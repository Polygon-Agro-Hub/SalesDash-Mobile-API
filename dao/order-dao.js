const db = require('../startup/database');

exports.placeOrder = (orderData, salesAgentId) => {
    return new Promise((resolve, reject) => {
        // Make sure db.dash exists and is properly initialized
        if (!db || !db.dash) {
            return reject(new Error('Database connection pool not initialized'));
        }
        
        let connection;
        
        // Use proper error handling for the connection
        db.dash.getConnection((err, conn) => {
            if (err) {
                return reject(err);
            }
            
            connection = conn;
            
            connection.beginTransaction((err) => {
                if (err) {
                    connection.release();
                    return reject(err);
                }
                
                // Insert into orders table - Including all fields from schema
                connection.query(
                    `INSERT INTO orders (
                        customerId, 
                        salesAgentId, 
                        deliveryType, 
                        scheduleDate, 
                        selectedDays, 
                        weeklyDate, 
                        paymentMethod, 
                        paymentStatus, 
                        orderStatus,
                        InvNo,
                        fullTotal,
                        fullDiscount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderData.customerId, 
                        salesAgentId, 
                        orderData.deliveryType, 
                        orderData.scheduleDate, 
                        orderData.selectedDays || null, 
                        orderData.weeklyDate || null, 
                        orderData.paymentMethod, 
                        orderData.paymentStatus || false, 
                        orderData.orderStatus,
                        orderData.InvNo || null,
                        orderData.fullTotal || null,
                        orderData.fullDiscount || null
                    ],
                    (err, orderResult) => {
                        if (err) {
                            return connection.rollback(() => {
                                connection.release();
                                reject(err);
                            });
                        }
                        
                        const orderId = orderResult.insertId;
                        const orderItemPromises = [];
                        
                        // Process each order item
                        const processOrderItems = (index) => {
                            if (index >= orderData.orderItems.length) {
                                // All items processed, commit transaction
                                connection.commit((err) => {
                                    if (err) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            reject(err);
                                        });
                                    }
                                    
                                    connection.release();
                                    resolve({ success: true, orderId });
                                });
                                return;
                            }
                            
                            const item = orderData.orderItems[index];
                            
                            // Insert into orderitems table
                            connection.query(
                                `INSERT INTO orderitems (
                                    orderId, 
                                    packageId, 
                                    isModifiedPlus, 
                                    isModifiedMin, 
                                    isAdditionalItems, 
                                    packageTotal, 
                                    packageDiscount
                                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    orderId, 
                                    item.packageId, 
                                    item.isModifiedPlus || false, 
                                    item.isModifiedMin || false, 
                                    item.isAdditionalItems || false, 
                                    item.packageTotal, 
                                    item.packageDiscount || 0
                                ],
                                (err, orderItemResult) => {
                                    if (err) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            reject(err);
                                        });
                                    }
                                    
                                    const orderItemsId = orderItemResult.insertId;
                                    let remainingOperations = 0;
                                    let operationError = null;
                                    
                                    // Function to track completion of operations
                                    const trackCompletion = (err) => {
                                        if (err && !operationError) {
                                            operationError = err;
                                        }
                                        
                                        remainingOperations--;
                                        
                                        if (remainingOperations === 0) {
                                            if (operationError) {
                                                return connection.rollback(() => {
                                                    connection.release();
                                                    reject(operationError);
                                                });
                                            }
                                            
                                            // Process next order item
                                            processOrderItems(index + 1);
                                        }
                                    };
                                    
                                    // Process modifiedPlusItems if they exist
                                    if (item.modifiedPlusItems && item.modifiedPlusItems.length > 0) {
                                        remainingOperations += item.modifiedPlusItems.length;
                                        
                                        item.modifiedPlusItems.forEach(modifiedItem => {
                                            connection.query(
                                                `INSERT INTO modifiedplusitems (
                                                    orderItemsId, 
                                                    packageDetailsId, 
                                                    originalQuantity, 
                                                    modifiedQuantity, 
                                                    originalPrice, 
                                                    additionalPrice, 
                                                    additionalDiscount
                                                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                                [
                                                    orderItemsId, 
                                                    modifiedItem.packageDetailsId, 
                                                    modifiedItem.originalQuantity, 
                                                    modifiedItem.modifiedQuantity, 
                                                    modifiedItem.originalPrice, 
                                                    modifiedItem.additionalPrice || 0, 
                                                    modifiedItem.additionalDiscount || 0
                                                ],
                                                (err) => trackCompletion(err)
                                            );
                                        });
                                    }
                                    
                                    // Process modifiedMinItems if they exist
                                    if (item.modifiedMinItems && item.modifiedMinItems.length > 0) {
                                        remainingOperations += item.modifiedMinItems.length;
                                        
                                        item.modifiedMinItems.forEach(modifiedItem => {
                                            connection.query(
                                                `INSERT INTO modifiedminitems (
                                                    orderItemsId, 
                                                    packageDetailsId, 
                                                    originalQuantity, 
                                                    modifiedQuantity, 
                                                    originalPrice, 
                                                    additionalPrice, 
                                                    additionalDiscount
                                                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                                [
                                                    orderItemsId, 
                                                    modifiedItem.packageDetailsId, 
                                                    modifiedItem.originalQuantity, 
                                                    modifiedItem.modifiedQuantity, 
                                                    modifiedItem.originalPrice, 
                                                    modifiedItem.additionalPrice || 0, 
                                                    modifiedItem.additionalDiscount || 0
                                                ],
                                                (err) => trackCompletion(err)
                                            );
                                        });
                                    }
                                    
                                    // Process additionalItems if they exist
                                    if (item.additionalItems && item.additionalItems.length > 0) {
                                        remainingOperations += item.additionalItems.length;
                                        
                                        item.additionalItems.forEach(additionalItem => {
                                            connection.query(
                                                `INSERT INTO additionalitem (
                                                    orderItemsId, 
                                                    mpItemId, 
                                                    quantity, 
                                                    price, 
                                                    discount
                                                ) VALUES (?, ?, ?, ?, ?)`,
                                                [
                                                    orderItemsId, 
                                                    additionalItem.mpItemId, 
                                                    additionalItem.quantity, 
                                                    additionalItem.price, 
                                                    additionalItem.discount || 0
                                                ],
                                                (err) => trackCompletion(err)
                                            );
                                        });
                                    }
                                    
                                    // If no additional operations, process next order item
                                    if (remainingOperations === 0) {
                                        processOrderItems(index + 1);
                                    }
                                }
                            );
                        };
                        
                        // Start processing order items
                        processOrderItems(0);
                    }
                );
            });
        });
    });
};


