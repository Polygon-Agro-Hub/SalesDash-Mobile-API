const axios = require("axios");
const { POLYGON_TRIGGER_SECRET } = require("../constants/notification-secrets");

/**
 * Service to notify Polygon Customer Mobile API over HTTP webhook from Sales Dash backend.
 * Delivers real-time Socket.IO and Push Notification to Customer.
 */

const getPolygonBaseUrl = () => {
  const url = process.env.POLYGON_API_URL || "https://dev-mob-api.polygon.lk/polygon";
  return url.replace(/\/+$/, "");
};

const getServiceHeaders = () => {
  const secret = POLYGON_TRIGGER_SECRET;
  const headers = {
    "Content-Type": "application/json",
  };
  if (secret) {
    headers["x-service-token"] = secret;
    headers["Authorization"] = `Bearer ${secret}`;
  }
  return headers;
};

/**
 * Dispatches a notification to Polygon customer via Polygon API webhook.
 */
const triggerPolygonNotification = async ({
  orderId,
  title,
  message,
  eventType,
  data = {},
  skipDbInsert = true,
}) => {
  if (!orderId) {
    console.warn("[Polygon Notification] orderId is required to trigger notification.");
    return false;
  }

  const polygonBase = getPolygonBaseUrl();
  const url = `${polygonBase}/api/notification/trigger`;

  try {
    const payload = {
      orderId,
      title,
      message,
      eventType,
      data,
      skipDbInsert,
    };

    const response = await axios.post(url, payload, {
      timeout: 5000,
      headers: getServiceHeaders(),
    });

    console.log(
      `📢 [Polygon Socket] Dispatched "${title}" for order ${orderId} (Status: ${response.status})`
    );
    return true;
  } catch (err) {
    console.warn(
      `⚠️ [Polygon Socket] Could not dispatch notification to Polygon API (${url}) for order ${orderId}:`,
      err.response?.data?.message || err.message
    );
    return false;
  }
};

/**
 * Order cancelled from Sales Dash app by sales agent
 */
const notifyPolygonOrderCancelled = async (processOrderId, invNo) => {
  const invoiceNumber = invNo || processOrderId;
  return triggerPolygonNotification({
    orderId: processOrderId,
    title: "Order Cancelled",
    message: `Your order #${invoiceNumber} has been cancelled successfully.`,
    eventType: "order_cancelled",
    data: { processOrderId, invNo: invoiceNumber },
    skipDbInsert: true,
  });
};

/**
 * Format a Date object to "Month Day", e.g. "September 3"
 */
const formatDateToMonthDay = (date) => {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${monthNames[d.getMonth()]} ${d.getDate()}`;
};

/**
 * Calculate payment deadline date: 2 days before scheduled date, e.g. "September 1"
 */
const getPaymentDeadlineDate = (scheduledDate) => {
  const d =
    scheduledDate instanceof Date
      ? new Date(scheduledDate.getTime())
      : new Date(scheduledDate);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 1);
    return formatDateToMonthDay(fallback);
  }
  // 2 days before scheduled date
  d.setDate(d.getDate() - 2);
  return formatDateToMonthDay(d);
};

/**
 * Payment Reminder notification for card orders placed via Sales Dash.
 * Saves to ordernotfication table, dispatches FCM/Expo push and Socket.IO.
 */
const notifyPolygonPaymentReminder = async ({
  processOrderId,
  invNo,
  scheduledDate,
  userId,
}) => {
  const invoiceNumber = invNo || processOrderId;
  const schedDateObj = scheduledDate
    ? (scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate))
    : new Date();
  const scheduledDateStr = formatDateToMonthDay(schedDateObj);
  const deadlineDateStr = getPaymentDeadlineDate(schedDateObj);

  const title = "Payment Reminder !!!";
  const message = `Order #${invoiceNumber} scheduled for ${scheduledDateStr}. Please pay via online banking before ${deadlineDateStr} at 6:00 PM to avoid cancellation.`;

  return triggerPolygonNotification({
    orderId: processOrderId,
    title,
    message,
    eventType: "payment_reminder",
    data: {
      processOrderId,
      invNo: invoiceNumber,
      userId,
      scheduledDate: scheduledDateStr,
      deadlineDate: deadlineDateStr,
      type: "payment_reminder",
    },
    skipDbInsert: false, // Save to ordernotfication table
  });
};

module.exports = {
  triggerPolygonNotification,
  notifyPolygonOrderCancelled,
  notifyPolygonPaymentReminder,
  formatDateToMonthDay,
  getPaymentDeadlineDate,
};
