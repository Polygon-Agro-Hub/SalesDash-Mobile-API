const notificationDao = require('../dao/notification-dao');
const { getIO, emitToAgent } = require('../config/socket.config');

exports.getNotifications = async (req, res) => {
  try {
    const salesAgentId = req.user.id;
    const { notifications, unreadCount } = await notificationDao.getNotificationsBySalesAgent(salesAgentId);

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount
      }
    });
  } catch (error) {
    console.error('Notification fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
};

exports.markAsReadByOrderId = async (req, res) => {
  try {
    const { id } = req.params;
    const salesAgentId = req.user.id;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const affectedRows = await notificationDao.markNotificationsAsReadByOrderId(id);

    // Emit updated notification list to the sales agent
    try {
      const { notifications, unreadCount } = await notificationDao.getNotificationsBySalesAgent(salesAgentId);
      
      emitToAgent(salesAgentId, 'notifications_update', {
        notifications,
        unreadCount
      });
    } catch (socketError) {
      console.error('Error emitting notification update:', socketError);
      // Continue even if socket emit fails
    }

    res.status(200).json({
      success: true,
      message: `Marked ${affectedRows} notifications as read`,
      affectedRows
    });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
};

exports.deleteByOrderId = async (req, res) => {
  try {
    const { id } = req.params;
    const salesAgentId = req.user.id;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const affectedRows = await notificationDao.deleteNotificationsByOrderId(id);

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'No notifications found for this order'
      });
    }

    // Emit update to the sales agent
    try {
      const { notifications, unreadCount } = await notificationDao.getNotificationsBySalesAgent(salesAgentId);
      
      emitToAgent(salesAgentId, 'notifications_update', {
        notifications,
        unreadCount
      });
    } catch (socketError) {
      console.error('Error emitting notification update:', socketError);
    }

    res.status(200).json({
      success: true,
      message: `Deleted ${affectedRows} notification(s)`,
      affectedRows
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notifications'
    });
  }
};

exports.createPaymentReminders = async (req, res) => {
  try {
    const io = getIO();
    const remindersCreated = await notificationDao.createPaymentReminders(io);

    res.status(200).json({
      success: true,
      message: `Created ${remindersCreated.notificationCount} payment reminder notifications and sent ${remindersCreated.smsCount} SMS messages`,
      data: remindersCreated
    });
  } catch (error) {
    console.error('Error creating payment reminders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment reminders',
      error: error.message
    });
  }
};

/**
 * Utility function to emit notification
 * Can be called from anywhere in your app
 * @param {number} orderId - Process order ID
 * @param {string} title - Notification title
 */
exports.emitNotification = async (orderId, title) => {
  try {
    await notificationDao.createNotification(orderId, title);
    return { success: true };
  } catch (error) {
    console.error('Error emitting notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Test endpoint to manually trigger a notification
 * For development/testing purposes only
 */
exports.testNotification = async (req, res) => {
  try {
    const { orderId, title } = req.body;

    if (!orderId || !title) {
      return res.status(400).json({
        success: false,
        message: 'orderId and title are required'
      });
    }

    await notificationDao.createNotification(orderId, title);

    res.status(200).json({
      success: true,
      message: 'Test notification sent successfully'
    });
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
};

/**
 * Get Socket.IO connection status
 */
exports.getConnectionStatus = async (req, res) => {
  try {
    const { getConnectedAgents, isAgentOnline, getAgentConnectionCount } = require('../config/socket.config');
    const salesAgentId = req.user.id;
    
    const connectedAgents = getConnectedAgents();
    const isOnline = isAgentOnline(salesAgentId);
    const connectionCount = getAgentConnectionCount(salesAgentId);

    res.status(200).json({
      success: true,
      data: {
        isOnline,
        connectionCount,
        totalConnectedAgents: connectedAgents.size,
        salesAgentId
      }
    });
  } catch (error) {
    console.error('Error getting connection status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connection status'
    });
  }
};