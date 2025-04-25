const db = require('../startup/database');


/**
 * Process a complete order with transaction support
 * @param {Object} orderData - Complete order data from request
 * @param {Number} salesAgentId - ID of the sales agent
 * @returns {Promise<{orderId: number}>} Object containing the new order ID
 */
exports.processOrder = async (orderData, salesAgentId) => {
  console.time('process-order');
  let connection;

  try {
    // Get connection from pool
    connection = await db.dash.promise().getConnection();
    console.log('Database connection acquired');

    // Start transaction
    await connection.beginTransaction();
    console.log('Transaction started');

    // STEP 1: Insert main order record
    const orderId = await insertMainOrder(connection, orderData, salesAgentId);
    console.log(`Main order created with ID: ${orderId}`);

    // STEP 2: Process items based on order type
    if (orderData.isCustomPackage) {
      await processCustomPackage(connection, orderId, orderData);
      console.log('Custom package items processed');
    } else if (orderData.isSelectPackage) {
      await processSelectedPackage(connection, orderId, orderData);
      console.log('Package order processed');
    }

    // STEP 3: Update salesagentstars table for the sales agent
    await updateSalesAgentStars(connection, salesAgentId);
    console.log('Sales agent stars updated');

    // Commit transaction if everything succeeded
    await connection.commit();
    console.log('Transaction committed successfully');
    console.timeEnd('process-order');

    return { orderId };
  } catch (error) {
    console.error('Error in processOrder:', error);

    // Rollback transaction if connection exists
    if (connection) {
      try {
        await connection.rollback();
        console.log('Transaction rolled back');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }

    throw new Error(`Order processing failed: ${error.message}`);
  } finally {
    // Release connection back to pool
    if (connection) {
      try {
        connection.release();
        console.log('DB connection released');
      } catch (releaseError) {
        console.error('Error releasing connection:', releaseError);
      }
    }
  }
};


// Helper function to insert main order record
async function insertMainOrder(connection, orderData, salesAgentId) {
  const {
    customerId,
    isCustomPackage,
    isSelectPackage,
    scheduleDate,
    selectedTimeSlot,
    paymentMethod,
    fullTotal,
    discount,
    subtotal,
    deleteStatus = false
  } = orderData;

  // Format date if needed (from "12 Apr 2025" to "YYYY-MM-DD 00:00:00")
  let formattedDate = scheduleDate;
  if (scheduleDate && typeof scheduleDate === 'string' && scheduleDate.match(/^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/)) {
    const dateParts = scheduleDate.split(' ');
    const day = parseInt(dateParts[0], 10);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames.indexOf(dateParts[1]) + 1;
    const year = parseInt(dateParts[2], 10);
    formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} 00:00:00`;
  }

  // Generate Invoice Number (YYMMDDRRRR)
  const today = new Date();
  const datePrefix = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

  // Get the current max sequence number for today
  const [sequenceResult] = await connection.query(
    'SELECT MAX(InvNo) as maxInvNo FROM orders WHERE InvNo LIKE ?',
    [`${datePrefix}%`]
  );

  let sequenceNumber = 1;
  if (sequenceResult[0].maxInvNo) {
    sequenceNumber = parseInt(sequenceResult[0].maxInvNo.slice(-4), 10) + 1;
  }

  const invNo = `${datePrefix}${sequenceNumber.toString().padStart(4, '0')}`;

  // Insert order record
  const [result] = await connection.query(
    `INSERT INTO orders (
      customerId, salesAgentId, InvNo, customPackage, selectedPackage, deliveryType,
      scheduleDate, scheduleTimeSlot, paymentMethod,
      paymentStatus, orderStatus, fullTotal,
      fullDiscount, fullSubTotal, deleteStatus
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customerId,
      salesAgentId,
      invNo,
      isCustomPackage ? 1 : 0,
      isSelectPackage ? 1 : 0,
      'One Time',
      formattedDate,
      selectedTimeSlot,
      paymentMethod,
      0, // paymentStatus default false
      'Ordered', // orderStatus default
      fullTotal,
      discount,
      subtotal,
      deleteStatus ? 1 : 0
    ]
  );

  return result.insertId;
}

