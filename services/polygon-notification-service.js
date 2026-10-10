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

module.exports = {
  triggerPolygonNotification,
  notifyPolygonOrderCancelled,
};
