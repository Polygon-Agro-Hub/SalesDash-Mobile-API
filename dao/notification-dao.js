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
exports.savePushTokenDAO = (salesAgentId, pushToken, platform = "android") => {
  return new Promise((resolve, reject) => {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS salesagent_push_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        salesAgentId INT NOT NULL,
        pushToken VARCHAR(255) NOT NULL UNIQUE,
        platform VARCHAR(50) DEFAULT 'android',
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_salesAgentId (salesAgentId)
      )
    `;

    db.collectionofficer.query(createTableSql, (tableErr) => {
      if (tableErr) {
        console.warn("[NotificationDAO] Error ensuring push tokens table exists:", tableErr.message);
      }

      const insertSql = `
        INSERT INTO salesagent_push_tokens (salesAgentId, pushToken, platform)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          salesAgentId = VALUES(salesAgentId),
          platform = VALUES(platform),
          updatedAt = CURRENT_TIMESTAMP
      `;

      db.collectionofficer.query(insertSql, [salesAgentId, pushToken, platform], (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  });
};

// Get Push Tokens DAO
exports.getPushTokensBySalesAgentDAO = (salesAgentId) => {
  return new Promise((resolve) => {
    const query = `
      SELECT pushToken 
      FROM salesagent_push_tokens 
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