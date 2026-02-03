
const notificationDao = require('../dao/notification-dao');
const { emitToAgent, isAgentOnline } = require('../config/socket.config');

const NotificationTypes = {
  PAYMENT_REMINDER: 'Payment reminder ',
  ORDER_PROCESSING: 'Order is Processing',
  ORDER_OUT_FOR_DELIVERY: 'Order is Out for Delivery',
  ORDER_CANCELLED: 'Order is Cancelled',
  ORDER_COMPLETED: 'Order is Completed',
  DRIVER_COLLECTED: 'Driver has collected the order',
  PAYMENT_RECEIVED: 'Payment received for order',
  ORDER_SCHEDULED: 'Order scheduled successfully'
};

/**
 * Send a notification
 * @param {number} orderId - Process order ID
 * @param {string} title - Notification title (use NotificationTypes enum)
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Result object
 */
async function sendNotification(orderId, title, options = {}) {
  try {
    // Validate inputs
    if (!orderId || !title) {
      throw new Error('orderId and title are required');
    }

    // Create notification in database
    await notificationDao.createNotification(orderId, title);

    console.log(`✅ Notification sent: "${title}" for order ${orderId}`);

    return {
      success: true,
      orderId,
      title,
      timestamp: new Date()
    };
  } catch (error) {
    console.error('❌ Failed to send notification:', error);
    return {
      success: false,
      error: error.message,
      orderId,
      title
    };
  }
}

/**
 * Send multiple notifications at once
 * @param {Array<{orderId: number, title: string}>} notifications - Array of notifications
 * @returns {Promise<Object>} Results object
 */
async function sendBulkNotifications(notifications) {
  const results = {
    successful: 0,
    failed: 0,
    details: []
  };

  for (const notification of notifications) {
    try {
      const result = await sendNotification(notification.orderId, notification.title);
      
      if (result.success) {
        results.successful++;
      } else {
        results.failed++;
      }
      
      results.details.push(result);
    } catch (error) {
      results.failed++;
      results.details.push({
        success: false,
        error: error.message,
        ...notification
      });
    }
  }

  return results;
}

/**
 * Check if a sales agent is currently online
 * @param {number} salesAgentId - Sales agent ID
 * @returns {boolean} True if online, false otherwise
 */
function checkAgentOnlineStatus(salesAgentId) {
  return isAgentOnline(salesAgentId);
}

/**
 * Send notification for order status change
 * @param {number} orderId - Order ID
 * @param {string} newStatus - New order status
 */
async function notifyOrderStatusChange(orderId, newStatus) {
  const statusTitleMap = {
    'Processing': NotificationTypes.ORDER_PROCESSING,
    'Out for Delivery': NotificationTypes.ORDER_OUT_FOR_DELIVERY,
    'Completed': NotificationTypes.ORDER_COMPLETED,
    'Cancelled': NotificationTypes.ORDER_CANCELLED,
    'Collected': NotificationTypes.DRIVER_COLLECTED
  };

  const title = statusTitleMap[newStatus] || `Order status updated to ${newStatus}`;
  
  return await sendNotification(orderId, title);
}

/**
 * Send payment reminder notification
 * @param {number} orderId - Order ID
 */
async function sendPaymentReminder(orderId) {
  return await sendNotification(orderId, NotificationTypes.PAYMENT_REMINDER);
}

/**
 * Send payment received notification
 * @param {number} orderId - Order ID
 */
async function notifyPaymentReceived(orderId) {
  return await sendNotification(orderId, NotificationTypes.PAYMENT_RECEIVED);
}

/**
 * Send driver collected notification
 * @param {number} orderId - Order ID
 */
async function notifyDriverCollected(orderId) {
  return await sendNotification(orderId, NotificationTypes.DRIVER_COLLECTED);
}

module.exports = {
  NotificationTypes,
  sendNotification,
  sendBulkNotifications,
  checkAgentOnlineStatus,
  notifyOrderStatusChange,
  sendPaymentReminder,
  notifyPaymentReceived,
  notifyDriverCollected
};