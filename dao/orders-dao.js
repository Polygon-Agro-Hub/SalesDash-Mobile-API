// // services/order-service.js
// const db = require('../startup/database');

// /**
//  * Process a complete order with transaction support for Market Place
//  * @param {Object} orderData - Complete order data from request
//  * @param {Number} salesAgentId - ID of the sales agent
//  * @returns {Promise<{orderId: number}>} Object containing the new order ID
//  */
// exports.processOrder = async (orderData, salesAgentId) => {
//     console.time('process-order');
//     let connection;

//     try {
//         // Get connection from pool
//         connection = await db.marketPlace.promise().getConnection();
//         console.log('Database connection acquired');

//         // Start transaction
//         await connection.beginTransaction();
//         console.log('Transaction started');

//         // STEP 1: Get user details from marketplaceusers
//         const userDetails = await getUserDetails(connection, orderData.userId);
//         console.log(`User details retrieved for ID: ${orderData.userId}`);

//         // STEP 2: Insert main order record
//         const orderId = await insertMainOrder(connection, orderData, salesAgentId, userDetails);
//         console.log(`Main order created with ID: ${orderId}`);



//         // STEP 3: Insert address data based on building type
//         await insertAddressData(connection, orderId, orderData, userDetails);
//         console.log('Address data inserted');

//         await updateSalesAgentStars(connection, salesAgentId);
//         console.log('Sales agent stars updated');

//         // STEP 4: Process order based on isPackage flag
//         if (orderData.isPackage === 1) {
//             // Package order - Insert into orderpackage table
//             await insertOrderPackage(connection, orderId, orderData);
//             console.log('Package order inserted into orderpackage table');

//             // Process items array for package orders (NEW LOGIC)
//             if (orderData.items && orderData.items.length > 0) {
//                 await insertAdditionalItems(connection, orderId, orderData.items);
//                 console.log('Package order items processed from items array');
//             }

//             // Process additional items if present for package orders (EXISTING LOGIC)
//             if (orderData.additionalItems && orderData.additionalItems.length > 0) {
//                 await insertAdditionalItems(connection, orderId, orderData.additionalItems);
//                 console.log('Additional items processed for package order');
//             }
//         } else {
//             // Regular order (isPackage = 0) - Items go to orderadditionalitems table
//             await processRegularOrderItems(connection, orderId, orderData);
//             console.log('Regular order items processed');
//         }

//         // STEP 5: Insert into processorders table
//         await insertProcessOrder(connection, orderId, orderData);
//         console.log('Process order record created');

//         // Commit transaction if everything succeeded
//         await connection.commit();
//         console.log('Transaction committed successfully');
//         console.timeEnd('process-order');

//         return { orderId };
//     } catch (error) {
//         console.error('Error in processOrder:', error);

//         // Rollback transaction if connection exists
//         // if (connection) {
//         //     try {
//         //         await connection.rollback();
//         //         console.log('Transaction rolled back');
//         //     } catch (rollbackError) {
//         //         console.error('Error rolling back transaction:', rollbackError);
//         //     }
//         // }

//         if (connection && transactionStarted) {
//             try {
//                 await connection.rollback();
//                 console.log('Transaction rolled back successfully - All data cleared');
//             } catch (rollbackError) {
//                 console.error('Critical Error: Failed to rollback transaction:', rollbackError);
//             }
//         }

//         throw new Error(`Order processing failed: ${error.message}`);
//     } finally {
//         // Release connection back to pool
//         if (connection) {
//             try {
//                 connection.release();
//                 console.log('DB connection released');
//             } catch (releaseError) {
//                 console.error('Error releasing connection:', releaseError);
//             }
//         }
//     }
// };

// // Helper function to get user details from marketplaceusers
// async function getUserDetails(connection, userId) {
//     const [userResult] = await connection.query(
//         `SELECT id, salesAgent, googleId, cusId, title, firstName, lastName, 
//          phoneCode, phoneNumber, buyerType, email, buildingType, billingTitle, billingName 
//          FROM marketplaceusers WHERE id = ?`,
//         [userId]
//     );

//     if (!userResult || userResult.length === 0) {
//         throw new Error(`User not found with ID: ${userId}`);
//     }

//     return userResult[0];
// }

// // Helper function to get building type integer value
// function getBuildingTypeInt(buildingType) {
//     const buildingTypeMapping = {
//         'house': 1,
//         'House': 1,
//         'apartment': 2,
//         'Apartment': 2,
//         'condo': 3,
//         'Condo': 3,
//         'office': 4,
//         'Office': 4
//     };
//     return buildingTypeMapping[buildingType] || 1; // Default to 1 (house) if not found
// }

// // Helper function to insert main order record
// // Helper function to insert main order record
// async function insertMainOrder(connection, orderData, salesAgentId, userDetails) {
//     const {
//         userId,
//         orderApp = 'Dash',
//         delivaryMethod = 'Delivery',
//         centerId = null, // Changed from 0 to null
//         isCoupon = 0,
//         couponValue = 0,
//         total,
//         fullTotal,
//         discount = 0,
//         sheduleType = 'One Time',
//         sheduleDate,
//         sheduleTime,
//         isPackage
//     } = orderData;

