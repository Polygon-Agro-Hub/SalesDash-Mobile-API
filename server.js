const http = require("http");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const compression = require("compression");
const path = require("path");
require("dotenv").config();
const {
  plantcare,
  collectionofficer,
  admin,
} = require("./startup/database");
const setupSwagger = require("./startup/swagger");
const { initSocket } = require("./socket/socket");

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = initSocket(server);

const BASE_PATH = "/agro-api/salesdash";

const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With", "Origin"],
};

app.use(compression());
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));



// Database connection check function
const DatabaseConnection = (db, name) => {
  db.getConnection((err, connection) => {
    if (err) {
      console.error(`Error getting connection from ${name}:`, err);
    } else {
      connection.ping((err) => {
        if (err) {
          console.error(`Error pinging ${name} database:`, err);
        } else {
          console.log(`🗄️ Ping to ${name} database successful.`);
        }
        connection.release();
      });
    }
  });
};

// Initial database connections
DatabaseConnection(plantcare, "PlantCare");
DatabaseConnection(collectionofficer, "CollectionOfficer");
DatabaseConnection(admin, "Admin");

// Pre-warm package cache in memory
const packageCache = require("./services/package-cache");
packageCache.refreshPackageCache().catch((err) => {
  console.warn("Could not pre-warm package cache:", err.message);
});

const routes = {
  auth: require("./routes/user.routes"),
  customer: require("./routes/customer.routes"),
  complain: require("./routes/complain.routes"),
  packages: require("./routes/package.routes"),
  orders: require("./routes/order.routes"),
  notifications: require("./routes/notification.routes"),
  otp: require("./routes/otp.routes"),
  health: require("./routes/health.routes"),
};

setupSwagger(app, BASE_PATH);

// Routes
app.use(`${BASE_PATH}/api/auth`, routes.auth);
app.use(`${BASE_PATH}/api/customer`, routes.customer);
app.use(`${BASE_PATH}/api/complain`, routes.complain);
app.use(`${BASE_PATH}/api/packages`, routes.packages);
app.use(`${BASE_PATH}/api/orders`, routes.orders);
app.use(`${BASE_PATH}/api/notifications`, routes.notifications);
app.use(`${BASE_PATH}/api/otp`, routes.otp);
app.use(`${BASE_PATH}`, routes.health);
app.use("", routes.health);

// ─── App Version Policy ────────────────────────────────────────────────────────
// Returns the version policy JSON that controls in-app update prompts in the
// mobile app. Edit remote-config/app-version.json to trigger or stop prompts
// without redeploying code.
app.get(`${BASE_PATH}/api/app-version`, (req, res) => {
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Content-Type", "application/json");
  res.sendFile(path.join(__dirname, "remote-config", "app-version.json"));
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const cron = require("node-cron");
const notificationDao = require("./dao/notification-dao");

// Run every day at midnight
cron.schedule("00 18 * * *", async () => {
  try {
    await notificationDao.createPaymentReminders();
    console.log("⏰ Payment reminders created successfully");
  } catch (error) {
    console.error("Error creating payment reminders:", error);
  }
});

// Attach io instance to express app
app.set("io", io);

// Attach io and app to server instance
server.io = io;
server.app = app;

// Only listen locally, Vercel will export the handler and call listen internally
const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Main API server running with Socket.IO on port ${PORT} with base path ${BASE_PATH}`);
  });
}

module.exports = server;
