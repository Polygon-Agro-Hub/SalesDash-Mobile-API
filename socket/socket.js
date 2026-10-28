const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
  });

  // Token authentication middleware
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "") ||
        socket.handshake.query?.token;

      if (token) {
        try {
          const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || "default_jwt_secret_key"
          );
          socket.userId = decoded.id;
          socket.empId = decoded.empId;
          socket.user = decoded;
        } catch (jwtErr) {
          console.warn("[Socket] Token verification failed:", jwtErr.message);
        }
      }
      return next();
    } catch (err) {
      console.error("[Socket] Auth middleware error:", err);
      return next();
    }
  });

  io.on("connection", (socket) => {
    console.log(
      `🔌 [Socket] Client connected: ${socket.id}, userId: ${
        socket.userId || "anonymous"
      }`
    );

    // Auto-join user rooms if authenticated
    if (socket.userId) {
      socket.join(`salesagent_${socket.userId}`);
      socket.join(`user_${socket.userId}`);
      console.log(`👤 [Socket] Socket ${socket.id} joined room salesagent_${socket.userId}`);
    }

    // Register Sales Agent event
    socket.on("registerSalesAgent", (salesAgentId) => {
      if (salesAgentId) {
        socket.join(`salesagent_${salesAgentId}`);
        socket.join(`user_${salesAgentId}`);
        console.log(`👤 [Socket] Socket ${socket.id} joined room salesagent_${salesAgentId}`);
      }
    });

    // Register user event (compatible with client naming)
    socket.on("register_user", (userId) => {
      if (userId) {
        socket.join(`salesagent_${userId}`);
        socket.join(`user_${userId}`);
        console.log(`👤 [Socket] Socket ${socket.id} joined room user_${userId}`);
      }
    });

    // Package real-time broadcast for Admin Panel changes
    const handlePackageUpdate = (data) => {
      console.log("📦 [Socket] packageUpdated received, broadcasting to all clients:", data);
      io.emit("packagesUpdated", data || {});
      io.emit("packageUpdated", data || {});
    };

    socket.on("packageUpdated", handlePackageUpdate);
    socket.on("package_updated", handlePackageUpdate);
    socket.on("packagesUpdated", handlePackageUpdate);

    socket.on("disconnect", (reason) => {
      console.log(`🔌 [Socket] Client disconnected: ${socket.id}, reason: ${reason}`);
    });
  });

  return io;
};

const getIO = () => {
  return io;
};

const emitNotificationToSalesAgent = (salesAgentId, notificationData) => {
  if (!io) {
    console.warn("[Socket] IO not initialized, cannot emit notification");
    return false;
  }
  const room = `salesagent_${salesAgentId}`;
  io.to(room).emit("newNotification", notificationData);
  io.to(room).emit("new_notification", notificationData);
  console.log(`📢 [Socket] Emitted notification to ${room}:`, notificationData?.title || notificationData?.id);
  return true;
};

const emitPackageUpdate = (packageData) => {
  if (!io) {
    console.warn("[Socket] IO not initialized, cannot emit package update");
    return false;
  }
  io.emit("packagesUpdated", packageData || {});
  io.emit("packageUpdated", packageData || {});
  console.log("📢 [Socket] Broadcasted package update to all clients");
  return true;
};

module.exports = {
  initSocket,
  getIO,
  emitNotificationToSalesAgent,
  emitPackageUpdate,
};
