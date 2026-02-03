// config/socket.config.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

// Store connected sales agents
const connectedSalesAgents = new Map(); // Map<salesAgentId, Set<socketId>>

/**
 * Initialize Socket.IO server
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} Socket.IO server instance
 */
function initializeSocket(server) {
  console.log('🚀 ========== INITIALIZING SOCKET.IO SERVER ==========');
  
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    path: '/agro-api/salesdash/socket.io',
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true, // Enable compatibility with older clients
  });

  console.log('✅ Socket.IO server configuration:');
  console.log('   - Path: /agro-api/salesdash/socket.io');
  console.log('   - CORS origin:', process.env.CLIENT_ORIGIN || "*");
  console.log('   - Ping timeout: 60000ms');
  console.log('   - Ping interval: 25000ms');
  console.log('   - Transports: websocket, polling');
  console.log('====================================================');

  // Socket.IO middleware for authentication
  io.use((socket, next) => {
    console.log('🔐 ========== AUTHENTICATION ATTEMPT ==========');
    console.log('   - Socket ID:', socket.id);
    console.log('   - Handshake auth:', Object.keys(socket.handshake.auth));
    
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        console.error('❌ Authentication failed: No token provided');
        console.log('==============================================');
        return next(new Error('Authentication error: No token provided'));
      }

      console.log('   - Token received (length):', token.length);

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      socket.salesAgentId = decoded.id;
      socket.userData = decoded;
      
      console.log('✅ Token verified successfully');
      console.log('   - Sales Agent ID:', decoded.id);
      console.log('   - User data:', { id: decoded.id, name: decoded.name || 'N/A' });
      console.log('==============================================');
      
      next();
    } catch (error) {
      console.error('❌ Authentication error:', error.message);
      console.error('   - Error type:', error.name);
      console.log('==============================================');
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Socket.IO connection handler
  io.on('connection', async (socket) => {
    const salesAgentId = socket.salesAgentId;
    
    console.log('✅ ========== NEW CONNECTION ==========');
    console.log('   - Sales Agent ID:', salesAgentId);
    console.log('   - Socket ID:', socket.id);
    console.log('   - Transport:', socket.conn.transport.name);
    console.log('   - Client IP:', socket.handshake.address);
    console.log('   - Time:', new Date().toISOString());
    console.log('=======================================');

    // Add socket to connected agents map
    if (!connectedSalesAgents.has(salesAgentId)) {
      connectedSalesAgents.set(salesAgentId, new Set());
    }
    connectedSalesAgents.get(salesAgentId).add(socket.id);

    const connectionCount = connectedSalesAgents.get(salesAgentId).size;
    console.log(`📊 Agent ${salesAgentId} now has ${connectionCount} active connection(s)`);

    // Join room based on sales agent ID
    socket.join(`agent_${salesAgentId}`);
    console.log(`📍 Sales Agent ${salesAgentId} joined room: agent_${salesAgentId}`);

    // ENHANCEMENT: Send existing notifications immediately on connection
    try {
      console.log(`📥 Fetching initial notifications for agent ${salesAgentId}...`);
      
      const notificationDao = require('../dao/notification-dao');
      const { notifications, unreadCount } = await notificationDao.getNotificationsBySalesAgent(salesAgentId);
      
      console.log(`📊 Initial notifications for agent ${salesAgentId}:`);
      console.log(`   - Total: ${notifications.length}`);
      console.log(`   - Unread: ${unreadCount}`);
      
      socket.emit('notifications_update', {
        notifications,
        unreadCount
      });
      
      console.log(`✅ Sent ${notifications.length} initial notifications to agent ${salesAgentId}`);
      
    } catch (error) {
      console.error('❌ Error sending initial notifications:', error.message);
      console.error('   - Stack:', error.stack);
      socket.emit('notification_error', {
        message: 'Failed to load initial notifications'
      });
    }

    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected to notification service',
      salesAgentId: salesAgentId,
      socketId: socket.id,
      timestamp: new Date()
    });
    console.log(`📱 Connection confirmation sent to agent ${salesAgentId}`);
    console.log('=======================================');

    // Handle manual notification fetch request
    socket.on('fetch_notifications', async () => {
      console.log(`📥 ========== FETCH NOTIFICATIONS REQUEST ==========`);
      console.log(`   - From agent: ${salesAgentId}`);
      console.log(`   - Socket: ${socket.id}`);
      
      try {
        const notificationDao = require('../dao/notification-dao');
        const { notifications, unreadCount } = await notificationDao.getNotificationsBySalesAgent(salesAgentId);
        
        console.log(`   - Found: ${notifications.length} notifications`);
        console.log(`   - Unread: ${unreadCount}`);
        
        socket.emit('notifications_update', {
          notifications,
          unreadCount
        });
        
        console.log(`✅ Sent notifications to agent ${salesAgentId}`);
        console.log(`===================================================`);
        
      } catch (error) {
        console.error('❌ Error fetching notifications:', error.message);
        console.error('   - Stack:', error.stack);
        console.log(`===================================================`);
        
        socket.emit('notification_error', {
          message: 'Failed to fetch notifications'
        });
      }
    });

    // Handle mark as read
    socket.on('mark_as_read', async (notificationId) => {
      console.log(`👁️ ========== MARK AS READ REQUEST ==========`);
      console.log(`   - Agent: ${salesAgentId}`);
      console.log(`   - Notification ID: ${notificationId}`);
      
      try {
        const notificationDao = require('../dao/notification-dao');
        await notificationDao.markNotificationsAsReadByOrderId(notificationId);
        
        console.log(`✅ Notification ${notificationId} marked as read`);
        
        // Fetch updated notifications
        const { notifications, unreadCount } = await notificationDao.getNotificationsBySalesAgent(salesAgentId);
        
        socket.emit('notifications_update', {
          notifications,
          unreadCount
        });
        
        console.log(`✅ Sent updated list to agent ${salesAgentId}`);
        console.log(`   - New unread count: ${unreadCount}`);
        console.log(`============================================`);
        
      } catch (error) {
        console.error('❌ Error marking notification as read:', error.message);
        console.log(`============================================`);
        
        socket.emit('notification_error', {
          message: 'Failed to mark notification as read'
        });
      }
    });

    // Handle transport upgrade
    socket.conn.on('upgrade', (transport) => {
      console.log(`🔄 ========== TRANSPORT UPGRADE ==========`);
      console.log(`   - Agent: ${salesAgentId}`);
      console.log(`   - New transport: ${transport.name}`);
      console.log(`=========================================`);
    });

    // ENHANCEMENT: Handle ping for connection health
    socket.on('ping', () => {
      console.log(`💓 Ping received from agent ${salesAgentId}`);
      socket.emit('pong');
    });

    // Handle custom events for testing
    socket.on('test_notification', async () => {
      console.log(`🧪 ========== TEST NOTIFICATION REQUEST ==========`);
      console.log(`   - From agent: ${salesAgentId}`);
      
      const testNotification = {
        id: 99999,
        orderId: 99999,
        title: 'Test Notification from Server',
        readStatus: false,
        createdAt: new Date().toISOString(),
        invNo: 'TEST-SERVER-001',
        orderStatus: 'Processing',
        cusId: salesAgentId.toString(),
        customerId: salesAgentId.toString(),
        customerName: 'Test Customer',
        phoneNumber: '1234567890',
        orderid: 99999,
        status: 'Processing'
      };

      socket.emit('new_notification', {
        notification: testNotification,
        notifications: [testNotification],
        unreadCount: 1
      });

      console.log(`✅ Test notification sent to agent ${salesAgentId}`);
      console.log(`=================================================`);
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`❌ ========== DISCONNECTION ==========`);
      console.log(`   - Sales Agent: ${salesAgentId}`);
      console.log(`   - Socket: ${socket.id}`);
      console.log(`   - Reason: ${reason}`);
      console.log(`   - Time: ${new Date().toISOString()}`);
      
      // Remove socket from connected agents
      const agentSockets = connectedSalesAgents.get(salesAgentId);
      if (agentSockets) {
        agentSockets.delete(socket.id);
        if (agentSockets.size === 0) {
          connectedSalesAgents.delete(salesAgentId);
          console.log(`🔌 Agent ${salesAgentId} fully disconnected (no active sockets)`);
        } else {
          console.log(`🔌 Agent ${salesAgentId} still has ${agentSockets.size} active socket(s)`);
        }
      }
      console.log(`======================================`);
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`❌ ========== SOCKET ERROR ==========`);
      console.error(`   - Agent: ${salesAgentId}`);
      console.error(`   - Socket: ${socket.id}`);
      console.error(`   - Error:`, error);
      console.error(`=====================================`);
    });
  });

  // Monitor connections periodically
  const monitorInterval = setInterval(() => {
    const activeConnections = io.engine.clientsCount;
    const activeAgents = connectedSalesAgents.size;
    
    if (activeConnections > 0) {
      console.log(`📊 ========== CONNECTION STATS ==========`);
      console.log(`   - Time: ${new Date().toISOString()}`);
      console.log(`   - Total connections: ${activeConnections}`);
      console.log(`   - Unique agents: ${activeAgents}`);
      
      // Log individual agent connections
      if (activeAgents > 0) {
        console.log(`   - Agent details:`);
        connectedSalesAgents.forEach((sockets, agentId) => {
          console.log(`     • Agent ${agentId}: ${sockets.size} socket(s)`);
        });
      }
      console.log(`=========================================`);
    }
  }, 300000); // Every 5 minutes

  // ENHANCEMENT: Log transport statistics
  io.engine.on('connection_error', (err) => {
    console.error('❌ ========== ENGINE CONNECTION ERROR ==========');
    console.error('   - Error:', err);
    console.error('   - Message:', err.message);
    console.error('   - Code:', err.code);
    console.error('===============================================');
  });

  // Cleanup on server shutdown
  io.on('close', () => {
    console.log('🔌 Socket.IO server closing...');
    clearInterval(monitorInterval);
  });

  console.log('✅ ========== SOCKET.IO SERVER READY ==========');
  console.log('   - Waiting for connections...');
  console.log('===============================================');

  return io;
}

