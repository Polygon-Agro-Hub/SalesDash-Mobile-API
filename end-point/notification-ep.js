const notificationDao = require("../dao/notification-dao");

// Get All Notification
exports.getNotifications = async (req, res) => {
  try {
    const salesAgentId = req.user.id;
    const { notifications, unreadCount } =
      await notificationDao.getNotificationsBySalesAgentDAO(salesAgentId);

    res.status(200).json({
      success: true,
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    console.error("Notification fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

// Mark As Read Notification
exports.markAsReadByOrderId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const affectedRows =
      await notificationDao.markNotificationsAsReadByOrderIdDAO(id);

    res.status(200).json({
      success: true,
      message: `Marked ${affectedRows} notifications as read`,
      affectedRows,
    });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
    });
  }
};

// Delete Notification
exports.deleteByOrderId = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const affectedRows =
      await notificationDao.deleteNotificationsByOrderIdDAO(id);

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "No notifications found for this order",
      });
    }

    res.status(200).json({
      success: true,
      message: `Deleted ${affectedRows} notification(s)`,
      affectedRows,
    });
  } catch (error) {
    console.error("Error deleting notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notifications",
    });
  }
};

// Register Push Token
exports.registerPushToken = async (req, res) => {
  try {
    const salesAgentId = req.user.id;
    const { pushToken, platform } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        message: "Push token is required",
      });
    }

    await notificationDao.savePushTokenDAO(
      salesAgentId,
      pushToken,
      platform || "android"
    );

    res.status(200).json({
      success: true,
      message: "Push token registered successfully",
    });
  } catch (error) {
    console.error("Error registering push token:", error);
    res.status(500).json({
      success: false,
      message: "Failed to register push token",
    });
  }
};

const pushSender = require("../services/push-sender");

// Send Notification (Inserts into DB + sends Expo Push Notification to Device even when app is closed)
exports.sendNotification = async (req, res) => {
  try {
    const { orderId, title, message } = req.body;
    const targetAgentId = req.body.salesAgentId || req.user.id;

    if (!orderId || !title) {
      return res.status(400).json({
        success: false,
        message: "orderId and title are required",
      });
    }

    // 1. Insert into dashnotification
    const notificationId = await notificationDao.insertNotificationDAO(orderId, title);

    // 2. Fetch push tokens for the sales agent
    const tokens = await notificationDao.getPushTokensBySalesAgentDAO(targetAgentId);

    // 3. Dispatch Expo Push Notification (delivers to phone even when app is closed / cleared / locked)
    let pushResult = null;
    if (tokens && tokens.length > 0) {
      pushResult = await pushSender.sendExpoPushNotification(
        tokens,
        title,
        message || title,
        {
          orderId,
          notificationId,
        }
      );
    }

    // 4. Emit via Socket.IO if client is open
    const io = req.app.get("io");
    if (io) {
      io.to(`salesagent_${targetAgentId}`).emit("newNotification", {
        id: notificationId,
        orderId,
        title,
        message: message || title,
        createdAt: new Date(),
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification created and push notification sent",
      data: {
        notificationId,
        pushedToTokensCount: tokens ? tokens.length : 0,
        pushResult,
      },
    });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send notification",
      error: error.message,
    });
  }
};
