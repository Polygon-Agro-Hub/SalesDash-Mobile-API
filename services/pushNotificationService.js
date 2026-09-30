const { collectionofficer } = require("../startup/database");
const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const firebaseConfig = require("../constants/firebase-config");

let firebaseApp = null;
let messaging = null;
let firebaseInitialized = false;

function initFirebase() {
  if (firebaseInitialized) return messaging;

  try {
    if (!firebaseConfig || !firebaseConfig.project_id) {
      console.warn("⚠️ [PushService] Firebase configuration not found in constants/firebase-config");
      return null;
    }

    if (getApps().length === 0) {
      firebaseApp = initializeApp({
        credential: cert(firebaseConfig),
      });
      console.log("🔥 [PushService] Firebase Admin SDK initialized successfully with project:", firebaseConfig.project_id);
    } else {
      firebaseApp = getApps()[0];
    }

    messaging = getMessaging(firebaseApp);
    firebaseInitialized = true;
    return messaging;
  } catch (err) {
    console.error("❌ [PushService] Failed to initialize Firebase Admin SDK:", err.message);
    return null;
  }
}

/**
 * Normalize device type to match DB enum ('android', 'ios')
 */
function normalizeDeviceType(deviceType) {
  if (!deviceType || typeof deviceType !== "string") return "android";
  const lower = deviceType.toLowerCase().trim();
  return lower === "ios" ? "ios" : "android";
}

/**
 * Save or update sales agent push token in notificationpushtoken table
 * Matches schema: salesAgentId, pushToken, deviceType
 * Unique key: uk_salesagent_token (salesAgentId, pushToken(191))
 */
async function saveSalesAgentPushToken(salesAgentId, pushToken, arg3 = "android", arg4) {
  if (!salesAgentId || !pushToken) {
    throw new Error("salesAgentId and pushToken are required");
  }

  let rawDevice = "android";
  if (typeof arg4 === "string") {
    rawDevice = arg4;
  } else if (typeof arg3 === "string" && (arg3.toLowerCase() === "android" || arg3.toLowerCase() === "ios")) {
    rawDevice = arg3;
  }
  const deviceType = normalizeDeviceType(rawDevice);

  const sql = `
    INSERT INTO notificationpushtoken (salesAgentId, pushToken, deviceType, updatedAt)
    VALUES (?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      deviceType = VALUES(deviceType),
      updatedAt = NOW()
  `;

  return new Promise((resolve, reject) => {
    collectionofficer.query(sql, [salesAgentId, pushToken, deviceType], (err, result) => {
      if (err) {
        console.error("❌ [PushService] Error saving push token for sales agent:", err);
        return reject(err);
      }
      console.log(`✅ [PushService] Push token saved for salesAgentId: ${salesAgentId} (${deviceType})`);
      resolve(result);
    });
  });
}

/**
 * Save or update officer push token in notificationpushtoken table
 * Matches schema: officerId, pushToken, deviceType
 * Unique key: uk_officer_token (officerId, pushToken(191))
 */
async function saveOfficerPushToken(officerId, pushToken, arg3 = "android", arg4) {
  if (!officerId || !pushToken) {
    throw new Error("officerId and pushToken are required");
  }

  let rawDevice = "android";
  if (typeof arg4 === "string") {
    rawDevice = arg4;
  } else if (typeof arg3 === "string" && (arg3.toLowerCase() === "android" || arg3.toLowerCase() === "ios")) {
    rawDevice = arg3;
  }
  const deviceType = normalizeDeviceType(rawDevice);

  const sql = `
    INSERT INTO notificationpushtoken (officerId, pushToken, deviceType, updatedAt)
    VALUES (?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      deviceType = VALUES(deviceType),
      updatedAt = NOW()
  `;

  return new Promise((resolve, reject) => {
    collectionofficer.query(sql, [officerId, pushToken, deviceType], (err, result) => {
      if (err) {
        console.error("❌ [PushService] Error saving push token for officer:", err);
        return reject(err);
      }
      console.log(`✅ [PushService] Push token saved for officerId: ${officerId} (${deviceType})`);
      resolve(result);
    });
  });
}

/**
 * Remove an invalid/expired token from the database
 */
function removeToken(pushToken) {
  const sql = "DELETE FROM notificationpushtoken WHERE pushToken = ?";
  collectionofficer.query(sql, [pushToken], (err) => {
    if (err) console.error("Error removing expired push token:", err);
    else console.log("Removed expired/unregistered push token:", pushToken);
  });
}

/**
 * Remove sales agent-specific push token
 */
function removeSalesAgentToken(salesAgentId, pushToken) {
  const sql = "DELETE FROM notificationpushtoken WHERE salesAgentId = ? AND pushToken = ?";
  collectionofficer.query(sql, [salesAgentId, pushToken], (err) => {
    if (err) console.error("Error removing sales agent push token:", err);
  });
}

/**
 * Remove officer-specific push token
 */
function removeOfficerToken(officerId, pushToken) {
  const sql = "DELETE FROM notificationpushtoken WHERE officerId = ? AND pushToken = ?";
  collectionofficer.query(sql, [officerId, pushToken], (err) => {
    if (err) console.error("Error removing officer push token:", err);
  });
}