/**
 * Get Socket.IO instance (for use in other modules)
 */
let ioInstance = null;

function getIO() {
  if (!ioInstance) {
    console.error('❌ Socket.IO not initialized. Call initializeSocket first.');
    throw new Error('Socket.IO not initialized. Call initializeSocket first.');
  }
  return ioInstance;
}

function setIO(io) {
  ioInstance = io;
  console.log('✅ Socket.IO instance stored globally');
}

/**
 * Get connected sales agents map
 */
function getConnectedAgents() {
  return connectedSalesAgents;
}

/**
 * Check if a sales agent is online
 */
function isAgentOnline(salesAgentId) {
  const isOnline = connectedSalesAgents.has(salesAgentId) && 
         connectedSalesAgents.get(salesAgentId).size > 0;
  
  if (isOnline) {
    console.log(`✅ Agent ${salesAgentId} is ONLINE (${connectedSalesAgents.get(salesAgentId).size} socket(s))`);
  } else {
    console.log(`❌ Agent ${salesAgentId} is OFFLINE`);
  }
  
  return isOnline;
}

/**
 * Get number of active connections for a sales agent
 */
function getAgentConnectionCount(salesAgentId) {
  const count = connectedSalesAgents.get(salesAgentId)?.size || 0;
  return count;
}

