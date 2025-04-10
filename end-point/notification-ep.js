const notificationDao = require('../dao/notification-dao');

exports.getNotifications = async (req, res) => {
  try {
    const salesAgentId = req.user.id; // From auth middleware
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
    
    console.log('Received orderId:', id); // Debugging line
    
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
      });
    }

    const affectedRows = await notificationDao.markNotificationsAsReadByOrderId(id);
    
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
    const { id} = req.params;
    
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