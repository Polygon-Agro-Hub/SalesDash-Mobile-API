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
            orderData.status || 'pending'
        ]
    );
}


/////get customer data

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
      FROM marketplaceusers
      WHERE id = ?
    `;

        db.marketPlace.query(customerSql, [customerId], (err, customerResults) => {
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

            db.marketPlace.query(buildingSql, [customerId], (err, buildingResults) => {
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


exports.getOrderById = (orderId) => {
    return new Promise((resolve, reject) => {
        const sql = `
        SELECT 
          o.id AS orderId,
          o.userId,
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
          c.title,
          c.firstName,
          c.lastName,
          c.phoneNumber,
          c.buildingType
        FROM orders o
        JOIN marketplaceusers c ON o.userId = c.id
        WHERE o.id = ?
      `;

        db.marketPlace.query(sql, [orderId], (err, orderResults) => {
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

                db.marketPlace.query(addressSql, [customerId], (err, addressResults) => {
                    if (err) {
                        return reject(err);
                    }

                    let formattedAddress = '';
                    if (addressResults[0]) {
                        const addr = addressResults[0];
                        formattedAddress = `${addr.houseNo || ''}, ${addr.streetName || ''}, ${addr.city || ''}`.trim();
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

                db.marketPlace.query(addressSql, [customerId], (err, addressResults) => {
                    if (err) {
                        return reject(err);
                    }

                    let formattedAddress = '';
                    if (addressResults[0]) {
                        const addr = addressResults[0];
                        formattedAddress = `${addr.buildingName || ''}, ${addr.buildingNo || ''}, Unit ${addr.unitNo || ''}, Floor ${addr.floorNo || ''}, ${addr.houseNo || ''}, ${addr.streetName || ''}, ${addr.city || ''}`.trim();
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