/**
 * Emit event to specific sales agent
 * ENHANCEMENT: Returns success status and emits to all agent's sockets
 */
function emitToAgent(salesAgentId, event, data) {
  console.log(`📤 ========== EMIT TO AGENT ==========`);
  console.log(`   - Target Agent: ${salesAgentId}`);
  console.log(`   - Event: ${event}`);
  console.log(`   - Data:`, JSON.stringify(data, null, 2));
  
  if (!ioInstance) {
    console.error('❌ Cannot emit: Socket.IO not initialized');
    console.log(`=====================================`);
    return false;
  }

  const socketCount = getAgentConnectionCount(salesAgentId);
  
  if (socketCount === 0) {
    console.warn(`⚠️ Agent ${salesAgentId} not connected, cannot emit '${event}'`);
    console.log(`   - Event will be lost`);
    console.log(`   - Ensure notification is saved to database`);
    console.log(`=====================================`);
    return false;
  }

  try {
    ioInstance.to(`agent_${salesAgentId}`).emit(event, data);
    console.log(`✅ Successfully emitted '${event}' to agent ${salesAgentId}`);
    console.log(`   - Delivered to ${socketCount} socket(s)`);
    console.log(`   - Room: agent_${salesAgentId}`);
    console.log(`=====================================`);
    return true;
  } catch (error) {
    console.error(`❌ Error emitting to agent ${salesAgentId}:`, error);
    console.log(`=====================================`);
    return false;
  }
}

