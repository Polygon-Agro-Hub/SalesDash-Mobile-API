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