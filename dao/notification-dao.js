const db = require("../startup/database");

// Get All Notification DAO
exports.getNotificationsBySalesAgentDAO = (salesAgentId) => {
  return new Promise((resolve, reject) => {
    const query = `
    SELECT 
  dn.id,
  dn.orderId,
  dn.title,
  dn.readStatus,
  dn.createdAt,
  po.invNo,
  po.status,
  po.reportStatus,
  o.id as orderid,
  o.userId AS cusId,
  mps.cusId As customerId,
  o.fullName AS customerName,
  CONCAT(o.phonecode1, o.phone1) AS phoneNumber
FROM dashnotification dn
JOIN processorders po ON dn.orderId = po.id
JOIN orders o ON  po.orderId = o.id
JOIN marketplaceusers mps ON o.userId = mps.id
WHERE mps.salesAgent = ?
ORDER BY dn.createdAt DESC
    `;

    const countQuery = `
      SELECT COUNT(*) AS unreadCount 
      FROM dashnotification dn
      JOIN processorders po ON dn.orderId = po.id
      JOIN orders o ON po.orderId = o.id
      JOIN marketplaceusers mps ON o.userId = mps.id
      WHERE mps.salesAgent = ? AND dn.readStatus = 0
    `;

    db.collectionofficer.query(query, [salesAgentId], (err, notifications) => {
      if (err) return reject(err);

      db.collectionofficer.query(countQuery, [salesAgentId], (err, countResult) => {
        if (err) return reject(err);

        resolve({
          notifications,
          unreadCount: countResult[0]?.unreadCount || 0,
        });
      });
    });
  });
};

// Mark As Read Notification DAO
exports.markNotificationsAsReadByOrderIdDAO = (id) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE dashnotification 
      SET readStatus = 1 
      WHERE id = ? AND readStatus = 0
    `;

    db.collectionofficer.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows);
    });
  });
};

// Delete Notification DAO
exports.deleteNotificationsByOrderIdDAO = (id) => {
  return new Promise((resolve, reject) => {
    const query = `
      DELETE FROM dashnotification
      WHERE id = ?
    `;

    db.collectionofficer.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows);
    });
  });
};

// Register / Save Push Token DAO
exports.savePushTokenDAO = async (salesAgentId, pushToken, platform = "android") => {
  const pushNotificationService = require("../services/pushNotificationService");
  return pushNotificationService.saveSalesAgentPushToken(salesAgentId, pushToken, platform);
};

// Get Push Tokens DAO
exports.getPushTokensBySalesAgentDAO = (salesAgentId) => {
  return new Promise((resolve) => {
    const query = `
      SELECT pushToken, deviceType 
      FROM notificationpushtoken 
      WHERE salesAgentId = ?
    `;

    db.collectionofficer.query(query, [salesAgentId], (err, results) => {
      if (err) {
        return resolve([]);
      }
      resolve((results || []).map((r) => r.pushToken));
    });
  });
};

// Insert Notification DAO
exports.insertNotificationDAO = (orderId, title) => {
  return new Promise((resolve, reject) => {
    const query = `
      INSERT INTO dashnotification (orderId, title, readStatus, createdAt)
      VALUES (?, ?, 0, NOW())
    `;

    db.collectionofficer.query(query, [orderId, title], (err, result) => {
      if (err) return reject(err);
      const insertedId = result.insertId;

      // Automatically dispatch Firebase / Expo Push Notification for background & closed-app delivery
      try {
        const lookupQuery = `
          SELECT mps.salesAgent, po.invNo, o.fullName AS customerName
          FROM processorders po
          JOIN orders o ON po.orderId = o.id
          JOIN marketplaceusers mps ON o.userId = mps.id
          WHERE po.id = ?
        `;
        db.collectionofficer.query(lookupQuery, [orderId], async (lErr, rows) => {
          if (!lErr && rows && rows.length > 0) {
            const { salesAgent, invNo, customerName } = rows[0];
            const pushNotificationService = require("../services/pushNotificationService");
            const message = invNo
              ? `Order #${invNo} for ${customerName || "Customer"}`
              : title;
            pushNotificationService
              .sendPushToSalesAgent(salesAgent, {
                title,
                body: message,
                data: {
                  orderId,
                  invNo,
                  notificationId: insertedId,
                },
              })
              .catch(() => {});
          }
        });
      } catch (_) {
        // Push notification dispatch is non-blocking
      }

      resolve(insertedId);
    });
  });
};