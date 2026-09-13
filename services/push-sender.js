/**
 * Push Notification Sender Service for Expo Push Notifications
 * Sends high-priority push notifications to Android / iOS devices 24/7.
 */

async function sendExpoPushNotification(tokens, title, body, data = {}) {
  if (!tokens) return;
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];
  const validTokens = tokenList.filter(
    (t) => typeof t === "string" && (t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken"))
  );

  if (validTokens.length === 0) return;

  const messages = validTokens.map((token) => ({
    to: token,
    sound: "default",
    title: title || "SalesDash Notification",
    body: body || "",
    data: data,
    priority: "high",
    channelId: "default",
    _displayInForeground: true,
  }));

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log("📲 [PushSender] Push notifications dispatched successfully:", result?.data?.length || messages.length);
    return result;
  } catch (error) {
    console.error("❌ [PushSender] Error sending push notification:", error);
  }
}

module.exports = { sendExpoPushNotification };
