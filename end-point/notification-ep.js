const notificationDao = require("../dao/notification-dao");
const notificationCache = require("../services/notification-cache");

// Get All Notification
exports.getNotifications = async (req, res) => {
  try {
    const salesAgentId = req.user.id;
    const { notifications, unreadCount } =
      await notificationDao.getNotificationsBySalesAgentDAO(salesAgentId);

    // Cache the fresh unread count in memory
    notificationCache.setUnreadCount(salesAgentId, unreadCount);

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

    if (affectedRows > 0 && req.user?.id) {
      notificationCache.decrementUnreadCount(req.user.id);
    }

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
    const { pushToken, platform, deviceType } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        message: "Push token is required",
      });
    }

    await notificationDao.savePushTokenDAO(
      salesAgentId,
      pushToken,
      deviceType || platform || "android"
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

const pushNotificationService = require("../services/pushNotificationService");

// Send Notification (Inserts into DB + sends Firebase FCM / Expo Push Notification to Device even when app is closed)
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

    // 2. Dispatch Push Notification via pushNotificationService (Firebase FCM + Expo)
    const pushResult = await pushNotificationService.sendPushToSalesAgent(
      targetAgentId,
      {
        title,
        body: message || title,
        data: {
          orderId,
          notificationId,
        },
      }
    );

    // 3. Emit via Socket.IO if client is open
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

/**
 * Universal Trigger / Webhook for external applications
 * (Admin Panel, Polygon/GoviMart, Govi Transport, Cron Jobs)
 *
 * Automatically resolves the assigned Sales Agent ID, increments in-memory cache,
 * pushes real-time WebSocket event, and dispatches native background Push Notification.
 */
exports.triggerNotification = async (req, res) => {
  try {
    const { orderId, title, message, eventType, data } = req.body || {};
    let targetAgentId = req.body.salesAgentId || (req.user && req.user.id);

    // Auto-resolve salesAgentId from orderId if not explicitly provided
    let resolvedDetails = null;
    if (!targetAgentId && orderId) {
      resolvedDetails = await notificationDao.resolveSalesAgentDetailsDAO(orderId);
      if (resolvedDetails && resolvedDetails.salesAgent) {
        targetAgentId = resolvedDetails.salesAgent;
      }
    }

    if (!targetAgentId) {
      return res.status(400).json({
        success: false,
        message: "Could not resolve salesAgentId. Please provide salesAgentId or a valid orderId.",
      });
    }

    const effectiveTitle =
      title || (eventType ? eventType.replace(/_/g, " ").toUpperCase() : "New Notification");
    const effectiveOrderId =
      orderId || (resolvedDetails && resolvedDetails.processOrderId) || null;
    const invNo =
      (data && data.invNo) || (resolvedDetails && resolvedDetails.invNo) || "";
    const customerName =
      (data && data.customerName) || (resolvedDetails && resolvedDetails.customerName) || "";
    const effectiveBody =
      message || (invNo ? `Order #${invNo} for ${customerName || "Customer"}` : effectiveTitle);

    // 1. Insert record into dashnotification DB
    let notificationId = null;
    if (effectiveOrderId) {
      try {
        notificationId = await notificationDao.insertNotificationDAO(effectiveOrderId, effectiveTitle);
      } catch (insertErr) {
        console.warn("⚠️ [NotificationTrigger] DB insert warning:", insertErr.message);
      }
    }

    // 2. Update in-memory unread count cache
    const updatedUnreadCount = notificationCache.incrementUnreadCount(targetAgentId);

    // 3. Emit real-time WebSocket event to active SalesDash app instance
    const io = req.app.get("io");
    if (io) {
      const socketPayload = {
        id: notificationId || Date.now(),
        orderId: effectiveOrderId,
        title: effectiveTitle,
        message: effectiveBody,
        invNo,
        customerName,
        eventType: eventType || "notification",
        unreadCount: updatedUnreadCount,
        createdAt: new Date().toISOString(),
        data: data || {},
      };
      io.to(`salesagent_${targetAgentId}`).emit("newNotification", socketPayload);
      io.to(`salesagent_${targetAgentId}`).emit("new_notification", socketPayload);
      console.log(
        `📢 [NotificationTrigger] Emitted real-time newNotification to salesagent_${targetAgentId}:`,
        effectiveTitle
      );
    }

    // 4. Dispatch Firebase FCM & Expo Push Notification for background / closed apps
    let pushResult = null;
    try {
      pushResult = await pushNotificationService.sendPushToSalesAgent(
        targetAgentId,
        {
          title: effectiveTitle,
          body: effectiveBody,
          data: {
            orderId: effectiveOrderId,
            notificationId,
            invNo,
            eventType: eventType || "notification",
          },
        }
      );
    } catch (pushErr) {
      console.warn("⚠️ [NotificationTrigger] Push delivery warning:", pushErr.message);
    }

    res.status(200).json({
      success: true,
      message: `Notification dispatched successfully to Sales Agent ${targetAgentId}`,
      data: {
        notificationId,
        salesAgentId: targetAgentId,
        orderId: effectiveOrderId,
        unreadCount: updatedUnreadCount,
        socketDelivered: !!io,
        pushResult,
      },
    });
  } catch (error) {
    console.error("Error triggering notification:", error);
    res.status(500).json({
      success: false,
      message: "Failed to trigger notification",
      error: error.message,
    });
  }
};
