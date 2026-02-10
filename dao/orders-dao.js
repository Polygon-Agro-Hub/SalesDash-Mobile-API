const db = require('../startup/database');
const smsService = require('../services/sms-service');
const QRCode = require('qrcode');
const uploadFileToS3 = require('../Middlewares/s3upload');
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

        // Start transaction
        await connection.beginTransaction();
        transactionStarted = true;

        // STEP 1: Get user details from marketplaceusers
        const userDetails = await getUserDetails(connection, orderData.userId);

        // STEP 2: Insert main order record FIRST
        const orderId = await insertMainOrder(connection, orderData, salesAgentId, userDetails);
       

        // STEP 3: Insert into processorders table SECOND
        const processOrderId = await insertProcessOrder(connection, orderId, orderData);
        

        // STEP 4: Insert address data based on building type
        await insertAddressData(connection, orderId, orderData, userDetails);


        await updateSalesAgentStars(connection, salesAgentId);

        // STEP 5: Process order based on isPackage flag
        if (orderData.isPackage === 1) {
            // Package order - Insert into orderpackage table using processOrderId
            await insertOrderPackage(connection, processOrderId, orderData);
         

            // Process items array for package orders (NEW LOGIC)
            if (orderData.items && orderData.items.length > 0) {
                await insertAdditionalItems(connection, orderId, orderData.items);
                
            }

            // Process additional items if present for package orders (EXISTING LOGIC)
            if (orderData.additionalItems && orderData.additionalItems.length > 0) {
                await insertAdditionalItems(connection, orderId, orderData.additionalItems);
                
            }
        } else {
            // Regular order (isPackage = 0) - Items go to orderadditionalitems table
            await processRegularOrderItems(connection, orderId, orderData);
            
        }

        // Commit transaction if everything succeeded
        await connection.commit();
        transactionStarted = false;
        

        // STEP 6: Send order confirmation SMS after successful order processing
        try {
            await sendOrderConfirmationSMS(orderId, processOrderId, orderData.userId, userDetails, orderData, connection);
            
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
         phoneCode, phoneNumber, buyerType, email, buildingType, billingTitle, billingName , longitude , latitude
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

    // Get longitude and latitude from userDetails
    const longitude = userDetails.longitude || null;
    const latitude = userDetails.latitude || null;

    // Use the original buildingType string for orders table
    const buildingTypeForOrder = userDetails.buildingType;
    

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

    // Insert order record with user data from marketplaceusers table INCLUDING longitude and latitude
    const [result] = await connection.query(
        `INSERT INTO orders (
          userId, orderApp, delivaryMethod, centerId, buildingType,
          title, fullName, phonecode1, phone1, phonecode2, phone2,
          isCoupon, couponValue, total, fullTotal, discount,
          sheduleType, sheduleDate, sheduleTime, isPackage, 
          longitude, latitude, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
            isPackage,
            longitude,    // Added
            latitude      // Added
        ]
    );

    
    return result.insertId;
}



/**
 * Generate QR Code and upload to cloud storage using existing middleware
 * @param {String} text - Text to encode in QR code (invoice number)
 * @returns {Promise<String>} Public URL of uploaded QR code
 */
async function generateQRCode(text) {
    try {
        // Generate QR code as buffer
        const qrCodeBuffer = await QRCode.toBuffer(text, {
            errorCorrectionLevel: 'M',
            type: 'png',
            quality: 0.92,
            margin: 1,
            width: 300,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });

        // Upload to R2 using existing middleware
        const fileName = `${text}.png`; // Use invoice number as filename
        const keyPrefix = 'qrcodes/invoices'; // Folder structure in R2

        const publicUrl = await uploadFileToS3(qrCodeBuffer, fileName, keyPrefix);


        return publicUrl;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw new Error(`QR Code generation failed: ${error.message}`);
    }
}



async function insertProcessOrder(connection, orderId, orderData) {
    try {
        // Generate date prefix (YYMMDD)
        const today = new Date();
        const year = today.getFullYear().toString().slice(-2); // Last 2 digits of year (25)
        const month = (today.getMonth() + 1).toString().padStart(2, '0'); // Month (08)
        const day = today.getDate().toString().padStart(2, '0'); // Day (04)

        const datePrefix = `${year}${month}${day}`; 

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
       

        // ✨ GENERATE QR CODE containing the invoice number
        const qrCodeDataURL = await generateQRCode(invNo);
        

        // Insert process order record WITH QR CODE
        const [result] = await connection.query(
            `INSERT INTO processorders (
              orderid, invNo, transactionId, paymentMethod, ispaid, amount, status, qrCode, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                orderId,
                invNo,
                orderData.transactionId || '',
                orderData.paymentMethod || 'cash',
                0, // ispaid
                0, // amount
                'Ordered', // status
                qrCodeDataURL // QR code as base64 data URL
            ]
        );

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
            
        } else {
            // Insert default house data if not found
            await connection.query(
                'INSERT INTO orderhouse (orderid, houseNo, streetName, city) VALUES (?, ?, ?, ?)',
                [orderId, orderData.houseNo || '', orderData.streetName || '', orderData.city || '']
            );
            
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
        
        return;
    }

    try {
        await connection.query(
            'UPDATE salesagents SET stars = stars + 1 WHERE id = ?',
            [salesAgentId]
        );
       
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

   
}

