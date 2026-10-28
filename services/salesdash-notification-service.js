const { collectionofficer } = require("../startup/database");
const pushNotificationService = require("./pushNotificationService");
const { getIO } = require("../socket/socket");
const notificationCache = require("./notification-cache");

/**
 * SalesDash Background Notification Service
 *
 * Mirrors the polygon-notification-service pattern but delivers notifications
 * TO the SalesDash mobile app (sales agent devices) instead of TO Polygon customers.
 *
 * Dispatches:
 *   1. DB insert into `dashnotification` table
 *   2. Real-time Socket.IO event to the sales agent's room
 *   3. Background Push Notification (FCM + Expo) for closed/background app delivery
 *
 * Usage:
 *   const { notifyDashOrderCancelled } = require("../services/salesdash-notification-service");
 *   await notifyDashOrderCancelled(processOrderId, invNo);
 */

/**
 * Resolve the sales agent ID and order details from a processOrderId.
 */
const resolveSalesAgentFromOrder = (processOrderId) => {
  return new Promise((resolve) => {
    if (!processOrderId) return resolve(null);

    const sql = `
      SELECT mps.salesAgent, po.id AS processOrderId, po.invNo,
             o.fullName AS customerName, o.id AS orderId
      FROM processorders po
      JOIN orders o ON po.orderId = o.id
      JOIN marketplaceusers mps ON o.userId = mps.id
      WHERE po.id = ?
      LIMIT 1
    `;

    collectionofficer.query(sql, [processOrderId], (err, rows) => {
      if (!err && rows && rows.length > 0) {
        return resolve(rows[0]);
      }
      resolve(null);
    });
  });
};

/**
 * Insert a notification record into the dashnotification table.
 */
const insertDashNotification = (orderId, title) => {
  return new Promise((resolve) => {
    const sql = `
      INSERT INTO dashnotification (orderId, title, readStatus, createdAt)
      VALUES (?, ?, 0, NOW())
    `;

    collectionofficer.query(sql, [orderId, title], (err, result) => {
      if (err) {
        console.warn("⚠️ [DashNotification] DB insert warning:", err.message);
        return resolve(null);
      }
      resolve(result.insertId);
    });
  });
};

/**
 * Core dispatcher: inserts DB record, emits Socket.IO event, and sends push notification.
 */
