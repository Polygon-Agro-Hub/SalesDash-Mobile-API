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



// exports.createPaymentReminders = () => {
//   return new Promise((resolve, reject) => {
//     // First get orders with scheduleDate 3 days from now
//     const orderQuery = `
//       SELECT 
//         o.id as orderId,
//         o.invNo,
//         o.customerId
//       FROM orders o
//       WHERE DATE(o.scheduleDate) = DATE(DATE_ADD(CURDATE(), INTERVAL 3 DAY))
//       AND NOT EXISTS (
//         SELECT 1 FROM dashnotification dn 
//         WHERE dn.orderId = o.id 
//         AND dn.title LIKE 'Payment reminder%'
//       )
//     `;

//     db.dash.query(orderQuery, [], (err, orders) => {
//       if (err) return reject(err);

//       if (!orders || orders.length === 0) {
//         return resolve(0); // No qualifying orders found
//       }

//       // Create notifications for each qualifying order
//       const insertQueries = orders.map(order => {
//         return new Promise((resolveInsert, rejectInsert) => {
//           const insertQuery = `
//             INSERT INTO dashnotification (orderId, title, readStatus, createdAt)
//             VALUES (?, ?, 0, NOW())
//           `;

//           const title = `Payment reminder `;

//           db.dash.query(insertQuery, [order.orderId, title], (insertErr, result) => {
//             if (insertErr) return rejectInsert(insertErr);
//             resolveInsert(result);
//           });
//         });
//       });

//       // Execute all insert queries
//       Promise.all(insertQueries)
//         .then(results => {
//           resolve(results.length); // Return number of notifications created
//         })
//         .catch(insertErr => {
//           reject(insertErr);
//         });
//     });
//   });
// };

// Update in notification-dao.js
// Make sure this is at the top of your file
const smsService = require('../services/sms-service');

exports.createPaymentReminders = async () => {
  return new Promise(async (resolve, reject) => {
    // First get orders with scheduleDate 3 days from now along with customer details
    const orderQuery = `
      SELECT 
        o.id as orderId,
        o.invNo,
        o.customerId,
        c.phoneNumber,
        CONCAT(c.firstName, ' ', c.lastName) AS customerName
      FROM orders o
      JOIN customer c ON o.customerId = c.id
      WHERE DATE(o.scheduleDate) = DATE(DATE_ADD(CURDATE(), INTERVAL 3 DAY))
      AND NOT EXISTS (
        SELECT 1 FROM dashnotification dn 
        WHERE dn.orderId = o.id 
        AND dn.title LIKE 'Payment reminder%'
      )
    `;

    try {
      const orders = await queryAsync(orderQuery, []);

      if (!orders || orders.length === 0) {
        return resolve({ notificationCount: 0, smsCount: 0, orders: [] }); // No qualifying orders found
      }

      // Create notifications for each qualifying order and send SMS
      const results = {
        notificationCount: 0,
        smsCount: 0,
        orders: []
      };

      for (const order of orders) {
        try {
          // 1. Create notification in database
          const title = `Payment reminder `;
          await insertNotification(order.orderId, title);
          results.notificationCount++;

          // 2. Send SMS to customer
          if (order.phoneNumber) {
            // Improved message format with more details
            const message = `Hello ${order.customerName}, this is a reminder that your payment for order ${order.invNo} is due in 3 days. Please ensure timely payment to avoid any service interruptions. Thank you!`;

            // Attempt to send the SMS
            const smsResult = await smsService.sendSMS(order.phoneNumber, message);

            // Log success or failure
            if (smsResult && smsResult.success) {
              console.log(`Successfully sent SMS to ${order.phoneNumber} for order ${order.invNo}`);
              results.smsCount++;
            } else {
              console.error(`Failed to send SMS to ${order.phoneNumber} for order ${order.invNo}`);
            }

            results.orders.push({
              orderId: order.orderId,
              invNo: order.invNo,
              customerName: order.customerName,
              phoneNumber: order.phoneNumber,
              notificationSent: true,
              smsSent: smsResult && smsResult.success,
              smsProvider: smsResult ? smsResult.provider : 'unknown'
            });
          } else {
            console.warn(`No phone number available for customer ${order.customerName}, order ${order.invNo}`);
            results.orders.push({
              orderId: order.orderId,
              invNo: order.invNo,
              customerName: order.customerName,
              phoneNumber: null,
              notificationSent: true,
              smsSent: false,
              reason: 'No phone number available'
            });
          }
        } catch (err) {
          console.error(`Error processing order ${order.orderId}:`, err);
          // Continue with other orders even if one fails
          results.orders.push({
            orderId: order.orderId,
            invNo: order.invNo,
            error: err.message,
            notificationSent: false,
            smsSent: false
          });
        }
      }

      resolve(results);
    } catch (error) {
      reject(error);
    }
  });
};

// Helper function to use promises with mysql queries
function queryAsync(query, params) {
  return new Promise((resolve, reject) => {
    db.dash.query(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

// Helper function to insert notification
function insertNotification(orderId, title) {
  return new Promise((resolve, reject) => {
    const insertQuery = `
      INSERT INTO dashnotification (orderId, title, readStatus, createdAt)
      VALUES (?, ?, 0, NOW())
    `;

    db.dash.query(insertQuery, [orderId, title], (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}