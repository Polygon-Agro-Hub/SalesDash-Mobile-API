// services/order-service.js
const db = require('../startup/database');

/**
 * Process a complete order with transaction support for Market Place
 * @param {Object} orderData - Complete order data from request
 * @param {Number} salesAgentId - ID of the sales agent
 * @returns {Promise<{orderId: number}>} Object containing the new order ID
 */
exports.processOrder = async (orderData, salesAgentId) => {
    console.time('process-order');
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        console.log('Database connection acquired');

        // Start transaction
        await connection.beginTransaction();
        console.log('Transaction started');

        // STEP 1: Get user details from marketplaceusers
        const userDetails = await getUserDetails(connection, orderData.userId);
        console.log(`User details retrieved for ID: ${orderData.userId}`);

        // STEP 2: Insert main order record
        const orderId = await insertMainOrder(connection, orderData, salesAgentId, userDetails);
        console.log(`Main order created with ID: ${orderId}`);



        // STEP 3: Insert address data based on building type
        await insertAddressData(connection, orderId, orderData, userDetails);
        console.log('Address data inserted');

        await updateSalesAgentStars(connection, salesAgentId);
        console.log('Sales agent stars updated');

        // STEP 4: Process order based on isPackage flag
        if (orderData.isPackage === 1) {
            // Package order - Insert into orderpackage table
            await insertOrderPackage(connection, orderId, orderData);
            console.log('Package order inserted into orderpackage table');

            // Process items array for package orders (NEW LOGIC)
            if (orderData.items && orderData.items.length > 0) {
                await insertAdditionalItems(connection, orderId, orderData.items);
                console.log('Package order items processed from items array');
            }

            // Process additional items if present for package orders (EXISTING LOGIC)
            if (orderData.additionalItems && orderData.additionalItems.length > 0) {
                await insertAdditionalItems(connection, orderId, orderData.additionalItems);
                console.log('Additional items processed for package order');
            }
        } else {
            // Regular order (isPackage = 0) - Items go to orderadditionalitems table
            await processRegularOrderItems(connection, orderId, orderData);
            console.log('Regular order items processed');
        }

        // STEP 5: Insert into processorders table
        await insertProcessOrder(connection, orderId, orderData);
        console.log('Process order record created');

        // Commit transaction if everything succeeded
        await connection.commit();
        console.log('Transaction committed successfully');
        console.timeEnd('process-order');

        return { orderId };
    } catch (error) {
        console.error('Error in processOrder:', error);

        // Rollback transaction if connection exists
        // if (connection) {
        //     try {
        //         await connection.rollback();
        //         console.log('Transaction rolled back');
        //     } catch (rollbackError) {
        //         console.error('Error rolling back transaction:', rollbackError);
        //     }
        // }

        if (connection && transactionStarted) {
            try {
                await connection.rollback();
                console.log('Transaction rolled back successfully - All data cleared');
            } catch (rollbackError) {
                console.error('Critical Error: Failed to rollback transaction:', rollbackError);
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

// Helper function to get user details from marketplaceusers
async function getUserDetails(connection, userId) {
    const [userResult] = await connection.query(
        `SELECT id, salesAgent, googleId, cusId, title, firstName, lastName, 
         phoneCode, phoneNumber, buyerType, email, buildingType, billingTitle, billingName 
         FROM marketplaceusers WHERE id = ?`,
        [userId]
    );

    if (!userResult || userResult.length === 0) {
        throw new Error(`User not found with ID: ${userId}`);
    }

    return userResult[0];
}

// Helper function to get building type integer value
function getBuildingTypeInt(buildingType) {
    const buildingTypeMapping = {
        'house': 1,
        'House': 1,
        'apartment': 2,
        'Apartment': 2,
        'condo': 3,
        'Condo': 3,
        'office': 4,
        'Office': 4
    };
    return buildingTypeMapping[buildingType] || 1; // Default to 1 (house) if not found
}

// Helper function to insert main order record
// Helper function to insert main order record
async function insertMainOrder(connection, orderData, salesAgentId, userDetails) {
    const {
        userId,
        orderApp = 'Dash',
        delivaryMethod = 'delivery',
        centerId = null, // Changed from 0 to null
        isCoupon = 0,
        couponValue = 0,
        total,
        fullTotal,
        discount = 0,
        sheduleType = 'One Time',
        sheduleDate,
        sheduleTime
    } = orderData;

    // Get title, fullName, and phone details from marketplaceusers table
    const orderTitle = userDetails.title;
    const orderFullName = `${userDetails.firstName} ${userDetails.lastName}`.trim();
    const orderPhonecode1 = userDetails.phoneCode;
    const orderPhone1 = userDetails.phoneNumber;

    // Optional second phone from order data (if provided)
    const orderPhonecode2 = orderData.phonecode2 || null;
    const orderPhone2 = orderData.phone2 || null;

    // Use the original buildingType string for orders table
    const buildingTypeForOrder = userDetails.buildingType;
    console.log(`Using buildingType '${buildingTypeForOrder}' for orders table`);

    // Format date if needed
    let formattedDate = sheduleDate;
    if (sheduleDate && typeof sheduleDate === 'string' && sheduleDate.match(/^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/)) {
        const dateParts = sheduleDate.split(' ');
        const day = parseInt(dateParts[0], 10);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = monthNames.indexOf(dateParts[1]) + 1;
        const year = parseInt(dateParts[2], 10);
        formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }

    // Insert order record with user data from marketplaceusers table
    const [result] = await connection.query(
        `INSERT INTO orders (
          userId, orderApp, delivaryMethod, centerId, buildingType,
          title, fullName, phonecode1, phone1, phonecode2, phone2,
          isCoupon, couponValue, total, fullTotal, discount,
          sheduleType, sheduleDate, sheduleTime, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            userId,
            orderApp,
            delivaryMethod,
            centerId, // This will now be null instead of 0
            buildingTypeForOrder,               // Use original string value (Apartment/House)
            orderTitle,                         // From marketplaceusers.title
            orderFullName,                      // From marketplaceusers.firstName + lastName
            orderPhonecode1,                    // From marketplaceusers.phoneCode
            orderPhone1,                        // From marketplaceusers.phoneNumber
            orderPhonecode2,                    // Optional from orderData
            orderPhone2,                        // Optional from orderData
            isCoupon,
            couponValue,
            total,
            fullTotal,
            discount,
            sheduleType,
            formattedDate,
            sheduleTime
        ]
    );

    console.log(`Order inserted with user data: Title=${orderTitle}, FullName=${orderFullName}, Phone=${orderPhonecode1}${orderPhone1}, BuildingType=${buildingTypeForOrder}`);
    return result.insertId;
}

// Helper function to insert address data (house/apartment)
async function insertAddressData(connection, orderId, orderData, userDetails) {
    const buildingTypeInt = getBuildingTypeInt(userDetails.buildingType);

    // Check by integer value: 1 = house, 2 = apartment
    if (buildingTypeInt === 1) { // House
        // Get house details using customerid from house table
        const [houseResult] = await connection.query(
            'SELECT * FROM house WHERE customerid = ? LIMIT 1',
            [orderData.userId]  // userId from marketplaceusers.id
        );

        if (houseResult && houseResult.length > 0) {
            await connection.query(
                'INSERT INTO orderhouse (orderid, houseNo, streetName, city) VALUES (?, ?, ?, ?)',
                [orderId, houseResult[0].houseNo, houseResult[0].streetName, houseResult[0].city]
            );
            console.log(`House data inserted for orderId: ${orderId}`);
        } else {
            // Insert default house data if not found
            await connection.query(
                'INSERT INTO orderhouse (orderid, houseNo, streetName, city) VALUES (?, ?, ?, ?)',
                [orderId, orderData.houseNo || '', orderData.streetName || '', orderData.city || '']
            );
            console.log(`Default house data inserted for orderId: ${orderId}`);
        }
    } else if (buildingTypeInt === 2) { // Apartment
        // Get apartment details using customerid from apartment table
        const [apartmentResult] = await connection.query(
            'SELECT * FROM apartment WHERE customerid = ? LIMIT 1',
            [orderData.userId]  // userId from marketplaceusers.id
        );

        if (apartmentResult && apartmentResult.length > 0) {
            await connection.query(
                'INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo, streetName, city) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    orderId,
                    apartmentResult[0].buildingNo,
                    apartmentResult[0].buildingName,
                    apartmentResult[0].unitNo,
                    apartmentResult[0].floorNo,
                    apartmentResult[0].streetName,
                    apartmentResult[0].city
                ]
            );
            console.log(`Apartment data inserted for orderId: ${orderId}`);
        } else {
            // Insert default apartment data if not found
            await connection.query(
                'INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo, streetName, city) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    orderId,
                    orderData.buildingNo || '',
                    orderData.buildingName || '',
                    orderData.unitNo || '',
                    orderData.floorNo || '',
                    orderData.streetName || '',
                    orderData.city || ''
                ]
            );
            console.log(`Default apartment data inserted for orderId: ${orderId}`);
        }
    }
    // Handle other building types (condo=3, office=4) if needed
    else if (buildingTypeInt === 3 || buildingTypeInt === 4) {
        console.log(`Building type ${buildingTypeInt} (${userDetails.buildingType}) - no specific address table handling implemented`);
    }
}

// Helper function to insert package order into orderpackage table
async function insertOrderPackage(connection, orderId, orderData) {
    const { packageId } = orderData;

    if (!packageId) {
        throw new Error('Package ID is required for package orders (isPackage = 1)');
    }

    await connection.query(
        'INSERT INTO orderpackage (orderid, packageId, createdAt) VALUES (?, ?, NOW())',
        [orderId, packageId]
    );

    console.log(`Package order inserted: orderId=${orderId}, packageId=${packageId}`);
}

// Helper function to process regular order items (isPackage = 0)
async function processRegularOrderItems(connection, orderId, orderData) {
    if (!orderData.items || orderData.items.length === 0) {
        throw new Error('Items are required for regular orders (isPackage = 0)');
    }

    // Insert each item into orderadditionalitems table row by row
    await insertAdditionalItems(connection, orderId, orderData.items);
    console.log(`Regular order items processed: ${orderData.items.length} items`);
}

// Helper function to insert additional items into orderadditionalitems table
async function insertAdditionalItems(connection, orderId, items) {
    if (!items || items.length === 0) return;

    // Process each item row by row
    for (const item of items) {
        await connection.query(
            'INSERT INTO orderadditionalitems (orderid, productId, qty, unit, price, discount, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [
                orderId,
                item.productId || item.id,
                item.qty || item.quantity,
                item.unit || item.unitType,
                item.price || item.price,          // Added price with default 0
                item.discount || item.discount        // Added discount with default 0
            ]
        );
        console.log(`Additional item inserted: orderId=${orderId}, productId=${item.productId || item.id}`);
    }
}

// Helper function to insert process order record
async function insertProcessOrder(connection, orderId, orderData) {
    // Generate Invoice Number (YYMMDDRRRR)
    const today = new Date();
    const datePrefix = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

    // Get the current max sequence number for today
    const [sequenceResult] = await connection.query(
        'SELECT MAX(invNo) as maxInvNo FROM processorders WHERE invNo LIKE ?',
        [`${datePrefix}%`]
    );

    let sequenceNumber = 1;
    if (sequenceResult[0] && sequenceResult[0].maxInvNo) {
        sequenceNumber = parseInt(sequenceResult[0].maxInvNo.slice(-4), 10) + 1;
    }

    const invNo = `${datePrefix}${sequenceNumber.toString().padStart(4, '0')}`;

    // Insert process order record
    await connection.query(
        `INSERT INTO processorders (
          orderid, invNo, transactionId, paymentMethod, ispaid, amount, status, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            orderId,
            invNo,
            orderData.transactionId || '',
            orderData.paymentMethod || 'cash',
            0,
            0,
            'Ordered'
        ]
    );
}


/////get customer data

// exports.getDataCustomerId = (customerId) => {
//     return new Promise((resolve, reject) => {
//         // First query to get basic customer info
//         const customerSql = `
//       SELECT 
//         id,
//         cusId,
//         salesAgent,
//         title,
//         firstName,
//         lastName,
//         phoneNumber,
//         email,
//         buildingType
//       FROM marketplaceusers
//       WHERE id = ?
//     `;

//         db.marketPlace.query(customerSql, [customerId], (err, customerResults) => {
//             if (err) {
//                 return reject(err);
//             }

//             if (customerResults.length === 0) {
//                 return resolve({ message: 'No customer found with this ID' });
//             }

//             const customer = customerResults[0];
//             const buildingType = customer.buildingType.toLowerCase();

//             // Second query to get building details based on building type
//             const buildingSql = `
//         SELECT * FROM ${buildingType}
//         WHERE customerId = ?
//       `;

//             db.marketPlace.query(buildingSql, [customerId], (err, buildingResults) => {
//                 if (err) {
//                     return reject(err);
//                 }

//                 // Combine customer info with building info
//                 const result = {
//                     ...customer,
//                     buildingDetails: buildingResults.length > 0 ? buildingResults[0] : null
//                 };

//                 resolve(result);
//             });
//         });
//     });
// };

// exports.getDataCustomerId = async (customerId) => {
//     let connection;

//     try {
//         // Get connection from pool
//         connection = await db.marketPlace.promise().getConnection();
//         console.log('Database connection acquired');

//         // First query to get basic customer info
//         const customerSql = `
//             SELECT 
//                 id,
//                 cusId,
//                 salesAgent,
//                 title,
//                 firstName,
//                 lastName,
//                 phoneNumber,
//                 email,
//                 buildingType
//             FROM marketplaceusers
//             WHERE id = ?
//         `;

//         const [customerResults] = await connection.execute(customerSql, [customerId]);

//         if (customerResults.length === 0) {
//             return { message: 'No customer found with this ID' };
//         }

//         const customer = customerResults[0];
//         const buildingType = customer.buildingType.toLowerCase();

//         // Second query to get building details based on building type
//         const buildingSql = `
//             SELECT * FROM ${buildingType}
//             WHERE customerId = ?
//         `;

//         const [buildingResults] = await connection.execute(buildingSql, [customerId]);

//         // Combine customer info with building info
//         const result = {
//             ...customer,
//             buildingDetails: buildingResults.length > 0 ? buildingResults[0] : null
//         };

//         return result;

//     } catch (err) {
//         console.error('Database error:', err);
//         throw err;
//     } finally {
//         // Always release the connection back to the pool
//         if (connection) {
//             connection.release();
//             console.log('Database connection released');
//         }
//     }
// };


exports.getDataCustomerId = async (customerId) => {
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        console.log('Database connection acquired');

        // First query to get basic customer info including phoneCode and phoneNumber
        const customerSql = `
            SELECT 
                id,
                cusId,
                salesAgent,
                title,
                firstName,
                lastName,
                phoneCode,
                phoneNumber,
                email,
                buildingType
            FROM marketplaceusers
            WHERE id = ?
        `;

        const [customerResults] = await connection.execute(customerSql, [customerId]);

        if (customerResults.length === 0) {
            return { message: 'No customer found with this ID' };
        }

        const customer = customerResults[0];

        // Combine phoneCode and phoneNumber into a single phoneNumber field
        if (customer.phoneCode && customer.phoneNumber) {
            customer.phoneNumber = `${customer.phoneCode}${customer.phoneNumber}`;
        } else if (customer.phoneNumber && !customer.phoneCode) {
            // If only phoneNumber exists, keep it as is
            customer.phoneNumber = customer.phoneNumber;
        } else if (customer.phoneCode && !customer.phoneNumber) {
            // If only phoneCode exists, set phoneNumber to just the code
            customer.phoneNumber = `${customer.phoneCode}`;
        } else {
            // If neither exists, set to empty string
            customer.phoneNumber = '';
        }

        // Remove the separate phoneCode field since we've combined it
        delete customer.phoneCode;

        const buildingType = customer.buildingType.toLowerCase();

        // Second query to get building details based on building type
        const buildingSql = `
            SELECT * FROM ${buildingType}
            WHERE customerId = ?
        `;

        const [buildingResults] = await connection.execute(buildingSql, [customerId]);

        // Combine customer info with building info
        const result = {
            ...customer,
            buildingDetails: buildingResults.length > 0 ? buildingResults[0] : null
        };

        return result;

    } catch (err) {
        console.error('Database error:', err);
        throw err;
    } finally {
        // Always release the connection back to the pool
        if (connection) {
            connection.release();
            console.log('Database connection released');
        }
    }
};

// exports.getOrderById = (orderId) => {
//     return new Promise((resolve, reject) => {
//         const sql = `
//         SELECT 
//            o.id AS orderId,
//            o.userId,
//            o.sheduleType,
//            o.sheduleDate,
//            o.sheduleTime,
//            o.createdAt,
//            o.total,
//            o.discount,
//            o.fullTotal,
//            c.title,
//            c.firstName,
//            c.lastName,
//            c.phoneNumber,
//            c.buildingType,
//            p.invNo AS invoiceNumber
//         FROM orders o
//         JOIN marketplaceusers c ON o.userId = c.id
//         LEFT JOIN processorders p ON o.id = p.orderId
//         WHERE o.id = ?
//       `;

//         db.marketPlace.query(sql, [orderId], (err, orderResults) => {
//             if (err) {
//                 return reject(err);
//             }

//             if (orderResults.length === 0) {
//                 return resolve({ message: 'No order found with the given ID' });
//             }

//             const order = orderResults[0];
//             const customerId = order.userId; // Fixed: should be userId, not customerId
//             const buildingType = order.buildingType;

//             if (buildingType === 'House') {
//                 const addressSql = `
//             SELECT 
//                houseNo,
//                streetName,
//                city
//             FROM house
//             WHERE customerId = ?
//           `;

//                 db.marketPlace.query(addressSql, [customerId], (err, addressResults) => {
//                     if (err) {
//                         return reject(err);
//                     }

//                     let formattedAddress = '';
//                     if (addressResults[0]) {
//                         const addr = addressResults[0];
//                         formattedAddress = `${addr.houseNo || ''}, ${addr.streetName || ''}, ${addr.city || ''}`.trim();
//                         formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
//                     }

//                     resolve({
//                         ...order,
//                         fullAddress: formattedAddress
//                     });
//                 });
//             } else if (buildingType === 'Apartment') {
//                 const addressSql = `
//             SELECT 
//                buildingNo,
//                buildingName,
//                unitNo,
//                floorNo,
//                houseNo,
//                streetName,
//                city
//             FROM apartment
//             WHERE customerId = ?
//           `;

//                 db.marketPlace.query(addressSql, [customerId], (err, addressResults) => {
//                     if (err) {
//                         return reject(err);
//                     }

//                     let formattedAddress = '';
//                     if (addressResults[0]) {
//                         const addr = addressResults[0];
//                         formattedAddress = `${addr.buildingName || ''}, ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''}, ${addr.streetName || ''}, ${addr.city || ''}`.trim();
//                         formattedAddress = formattedAddress.replace(/\s+/g, ' ')
//                             .replace(/, Unit ,/, ',')
//                             .replace(/, Floor ,/, ',')
//                             .trim();
//                         formattedAddress = formattedAddress.replace(/,\s*$/, '');
//                     }

//                     resolve({
//                         ...order,
//                         fullAddress: formattedAddress
//                     });
//                 });
//             } else {
//                 resolve({
//                     ...order,
//                     fullAddress: ''
//                 });
//             }
//         });
//     });
// };

exports.getOrderById = async (orderId) => {
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        console.log('Database connection acquired');

        const sql = `
            SELECT
                o.id AS orderId,
                o.userId,
                o.sheduleType,
                o.sheduleDate,
                o.sheduleTime,
                o.createdAt,
                o.total,
                o.discount,
                o.fullTotal,
                c.title,
                c.firstName,
                c.lastName,
                c.phoneNumber,
                c.buildingType,
                p.invNo AS invoiceNumber
            FROM orders o
            JOIN marketplaceusers c ON o.userId = c.id
            LEFT JOIN processorders p ON o.id = p.orderId
            WHERE o.id = ?
        `;

        const [orderResults] = await connection.execute(sql, [orderId]);

        if (orderResults.length === 0) {
            return { message: 'No order found with the given ID' };
        }

        const order = orderResults[0];
        const customerId = order.userId; // Fixed: should be userId, not customerId
        const buildingType = order.buildingType;

        let formattedAddress = '';

        if (buildingType === 'House') {
            const addressSql = `
                SELECT
                    houseNo,
                    streetName,
                    city
                FROM house
                WHERE customerId = ?
            `;

            const [addressResults] = await connection.execute(addressSql, [customerId]);

            if (addressResults[0]) {
                const addr = addressResults[0];
                formattedAddress = `${addr.houseNo || ''}, ${addr.streetName || ''}, ${addr.city || ''}`.trim();
                formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
            }

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

            const [addressResults] = await connection.execute(addressSql, [customerId]);

            if (addressResults[0]) {
                const addr = addressResults[0];
                formattedAddress = `${addr.buildingName || ''}, ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''}, ${addr.streetName || ''}, ${addr.city || ''}`.trim();
                formattedAddress = formattedAddress.replace(/\s+/g, ' ')
                    .replace(/, Unit ,/, ',')
                    .replace(/, Floor ,/, ',')
                    .trim();
                formattedAddress = formattedAddress.replace(/,\s*$/, '');
            }
        }

        return {
            ...order,
            fullAddress: formattedAddress
        };

    } catch (err) {
        console.error('Database error:', err);
        throw err;
    } finally {
        // Always release the connection back to the pool
        if (connection) {
            connection.release();
            console.log('Database connection released');
        }
    }
};



exports.getOrderByCustomerId = (customerId) => {
    return new Promise((resolve, reject) => {
        const sql = `
            SELECT 
                o.id AS orderId,
                o.userId,
                o.sheduleType,
                o.sheduleDate,
                o.sheduleTime,
               
            
                o.createdAt,
        
             
                o.total,
                o.discount,
                o.fullTotal,
                p.invNo AS InvNo,
                p.reportStatus AS reportStatus,
                p.paymentMethod AS paymentMethod,
                p.status As status
            FROM orders o
            LEFT JOIN market_place.processorders p ON o.id = p.orderId
            WHERE o.userId = ?
        `;

        db.marketPlace.query(sql, [customerId], (err, orderResults) => {
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





// exports.getAllOrderDetails = (salesAgentId) => {
//     return new Promise((resolve, reject) => {
//         let sql = `
//       SELECT 
//          o.id AS orderId,
//                 o.userId,
//                 o.sheduleType,
//                 o.sheduleDate,
//                 o.sheduleTime,
//                 o.createdAt,
//                 o.total,
//                 o.discount,
//                 o.fullTotal,
//                 m.salesAgent,
//                 p.invNo AS InvNo,
//                 p.reportStatus AS reportStatus,
//                 p.paymentMethod AS paymentMethod,
//                 p.status As status
//       FROM orders o
//        LEFT JOIN market_place.processorders p ON o.id = p.orderId
//         LEFT JOIN market_place.marketplaceusers m ON o.userId = m.id
//     `;

//         // Add WHERE clause if salesAgentId is provided
//         const params = [];
//         if (salesAgentId) {
//             sql += ` WHERE m.salesAgent = ?`;
//             params.push(salesAgentId);
//         }

//         db.marketPlace.query(sql, params, (err, orderResults) => {
//             if (err) {
//                 return reject(err);
//             }

//             if (orderResults.length === 0) {
//                 return resolve({ message: 'No orders found' });
//             }

//             // Process each order to get corresponding address details
//             const orderPromises = orderResults.map(order => {
//                 return new Promise((resolveOrder, rejectOrder) => {
//                     const customerId = order.customerId;
//                     const buildingType = order.buildingType;

//                     if (buildingType === 'House') {
//                         const addressSql = `
//               SELECT 
//                 houseNo,
//                 streetName,
//                 city
//               FROM house
//               WHERE customerId = ?
//             `;

//                         db.marketPlace.query(addressSql, [customerId], (err, addressResults) => {
//                             if (err) {
//                                 return rejectOrder(err);
//                             }

//                             let formattedAddress = '';
//                             if (addressResults[0]) {
//                                 const addr = addressResults[0];
//                                 formattedAddress = `${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
//                                 formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
//                             }

//                             resolveOrder({
//                                 ...order,
//                                 fullAddress: formattedAddress
//                             });
//                         });
//                     } else if (buildingType === 'Apartment') {
//                         const addressSql = `
//               SELECT 
//                 buildingNo,
//                 buildingName,
//                 unitNo,
//                 floorNo,
//                 houseNo,
//                 streetName,
//                 city
//               FROM apartment
//               WHERE customerId = ?
//             `;

//                         db.marketPlace.query(addressSql, [customerId], (err, addressResults) => {
//                             if (err) {
//                                 return rejectOrder(err);
//                             }

//                             let formattedAddress = '';
//                             if (addressResults[0]) {
//                                 const addr = addressResults[0];
//                                 formattedAddress = `${addr.buildingName || ''} ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
//                                 formattedAddress = formattedAddress.replace(/\s+/g, ' ')
//                                     .replace(/, Unit ,/, ',')
//                                     .replace(/, Floor ,/, ',')
//                                     .trim();
//                                 formattedAddress = formattedAddress.replace(/,\s*$/, '');
//                             }

//                             resolveOrder({
//                                 ...order,
//                                 fullAddress: formattedAddress
//                             });
//                         });
//                     } else {
//                         resolveOrder({
//                             ...order,
//                             fullAddress: ''
//                         });
//                     }
//                 });
//             });

//             Promise.all(orderPromises)
//                 .then(results => resolve(results))
//                 .catch(error => reject(error));
//         });
//     });
// };

exports.getAllOrderDetails = async (salesAgentId) => {
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        console.log('Database connection acquired');

        let sql = `
            SELECT 
                o.id AS orderId,
                o.userId,
                o.sheduleType,
                o.sheduleDate,
                o.sheduleTime,
                o.createdAt,
                o.total,
                o.discount,
                o.fullTotal,
                m.salesAgent,
                m.buildingType,
                p.invNo AS InvNo,
                p.reportStatus AS reportStatus,
                p.paymentMethod AS paymentMethod,
                p.status As status
            FROM orders o
            LEFT JOIN market_place.processorders p ON o.id = p.orderId
            LEFT JOIN market_place.marketplaceusers m ON o.userId = m.id
        `;

        // Add WHERE clause if salesAgentId is provided
        const params = [];
        if (salesAgentId) {
            sql += ` WHERE m.salesAgent = ?`;
            params.push(salesAgentId);
        }

        const [orderResults] = await connection.execute(sql, params);

        if (orderResults.length === 0) {
            return { message: 'No orders found' };
        }

        // Process each order to get corresponding address details
        const processedOrders = [];

        for (const order of orderResults) {
            const customerId = order.userId; // Using userId as customerId
            const buildingType = order.buildingType;
            let formattedAddress = '';

            if (buildingType === 'House') {
                const addressSql = `
                    SELECT 
                        houseNo,
                        streetName,
                        city
                    FROM house
                    WHERE customerId = ?
                `;

                const [addressResults] = await connection.execute(addressSql, [customerId]);

                if (addressResults[0]) {
                    const addr = addressResults[0];
                    formattedAddress = `${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
                    formattedAddress = formattedAddress.replace(/\s+/g, ' ').trim();
                }

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

                const [addressResults] = await connection.execute(addressSql, [customerId]);

                if (addressResults[0]) {
                    const addr = addressResults[0];
                    formattedAddress = `${addr.buildingName || ''} ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''} ${addr.streetName || ''}, ${addr.city || ''}`.trim();
                    formattedAddress = formattedAddress.replace(/\s+/g, ' ')
                        .replace(/, Unit ,/, ',')
                        .replace(/, Floor ,/, ',')
                        .trim();
                    formattedAddress = formattedAddress.replace(/,\s*$/, '');
                }
            }

            processedOrders.push({
                ...order,
                fullAddress: formattedAddress
            });
        }

        return processedOrders;

    } catch (err) {
        console.error('Database error:', err);
        throw err;
    } finally {
        // Always release the connection back to the pool
        if (connection) {
            connection.release();
            console.log('Database connection released');
        }
    }
};




exports.reportOrder = (orderId, reportStatus) => {
    return new Promise((resolve, reject) => {
        const updateSql = `
      UPDATE market_place.processorders 
      SET reportStatus = ?
      WHERE orderId = ?
    `;

        db.marketPlace.query(updateSql, [reportStatus, orderId], (err, result) => {
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


///cancel Order

exports.cancelOrder = (orderId) => {
    return new Promise((resolve, reject) => {
        // Update order status to Cancelled
        const updateSql = `
      UPDATE market_place.processorders  
      SET status = 'Cancelled'
      WHERE orderId = ?
    `;

        db.marketPlace.query(updateSql, [orderId], (err, result) => {
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


///// getorders

// exports.getOrderCountBySalesAgent = async () => {
//     try {
//         const connection = await db.marketPlace.promise().getConnection();
//         try {
//             const [rows] = await connection.query(`
//         SELECT salesAgentId, COUNT(*) AS orderCount
//         FROM orders
//         GROUP BY salesAgentId
//       `);
//             return rows;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in getOrderCountBySalesAgent:', error);
//         throw new Error(`Failed to get order count: ${error.message}`);
//     }
// };


exports.getOrderCountBySalesAgent = async (salesAgentId) => {
    try {
        const connection = await db.marketPlace.promise().getConnection();
        try {
            // First verify the user is a sales agent
            const userCheckQuery = `
                SELECT id, firstName, lastName, salesAgent 
                FROM marketplaceusers 
                WHERE id = ? AND salesAgent IS NOT NULL AND salesAgent != ''
            `;

            const [userRows] = await connection.query(userCheckQuery, [salesAgentId]);

            console.log("ksba", userRows);

            if (userRows.length === 0) {
                return {
                    salesAgentUserId: salesAgentId,
                    firstName: null,
                    lastName: null,
                    salesAgentCategory: null,
                    orderCount: 0,
                    message: 'User is not a sales agent or does not exist'
                };
            }

            // Get order count for customers assigned to this sales agent
            const orderCountQuery = `
                SELECT COUNT(o.id) as orderCount
                FROM orders o
                INNER JOIN marketplaceusers mu ON o.userId = mu.id
                WHERE mu.salesAgent = ?
            `;

            const [rows] = await connection.query(orderCountQuery, [salesAgentId]);

            return {
                salesAgentUserId: userRows[0].id,
                firstName: userRows[0].firstName,
                lastName: userRows[0].lastName,
                salesAgentCategory: userRows[0].salesAgent,
                orderCount: rows[0]?.orderCount || 0
            };

        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in getOrderCountBySalesAgent:', error);
        throw error;
    }
};

// Alternative function to get order counts for ALL sales agents
exports.getOrderCountBySalesAgent = async (salesAgentId) => {
    try {
        const connection = await db.marketPlace.promise().getConnection();
        try {
            // First get all customers assigned to this sales agent
            const customersQuery = `
                SELECT id, firstName, lastName, salesAgent
                FROM marketplaceusers 
                WHERE salesAgent = ?
            `;

            const [customerRows] = await connection.query(customersQuery, [salesAgentId]);

            console.log("Customers for sales agent", salesAgentId, ":", customerRows);

            if (customerRows.length === 0) {
                return {
                    salesAgentId: salesAgentId,
                    customerCount: 0,
                    orderCount: 0,
                    message: 'No customers assigned to this sales agent'
                };
            }

            // Get customer IDs
            const customerIds = customerRows.map(customer => customer.id);

            // Get order count for all these customers
            const orderCountQuery = `
                SELECT COUNT(*) as orderCount
                FROM orders 
                WHERE userId IN (${customerIds.map(() => '?').join(',')})
            `;

            const [orderRows] = await connection.query(orderCountQuery, customerIds);

            console.log("veukcsaj", orderRows)

            return {
                salesAgentId: salesAgentId,
                customerCount: customerRows.length,
                orderCount: orderRows[0]?.orderCount || 0,
                customers: customerRows // Optional: include customer details
            };

        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in getOrderCountBySalesAgent:', error);
        throw error;
    }
};



////starssss

exports.getTodayStats = async (salesAgentId) => {
    try {
        const connection = await db.marketPlace.promise().getConnection();

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
        const connection = await db.marketPlace.promise().getConnection();

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
        const connection = await db.marketPlace.promise().getConnection();

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