const triggerDashNotification = async ({
  processOrderId,
  title,
  message,
  eventType,
  data = {},
  skipDbInsert = false,
}) => {
  if (!processOrderId) {
    console.warn("[DashNotification] processOrderId is required to trigger notification.");
    return { success: false, error: "processOrderId is required" };
  }

  try {
    // 1. Resolve sales agent from order
    const orderDetails = await resolveSalesAgentFromOrder(processOrderId);
    if (!orderDetails || !orderDetails.salesAgent) {
      console.log(
        `ℹ️ [DashNotification] No sales agent associated with processOrderId: ${processOrderId}. Skipping.`
      );
      return { success: true, skipped: true };
    }

    const salesAgentId = orderDetails.salesAgent;
    const invNo = data.invNo || orderDetails.invNo || "";
    const customerName = data.customerName || orderDetails.customerName || "";
    const effectiveBody =
      message || (invNo ? `Order #${invNo} for ${customerName || "Customer"}` : title);

    // 2. Insert into dashnotification DB (unless skipped)
    let notificationId = null;
    if (!skipDbInsert) {
      notificationId = await insertDashNotification(processOrderId, title);
    }

    // 3. Update in-memory unread count cache
    const updatedUnreadCount = notificationCache.incrementUnreadCount(salesAgentId);

    // 4. Emit real-time Socket.IO event to sales agent
    const io = getIO();
    if (io) {
      const socketPayload = {
        id: notificationId || Date.now(),
        orderId: processOrderId,
        title,
        message: effectiveBody,
        invNo,
        customerName,
        eventType: eventType || "notification",
        unreadCount: updatedUnreadCount,
        createdAt: new Date().toISOString(),
        data,
      };
      io.to(`salesagent_${salesAgentId}`).emit("newNotification", socketPayload);
      io.to(`salesagent_${salesAgentId}`).emit("new_notification", socketPayload);
      console.log(
        `📢 [DashNotification] Emitted real-time socket to salesagent_${salesAgentId}: "${title}"`
      );
    }

    // 5. Dispatch Firebase FCM & Expo Push Notification (background / closed app delivery)
    let pushResult = null;
    try {
      pushResult = await pushNotificationService.sendPushToSalesAgent(salesAgentId, {
        title,
        body: effectiveBody,
        data: {
          orderId: processOrderId,
          notificationId,
          invNo,
          eventType: eventType || "notification",
        },
      });
      console.log(
        `📲 [DashNotification] Push notification dispatched to salesAgentId: ${salesAgentId}`
      );
    } catch (pushErr) {
      console.warn("⚠️ [DashNotification] Push delivery warning:", pushErr.message);
    }

    return {
      success: true,
      salesAgentId,
      notificationId,
      unreadCount: updatedUnreadCount,
      socketDelivered: !!io,
      pushResult,
    };
  } catch (err) {
    console.error("❌ [DashNotification] Error dispatching notification:", err.message);
    return { success: false, error: err.message };
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// Pre-built notification helpers (same pattern as notifyPolygonOrderCancelled)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Order cancelled — notify the assigned sales agent via background push
 */
const notifyDashOrderCancelled = async (processOrderId, invNo) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerDashNotification({
    processOrderId,
    title: "Order is Cancelled",
    message: `Order #${invoiceNumber} has been cancelled.`,
    eventType: "order_cancelled",
    data: { processOrderId, invNo: invoiceNumber },
    skipDbInsert: true,
  });
};

/**
 * Order status changed (e.g. Ordered → Processing → Dispatched → Delivered)
 */
const notifyDashOrderStatusChanged = async (processOrderId, invNo, newStatus) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerDashNotification({
    processOrderId,
    title: `Order ${newStatus}`,
    message: `Order #${invoiceNumber} status updated to "${newStatus}".`,
    eventType: "order_status_changed",
    data: { processOrderId, invNo: invoiceNumber, status: newStatus },
  });
};

/**
 * New order placed from external app (Polygon/GoviMart customer app)
 */
const notifyDashNewOrder = async (processOrderId, invNo) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerDashNotification({
    processOrderId,
    title: "New Order Received",
    message: `New order #${invoiceNumber} has been placed.`,
    eventType: "new_order",
    data: { processOrderId, invNo: invoiceNumber },
  });
};

/**
 * Payment received for an order
 */
const notifyDashPaymentReceived = async (processOrderId, invNo, amount) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerDashNotification({
    processOrderId,
    title: "Payment Received",
    message: `Payment of Rs. ${amount || "0"} received for order #${invoiceNumber}.`,
    eventType: "payment_received",
    data: { processOrderId, invNo: invoiceNumber, amount },
  });
};

/**
 * Order returned / return requested
 */
const notifyDashOrderReturned = async (processOrderId, invNo) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerDashNotification({
    processOrderId,
    title: "Order Return Requested",
    message: `A return has been requested for order #${invoiceNumber}.`,
    eventType: "order_returned",
    data: { processOrderId, invNo: invoiceNumber },
  });
};

/**
 * Complain filed by customer
 */
const notifyDashNewComplain = async (processOrderId, invNo, complainTitle) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerDashNotification({
    processOrderId,
    title: complainTitle || "New Complaint",
    message: `A complaint has been filed for order #${invoiceNumber}.`,
    eventType: "new_complain",
    data: { processOrderId, invNo: invoiceNumber },
  });
};

/**
 * Generic / custom notification
 */
const notifyDashCustom = async (processOrderId, title, message, eventType, extraData = {}) => {
  return triggerDashNotification({
    processOrderId,
    title,
    message,
    eventType: eventType || "custom",
    data: { processOrderId, ...extraData },
  });
};

module.exports = {
  triggerDashNotification,
  notifyDashOrderCancelled,
  notifyDashOrderStatusChanged,
  notifyDashNewOrder,
  notifyDashPaymentReceived,
  notifyDashOrderReturned,
  notifyDashNewComplain,
  notifyDashCustom,
};