/**
 * Helper to dispatch push notifications to a list of tokens (Expo or FCM)
 */
async function sendPushToTokens(tokenRows, { title, body, data = {} }) {
  if (!tokenRows || tokenRows.length === 0) {
    return { success: true, count: 0, results: [] };
  }

  const fbMessaging = initFirebase();
  const stringifiedData = {};
  for (const [key, value] of Object.entries(data)) {
    stringifiedData[key] = typeof value === "string" ? value : JSON.stringify(value);
  }

  const results = [];

  for (const row of tokenRows) {
    const pushToken = typeof row === "string" ? row : row.pushToken;
    if (!pushToken) continue;

    // 1. Expo Push Token handling
    if (pushToken.startsWith("ExponentPushToken") || pushToken.startsWith("ExpoPushToken")) {
      try {
        const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: pushToken,
            title: title,
            body: body,
            sound: "default",
            priority: "high",
            channelId: "default",
            color: "#6638CE",
            _displayInForeground: true,
            data: stringifiedData,
          }),
        });
        const expoResult = await expoResponse.json();
        console.log(`📱 [PushService] Expo Push response for token ${pushToken.slice(0, 15)}...:`, expoResult);
        results.push({ token: pushToken, success: true, type: "expo" });
      } catch (expoErr) {
        console.error("❌ [PushService] Expo push error:", expoErr.message);
        results.push({ token: pushToken, success: false, error: expoErr.message });
      }
      continue;
    }

    // 2. Native FCM Token handling via Firebase Admin
    if (fbMessaging) {
      try {
        const message = {
          token: pushToken,
          notification: {
            title: title,
            body: body,
          },
          data: stringifiedData,
          android: {
            priority: "high",
            notification: {
              channelId: "default",
              sound: "default",
              icon: "dashicon",
              color: "#6638CE",
              priority: "max",
              defaultVibrateTimings: true,
              visibility: "public",
            },
          },
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
          },
        };

        const response = await fbMessaging.send(message);
        console.log(`🔥 [PushService] FCM message sent successfully! MessageId: ${response}`);
        results.push({ token: pushToken, success: true, messageId: response });
      } catch (fcmErr) {
        console.error("❌ [PushService] FCM send error:", fcmErr.message);
        if (
          fcmErr.code === "messaging/registration-token-not-registered" ||
          fcmErr.code === "messaging/invalid-registration-token"
        ) {
          removeToken(pushToken);
        }
        results.push({ token: pushToken, success: false, error: fcmErr.message });
      }
    } else {
      console.warn("⚠️ [PushService] Firebase Messaging not initialized; skipped FCM send for token:", pushToken.slice(0, 15));
    }
  }

  return { success: true, count: results.length, results };
}

/**
 * Send push notification to all active devices of a Sales Agent
 */
async function sendPushToSalesAgent(salesAgentId, { title, body, data = {} }) {
  if (!salesAgentId) return { success: false, error: "salesAgentId is required" };

  const getTokensSql = `
    SELECT pushToken, deviceType 
    FROM notificationpushtoken 
    WHERE salesAgentId = ?
  `;

  return new Promise((resolve) => {
    collectionofficer.query(getTokensSql, [salesAgentId], async (err, rows) => {
      if (err) {
        console.error("❌ [PushService] Error fetching push tokens for sales agent:", err);
        return resolve({ success: false, error: err.message });
      }

      if (!rows || rows.length === 0) {
        console.log(`ℹ️ [PushService] No registered push tokens found for salesAgentId: ${salesAgentId}`);
        return resolve({ success: true, count: 0, results: [] });
      }

      console.log(`📢 [PushService] Found ${rows.length} token(s) for salesAgentId: ${salesAgentId}. Sending push...`);
      const result = await sendPushToTokens(rows, { title, body, data });
      resolve(result);
    });
  });
}

/**
 * Send push notification to all active devices of an officer
 */
async function sendPushToOfficer(officerId, { title, body, data = {} }) {
  if (!officerId) return { success: false, error: "officerId is required" };

  const getTokensSql = `
    SELECT pushToken, deviceType 
    FROM notificationpushtoken 
    WHERE officerId = ?
  `;

  return new Promise((resolve) => {
    collectionofficer.query(getTokensSql, [officerId], async (err, rows) => {
      if (err) {
        console.error("❌ [PushService] Error fetching push tokens for officer:", err);
        return resolve({ success: false, error: err.message });
      }

      if (!rows || rows.length === 0) {
        console.log(`ℹ️ [PushService] No registered push tokens found for officerId: ${officerId}`);
        return resolve({ success: true, count: 0, results: [] });
      }

      console.log(`📢 [PushService] Found ${rows.length} token(s) for officerId: ${officerId}. Sending push...`);
      const result = await sendPushToTokens(rows, { title, body, data });
      resolve(result);
    });
  });
}

module.exports = {
  initFirebase,
  saveSalesAgentPushToken,
  saveOfficerPushToken,
  saveUserPushToken: saveSalesAgentPushToken,
  sendPushToSalesAgent,
  sendPushToOfficer,
  sendPushToUser: sendPushToSalesAgent,
  sendPushToTokens,
  removeToken,
  removeSalesAgentToken,
  removeOfficerToken,
};
