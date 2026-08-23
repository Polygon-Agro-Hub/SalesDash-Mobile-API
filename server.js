const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const compression = require("compression");
require("dotenv").config();
const {
  plantcare,
  collectionofficer,
  marketPlace,
  admin,
} = require("./startup/database");
const setupSwagger = require("./startup/swagger");
const app = express();
app.use(compression());
const BASE_PATH = "/agro-api/salesdash";

const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || "http://localhost:8081",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));

app.get([`${BASE_PATH}/health`, `${BASE_PATH}/healthz`], (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date(),
    uptime: process.uptime(),
    service: "SalesDash Mobile API",
    environment: process.env.NODE_ENV || "development",
  });
});

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
DatabaseConnection(marketPlace, "MarketPlace");
DatabaseConnection(admin, "Admin");

const routes = {
  auth: require("./routes/user.routes"),
  customer: require("./routes/customer.routes"),
  complain: require("./routes/complain.routes"),
  packages: require("./routes/package.routes"),
  orders: require("./routes/order.routes"),
  notifications: require("./routes/notification.routes"),
};

setupSwagger(app, BASE_PATH);

// Routes
app.use(`${BASE_PATH}/api/auth`, routes.auth);
app.use(`${BASE_PATH}/api/customer`, routes.customer);
app.use(`${BASE_PATH}/api/complain`, routes.complain);
app.use(`${BASE_PATH}/api/packages`, routes.packages);
app.use(`${BASE_PATH}/api/orders`, routes.orders);
app.use(`${BASE_PATH}/api/notifications`, routes.notifications);

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});

const cron = require("node-cron");
const notificationDao = require("./dao/notification-dao");
const orderDao = require("./dao/orders-dao");

// Run every day at midnight
cron.schedule("00 18 * * *", async () => {
  try {
    await notificationDao.createPaymentReminders();
    console.log("⏰ Payment reminders created successfully");
  } catch (error) {
    console.error("Error creating payment reminders:", error);
  }
});

const PORT = process.env.PORT || 3000;
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("⚡ Client connected to Socket.IO:", socket.id);

  socket.on("joinOrder", (orderId) => {
    socket.join(`order_${orderId}`);
    console.log(`Socket ${socket.id} joined room order_${orderId}`);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Client disconnected from Socket.IO:", socket.id);
  });
});

// Attach io instance to express app
app.set("io", io);

// Attach io and app to server instance
server.io = io;
server.app = app;

// Only listen locally, Vercel will export the handler and call listen internally
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Main API server running with Socket.IO on port ${PORT} with base path ${BASE_PATH}`);
  });
}

module.exports = server;