// Helper function to process regular order items (isPackage = 0)
async function processRegularOrderItems(connection, orderId, orderData) {
    if (!orderData.items || orderData.items.length === 0) {
        throw new Error('Items are required for regular orders (isPackage = 0)');
    }

    await insertAdditionalItems(connection, orderId, orderData.items);
    
}



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

        smsMessage += `\nThank you for choosing Polygon Agro! Our team will contact you shortly.\nSupport: +94 770111999`;


        // Actually call the SMS service
        const smsResult = await smsService.sendSMS(phoneNumber, smsMessage);

        if (smsResult && smsResult.success) {
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



exports.getDataCustomerId = async (customerId) => {
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
        

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


exports.getOrderById = async (orderId) => {
    let connection;

    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
      

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

          

                resolve({
                    orders: orderResults,
                    totalCount: totalCount
                });
            });
        });
    });
};



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

exports.cancelOrder = (orderId) => {
    return new Promise((resolve, reject) => {
      

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
                
                return resolve({
                    message: 'Order not found'
                });
            }

            const actualId = selectResult[0].id;
         

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

             

                // Check if any row was affected
                if (result.affectedRows === 0) {
                    
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
            
        }

        await connection.query(
            'UPDATE salesagentstars SET completed = ?, numOfStars = ? WHERE id = ?',
            [newCompleted, numOfStars, currentRecord.id]
        );

       
    } else {
        // No record exists for today, create a new one with completed = 1
        // Note: We don't know the target yet, so numOfStars will be 0 initially
        await connection.query(
            'INSERT INTO salesagentstars (salesagentId, date, completed, target, numOfStars) VALUES (?, ?, ?, ?, ?)',
            [salesAgentId, formattedDate, 1, 0, 0]  // Initialize with defaults
        );

    }
}



exports.getReturnReason = async (orderId) => {
    let connection;
    try {
        // Get connection from pool
        connection = await db.marketPlace.promise().getConnection();
       

        // Single query with joins to get return reason directly
        const returnReasonSql = `
            SELECT rr.rsnEnglish as returnReason
            FROM market_place.processorders po
            INNER JOIN collection_officer.driverorders do ON do.orderId = po.id
            INNER JOIN collection_officer.driverreturnorders dro ON dro.drvOrderId = do.id
            INNER JOIN collection_officer.returnreason rr ON rr.id = dro.returnReasonId
            WHERE po.orderId = ?
            LIMIT 1
        `;

        const [result] = await connection.query(returnReasonSql, [orderId]);

        if (!result || result.length === 0) {
            return { message: 'Return reason not found' };
        }

        return {
            returnReason: result[0].returnReason
        };

    } catch (err) {
        console.error('Database error in getReturnReason:', err);
        throw err;
    } finally {
        // Always release the connection back to the pool
        if (connection) {
            connection.release();
            console.log('Database connection released');
        }
    }
};


exports.getHold = async (orderId) => {
    let connection;
    try {
        connection = await db.marketPlace.promise().getConnection();
     

        const holdCheckSql = `
            SELECT 
                po.orderId as businessOrderId,
                po.id as processOrderId,
                do.id as driverOrderId,
                do.drvStatus,
                dho.id as holdRecordId,
                dho.holdReasonId,
                dho.createdAt as holdCreatedAt
            FROM market_place.processorders po
            LEFT JOIN collection_officer.driverorders do ON po.id = do.orderId
            LEFT JOIN collection_officer.driverholdorders dho ON do.id = dho.drvOrderId
            WHERE po.orderId = ?
            LIMIT 1
        `;

        const [result] = await connection.query(holdCheckSql, [orderId]);

        if (!result || result.length === 0) {
            return {
                success: false,
                message: 'Order not found'
            };
        }

        // Check if holdRecordId exists to determine if order is on hold
        const isHold = result[0].holdRecordId !== null;

        return {
            success: true,
            orderId: result[0].businessOrderId,  // Fixed: use businessOrderId
            isHold: isHold,  // Fixed: check if holdRecordId exists
            holdReasonId: result[0].holdReasonId || null,
            holdCreatedAt: result[0].holdCreatedAt || null
        };

    } catch (err) {
        console.error('Database error in getHoldReason:', err);
        throw err;
    } finally {
        if (connection) {
            connection.release();
            console.log('Database connection released');
        }
    }
};