/**
 * Emit event to all connected clients
 */
function emitToAll(event, data) {
  console.log(`📢 ========== BROADCAST TO ALL ==========`);
  console.log(`   - Event: ${event}`);
  console.log(`   - Data:`, JSON.stringify(data, null, 2));
  
  if (!ioInstance) {
    console.error('❌ Cannot emit: Socket.IO not initialized');
    console.log(`=========================================`);
    return false;
  }

  try {
    const connectionCount = ioInstance.engine.clientsCount;
    ioInstance.emit(event, data);
    console.log(`✅ Broadcast '${event}' to all clients`);
    console.log(`   - Delivered to ${connectionCount} connection(s)`);
    console.log(`=========================================`);
    return true;
  } catch (error) {
    console.error(`❌ Error broadcasting:`, error);
    console.log(`=========================================`);
    return false;
  }
}

/**
 * Disconnect a specific sales agent
 */
function disconnectAgent(salesAgentId) {
  console.log(`🔌 ========== DISCONNECT AGENT ==========`);
  console.log(`   - Agent: ${salesAgentId}`);
  
  if (!ioInstance || !connectedSalesAgents.has(salesAgentId)) {
    console.warn(`⚠️ Cannot disconnect agent ${salesAgentId}: not found`);
    console.log(`=========================================`);
    return false;
  }

  const sockets = connectedSalesAgents.get(salesAgentId);
  let disconnectedCount = 0;
  
  sockets.forEach(socketId => {
    const socket = ioInstance.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(true);
      disconnectedCount++;
    }
  });
  
  connectedSalesAgents.delete(salesAgentId);
  console.log(`✅ Disconnected agent ${salesAgentId}`);
  console.log(`   - Closed ${disconnectedCount} socket(s)`);
  console.log(`=========================================`);
  return true;
}

/**
 * ENHANCEMENT: Get statistics about connected agents
 */
function getConnectionStats() {
  const stats = {
    totalConnections: ioInstance ? ioInstance.engine.clientsCount : 0,
    uniqueAgents: connectedSalesAgents.size,
    agents: [],
    timestamp: new Date().toISOString()
  };

  connectedSalesAgents.forEach((sockets, agentId) => {
    stats.agents.push({
      agentId,
      socketCount: sockets.size,
      socketIds: Array.from(sockets)
    });
  });

  return stats;
}

/**
 * ENHANCEMENT: Send a test notification to an agent
 */
function sendTestNotification(salesAgentId) {
  console.log(`🧪 ========== SENDING TEST NOTIFICATION ==========`);
  console.log(`   - To agent: ${salesAgentId}`);
  
  const testNotification = {
    id: 99999,
    orderId: 99999,
    title: 'Test Notification from Backend',
    readStatus: false,
    createdAt: new Date().toISOString(),
    invNo: 'TEST-BACKEND-001',
    orderStatus: 'Processing',
    cusId: salesAgentId.toString(),
    customerId: salesAgentId.toString(),
    customerName: 'Test Customer',
    phoneNumber: '1234567890',
    orderid: 99999,
    status: 'Processing'
  };

  const emitted = emitToAgent(salesAgentId, 'new_notification', {
    notification: testNotification,
    notifications: [testNotification],
    unreadCount: 1
  });

  if (emitted) {
    console.log(`✅ Test notification sent successfully`);
  } else {
    console.log(`❌ Failed to send test notification`);
  }
  
  console.log(`=================================================`);
  return emitted;
}

module.exports = {
  initializeSocket,
  getIO,
  setIO,
  getConnectedAgents,
  isAgentOnline,
  getAgentConnectionCount,
  emitToAgent,
  emitToAll,
  disconnectAgent,
  getConnectionStats,
  sendTestNotification // New export for testing
};