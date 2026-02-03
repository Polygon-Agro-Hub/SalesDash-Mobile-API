const db = require('../startup/database');
const smsService = require('../services/sms-service');
const { getIO, emitToAgent } = require('../config/socket.config');

exports.getNotificationsBySalesAgent = (salesAgentId) => {
  console.log('Fetching notifications for agent:', salesAgentId);
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
      o.id as orderid,
      o.userId AS cusId,
      mps.cusId As customerId,
      o.fullName AS customerName,
      CONCAT(o.phonecode1, o.phone1) AS phoneNumber
    FROM dashnotification dn
    JOIN processorders po ON dn.orderId = po.id
    JOIN orders o ON po.orderId = o.id
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

    db.marketPlace.query(query, [salesAgentId], (err, notifications) => {
      if (err) return reject(err);

      db.marketPlace.query(countQuery, [salesAgentId], (err, countResult) => {
        if (err) return reject(err);

        resolve({
          notifications,
          unreadCount: countResult[0]?.unreadCount || 0
        });
      });
    });
  });
};

exports.markNotificationsAsReadByOrderId = (id) => {
  console.log('Marking notification as read:', id);
  return new Promise((resolve, reject) => {
    const query = `
      UPDATE dashnotification 
      SET readStatus = 1 
      WHERE id = ? AND readStatus = 0
    `;

    db.marketPlace.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows);
    });
  });
};

exports.deleteNotificationsByOrderId = (id) => {
  return new Promise((resolve, reject) => {
    const query = `
      DELETE FROM dashnotification
      WHERE id = ?
    `;

    db.marketPlace.query(query, [id], (err, result) => {
      if (err) return reject(err);
      resolve(result.affectedRows);
    });
  });
};

// Helper to get sales agent ID from order
exports.getSalesAgentFromOrder = (orderId) => {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT mps.salesAgent
      FROM processorders po
      JOIN orders o ON po.orderId = o.id
      JOIN marketplaceusers mps ON o.userId = mps.id
      WHERE po.id = ?
    `;

    db.marketPlace.query(query, [orderId], (err, result) => {
      if (err) return reject(err);
      resolve(result[0]?.salesAgent || null);
    });
  });
};

/**
 * Create notification and emit via Socket.IO
 * @param {number} orderId - Process order ID
 * @param {string} title - Notification title
 * @returns {Promise<Object>} Created notification result
 */
exports.createNotification = async (orderId, title) => {
  return new Promise(async (resolve, reject) => {
    const insertQuery = `
      INSERT INTO dashnotification (orderId, title, readStatus, createdAt)
      VALUES (?, ?, 0, NOW())
    `;

    db.marketPlace.query(insertQuery, [orderId, title], async (err, result) => {
      if (err) return reject(err);

      try {
        // Get sales agent ID
        const salesAgentId = await exports.getSalesAgentFromOrder(orderId);
        
        if (salesAgentId) {
          try {
            // Fetch updated notifications for this sales agent
            const { notifications, unreadCount } = await exports.getNotificationsBySalesAgent(salesAgentId);
            
            // Emit to the specific sales agent's room using helper function
            const emitted = emitToAgent(salesAgentId, 'new_notification', {
              notification: notifications[0], // The newly created notification
              notifications: notifications,
              unreadCount: unreadCount,
              timestamp: new Date()
            });

            if (emitted) {
              console.log(`📢 Notification emitted to sales agent ${salesAgentId}`);
            } else {
              console.log(`⚠️ Socket.IO not available, notification saved to DB only`);
            }
          } catch (socketError) {
            console.error('Error emitting notification via Socket.IO:', socketError);
            // Continue even if socket emit fails - notification is still in DB
          }
        }

        resolve(result);
      } catch (error) {
        console.error('Error in notification creation process:', error);
        // Still resolve since the notification was created in DB
        resolve(result);
      }
    });
  });
};

/**
 * Create payment reminders for orders due in 3 days
 * @param {Server} io - Socket.IO server instance (optional)
 * @returns {Promise<Object>} Results with notification and SMS counts
 */
exports.createPaymentReminders = async (io) => {
  return new Promise(async (resolve, reject) => {
    const orderQuery = `
      SELECT 
        po.id as orderId,
        po.invNo,
        o.userId AS customerId,
        o.fullName AS customerName,
        CONCAT(o.phonecode1, o.phone1) AS phoneNumber,
        mps.salesAgent
      FROM processorders po
      JOIN orders o ON po.orderId = o.id
      JOIN marketplaceusers mps ON o.userId = mps.id
      WHERE DATE(o.sheduleDate) = DATE(DATE_ADD(CURDATE(), INTERVAL 3 DAY))
      AND NOT EXISTS (
        SELECT 1 FROM dashnotification dn 
        WHERE dn.orderId = po.id 
        AND dn.title LIKE 'Payment reminder%'
      )
    `;

    try {
      const orders = await queryAsync(orderQuery, []);

      console.log(`📋 Found ${orders.length} orders for payment reminders`);

      if (!orders || orders.length === 0) {
        return resolve({ notificationCount: 0, smsCount: 0, orders: [] });
      }

      const results = {
        notificationCount: 0,
        smsCount: 0,
        orders: []
      };

      for (const order of orders) {
        try {
          // Create notification in DB
          const title = `Payment reminder `;
          await insertNotification(order.orderId, title);
          results.notificationCount++;

          // Emit real-time notification via Socket.IO
          if (order.salesAgent) {
            try {
              const { notifications, unreadCount } = await exports.getNotificationsBySalesAgent(order.salesAgent);
              
              // Use helper function to emit
              const emitted = emitToAgent(order.salesAgent, 'new_notification', {
                notification: notifications[0],
                notifications: notifications,
                unreadCount: unreadCount,
                timestamp: new Date()
              });

              if (emitted) {
                console.log(`📢 Payment reminder emitted to agent ${order.salesAgent}`);
              }
            } catch (socketError) {
              console.error('Error emitting payment reminder:', socketError);
            }
          }

          // Send SMS
          if (order.phoneNumber) {
            const message = `Hello ${order.customerName}, this is a reminder that your payment for order ${order.invNo} is due in 3 days. Please ensure timely payment. Thank you!`;
            
            try {
              const smsResult = await smsService.sendSMS(order.phoneNumber, message);

              if (smsResult && smsResult.success) {
                results.smsCount++;
                console.log(`📱 SMS sent to ${order.phoneNumber}`);
              }

              results.orders.push({
                orderId: order.orderId,
                invNo: order.invNo,
                customerName: order.customerName,
                phoneNumber: order.phoneNumber,
                notificationSent: true,
                smsSent: smsResult && smsResult.success
              });
            } catch (smsError) {
              console.error(`SMS error for ${order.phoneNumber}:`, smsError);
              results.orders.push({
                orderId: order.orderId,
                invNo: order.invNo,
                customerName: order.customerName,
                phoneNumber: order.phoneNumber,
                notificationSent: true,
                smsSent: false,
                error: smsError.message
              });
            }
          } else {
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
    db.marketPlace.query(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

function insertNotification(orderId, title) {
  return new Promise((resolve, reject) => {
    const insertQuery = `
      INSERT INTO dashnotification (orderId, title, readStatus, createdAt)
      VALUES (?, ?, 0, NOW())
    `;

    db.marketPlace.query(insertQuery, [orderId, title], (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}