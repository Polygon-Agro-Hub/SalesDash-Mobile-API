const db = require('../startup/database');

exports.getNotificationsBySalesAgent = (salesAgentId) => {
  console.log(salesAgentId)
  return new Promise((resolve, reject) => {
    const query = `
      SELECT 
        dn.id,
        dn.orderId,
        dn.title,
        dn.readStatus,
        dn.createdAt,
        o.invNo,
        o.orderStatus,
        c.cusId,
        CONCAT(c.firstName, ' ', c.lastName) AS customerName,
        c.phoneNumber
      FROM dashnotification dn
      JOIN orders o ON dn.orderId = o.id
      JOIN customer c ON o.customerId = c.id
      WHERE o.salesAgentId = ?
      ORDER BY dn.createdAt DESC
    `;

    const countQuery = `
      SELECT COUNT(*) AS unreadCount 
      FROM dashnotification dn
      JOIN orders o ON dn.orderId = o.id
      WHERE o.salesAgentId = ? AND dn.readStatus = 0
    `;

    db.dash.query(query, [salesAgentId], (err, notifications) => {
      if (err) return reject(err);

      db.dash.query(countQuery, [salesAgentId], (err, countResult) => {
        if (err) return reject(err);

        resolve({
          notifications,
          unreadCount: countResult[0]?.unreadCount || 0
        });
      });
      console.log(notifications)
    });
  });
};

exports.markNotificationsAsReadByOrderId = (id) => {
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE dashnotification 
      SET readStatus = 1 
      WHERE id = ? AND readStatus = 0
    `;

    db.dash.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows); // Returns number of marked notifications
    });
  });
};

exports.deleteNotificationsByOrderId = (id) => {
  return new Promise((resolve, reject) => {
    const query = `
      DELETE FROM dashnotification
      WHERE id = ?
    `;

    db.dash.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows); // Returns number of deleted notifications
    });
  });
};