exports.getAllOrderDetails = () => {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          o.id AS orderId,
          o.customerId,
          o.deliveryType,
          o.scheduleDate,
          o.selectedDays,
          o.weeklyDate,
          o.paymentMethod,
          o.paymentStatus,
          o.orderStatus,
          o.createdAt,
          o.InvNo,
          o.fullTotal,
          o.fullDiscount,
          c.firstName,
          c.lastName,
          c.phoneNumber,
          c.buildingType
        FROM orders o
        JOIN customer c ON o.customerId = c.id
      `;
      
      db.dash.query(sql, (err, orderResults) => {
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
                  // Remove any double spaces
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
                  // Remove any double spaces and fix formatting
                  formattedAddress = formattedAddress.replace(/\s+/g, ' ')
                                                    .replace(/, Unit ,/, ',')
                                                    .replace(/, Floor ,/, ',')
                                                    .trim();
                  // Remove trailing commas
                  formattedAddress = formattedAddress.replace(/,\s*$/, '');
                }
                
                resolveOrder({
                  ...order,
                  fullAddress: formattedAddress
                });
              });
            } else {
              // If building type is not specified or is something else
              resolveOrder({
                ...order,
                fullAddress: ''
              });
            }
          });
        });
        
        // Resolve all order promises
        Promise.all(orderPromises)
          .then(results => resolve(results))
          .catch(error => reject(error));
      });
    });
  };