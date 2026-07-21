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

// Setup Swagger UI
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

// Start server using HTTP server for Socket.io support
const PORT = process.env.PORT || 3000;
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  path: `${BASE_PATH}/socket.io`,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Active orders to monitor: orderId -> Set of socket IDs
const activeOrderChecks = new Map();
// Active sales agents to monitor: salesAgentId -> { count: number, sockets: Set }
const activeAgentChecks = new Map();

io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  socket.on("joinOrder", (orderId) => {
    const numericOrderId = Number(orderId);
    if (!numericOrderId) return;
    
    socket.join(`order_${numericOrderId}`);
    console.log(`🔌 Socket ${socket.id} joined order_${numericOrderId}`);

    if (!activeOrderChecks.has(numericOrderId)) {
      activeOrderChecks.set(numericOrderId, new Set());
    }
    activeOrderChecks.get(numericOrderId).add(socket.id);
  });

  socket.on("registerSalesAgent", (salesAgentId) => {
    const numericAgentId = Number(salesAgentId);
    if (!numericAgentId) return;

    socket.join(`salesAgent_${numericAgentId}`);
    console.log(`🔌 Socket ${socket.id} registered for salesAgent_${numericAgentId}`);

    if (!activeAgentChecks.has(numericAgentId)) {
      activeAgentChecks.set(numericAgentId, { lastCount: null, sockets: new Set() });
    }
    activeAgentChecks.get(numericAgentId).sockets.add(socket.id);
  });

  socket.on("disconnect", () => {
    console.log("🔌 Socket disconnected:", socket.id);
    
    // Clean up order checks
    for (const [orderId, socketSet] of activeOrderChecks.entries()) {
      if (socketSet.has(socket.id)) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          activeOrderChecks.delete(orderId);
        }
      }
    }

    // Clean up agent checks
    for (const [agentId, info] of activeAgentChecks.entries()) {
      if (info.sockets.has(socket.id)) {
        info.sockets.delete(socket.id);
        if (info.sockets.size === 0) {
          activeAgentChecks.delete(agentId);
        }
      }
    }
  });
});

// Periodic payment status checker (every 2 seconds)
setInterval(async () => {
  if (activeOrderChecks.size === 0) return;

  for (const orderId of Array.from(activeOrderChecks.keys())) {
    try {
      const result = await orderDao.checkOrderPaymentStatus(orderId);
      const isPaid = result?.data?.isPaid;

      if (Number(isPaid) === 1) {
        console.log(`💲 Order ${orderId} has been PAID. Emitting event.`);
        io.to(`order_${orderId}`).emit("paymentStatusChanged", { orderId, isPaid: 1 });
        activeOrderChecks.delete(orderId);
      }
    } catch (err) {
      console.error(`Error in socket payment status check for order ${orderId}:`, err);
    }
  }
}, 2000);

// Periodic notification checker (every 5 seconds)
setInterval(async () => {
  if (activeAgentChecks.size === 0) return;

  for (const agentId of Array.from(activeAgentChecks.keys())) {
    const info = activeAgentChecks.get(agentId);
    if (!info || info.sockets.size === 0) continue;

    try {
      const { unreadCount, notifications } = await notificationDao.getNotificationsBySalesAgentDAO(agentId);
      const currentCount = Number(unreadCount) || 0;

      if (info.lastCount !== null && currentCount > info.lastCount) {
        console.log(`🔔 New notification for agent ${agentId}. Emitting event.`);
        io.to(`salesAgent_${agentId}`).emit("newNotification", { unreadCount: currentCount, notifications });
      }
      info.lastCount = currentCount;
    } catch (err) {
      console.error(`Error in socket notification check for agent ${agentId}:`, err);
    }
  }
}, 5000);

// Only listen locally, Vercel will export the handler and call listen internally
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log(`📍 Base Path: ${BASE_PATH}`);
    console.log(`💓 Health Check URL: ${BASE_PATH}/health`);
  });
}

module.exports = server;