// Helper function to process custom package items
async function processCustomPackage(connection, orderId, orderData) {
  if (!orderData.items?.length) return;

  const values = orderData.items.map(item => [
    orderId,
    item.id, // mpItemId
    item.quantity,
    item.unitType,
    item.normalPrice * item.quantity, // total
    (item.normalPrice - item.discountedPrice) * item.quantity, // discount
    item.price * item.quantity // subtotal
  ]);

  await connection.query(
    `INSERT INTO orderselecteditems (
      orderId, mpItemId, quantity, unitType, 
      total, discount, subtotal
    ) VALUES ?`,
    [values]
  );
}

// Helper function to process selected package
// Helper function to process selected package
async function processSelectedPackage(connection, orderId, orderData) {
  const packageId = orderData.packageId || (orderData.items && orderData.items[0]?.packageId);
  if (!packageId) {
    throw new Error('Package ID is required for selected package orders');
  }

  const {
    isModifiedPlus = false,
    isModifiedMin = false,
    isAdditionalItems = false,
    packageTotal = orderData.fullTotal,
    packageDiscount = orderData.discount,
    packageSubTotal = orderData.subtotal
  } = orderData;

  // Insert package record
  const [packageResult] = await connection.query(
    `INSERT INTO orderpackageitems (
      orderId, packageId, isModifiedPlus, isModifiedMin, 
      isAdditionalItems, packageTotal, packageDiscount, packageSubTotal
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orderId,
      packageId,
      isModifiedPlus ? 1 : 0,
      isModifiedMin ? 1 : 0,
      isAdditionalItems ? 1 : 0,
      packageTotal,
      packageDiscount,
      packageSubTotal
    ]
  );

  const orderPackageItemsId = packageResult.insertId;

  // Process modified plus items if they exist
  if (isModifiedPlus && orderData.modifiedPlusItems?.length > 0) {
    await connection.query(
      `INSERT INTO modifiedplusitems (
        orderPackageItemsId, packageDetailsId, originalQuantity, 
        modifiedQuantity, originalPrice, additionalPrice, additionalDiscount
      ) VALUES ?`,
      [orderData.modifiedPlusItems.map(item => [
        orderPackageItemsId,
        item.packageDetailsId,
        item.originalQuantity,
        item.modifiedQuantity,
        item.originalPrice,
        item.additionalPrice,
        item.additionalDiscount
      ])]
    );
  }

  // Process modified minus items if they exist
  if (isModifiedMin && orderData.modifiedMinItems?.length > 0) {
    await connection.query(
      `INSERT INTO modifiedminitems (
        orderPackageItemsId, packageDetailsId, originalQuantity, 
        modifiedQuantity, originalPrice, additionalPrice, additionalDiscount
      ) VALUES ?`,
      [orderData.modifiedMinItems.map(item => [
        orderPackageItemsId,
        item.packageDetailsId,
        item.originalQuantity,
        item.modifiedQuantity,
        item.originalPrice,
        item.additionalPrice,
        item.additionalDiscount
      ])]
    );
  }

  // Process additional items if they exist
  if (isAdditionalItems && orderData.additionalItems?.length > 0) {
    await connection.query(
      `INSERT INTO additionalitem (
        orderPackageItemsId, mpItemId, quantity, unitType, 
        total, discount, subtotal
      ) VALUES ?`,
      [orderData.additionalItems.map(item => [
        orderPackageItemsId,
        item.id,
        item.quantity,
        item.unitType,
        item.total,
        item.discount,
        item.subtotal
      ])]
    );
  }

  // NEW CODE: Process finalOrderPackageList if it exists
  if (orderData.finalOrderPackageList?.length > 0) {
    // Get the items from the finalOrderPackageList
    const finalOrderItems = orderData.finalOrderPackageList.map(item => [
      orderId,
      item.productId,
      item.quantity,
      item.price,
      item.isPacking || 0,
      new Date().toISOString().slice(0, 19).replace('T', ' ') // Format current timestamp for MySQL
    ]);

    // Insert all items into finalorderpackagelist table
    await connection.query(
      `INSERT INTO finalorderpackagelist (
        orderId, productId, quantity, price, isPacking, createdAt
      ) VALUES ?`,
      [finalOrderItems]
    );
  }
}




// exports.getAllOrderDetails = (salesAgentId) => {
//   return new Promise((resolve, reject) => {
//     const sql = `
//         SELECT 
//           o.id AS orderId,
//           o.customerId,
//           o.salesAgentId,
//           o.InvNo,
//           o.reportStatus,
//           o.customPackage,
//           o.selectedPackage,
//           o.deliveryType,
//           o.scheduleDate,
//           o.scheduleTimeSlot,
//           o.paymentMethod,
//           o.paymentStatus,
//           o.orderStatus,
//           o.createdAt,
//           o.fullTotal,
//           o.fullDiscount,
//           o.fullSubTotal,
//           c.firstName,
//           c.lastName,
//           c.phoneNumber,
//           c.buildingType
//         FROM orders o
//         JOIN customer c ON o.customerId = c.id
//       `;

//     db.dash.query(sql, (err, orderResults) => {
//       if (err) {
//         return reject(err);
//       }

//       if (orderResults.length === 0) {
//         return resolve({ message: 'No orders found' });
//       }

//       // Process each order to get corresponding address details
//       const orderPromises = orderResults.map(order => {
//         return new Promise((resolveOrder, rejectOrder) => {
//           const customerId = order.customerId;
//           const buildingType = order.buildingType;

//           if (buildingType === 'House') {
//             const addressSql = `
//                 SELECT 
//                   houseNo,
//                   streetName,
//                   city
//                 FROM house
//                 WHERE customerId = ?
//               `;

//             db.dash.query(addressSql, [customerId], (err, addressResults) => {
//               if (err) {
//                 return rejectOrder(err);
//               }

//               let formattedAddress = '';
//               if (addressResults[0]) {
//                 const addr = addressResults[0];
//                 formattedAddress = `${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
//                 formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
//               }

//               resolveOrder({
//                 ...order,
//                 fullAddress: formattedAddress
//               });
//             });
//           } else if (buildingType === 'Apartment') {
//             const addressSql = `
//                 SELECT 
//                   buildingNo,
//                   buildingName,
//                   unitNo,
//                   floorNo,
//                   houseNo,
//                   streetName,
//                   city
//                 FROM apartment
//                 WHERE customerId = ?
//               `;

//             db.dash.query(addressSql, [customerId], (err, addressResults) => {
//               if (err) {
//                 return rejectOrder(err);
//               }

//               let formattedAddress = '';
//               if (addressResults[0]) {
//                 const addr = addressResults[0];
//                 formattedAddress = `${addr.buildingName || ''} ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
//                 formattedAddress = formattedAddress.replace(/\s+/g, ' ')
//                   .replace(/, Unit ,/, ',')
//                   .replace(/, Floor ,/, ',')
//                   .trim();
//                 formattedAddress = formattedAddress.replace(/,\s*$/, '');
//               }

//               resolveOrder({
//                 ...order,
//                 fullAddress: formattedAddress
//               });
//             });
//           } else {
//             resolveOrder({
//               ...order,
//               fullAddress: ''
//             });
//           }
//         });
//       });

//       Promise.all(orderPromises)
//         .then(results => resolve(results))
//         .catch(error => reject(error));
//     });
//   });
// };

exports.getAllOrderDetails = (salesAgentId) => {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT 
        o.id AS orderId,
        o.customerId,
        o.salesAgentId,
        o.InvNo,
        o.reportStatus,
        o.customPackage,
        o.selectedPackage,
        o.deliveryType,
        o.scheduleDate,
        o.scheduleTimeSlot,
        o.paymentMethod,
        o.paymentStatus,
        o.orderStatus,
        o.createdAt,
        o.fullTotal,
        o.fullDiscount,
        o.fullSubTotal,
        c.firstName,
        c.lastName,
        c.phoneNumber,
        c.buildingType
      FROM orders o
      JOIN customer c ON o.customerId = c.id
    `;

    // Add WHERE clause if salesAgentId is provided
    const params = [];
    if (salesAgentId) {
      sql += ` WHERE o.salesAgentId = ?`;
      params.push(salesAgentId);
    }

    db.dash.query(sql, params, (err, orderResults) => {
      if (err) {
        return reject(err);
      }

      if (orderResults.length === 0) {
        return resolve({ message: 'No orders found' });
      }

      // Process each order to get corresponding address details
      const orderPromises = orderResults.map(order => {
        return new Promise((resolveOrder, rejectOrder) => {
          const customerId = order.customerId;
          const buildingType = order.buildingType;

          if (buildingType === 'House') {
            const addressSql = `
              SELECT 
                houseNo,
                streetName,
                city
              FROM house
              WHERE customerId = ?
            `;

            db.dash.query(addressSql, [customerId], (err, addressResults) => {
              if (err) {
                return rejectOrder(err);
              }

              let formattedAddress = '';
              if (addressResults[0]) {
                const addr = addressResults[0];
                formattedAddress = `${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
                formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
              }

              resolveOrder({
                ...order,
                fullAddress: formattedAddress
              });
            });
          } else if (buildingType === 'Apartment') {
            const addressSql = `
              SELECT 
                buildingNo,
                buildingName,
                unitNo,
                floorNo,
                houseNo,
                streetName,
                city
              FROM apartment
              WHERE customerId = ?
            `;

            db.dash.query(addressSql, [customerId], (err, addressResults) => {
              if (err) {
                return rejectOrder(err);
              }

              let formattedAddress = '';
              if (addressResults[0]) {
                const addr = addressResults[0];
                formattedAddress = `${addr.buildingName || ''} ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
                formattedAddress = formattedAddress.replace(/\s+/g, ' ')
                  .replace(/, Unit ,/, ',')
                  .replace(/, Floor ,/, ',')
                  .trim();
                formattedAddress = formattedAddress.replace(/,\s*$/, '');
              }

              resolveOrder({
                ...order,
                fullAddress: formattedAddress
              });
            });
          } else {
            resolveOrder({
              ...order,
              fullAddress: ''
            });
          }
        });
      });

      Promise.all(orderPromises)
        .then(results => resolve(results))
        .catch(error => reject(error));
    });
  });
};

exports.getOrderById = (orderId) => {
  return new Promise((resolve, reject) => {
    const sql = `
        SELECT 
          o.id AS orderId,
          o.customerId,
          o.deliveryType,
          o.scheduleDate,
          o.scheduleTimeSlot,  
          o.paymentMethod,
          o.paymentStatus,
          o.orderStatus,
          o.createdAt,
          o.InvNo,
          o.reportStatus,
          o.fullTotal,
          o.fullDiscount,
          o.fullSubTotal,  
          c.firstName,
          c.lastName,
          c.phoneNumber,
          c.buildingType
        FROM orders o
        JOIN customer c ON o.customerId = c.id
        WHERE o.id = ?
      `;

    db.dash.query(sql, [orderId], (err, orderResults) => {
      if (err) {
        return reject(err);
      }

      if (orderResults.length === 0) {
        return resolve({ message: 'No order found with the given ID' });
      }

      const order = orderResults[0];
      const customerId = order.customerId;
      const buildingType = order.buildingType;

      if (buildingType === 'House') {
        const addressSql = `
            SELECT 
              houseNo,
              streetName,
              city
            FROM house
            WHERE customerId = ?
          `;

        db.dash.query(addressSql, [customerId], (err, addressResults) => {
          if (err) {
            return reject(err);
          }

          let formattedAddress = '';
          if (addressResults[0]) {
            const addr = addressResults[0];
            formattedAddress = `${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
            formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
          }

          resolve({
            ...order,
            fullAddress: formattedAddress
          });
        });
      } else if (buildingType === 'Apartment') {
        const addressSql = `
            SELECT 
              buildingNo,
              buildingName,
              unitNo,
              floorNo,
              houseNo,
              streetName,
              city
            FROM apartment
            WHERE customerId = ?
          `;

        db.dash.query(addressSql, [customerId], (err, addressResults) => {
          if (err) {
            return reject(err);
          }

          let formattedAddress = '';
          if (addressResults[0]) {
            const addr = addressResults[0];
            formattedAddress = `${addr.buildingName || ''} ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
            formattedAddress = formattedAddress.replace(/\s+/g, ' ')
              .replace(/, Unit ,/, ',')
              .replace(/, Floor ,/, ',')
              .trim();
            formattedAddress = formattedAddress.replace(/,\s*$/, '');
          }

          resolve({
            ...order,
            fullAddress: formattedAddress
          });
        });
      } else {
        resolve({
          ...order,
          fullAddress: ''
        });
      }
    });
  });
};

exports.getOrderByCustomerId = (customerId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT 
        id AS orderId,
        customerId,
        deliveryType,
        scheduleDate,
        scheduleTimeSlot,  
        paymentMethod,
        paymentStatus,
        orderStatus,
        createdAt,
        InvNo,
        reportStatus,
        fullTotal,
        fullDiscount,
        fullSubTotal  
      FROM orders
      WHERE customerId = ?
    `;

    db.dash.query(sql, [customerId], (err, orderResults) => {
      if (err) {
        return reject(err);
      }

      if (orderResults.length === 0) {
        return resolve({ message: 'No orders found for this customer' });
      }

      resolve(orderResults);
    });
  });
};



exports.getDataCustomerId = (customerId) => {
  return new Promise((resolve, reject) => {
    // First query to get basic customer info
    const customerSql = `
      SELECT 
        id,
        cusId,
        salesAgent,
        title,
        firstName,
        lastName,
        phoneNumber,
        email,
        buildingType
      FROM customer
      WHERE id = ?
    `;

    db.dash.query(customerSql, [customerId], (err, customerResults) => {
      if (err) {
        return reject(err);
      }

      if (customerResults.length === 0) {
        return resolve({ message: 'No customer found with this ID' });
      }

      const customer = customerResults[0];
      const buildingType = customer.buildingType.toLowerCase();

      // Second query to get building details based on building type
      const buildingSql = `
        SELECT * FROM ${buildingType}
        WHERE customerId = ?
      `;

      db.dash.query(buildingSql, [customerId], (err, buildingResults) => {
        if (err) {
          return reject(err);
        }

        // Combine customer info with building info
        const result = {
          ...customer,
          buildingDetails: buildingResults.length > 0 ? buildingResults[0] : null
        };

        resolve(result);
      });
    });
  });
};



// order-dao.js

exports.cancelOrder = (orderId) => {
  return new Promise((resolve, reject) => {
    // Update order status to Cancelled
    const updateSql = `
      UPDATE dash.orders 
      SET orderStatus = 'Cancelled'
      WHERE id = ?
    `;

    db.dash.query(updateSql, [orderId], (err, result) => {
      if (err) {
        return reject(err);
      }

      // Check if any row was affected
      if (result.affectedRows === 0) {
        return resolve({
          message: 'Order not found or already cancelled'
        });
      }

      // Return success
      resolve({
        success: true,
        message: 'Order cancelled successfully',
        orderId: orderId
      });
    });
  });
};

exports.reportOrder = (orderId, reportStatus) => {
  return new Promise((resolve, reject) => {
    const updateSql = `
      UPDATE dash.orders 
      SET reportStatus = ?
      WHERE id = ?
    `;

    db.dash.query(updateSql, [reportStatus, orderId], (err, result) => {
      if (err) {
        return reject(err);
      }

      // Check if any row was affected
      if (result.affectedRows === 0) {
        return resolve({
          message: 'Order not found or could not be updated'
        });
      }

      // Return success
      resolve({
        success: true,
        message: 'Order report status updated successfully',
        orderId: orderId,
        reportStatus: reportStatus
      });
    });
  });
};





exports.getTodayStats = async (salesAgentId) => {
  try {
    const connection = await db.dash.promise().getConnection();

    try {
      // Get current date in YYYY-MM-DD format
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

      // Get today's stats
      const [rows] = await connection.query(
        'SELECT target, completed, numOfStars FROM salesagentstars WHERE salesagentId = ? AND date = ?',
        [salesAgentId, formattedDate]
      );

      // Return default values if no record found
      if (rows.length === 0) {
        return {
          target: 10, // Default target value
          completed: 0,
          numOfStars: 0,
          progress: 0
        };
      }

      // Calculate progress (between 0 and 1)
      const progress = rows[0].target > 0 ?
        Math.min(rows[0].completed / rows[0].target, 1) : 0;

      return {
        target: rows[0].target,
        completed: rows[0].completed,
        numOfStars: rows[0].numOfStars,
        progress
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error in getTodayStats:', error);
    throw new Error(`Failed to get today's stats: ${error.message}`);
  }
};


exports.getMonthlyStats = async (salesAgentId) => {
  try {
    const connection = await db.dash.promise().getConnection();

    try {
      // Get current month range
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
      const lastDay = month === 12 ?
        `${year + 1}-01-01` :
        `${year}-${(month + 1).toString().padStart(2, '0')}-01`;

      // Get sum of numOfStars for the current month
      const [rows] = await connection.query(
        'SELECT SUM(numOfStars) as totalStars FROM salesagentstars WHERE salesagentId = ? AND date >= ? AND date < ?',
        [salesAgentId, firstDay, lastDay]
      );

      return {
        totalStars: rows[0].totalStars || 0
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error in getMonthlyStats:', error);
    throw new Error(`Failed to get monthly stats: ${error.message}`);
  }
};


exports.getCombinedStats = async (salesAgentId) => {
  try {
    const dailyStats = await exports.getTodayStats(salesAgentId);
    const monthlyStats = await exports.getMonthlyStats(salesAgentId);

    return {
      daily: dailyStats,
      monthly: monthlyStats
    };
  } catch (error) {
    console.error('Error in getCombinedStats:', error);
    throw new Error(`Failed to get combined stats: ${error.message}`);
  }
};


exports.getAllAgentStats = async (salesAgentId) => {
  try {
    const connection = await db.dash.promise().getConnection();

    try {
      // Get today's stats
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

      const [todayStats] = await connection.query(
        'SELECT target, completed, numOfStars FROM salesagentstars WHERE salesAgentId = ? AND date = ?',
        [salesAgentId, formattedDate]
      );

      // Calculate today's progress
      const dailyStats = todayStats.length > 0 ? {
        target: todayStats[0].target,
        completed: todayStats[0].completed,
        numOfStars: todayStats[0].numOfStars,
        progress: todayStats[0].target > 0 ? Math.min(todayStats[0].completed / todayStats[0].target, 1) : 0
      } : {
        target: 10,
        completed: 0,
        numOfStars: 0,
        progress: 0
      };

      // Get total number of stars for the agent (all time)
      const [totalStarsResult] = await connection.query(
        'SELECT SUM(numOfStars) as totalStars FROM salesagentstars WHERE salesAgentId = ?',
        [salesAgentId]
      );

      // Get count of total entries for this agent
      const [totalEntriesResult] = await connection.query(
        'SELECT COUNT(*) as totalEntries FROM salesagentstars WHERE salesAgentId = ?',
        [salesAgentId]
      );

      return {
        daily: dailyStats,
        monthly: {
          totalStars: totalStarsResult[0].totalStars || 0
        },
        totalEntries: totalEntriesResult[0].totalEntries || 0
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error in getAllAgentStats:', error);
    throw new Error(`Failed to get agent stats: ${error.message}`);
  }
};

exports.getOrderCountBySalesAgent = async () => {
  try {
    const connection = await db.dash.promise().getConnection();
    try {
      const [rows] = await connection.query(`
        SELECT salesAgentId, COUNT(*) AS orderCount
        FROM orders
        GROUP BY salesAgentId
      `);
      return rows;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Error in getOrderCountBySalesAgent:', error);
    throw new Error(`Failed to get order count: ${error.message}`);
  }
};

/**
 * Update sales agent stars for the current date
 * Increments the 'completed' column by 1 for the given salesAgentId on current date
 * Updates numOfStars to 1 if completed equals target, otherwise leaves it unchanged
 * If no record exists for today, creates a new one
 * 
 * @param {Object} connection - Database connection
 * @param {Number} salesAgentId - ID of the sales agent
 * @returns {Promise<void>}
 */
async function updateSalesAgentStars(connection, salesAgentId) {
  // Get current date in YYYY-MM-DD format
  const today = new Date();
  const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  // Check if a record exists for this sales agent on the current date
  const [existingRows] = await connection.query(
    'SELECT id, completed, target, numOfStars FROM salesagentstars WHERE salesagentId = ? AND date = ?',
    [salesAgentId, formattedDate]
  );

  if (existingRows.length > 0) {
    // Record exists, update the completed count by incrementing it
    const currentRecord = existingRows[0];
    const currentCompleted = currentRecord.completed || 0;
    const newCompleted = currentCompleted + 1;
    const targetValue = currentRecord.target || 0;

    // Determine if numOfStars should be updated
    let numOfStars = currentRecord.numOfStars || 0;
    if (newCompleted === targetValue) {
      numOfStars = 1;
      console.log(`Sales agent ${salesAgentId} achieved target (${targetValue}), setting numOfStars to 1`);
    }

    await connection.query(
      'UPDATE salesagentstars SET completed = ?, numOfStars = ? WHERE id = ?',
      [newCompleted, numOfStars, currentRecord.id]
    );

    console.log(`Updated sales agent ${salesAgentId} stars: completed ${currentCompleted} -> ${newCompleted}`);
  } else {
    // No record exists for today, create a new one with completed = 1
    // Note: We don't know the target yet, so numOfStars will be 0 initially
    await connection.query(
      'INSERT INTO salesagentstars (salesagentId, date, completed, target, numOfStars) VALUES (?, ?, ?, ?, ?)',
      [salesAgentId, formattedDate, 1, 0, 0]  // Initialize with defaults
    );

    console.log(`Created new sales agent ${salesAgentId} stars record with completed = 1`);
  }
}