//     // Get title, fullName, and phone details from marketplaceusers table
//     const orderTitle = userDetails.title;
//     const orderFullName = `${userDetails.firstName} ${userDetails.lastName}`.trim();
//     const orderPhonecode1 = userDetails.phoneCode;
//     const orderPhone1 = userDetails.phoneNumber;

//     // Optional second phone from order data (if provided)
//     const orderPhonecode2 = orderData.phonecode2 || null;
//     const orderPhone2 = orderData.phone2 || null;

//     // Use the original buildingType string for orders table
//     const buildingTypeForOrder = userDetails.buildingType;
//     console.log(`Using buildingType '${buildingTypeForOrder}' for orders table`);

//     // Format date if needed
//     let formattedDate = sheduleDate;
//     if (sheduleDate && typeof sheduleDate === 'string' && sheduleDate.match(/^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/)) {
//         const dateParts = sheduleDate.split(' ');
//         const day = parseInt(dateParts[0], 10);
//         const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
//         const month = monthNames.indexOf(dateParts[1]) + 1;
//         const year = parseInt(dateParts[2], 10);
//         formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
//     }

//     // Insert order record with user data from marketplaceusers table
//     const [result] = await connection.query(
//         `INSERT INTO orders (
//           userId, orderApp, delivaryMethod, centerId, buildingType,
//           title, fullName, phonecode1, phone1, phonecode2, phone2,
//           isCoupon, couponValue, total, fullTotal, discount,
//           sheduleType, sheduleDate, sheduleTime, isPackage ,createdAt
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?, NOW())`,
//         [
//             userId,
//             orderApp,
//             delivaryMethod,
//             centerId, // This will now be null instead of 0
//             buildingTypeForOrder,               // Use original string value (Apartment/House)
//             orderTitle,                         // From marketplaceusers.title
//             orderFullName,                      // From marketplaceusers.firstName + lastName
//             orderPhonecode1,                    // From marketplaceusers.phoneCode
//             orderPhone1,                        // From marketplaceusers.phoneNumber
//             orderPhonecode2,                    // Optional from orderData
//             orderPhone2,                        // Optional from orderData
//             isCoupon,
//             couponValue,
//             total,
//             fullTotal,
//             discount,
//             sheduleType,
//             formattedDate,
//             sheduleTime,
//             isPackage
//         ]
//     );

//     console.log(`Order inserted with user data: Title=${orderTitle}, FullName=${orderFullName}, Phone=${orderPhonecode1}${orderPhone1}, BuildingType=${buildingTypeForOrder}`);
//     return result.insertId;
// }

// // Helper function to insert address data (house/apartment)
// async function insertAddressData(connection, orderId, orderData, userDetails) {
//     const buildingTypeInt = getBuildingTypeInt(userDetails.buildingType);

//     // Check by integer value: 1 = house, 2 = apartment
//     if (buildingTypeInt === 1) { // House
//         // Get house details using customerid from house table
//         const [houseResult] = await connection.query(
//             'SELECT * FROM house WHERE customerid = ? LIMIT 1',
//             [orderData.userId]  // userId from marketplaceusers.id
//         );

//         if (houseResult && houseResult.length > 0) {
//             await connection.query(
//                 'INSERT INTO orderhouse (orderid, houseNo, streetName, city) VALUES (?, ?, ?, ?)',
//                 [orderId, houseResult[0].houseNo, houseResult[0].streetName, houseResult[0].city]
//             );
//             console.log(`House data inserted for orderId: ${orderId}`);
//         } else {
//             // Insert default house data if not found
//             await connection.query(
//                 'INSERT INTO orderhouse (orderid, houseNo, streetName, city) VALUES (?, ?, ?, ?)',
//                 [orderId, orderData.houseNo || '', orderData.streetName || '', orderData.city || '']
//             );
//             console.log(`Default house data inserted for orderId: ${orderId}`);
//         }
//     } else if (buildingTypeInt === 2) { // Apartment
//         // Get apartment details using customerid from apartment table
//         const [apartmentResult] = await connection.query(
//             'SELECT * FROM apartment WHERE customerid = ? LIMIT 1',
//             [orderData.userId]  // userId from marketplaceusers.id
//         );

//         if (apartmentResult && apartmentResult.length > 0) {
//             await connection.query(
//                 'INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo, streetName, city) VALUES (?, ?, ?, ?, ?, ?, ?)',
//                 [
//                     orderId,
//                     apartmentResult[0].buildingNo,
//                     apartmentResult[0].buildingName,
//                     apartmentResult[0].unitNo,
//                     apartmentResult[0].floorNo,
//                     apartmentResult[0].streetName,
//                     apartmentResult[0].city
//                 ]
//             );
//             console.log(`Apartment data inserted for orderId: ${orderId}`);
//         } else {
//             // Insert default apartment data if not found
//             await connection.query(
//                 'INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo, streetName, city) VALUES (?, ?, ?, ?, ?, ?, ?)',
//                 [
//                     orderId,
//                     orderData.buildingNo || '',
//                     orderData.buildingName || '',
//                     orderData.unitNo || '',
//                     orderData.floorNo || '',
//                     orderData.streetName || '',
//                     orderData.city || ''
//                 ]
//             );
//             console.log(`Default apartment data inserted for orderId: ${orderId}`);
//         }
//     }
//     // Handle other building types (condo=3, office=4) if needed
//     else if (buildingTypeInt === 3 || buildingTypeInt === 4) {
//         console.log(`Building type ${buildingTypeInt} (${userDetails.buildingType}) - no specific address table handling implemented`);
//     }
// }

// // Helper function to insert package order into orderpackage table
// async function insertOrderPackage(connection, orderId, orderData) {
//     const { packageId } = orderData;

//     if (!packageId) {
//         throw new Error('Package ID is required for package orders (isPackage = 1)');
//     }

//     await connection.query(
//         'INSERT INTO orderpackage (orderid, packageId, createdAt) VALUES (?, ?, NOW())',
//         [orderId, packageId]
//     );

//     console.log(`Package order inserted: orderId=${orderId}, packageId=${packageId}`);
// }

// // Helper function to process regular order items (isPackage = 0)
// async function processRegularOrderItems(connection, orderId, orderData) {
//     if (!orderData.items || orderData.items.length === 0) {
//         throw new Error('Items are required for regular orders (isPackage = 0)');
//     }

//     // Insert each item into orderadditionalitems table row by row
//     await insertAdditionalItems(connection, orderId, orderData.items);
//     console.log(`Regular order items processed: ${orderData.items.length} items`);
// }

// // Helper function to insert additional items into orderadditionalitems table
// async function insertAdditionalItems(connection, orderId, items) {
//     if (!items || items.length === 0) return;

//     // Process each item row by row
//     for (const item of items) {
//         await connection.query(
//             'INSERT INTO orderadditionalitems (orderid, productId, qty, unit, price, discount, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//             [
//                 orderId,
//                 item.productId || item.id,
//                 item.qty || item.quantity,
//                 item.unit || item.unitType,
//                 item.price || item.price,          // Added price with default 0
//                 item.discount || item.discount        // Added discount with default 0
//             ]
//         );
//         console.log(`Additional item inserted: orderId=${orderId}, productId=${item.productId || item.id}`);
//     }
// }

// // Helper function to insert process order record
// async function insertProcessOrder(connection, orderId, orderData) {
//     // Generate Invoice Number (YYMMDDRRRR)
//     const today = new Date();
//     const datePrefix = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

//     // Get the current max sequence number for today
//     const [sequenceResult] = await connection.query(
//         'SELECT MAX(invNo) as maxInvNo FROM processorders WHERE invNo LIKE ?',
//         [`${datePrefix}%`]
//     );

//     let sequenceNumber = 1;
//     if (sequenceResult[0] && sequenceResult[0].maxInvNo) {
//         sequenceNumber = parseInt(sequenceResult[0].maxInvNo.slice(-4), 10) + 1;
//     }

//     const invNo = `${datePrefix}${sequenceNumber.toString().padStart(4, '0')}`;

//     // Insert process order record
//     await connection.query(
//         `INSERT INTO processorders (
//           orderid, invNo, transactionId, paymentMethod, ispaid, amount, status, createdAt
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
//         [
//             orderId,
//             invNo,
//             orderData.transactionId || '',
//             orderData.paymentMethod || 'cash',
//             0,
//             0,
//             'Ordered'
//         ]
//     );
// }




const db = require('../startup/database');
const smsService = require('../services/sms-service');

/**
 * Process a complete order with transaction support for Market Place
 * @param {Object} orderData - Complete order data from request
 * @param {Number} salesAgentId - ID of the sales agent
 * @returns {Promise<{orderId: number, processOrderId: number}>} Object containing the new order ID and process order ID
 */
exports.processOrder = async (orderData, salesAgentId) => {
    console.time('process-order');
    let connection;
    let transactionStarted = false;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        console.log('Database connection acquired');

        // Start transaction
        await connection.beginTransaction();
        transactionStarted = true;
        console.log('Transaction started');

        // STEP 1: Get user details from marketplaceusers
        const userDetails = await getUserDetails(connection, orderData.userId);
        console.log(`User details retrieved for ID: ${orderData.userId}`);

        // STEP 2: Insert main order record FIRST
        const orderId = await insertMainOrder(connection, orderData, salesAgentId, userDetails);
        console.log(`Main order created with ID: ${orderId}`);

        // STEP 3: Insert into processorders table SECOND
        const processOrderId = await insertProcessOrder(connection, orderId, orderData);
        console.log(`Process order record created with ID: ${processOrderId}`);

        // STEP 4: Insert address data based on building type
        await insertAddressData(connection, orderId, orderData, userDetails);
        console.log('Address data inserted');

        await updateSalesAgentStars(connection, salesAgentId);
        console.log('Sales agent stars updated');

        // STEP 5: Process order based on isPackage flag
        if (orderData.isPackage === 1) {
            // Package order - Insert into orderpackage table using processOrderId
            await insertOrderPackage(connection, processOrderId, orderData);
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

        // Commit transaction if everything succeeded
        await connection.commit();
        transactionStarted = false;
        console.log('Transaction committed successfully');

        // STEP 6: Send order confirmation SMS after successful order processing
        try {
            await sendOrderConfirmationSMS(orderId, processOrderId, orderData.userId, userDetails, orderData, connection);
            console.log('Enhanced order confirmation SMS sent successfully');
        } catch (smsError) {
            // Log SMS error but don't fail the entire order since it's already committed
            console.error('Failed to send order confirmation SMS:', smsError);
            // You might want to add this to a retry queue or notification system
        }

        console.timeEnd('process-order');
        return { orderId, processOrderId };

    } catch (error) {
        console.error('Error in processOrder:', error);

        // Rollback transaction if connection exists and transaction was started
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
async function insertMainOrder(connection, orderData, salesAgentId, userDetails) {
    const {
        userId,
        orderApp = 'Dash',
        delivaryMethod = 'Delivery',
        centerId = null,
        isCoupon = 0,
        couponValue = 0,
        total,
        fullTotal,
        discount = 0,
        sheduleType = 'One Time',
        sheduleDate,
        sheduleTime,
        isPackage
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
          sheduleType, sheduleDate, sheduleTime, isPackage, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            userId,
            orderApp,
            delivaryMethod,
            centerId,
            buildingTypeForOrder,
            orderTitle,
            orderFullName,
            orderPhonecode1,
            orderPhone1,
            orderPhonecode2,
            orderPhone2,
            isCoupon,
            couponValue,
            total,
            fullTotal,
            discount,
            sheduleType,
            formattedDate,
            sheduleTime,
            isPackage
        ]
    );

    console.log(`Order inserted with user data: Title=${orderTitle}, FullName=${orderFullName}, Phone=${orderPhonecode1}${orderPhone1}, BuildingType=${buildingTypeForOrder}`);
    return result.insertId;
}

// Helper function to insert process order record - NOW RETURNS THE processOrderId
// async function insertProcessOrder(connection, orderId, orderData) {
//     // Generate Invoice Number (YYMMDDRRRR)
//     const today = new Date();
//     const datePrefix = `${today.getFullYear().toString().slice(-2)}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

//     // Get the current max sequence number for today
//     const [sequenceResult] = await connection.query(
//         'SELECT MAX(invNo) as maxInvNo FROM processorders WHERE invNo LIKE ?',
//         [`${datePrefix}%`]
//     );

//     let sequenceNumber = 1;
//     if (sequenceResult[0] && sequenceResult[0].maxInvNo) {
//         sequenceNumber = parseInt(sequenceResult[0].maxInvNo.slice(-4), 10) + 1;
//     }

//     const invNo = `${datePrefix}${sequenceNumber.toString().padStart(4, '0')}`;

//     // Insert process order record
//     const [result] = await connection.query(
//         `INSERT INTO processorders (
//           orderid, invNo, transactionId, paymentMethod, ispaid, amount, status, createdAt
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
//         [
//             orderId,
//             invNo,
//             orderData.transactionId || '',
//             orderData.paymentMethod || 'cash',
//             0,
//             0,
//             'Ordered'
//         ]
//     );

//     console.log(`Process order inserted with ID: ${result.insertId}, Invoice: ${invNo}`);
//     return result.insertId; // Return the processOrderId
// }

async function insertProcessOrder(connection, orderId, orderData) {
    try {
        // Generate date prefix (YYMMDD)
        const today = new Date();
        const year = today.getFullYear().toString().slice(-2); // Last 2 digits of year (25)
        const month = (today.getMonth() + 1).toString().padStart(2, '0'); // Month (08)
        const day = today.getDate().toString().padStart(2, '0'); // Day (04)

        const datePrefix = `${year}${month}${day}`; // 250804
        console.log(`Date prefix for invoice: ${datePrefix}`);

        // Get the current max sequence number for today (last 4 digits)
        const [sequenceResult] = await connection.query(`
            SELECT MAX(CAST(RIGHT(invNo, 4) AS UNSIGNED)) as maxSequence
            FROM processorders 
            WHERE invNo LIKE ? 
              AND LENGTH(invNo) = 10
              AND invNo REGEXP '^[0-9]+$'
        `, [`${datePrefix}%`]);

        // Calculate next sequence number (4 digits)
        let sequenceNumber = 1;
        if (sequenceResult[0] && sequenceResult[0].maxSequence !== null) {
            sequenceNumber = sequenceResult[0].maxSequence + 1;
        }

        // Generate final 10-digit invoice number: YYMMDDXXXX
        const invNo = `${datePrefix}${sequenceNumber.toString().padStart(4, '0')}`;
        console.log(`Generated invoice number: ${invNo} (Date: ${datePrefix}, Sequence: ${sequenceNumber})`);

        // Insert process order record
        const [result] = await connection.query(
            `INSERT INTO processorders (
              orderid, invNo, transactionId, paymentMethod, ispaid, amount, status, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                orderId,
                invNo,
                orderData.transactionId || '',
                orderData.paymentMethod || 'cash',
                0, // ispaid
                0, // amount
                'Ordered' // status
            ]
        );

        console.log(`Process order inserted with ID: ${result.insertId}, Invoice: ${invNo}`);
        return result.insertId; // Return the processOrderId

    } catch (error) {
        console.error('Error in insertProcessOrder:', error);
        throw new Error(`Failed to insert process order: ${error.message}`);
    }
}

// Helper function to insert address data (house/apartment)
async function insertAddressData(connection, orderId, orderData, userDetails) {
    const buildingTypeInt = getBuildingTypeInt(userDetails.buildingType);

    // Check by integer value: 1 = house, 2 = apartment
    if (buildingTypeInt === 1) { // House
        // Get house details using customerid from house table
        const [houseResult] = await connection.query(
            'SELECT * FROM house WHERE customerid = ? LIMIT 1',
            [orderData.userId]
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
            [orderData.userId]
        );

        if (apartmentResult && apartmentResult.length > 0) {
            await connection.query(
                'INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo,houseNo, streetName, city) VALUES (?, ?,?, ?, ?, ?, ?, ?)',
                [
                    orderId,
                    apartmentResult[0].buildingNo,
                    apartmentResult[0].buildingName,
                    apartmentResult[0].unitNo,
                    apartmentResult[0].floorNo,
                    apartmentResult[0].houseNo,
                    apartmentResult[0].streetName,
                    apartmentResult[0].city
                ]
            );
            console.log(`Apartment data inserted for orderId: ${orderId}`);
        } else {
            // Insert default apartment data if not found
            await connection.query(
                'INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo,houseNo, streetName, city) VALUES (?, ?, ?,?, ?, ?, ?, ?)',
                [
                    orderId,
                    orderData.buildingNo || '',
                    orderData.buildingName || '',
                    orderData.unitNo || '',
                    orderData.floorNo || '',
                    orderData.houseNo || '',
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

// Helper function to update sales agent stars
async function updateSalesAgentStars(connection, salesAgentId) {
    if (!salesAgentId) {
        console.log('No salesAgentId provided, skipping stars update');
        return;
    }

    try {
        await connection.query(
            'UPDATE salesagents SET stars = stars + 1 WHERE id = ?',
            [salesAgentId]
        );
        console.log(`Sales agent ${salesAgentId} stars updated`);
    } catch (error) {
        console.error('Error updating sales agent stars:', error);
    }
}

// FIXED: Helper function to insert package order into orderpackage table using processOrderId
async function insertOrderPackage(connection, processOrderId, orderData) {
    const { packageId } = orderData;

    if (!packageId) {
        throw new Error('Package ID is required for package orders (isPackage = 1)');
    }

    // Now using processOrderId instead of orderId
    await connection.query(
        'INSERT INTO orderpackage (orderid, packageId, createdAt) VALUES (?, ?, NOW())',
        [processOrderId, packageId]
    );

    console.log(`Package order inserted: processOrderId=${processOrderId}, packageId=${packageId}`);
}

// Helper function to process regular order items (isPackage = 0)
async function processRegularOrderItems(connection, orderId, orderData) {
    if (!orderData.items || orderData.items.length === 0) {
        throw new Error('Items are required for regular orders (isPackage = 0)');
    }

    await insertAdditionalItems(connection, orderId, orderData.items);
    console.log(`Regular order items processed: ${orderData.items.length} items`);
}

// Helper function to insert additional items into orderadditionalitems table
// async function insertAdditionalItems(connection, orderId, items) {
//     if (!items || items.length === 0) return;

//     for (const item of items) {
//         await connection.query(
//             'INSERT INTO orderadditionalitems (orderid, productId, qty, unit, price, discount, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW())',
//             [
//                 orderId,
//                 item.productId || item.id,
//                 item.qty || item.quantity,
//                 item.unit || item.unitType,
//                 item.price || 0,
//                 item.discount || 0
//             ]
//         );
//         console.log(`Additional item inserted: orderId=${orderId}, productId=${item.productId || item.id}`);
//     }
// }

async function insertAdditionalItems(connection, orderId, items) {
    if (!items || items.length === 0) return;

    for (const item of items) {
        const price = item.price || 0;
        const discount = item.discount || 0;
        const normalPrice = price + discount;

        await connection.query(
            'INSERT INTO orderadditionalitems (orderid, productId, qty, unit, price, discount, normalPrice, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                orderId,
                item.productId || item.id,
                item.qty || item.quantity,
                item.unit || item.unitType,
                price,
                discount,
                normalPrice
            ]
        );
        console.log(`Additional item inserted: orderId=${orderId}, productId=${item.productId || item.id}, normalPrice=${normalPrice}`);
    }
}

// FIXED: Enhanced helper function to send order confirmation SMS with total price, schedule date, and invoice number
async function sendOrderConfirmationSMS(orderId, processOrderId, userId, userDetails, orderData, connection) {
    try {
        // Format phone number
        const phoneNumber = `${userDetails.phoneCode}${userDetails.phoneNumber}`;

        // Create SMS message
        const customerName = `${userDetails.firstName} ${userDetails.lastName}`.trim();

        // Get the invoice number from processorders table using processOrderId
        const [invoiceResult] = await connection.query(
            'SELECT invNo FROM processorders WHERE id = ?',
            [processOrderId]
        );

        const invoiceNo = invoiceResult && invoiceResult[0] ? invoiceResult[0].invNo : processOrderId;

        // Format total price (assuming it's in LKR)
        const totalPrice = parseFloat(orderData.fullTotal);
        const formattedPrice = `Rs. ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Format schedule date for SMS
        let formattedScheduleDate = '';
        if (orderData.sheduleDate) {
            try {
                // If it's already in YYYY-MM-DD format
                if (orderData.sheduleDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const date = new Date(orderData.sheduleDate);
                    formattedScheduleDate = date.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                    });
                }
                // If it's in "DD MMM YYYY" format
                else if (orderData.sheduleDate.match(/^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/)) {
                    formattedScheduleDate = orderData.sheduleDate;
                }
                // Default fallback
                else {
                    formattedScheduleDate = orderData.sheduleDate;
                }
            } catch (dateError) {
                console.warn('Error formatting schedule date for SMS:', dateError);
                formattedScheduleDate = orderData.sheduleDate;
            }
        }

        // Format schedule time
        const scheduleTime = orderData.sheduleTime || '';

        // Build enhanced SMS message (keeping it concise for SMS limits)
        let smsMessage = `Dear ${customerName}, your order has been successfully placed!\n\n`;
        smsMessage += `Invoice: #${invoiceNo}\n`;
        smsMessage += `Total: ${formattedPrice}\n`;

        if (formattedScheduleDate) {
            smsMessage += `Delivery Date: ${formattedScheduleDate}`;
            smsMessage += `\n`;
        }

        smsMessage += `\nThank you for choosing AgroWorld! Our team will contact you shortly.\nSupport: +94 770111999`;

        console.log(`Preparing to send enhanced order confirmation SMS to ${phoneNumber}:`);
        console.log(`SMS Content: ${smsMessage}`);

        // Actually call the SMS service
        const smsResult = await smsService.sendSMS(phoneNumber, smsMessage);

        if (smsResult && smsResult.success) {
            console.log(`✅ Enhanced order confirmation SMS sent successfully to ${phoneNumber}`);
            console.log(`SMS Details - Invoice: ${invoiceNo}, Total: ${formattedPrice}, Schedule: ${formattedScheduleDate} ${scheduleTime}`);
            console.log(`SMS Provider: ${smsResult.provider || 'unknown'}`);
            return smsResult;
        } else {
            console.error(`❌ Failed to send SMS to ${phoneNumber}:`, smsResult);
            throw new Error('SMS sending failed');
        }

    } catch (error) {
        console.error('Error sending enhanced order confirmation SMS:', error);
        // Re-throw the error so the calling function can decide how to handle it
        throw error;
    }
}
// Export the SMS function so it can be used elsewhere if needed
exports.sendOrderConfirmationSMS = sendOrderConfirmationSMS;
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
                o.isPackage,
                c.title,
                c.firstName,
                c.lastName,
                c.phoneNumber,
                c.buildingType,
                p.invNo AS invoiceNumber,
                p.status As status,
                p.reportStatus As reportStatus,
                oai.qty,
                oai.productId,
                oai.unit,
                oai.price,
                oai.discount AS itemDiscount,
                op.packageId,
                mpp.displayName AS packageDisplayName,
                mpp.productPrice AS packagePrice,
                mpp.packingFee AS packagePackingFee,
                mpp.serviceFee AS packageServiceFee,
                mpp.status AS packageStatus
            FROM orders o
            JOIN marketplaceusers c ON o.userId = c.id
            LEFT JOIN processorders p ON o.id = p.orderId
            LEFT JOIN orderadditionalitems oai ON oai.orderId = o.id
            LEFT JOIN orderpackage op ON op.orderId = p.id
            LEFT JOIN marketplacepackages mpp ON mpp.id = op.packageId
            WHERE o.id = ?
        `;

        const [orderResults] = await connection.execute(sql, [orderId]);
        console.log("Order results:", orderResults);

        if (orderResults.length === 0) {
            return { message: 'No order found with the given ID' };
        }

        const order = orderResults[0];
        const customerId = order.userId;
        const buildingType = order.buildingType;

        let formattedAddress = '';

        // Filter out null/undefined items and create additional items array
        const additionalItems = orderResults
            .filter(item => item.productId !== null && item.productId !== undefined)
            .map(item => ({
                productId: item.productId,
                qty: parseFloat(item.qty) || 0,
                unit: item.unit || '',
                price: parseFloat(item.price) || 0,
                discount: parseFloat(item.itemDiscount) || 0
            }));

        // Handle address based on building type
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

        // Get package details if it's a package order
        let packageDetails = [];
        let packageInfo = null;

        if (order.isPackage === 1) {
            console.log("This is a package order, packageId:", order.packageId);

            if (order.packageId) {
                const packageDetailsSql = `
                    SELECT
                        pd.id,
                        pd.packageId,
                        pd.productTypeId,
                        pd.qty,
                        pt.typeName AS productTypeName
                    FROM packagedetails pd
                    JOIN producttypes pt ON pt.id = pd.productTypeId
                    WHERE pd.packageId = ?
                    ORDER BY pd.id ASC
                `;

                const [packageDetailsResults] = await connection.execute(packageDetailsSql, [order.packageId]);
                console.log("Package details query results:", packageDetailsResults);

                packageDetails = packageDetailsResults.map(detail => ({
                    id: detail.id,
                    productTypeId: detail.productTypeId,
                    productTypeName: detail.productTypeName,
                    qty: detail.qty
                }));

                // Create package info object
                packageInfo = {
                    packageId: order.packageId,
                    displayName: order.packageDisplayName,
                    productPrice: order.packagePrice,
                    packingFee: order.packagePackingFee,
                    serviceFee: order.packageServiceFee,
                    status: order.packageStatus,
                    packageDetails: packageDetails
                };
            } else {
                console.log("Package order but no packageId found");
            }
        }

        // Get product details for additional items if they exist
        let enhancedAdditionalItems = [];
        if (additionalItems.length > 0) {
            const productIds = additionalItems.map(item => item.productId);
            const placeholders = productIds.map(() => '?').join(',');

            const productDetailsSql = `
                SELECT
                    mi.id,
                    mi.displayName,
                    mi.varietyId
                FROM marketplaceitems mi
                WHERE mi.id IN (${placeholders})
            `;

            const [productResults] = await connection.execute(productDetailsSql, productIds);

            // Map additional items with product details
            enhancedAdditionalItems = additionalItems.map(item => {
                const productDetail = productResults.find(p => p.id === item.productId);
                return {
                    ...item,
                    displayName: productDetail ? productDetail.displayName : 'Unknown Product',
                    varietyId: productDetail ? productDetail.varietyId : null
                };
            });
        }

        console.log("Package details:", packageDetails);
        console.log("Package info:", packageInfo);
        console.log("Enhanced Additional Items:", enhancedAdditionalItems);
        console.log("Order packageId:", order.packageId);
        console.log("Order isPackage:", order.isPackage);

        // Return order data
        const result = {
            orderId: order.orderId,
            userId: order.userId,
            scheduleType: order.sheduleType,
            scheduleDate: order.sheduleDate,
            scheduleTime: order.sheduleTime,
            createdAt: order.createdAt,
            total: order.total,
            discount: order.discount,
            fullTotal: order.fullTotal,
            isPackage: order.isPackage,
            customerInfo: {
                title: order.title,
                firstName: order.firstName,
                lastName: order.lastName,
                phoneNumber: order.phoneNumber,
                buildingType: order.buildingType
            },
            fullAddress: formattedAddress,
            orderStatus: {
                invoiceNumber: order.invoiceNumber,
                status: order.status,
                reportStatus: order.reportStatus
            },
            additionalItems: enhancedAdditionalItems
        };

        // Add package information if it's a package order
        if (packageInfo) {
            result.packageInfo = packageInfo;
        }

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

// exports.getOrderByCustomerId = (customerId) => {
//     return new Promise((resolve, reject) => {
//         const sql = `
//             SELECT 
//                 o.id AS orderId,
//                 o.userId,
//                 o.sheduleType,
//                 o.sheduleDate,
//                 o.sheduleTime,


//                 o.createdAt,


//                 o.total,
//                 o.discount,
//                 o.fullTotal,
//                 p.invNo AS InvNo,
//                 p.reportStatus AS reportStatus,
//                 p.paymentMethod AS paymentMethod,
//                 p.status As status
//             FROM orders o
//             LEFT JOIN market_place.processorders p ON o.id = p.orderId
//             WHERE o.userId = ?
//         `;

//         db.marketPlace.query(sql, [customerId], (err, orderResults) => {
//             if (err) {
//                 return reject(err);
//             }

//             if (orderResults.length === 0) {
//                 return resolve({ message: 'No orders found for this customer' });
//             }

//             resolve(orderResults);
//         });
//     });
// };

exports.getOrderByCustomerId = (customerId, page = 1, limit = 5) => {
    return new Promise((resolve, reject) => {
        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // First, get the total count of orders for this customer
        const countSql = `
            SELECT COUNT(*) as totalCount
            FROM orders o
            LEFT JOIN market_place.processorders p ON o.id = p.orderId
            WHERE o.userId = ?
        `;

        db.marketPlace.query(countSql, [customerId], (err, countResult) => {
            if (err) {
                return reject(err);
            }

            const totalCount = countResult[0].totalCount;

            if (totalCount === 0) {
                return resolve({ message: 'No orders found for this customer' });
            }

            // Now get the paginated orders
            const ordersSql = `
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
                ORDER BY o.createdAt DESC
                LIMIT ? OFFSET ?
            `;

            db.marketPlace.query(ordersSql, [customerId, limit, offset], (err, orderResults) => {
                if (err) {
                    return reject(err);
                }

                console.log("bidshkic", orderResults)

                resolve({
                    orders: orderResults,
                    totalCount: totalCount
                });
            });
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

exports.getAllOrderDetails = async (salesAgentId, page = 1, limit = 5) => {
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        console.log('Database connection acquired');

        // Ensure page and limit are integers
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;

        console.log('Pagination params:', { page: pageNum, limit: limitNum, offset });

        // First, get the total count
        let countSql = `
            SELECT COUNT(*) as totalCount
            FROM orders o
            LEFT JOIN market_place.processorders p ON o.id = p.orderId
            LEFT JOIN market_place.marketplaceusers m ON o.userId = m.id
        `;

        const countParams = [];
        if (salesAgentId) {
            countSql += ` WHERE m.salesAgent = ?`;
            countParams.push(salesAgentId);
        }

        const [countResult] = await connection.execute(countSql, countParams);
        const totalCount = countResult[0].totalCount;

        // Main query with pagination - using string interpolation for LIMIT and OFFSET
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

        // Add ORDER BY and LIMIT/OFFSET using string interpolation
        sql += ` ORDER BY o.createdAt DESC LIMIT ${limitNum} OFFSET ${offset}`;

        //console.log('Final SQL:', sql);
        console.log('Params:', params);

        const [orderResults] = await connection.execute(sql, params);

        if (orderResults.length === 0) {
            return {
                orders: [],
                totalCount: totalCount
            };
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

        return {
            orders: processedOrders,
            totalCount: totalCount
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

// exports.cancelOrder = (orderId) => {
//     return new Promise((resolve, reject) => {
//         // Update order status to Cancelled
//         const updateSql = `
//       UPDATE market_place.processorders  
//       SET status = 'Cancelled'
//       WHERE orderId = ?
//     `;

//         db.marketPlace.query(updateSql, [orderId], (err, result) => {
//             if (err) {
//                 return reject(err);
//             }

//             // Check if any row was affected
//             if (result.affectedRows === 0) {
//                 return resolve({
//                     message: 'Order not found or already cancelled'
//                 });
//             }

//             // Return success
//             resolve({
//                 success: true,
//                 message: 'Order cancelled successfully',
//                 orderId: orderId
//             });
//         });
//     });
// };

exports.cancelOrder = (orderId) => {
    return new Promise((resolve, reject) => {
        console.log('Starting cancelOrder for orderId:', orderId);

        // First, get the actual ID from processorders table
        const selectSql = `
            SELECT id FROM market_place.processorders 
            WHERE orderId = ?
        `;

        db.marketPlace.query(selectSql, [orderId], (selectErr, selectResult) => {
            if (selectErr) {
                console.error('Error selecting order:', selectErr);
                return reject(selectErr);
            }

            if (selectResult.length === 0) {
                console.log('Order not found');
                return resolve({
                    message: 'Order not found'
                });
            }

            const actualId = selectResult[0].id;
            console.log('Found order with actual ID:', actualId);

            // Update order status to Cancelled
            const updateSql = `
                UPDATE market_place.processorders 
                SET status = 'Cancelled' 
                WHERE orderId = ?
            `;

            db.marketPlace.query(updateSql, [orderId], (err, result) => {
                if (err) {
                    console.error('Error updating order:', err);
                    return reject(err);
                }

                console.log('Order update result:', result);

                // Check if any row was affected
                if (result.affectedRows === 0) {
                    console.log('No rows affected - order not found');
                    return resolve({
                        message: 'Order not found or already cancelled'
                    });
                }

                // Insert notification using the actual ID (not orderId)
                const notificationSql = `
                    INSERT INTO dashnotification (
                        orderId, title, readStatus, createdAt
                    ) VALUES (?, ?, ?, NOW())
                `;

                console.log('Attempting to insert notification...');
                console.log('Using actual ID:', actualId);

                db.marketPlace.query(
                    notificationSql,
                    [actualId, "Order is Cancelled", 0], // Use actualId here
                    (notifErr, notifResult) => {
                        if (notifErr) {
                            console.error('Failed to insert notification:', notifErr);
                            return resolve({
                                success: true,
                                message: 'Order cancelled successfully but notification failed',
                                orderId: orderId,
                                notificationInserted: false,
                                error: notifErr.message
                            });
                        }

                        console.log('Notification inserted successfully:', notifResult);

                        // Return success
                        resolve({
                            success: true,
                            message: 'Order cancelled successfully',
                            orderId: orderId,
                            notificationInserted: true
                        });
                    }
                );
            });
        });
    });
};

///// getorders




// // Alternative function to get order counts for ALL sales agents
// exports.getOrderCountBySalesAgent = async (salesAgentId) => {
//     try {
//         const connection = await db.marketPlace.promise().getConnection();
//         try {
//             // First get all customers assigned to this sales agent
//             const customersQuery = `
//                 SELECT id, firstName, lastName, salesAgent
//                 FROM marketplaceusers 
//                 WHERE salesAgent = ?
//             `;

//             const [customerRows] = await connection.query(customersQuery, [salesAgentId]);

//             console.log("Customers for sales agent", salesAgentId, ":", customerRows);

//             if (customerRows.length === 0) {
//                 return {
//                     salesAgentId: salesAgentId,
//                     customerCount: 0,
//                     orderCount: 0,
//                     message: 'No customers assigned to this sales agent'
//                 };
//             }

//             // Get customer IDs
//             const customerIds = customerRows.map(customer => customer.id);

//             // Get order count for all these customers
//             const orderCountQuery = `
//                 SELECT COUNT(*) as orderCount
//                 FROM orders 
//                 WHERE userId IN (${customerIds.map(() => '?').join(',')})
//             `;

//             const [orderRows] = await connection.query(orderCountQuery, customerIds);

//             console.log("veukcsaj", orderRows)

//             return {
//                 salesAgentId: salesAgentId,
//                 customerCount: customerRows.length,
//                 orderCount: orderRows[0]?.orderCount || 0,
//                 customers: customerRows // Optional: include customer details
//             };

//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in getOrderCountBySalesAgent:', error);
//         throw error;
//     }
// };


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

            // Get order count for current month only
            const orderCountQuery = `
                SELECT COUNT(*) as orderCount
                FROM orders 
                WHERE userId IN (${customerIds.map(() => '?').join(',')})
                AND YEAR(createdAt) = YEAR(CURDATE())
                AND MONTH(createdAt) = MONTH(CURDATE())
            `;

            const [orderRows] = await connection.query(orderCountQuery, customerIds);

            console.log("Current month orders:", orderRows);

            return {
                salesAgentId: salesAgentId,
                customerCount: customerRows.length,
                orderCount: orderRows[0]?.orderCount || 0,
                month: new Date().getMonth() + 1, // Current month number
                year: new Date().getFullYear(),   // Current year
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

