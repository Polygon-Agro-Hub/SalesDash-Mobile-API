const db = require("../startup/database");
const smsService = require("../services/sms-service");
const QRCode = require("qrcode");
const uploadFileToS3 = require("../middleware/s3upload");

exports.processOrder = async (orderData, salesAgentId) => {
  console.time("process-order");
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
    const orderId = await insertMainOrder(
      connection,
      orderData,
      salesAgentId,
      userDetails,
    );

    // STEP 3: Insert into processorders table SECOND
    const processOrderId = await insertProcessOrder(
      connection,
      orderId,
      orderData,
    );

    await assignCenterToOrder(connection, orderId, orderData, userDetails);

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
        await insertAdditionalItems(
          connection,
          orderId,
          orderData.additionalItems,
        );
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
      await sendOrderConfirmationSMS(
        orderId,
        processOrderId,
        orderData.userId,
        userDetails,
        orderData,
        connection,
      );
    } catch (smsError) {
      // Log SMS error but don't fail the entire order since it's already committed
      console.error("Failed to send order confirmation SMS:", smsError);
      // You might want to add this to a retry queue or notification system
    }

    console.timeEnd("process-order");
    return { orderId, processOrderId };
  } catch (error) {
    console.error("Error in processOrder:", error);

    // Rollback transaction if connection exists and transaction was started
    if (connection && transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          "Critical Error: Failed to rollback transaction:",
          rollbackError,
        );
      }
    }

    throw new Error(`Order processing failed: ${error.message}`);
  } finally {
    // Release connection back to pool
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        console.error("Error releasing connection:", releaseError);
      }
    }
  }
};

// Helper function to get user details from marketplaceusers
async function getUserDetails(connection, userId) {
  const [userResult] = await connection.query(
    `SELECT id, salesAgent, googleId, cusId, title, firstName, lastName, 
         phoneCode, phoneNumber, buyerType, email
         FROM marketplaceusers WHERE id = ?`,
    [userId],
  );

  if (!userResult || userResult.length === 0) {
    throw new Error(`User not found with ID: ${userId}`);
  }

  return userResult[0];
}

// Helper function to get building type integer value
function getBuildingTypeInt(buildingType) {
  const buildingTypeMapping = {
    house: 1,
    House: 1,
    1: 1,
    1: 1,
    apartment: 2,
    Apartment: 2,
    2: 2,
    2: 2,
    condo: 3,
    Condo: 3,
    3: 3,
    3: 3,
    office: 4,
    Office: 4,
    4: 4,
    4: 4,
  };
  return buildingTypeMapping[buildingType] || 1;
}

async function assignCenterToOrder(
  connection,
  orderId,
  orderData,
  userDetails,
) {
  try {
    let city = null;

    // Step 1: Get city based on deliveryAddress
    if (orderData.deliveryAddress && orderData.deliveryAddress.city) {
      city = orderData.deliveryAddress.city;
    }

    if (!city) {
      console.warn(
        `No city found for userId ${orderData.userId}, skipping center assignment.`,
      );
      return;
    }

    // Step 2: Match city in collection_officer.deliverycharge → get id
    const [deliveryChargeResult] = await connection.query(
      "SELECT id FROM collection_officer.deliverycharge WHERE city = ? LIMIT 1",
      [city],
    );

    if (!deliveryChargeResult || deliveryChargeResult.length === 0) {
      console.warn(
        `No delivery charge found for city "${city}", skipping center assignment.`,
      );
      return;
    }

    const deliveryChargeId = deliveryChargeResult[0].id;

    // Step 3: Get companyCenterId from centerowncity (this is the FK to distributedcompanycenter)
    const [centerOwnCityResult] = await connection.query(
      "SELECT companyCenterId FROM collection_officer.centerowncity WHERE cityId = ? LIMIT 1",
      [deliveryChargeId],
    );

    if (!centerOwnCityResult || centerOwnCityResult.length === 0) {
      console.warn(
        `No center found for deliveryChargeId ${deliveryChargeId}, skipping center assignment.`,
      );
      return;
    }

    // Step 4: Use companyCenterId — it references distributedcompanycenter(id) ✅
    const companyCenterId = centerOwnCityResult[0].companyCenterId;

    await connection.query(
      "UPDATE orders SET assignCoMCenId = ? WHERE id = ?",
      [companyCenterId, orderId],
    );

    console.log(
      `🎯 Assigned companyCenterId ${companyCenterId} to orderId ${orderId}`,
    );
  } catch (error) {
    console.error("Error in assignCenterToOrder:", error);
  }
}

async function insertMainOrder(
  connection,
  orderData,
  salesAgentId,
  userDetails,
) {
  const {
    userId,
    orderApp = "Dash",
    delivaryMethod = "Delivery",
    centerId = null,
    isCoupon = 0,
    couponValue = 0,
    total,
    fullTotal,
    discount = 0,
    sheduleType = "One Time",
    sheduleDate,
    sheduleTime,
    isPackage,
    deliveryCharge = 0,
    isFinalizeImdt = 0,
  } = orderData;

  // Normalize a phone number: strip country code / leading 0, return last 9 digits
  const normalizePhone = (raw) => {
    if (!raw) return null;
    // Remove spaces, dashes, parentheses
    let digits = String(raw).replace(/[\s\-().+]/g, "");
    // Strip leading country code 94 (Sri Lanka) if longer than 9 digits
    if (digits.startsWith("94") && digits.length > 9) {
      digits = digits.slice(2);
    }
    // Strip leading 0
    if (digits.startsWith("0")) {
      digits = digits.slice(1);
    }
    // Always return the last 9 digits
    return digits.slice(-9);
  };

  const orderTitle =
    orderData.deliveryAddress?.billingTitle || userDetails.title;
  const orderFullName = orderData.deliveryAddress?.billingName
    ? orderData.deliveryAddress.billingName.trim()
    : `${userDetails.firstName} ${userDetails.lastName}`.trim();

  // phonecode1 is always "+94"
  const orderPhonecode1 = "+94";
  const orderPhone1 = normalizePhone(
    orderData.deliveryAddress?.billingPhone1 || userDetails.phoneNumber,
  );

  // Optional second phone
  const orderPhonecode2 =
    orderData.deliveryAddress?.billingPhone2 || orderData.phone2 ? "+94" : null;
  const orderPhone2 = normalizePhone(
    orderData.deliveryAddress?.billingPhone2 || orderData.phone2 || null,
  );

  // Get longitude and latitude from userDetails / deliveryAddress
  const longitude =
    orderData.deliveryAddress?.longitude || userDetails.longitude || null;
  const latitude =
    orderData.deliveryAddress?.latitude || userDetails.latitude || null;

  // Use House or Apartment for buildingType in orders table
  const rawBuildingType = orderData.deliveryAddress?.type || "House";
  const buildingTypeIntForOrder = getBuildingTypeInt(rawBuildingType);
  const buildingTypeForOrder =
    buildingTypeIntForOrder === 2 ||
      buildingTypeIntForOrder === 3 ||
      buildingTypeIntForOrder === 4
      ? "Apartment"
      : "House";

  // Format date if needed
  let formattedDate = sheduleDate;
  if (
    sheduleDate &&
    typeof sheduleDate === "string" &&
    sheduleDate.match(/^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/)
  ) {
    const dateParts = sheduleDate.split(" ");
    const day = parseInt(dateParts[0], 10);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames.indexOf(dateParts[1]) + 1;
    const year = parseInt(dateParts[2], 10);
    formattedDate = `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  }

  // Insert order record with user data from marketplaceusers table INCLUDING longitude and latitude
  const [result] = await connection.query(
    `INSERT INTO orders (
          userId,  orderApp, delivaryMethod, centerId, buildingType,
          title, fullName, phonecode1, phone1, phonecode2, phone2,
          isCoupon, couponValue, total, fullTotal, discount,
          sheduleType, sheduleDate, sheduleTime, isPackage, 
          longitude, latitude, deliveryCharge, isFinalizeImdt, createdAt
        ) VALUES (?, ? , ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      longitude,
      latitude,
      deliveryCharge,
      isFinalizeImdt ? 1 : 0,
    ],
  );

  return result.insertId;
}

async function generateQRCode(text) {
  try {
    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(text, {
      errorCorrectionLevel: "M",
      type: "png",
      quality: 0.92,
      margin: 1,
      width: 300,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });

    // Upload to R2 using existing middleware
    const fileName = `${text}.png`; // Use invoice number as filename
    const keyPrefix = "qrcodes/invoices"; // Folder structure in R2

    const publicUrl = await uploadFileToS3(qrCodeBuffer, fileName, keyPrefix);

    return publicUrl;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error(`QR Code generation failed: ${error.message}`);
  }
}

async function insertProcessOrder(connection, orderId, orderData) {
  try {
    // Generate date prefix (YYMMDD)
    const today = new Date();
    const year = today.getFullYear().toString().slice(-2); // Last 2 digits of year (25)
    const month = (today.getMonth() + 1).toString().padStart(2, "0"); // Month (08)
    const day = today.getDate().toString().padStart(2, "0"); // Day (04)

    const datePrefix = `${year}${month}${day}`;

    // Get the current max sequence number for today (last 4 digits)
    const [sequenceResult] = await connection.query(
      `
            SELECT MAX(CAST(RIGHT(invNo, 4) AS UNSIGNED)) as maxSequence
            FROM processorders 
            WHERE invNo LIKE ? 
              AND LENGTH(invNo) = 10
              AND invNo REGEXP '^[0-9]+$'
        `,
      [`${datePrefix}%`],
    );

    // Calculate next sequence number (4 digits)
    let sequenceNumber = 1;
    if (sequenceResult[0] && sequenceResult[0].maxSequence !== null) {
      sequenceNumber = sequenceResult[0].maxSequence + 1;
    }

    // Generate final 10-digit invoice number: YYMMDDXXXX
    const invNo = `${datePrefix}${sequenceNumber.toString().padStart(4, "0")}`;

    // ✨ GENERATE QR CODE containing the invoice number
    const qrCodeDataURL = await generateQRCode(invNo);

    // Normalize paymentMethod: "Card" or "Cash"
    const paymentMethodValue =
      orderData.paymentMethod &&
        orderData.paymentMethod.toLowerCase().includes("card")
        ? "Card"
        : "Cash";

    const isCardPayment = paymentMethodValue === "Card";
    const isPaidValue = 0;
    const amountValue = 0.0;

    // Insert process order record WITH QR CODE
    const [result] = await connection.query(
      `INSERT INTO processorders (
          orderid, invNo, transactionId, paymentMethod, ispaid, amount, creditPaid, moneyPaid, status, qrCode, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId,
        invNo,
        orderData.transactionId || "",
        paymentMethodValue,
        isPaidValue,
        amountValue,
        0.0,
        0.0,
        "Ordered",
        qrCodeDataURL,
      ],
    );

    return result.insertId; // Return the processOrderId
  } catch (error) {
    console.error("Error in insertProcessOrder:", error);
    throw new Error(`Failed to insert process order: ${error.message}`);
  }
}

// Helper function to insert address data (house/apartment)
async function insertAddressData(connection, orderId, orderData, userDetails) {
  // If custom deliveryAddress is specified in orderData, use it directly
  if (orderData.deliveryAddress) {
    const address = orderData.deliveryAddress;
    const typeInt = getBuildingTypeInt(address.type);

    if (typeInt === 1) {
      await connection.query(
        "INSERT INTO orderhouse (orderid, houseNo, streetName, city, saveAs) VALUES (?, ?, ?, ?, ?)",
        [
          orderId,
          address.houseNo || "",
          address.streetName || "",
          address.city || "",
          address.label || address.billingName || "",
        ],
      );
    } else if (typeInt === 2 || typeInt === 3 || typeInt === 4) {
      await connection.query(
        "INSERT INTO orderapartment (orderid, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city, saveAs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          orderId,
          address.buildingNo || "",
          address.buildingName || "",
          address.unitNo || "",
          address.floorNo || "",
          address.houseNo || "",
          address.streetName || "",
          address.city || "",
          address.label || address.billingName || "",
        ],
      );
    }
  }
}

// Helper function to update sales agent stars (Legacy)
async function updateSalesAgentStarsLegacy(connection, salesAgentId) {
  if (!salesAgentId) {
    return;
  }

  try {
    await connection.query(
      "UPDATE salesagents SET stars = stars + 1 WHERE id = ?",
      [salesAgentId],
    );
  } catch (error) {
    console.error("Error updating sales agent stars:", error);
  }
}

// Helper function to insert package order into orderpackage table using processOrderId
async function insertOrderPackage(connection, processOrderId, orderData) {
  const { packageId } = orderData;

  if (!packageId) {
    throw new Error(
      "Package ID is required for package orders (isPackage = 1)",
    );
  }

  // Now using processOrderId instead of orderId
  await connection.query(
    "INSERT INTO orderpackage (orderid, packageId, createdAt) VALUES (?, ?, NOW())",
    [processOrderId, packageId],
  );
}

// Helper function to process regular order items (isPackage = 0)
async function processRegularOrderItems(connection, orderId, orderData) {
  if (!orderData.items || orderData.items.length === 0) {
    return;
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
      "INSERT INTO orderadditionalitems (orderid, productId, qty, unit, price, discount, normalPrice, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())",
      [
        orderId,
        item.productId || item.id,
        item.qty || item.quantity,
        item.unit || item.unitType,
        price,
        discount,
        normalPrice,
      ],
    );
  }
}

// Enhanced helper function to send order confirmation SMS with total price, schedule date, and invoice number
async function sendOrderConfirmationSMS(
  orderId,
  processOrderId,
  userId,
  userDetails,
  orderData,
  connection,
) {
  try {
    // Format phone number
    const phoneNumber = `${userDetails.phoneCode}${userDetails.phoneNumber}`;

    // Create SMS message
    const customerName =
      `${userDetails.firstName} ${userDetails.lastName}`.trim();

    // Get the invoice number from processorders table using processOrderId
    const [invoiceResult] = await connection.query(
      "SELECT invNo FROM processorders WHERE id = ?",
      [processOrderId],
    );

    const invoiceNo =
      invoiceResult && invoiceResult[0]
        ? invoiceResult[0].invNo
        : processOrderId;

    // Format total price (assuming it's in LKR)
    const totalPrice = parseFloat(orderData.fullTotal);
    const formattedPrice = `Rs. ${totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Format schedule date for SMS
    let formattedScheduleDate = "";
    if (orderData.sheduleDate) {
      try {
        // If it's already in YYYY-MM-DD format
        if (orderData.sheduleDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const date = new Date(orderData.sheduleDate);
          formattedScheduleDate = date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
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
        console.warn("Error formatting schedule date for SMS:", dateError);
        formattedScheduleDate = orderData.sheduleDate;
      }
    }

    // Format schedule time
    const scheduleTime = orderData.sheduleTime || "";

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
      throw new Error("SMS sending failed");
    }
  } catch (error) {
    console.error("Error sending enhanced order confirmation SMS:", error);
    // Re-throw the error so the calling function can decide how to handle it
    throw error;
  }
}

exports.sendOrderConfirmationSMS = sendOrderConfirmationSMS;

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
                email
            FROM marketplaceusers
            WHERE id = ?
        `;

    const [customerResults] = await connection.execute(customerSql, [
      customerId,
    ]);

    if (customerResults.length === 0) {
      return { message: "No customer found with this ID" };
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
      customer.phoneNumber = "";
    }

    // Remove the separate phoneCode field since we've combined it
    delete customer.phoneCode;

    return customer;
  } catch (err) {
    console.error("Database error:", err);
    throw err;
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
};

// Get user's total of successfully delivered orders and compute credit balance
exports.getDeliveredOrdersTotal = async (userId) => {
  let connection;
  try {
    connection = await db.marketPlace.promise().getConnection();
    const [rows] = await connection.query(
      `SELECT COALESCE(SUM(o.fullTotal), 0) AS deliveredTotal
       FROM orders o
       WHERE o.userId = ?`,
      [userId],
    );
    const deliveredTotal = parseFloat(rows[0]?.deliveredTotal || 0);

    // Base 2000, +250 for every full 25000 in total order value
    const tiersEarned = Math.floor(deliveredTotal / 25000);
    const creditBalance = 2000 + tiersEarned * 250;

    return { deliveredTotal, creditBalance };
  } catch (err) {
    console.error("Error in getDeliveredOrdersTotal:", err);
    throw err;
  } finally {
    if (connection) connection.release();
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
                o.deliveryCharge,
                o.fullTotal,
                o.isPackage,
                o.delivaryMethod,
                c.title,
                c.firstName,
                c.lastName,
                c.phoneNumber,
                p.invNo AS invoiceNumber,
                p.status As status,
                p.reportStatus As reportStatus,
                p.paymentMethod,
                p.creditPaid,
                p.moneyPaid,
                p.isPaid,
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
      return { message: "No order found with the given ID" };
    }

    const order = orderResults[0];

    let formattedAddress = "";
    let buildingType = "";

    // Filter out null/undefined items and create additional items array
    const additionalItems = orderResults
      .filter((item) => item.productId !== null && item.productId !== undefined)
      .map((item) => ({
        productId: item.productId,
        qty: parseFloat(item.qty) || 0,
        unit: item.unit || "",
        price: parseFloat(item.price) || 0,
        discount: parseFloat(item.itemDiscount) || 0,
      }));

    // Determine building type from orderhouse / orderapartment tables (by orderId)
    const [houseRows] = await connection.execute(
      `SELECT houseNo, streetName, city FROM orderhouse WHERE orderid = ? LIMIT 1`,
      [orderId]
    );

    if (houseRows.length > 0) {
      buildingType = "House";
      const addr = houseRows[0];
      formattedAddress =
        `${addr.houseNo || ""}, ${addr.streetName || ""}, ${addr.city || ""}`.trim();
      formattedAddress = formattedAddress.replace(/,\s*,/g, ",").replace(/\s+/g, " ").replace(/,\s*$/, "").trim();
    } else {
      const [apartmentRows] = await connection.execute(
        `SELECT buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city FROM orderapartment WHERE orderid = ? LIMIT 1`,
        [orderId]
      );

      if (apartmentRows.length > 0) {
        buildingType = "Apartment";
        const addr = apartmentRows[0];
        formattedAddress =
          `${addr.buildingName || ""}, ${addr.buildingNo || ""}, Unit ${addr.unitNo || ""}, Floor ${addr.floorNo || ""}, ${addr.houseNo || ""}, ${addr.streetName || ""}, ${addr.city || ""}`.trim();
        formattedAddress = formattedAddress
          .replace(/\s+/g, " ")
          .replace(/, Unit ,/g, ",")
          .replace(/, Floor ,/g, ",")
          .replace(/,\s*,/g, ",")
          .replace(/,\s*$/, "")
          .trim();
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

        const [packageDetailsResults] = await connection.execute(
          packageDetailsSql,
          [order.packageId],
        );

        packageDetails = packageDetailsResults.map((detail) => ({
          id: detail.id,
          productTypeId: detail.productTypeId,
          productTypeName: detail.productTypeName,
          qty: detail.qty,
        }));

        // Create package info object
        packageInfo = {
          packageId: order.packageId,
          displayName: order.packageDisplayName,
          productPrice: order.packagePrice,
          packingFee: order.packagePackingFee,
          serviceFee: order.packageServiceFee,
          status: order.packageStatus,
          packageDetails: packageDetails,
        };
      } else {
        console.warn("⚠️ Package order but no packageId found");
      }
    }

    // Get product details for additional items if they exist
    let enhancedAdditionalItems = [];
    if (additionalItems.length > 0) {
      const productIds = additionalItems.map((item) => item.productId);
      const placeholders = productIds.map(() => "?").join(",");

      const productDetailsSql = `
    SELECT
      mi.id,
      mi.displayName,
      mi.varietyId,
      mi.normalPrice,
      mi.discountedPrice,
      mi.discount
    FROM marketplaceitems mi
    WHERE mi.id IN (${placeholders})
  `;

      const [productResults] = await connection.execute(
        productDetailsSql,
        productIds,
      );

      // Map additional items with product details
      enhancedAdditionalItems = additionalItems.map((item) => {
        const productDetail = productResults.find(
          (p) => p.id === item.productId,
        );
        return {
          ...item,
          displayName: productDetail
            ? productDetail.displayName
            : "Unknown Product",
          varietyId: productDetail ? productDetail.varietyId : null,
          marketplacetablenormalPrice: productDetail
            ? parseFloat(productDetail.normalPrice) || 0
            : 0,
          marketplacetablediscountedPrice: productDetail
            ? parseFloat(productDetail.discountedPrice) || 0
            : 0,
          marketplacetablediscount: productDetail
            ? parseFloat(productDetail.discount) || 0
            : 0,
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
      deliveryCharge: order.deliveryCharge,
      fullTotal: order.fullTotal,
      isPackage: order.isPackage,
      delivaryMethod: order.delivaryMethod,
      customerInfo: {
        title: order.title,
        firstName: order.firstName,
        lastName: order.lastName,
        phoneNumber: order.phoneNumber,
        buildingType: buildingType,
      },
      fullAddress: formattedAddress,
      orderStatus: {
        invoiceNumber: order.invoiceNumber,
        status: order.status,
        reportStatus: order.reportStatus,
        paymentMethod: order.paymentMethod,
        isPaid: order.isPaid,
        creditPaid: order.creditPaid,
        moneyPaid: order.moneyPaid,
      },
      additionalItems: enhancedAdditionalItems,
    };

    if (packageInfo) {
      result.packageInfo = packageInfo;
    }

    return result;
  } catch (err) {
    console.error("Database error:", err);
    throw err;
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
};

exports.getOrderByCustomerId = (
  customerId,
  page = 1,
  limit = 5,
  status = null,
) => {
  return new Promise((resolve, reject) => {
    const offset = (page - 1) * limit;

    // Build WHERE clause conditionally
    const statusClause = status ? `AND p.status = ?` : "";
    const countParams = status ? [customerId, status] : [customerId];

    const countSql = `
      SELECT COUNT(*) as totalCount
      FROM orders o
      LEFT JOIN market_place.processorders p ON o.id = p.orderId
      WHERE o.userId = ?
      ${statusClause}
    `;

    db.marketPlace.query(countSql, countParams, (err, countResult) => {
      if (err) return reject(err);

      const totalCount = countResult[0].totalCount;
      if (totalCount === 0) {
        return resolve({ message: "No orders found for this customer" });
      }

      const orderParams = status
        ? [customerId, status, limit, offset]
        : [customerId, limit, offset];

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
          p.isPaid,
          p.reportStatus AS reportStatus,
          p.paymentMethod AS paymentMethod,
          p.status AS status
        FROM orders o
        LEFT JOIN market_place.processorders p ON o.id = p.orderId
        WHERE o.userId = ?
        ${statusClause}
        ORDER BY o.createdAt DESC
        LIMIT ? OFFSET ?
      `;

      db.marketPlace.query(ordersSql, orderParams, (err, orderResults) => {
        if (err) return reject(err);
        resolve({ orders: orderResults, totalCount });
      });
    });
  });
};

exports.getAllOrderDetails = async (salesAgentId, page = 1, limit = 5) => {
  let connection;

  try {
    // Get connection from pool
    connection = await db.marketPlace.promise().getConnection();

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
                o.deliveryCharge,
                m.salesAgent,
                o.buildingType,
                p.invNo AS InvNo,
                p.isPaid,
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
        totalCount: totalCount,
      };
    }

    // Process each order to get corresponding address details
    const processedOrders = [];

    for (const order of orderResults) {
      const customerId = order.userId; // Using userId as customerId
      const buildingType = order.buildingType;
      let formattedAddress = "";

      if (buildingType === "House") {
        const addressSql = `
                    SELECT 
                        houseNo,
                        streetName,
                        city
                    FROM house
                    WHERE customerId = ?
                `;

        const [addressResults] = await connection.execute(addressSql, [
          customerId,
        ]);

        if (addressResults[0]) {
          const addr = addressResults[0];
          formattedAddress =
            `${addr.houseNo || ""} ${addr.streetName || ""}, ${addr.city || ""}`.trim();
          formattedAddress = formattedAddress.replace(/\s+/g, " ").trim();
        }
      } else if (buildingType === "Apartment") {
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

        const [addressResults] = await connection.execute(addressSql, [
          customerId,
        ]);

        if (addressResults[0]) {
          const addr = addressResults[0];
          formattedAddress =
            `${addr.buildingName || ""} ${addr.buildingNo || ""}, Unit ${addr.unitNo || ""}, Floor ${addr.floorNo || ""}, ${addr.houseNo || ""} ${addr.streetName || ""}, ${addr.city || ""}`.trim();
          formattedAddress = formattedAddress
            .replace(/\s+/g, " ")
            .replace(/, Unit ,/, ",")
            .replace(/, Floor ,/, ",")
            .trim();
          formattedAddress = formattedAddress.replace(/,\s*$/, "");
        }
      }

      processedOrders.push({
        ...order,
        fullAddress: formattedAddress,
      });
    }

    return {
      orders: processedOrders,
      totalCount: totalCount,
    };
  } catch (err) {
    console.error("Database error:", err);
    throw err;
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
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
          message: "Order not found or could not be updated",
        });
      }

      // Return success
      resolve({
        success: true,
        message: "Order report status updated successfully",
        orderId: orderId,
        reportStatus: reportStatus,
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
        console.error("Error selecting order:", selectErr);
        return reject(selectErr);
      }

      if (selectResult.length === 0) {
        return resolve({
          message: "Order not found",
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
          console.error("Error updating order:", err);
          return reject(err);
        }

        // Check if any row was affected
        if (result.affectedRows === 0) {
          return resolve({
            message: "Order not found or already cancelled",
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
              console.error("Failed to insert notification:", notifErr);
              return resolve({
                success: true,
                message: "Order cancelled successfully but notification failed",
                orderId: orderId,
                notificationInserted: false,
                error: notifErr.message,
              });
            }

            // Return success
            resolve({
              success: true,
              message: "Order cancelled successfully",
              orderId: orderId,
              notificationInserted: true,
            });
          },
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

      const [customerRows] = await connection.query(customersQuery, [
        salesAgentId,
      ]);

      if (customerRows.length === 0) {
        return {
          salesAgentId: salesAgentId,
          customerCount: 0,
          orderCount: 0,
          message: "No customers assigned to this sales agent",
        };
      }

      // Get customer IDs
      const customerIds = customerRows.map((customer) => customer.id);

      // Get order count for current month only
      const orderCountQuery = `
                SELECT COUNT(*) as orderCount
                FROM orders 
                WHERE userId IN (${customerIds.map(() => "?").join(",")})
                AND YEAR(createdAt) = YEAR(CURDATE())
                AND MONTH(createdAt) = MONTH(CURDATE())
            `;

      const [orderRows] = await connection.query(orderCountQuery, customerIds);

      return {
        salesAgentId: salesAgentId,
        customerCount: customerRows.length,
        orderCount: orderRows[0]?.orderCount || 0,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        customers: customerRows,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in getOrderCountBySalesAgent:", error);
    throw error;
  }
};

exports.getTodayStats = async (salesAgentId) => {
  try {
    const connection = await db.marketPlace.promise().getConnection();

    try {
      // Get current date in YYYY-MM-DD format
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;

      // Get today's stats
      const [rows] = await connection.query(
        "SELECT target, completed, numOfStars FROM salesagentstars WHERE salesagentId = ? AND date = ?",
        [salesAgentId, formattedDate],
      );

      // Return default values if no record found
      if (rows.length === 0) {
        return {
          target: 10,
          completed: 0,
          numOfStars: 0,
          progress: 0,
        };
      }

      // Calculate progress (between 0 and 1)
      const progress =
        rows[0].target > 0
          ? Math.min(rows[0].completed / rows[0].target, 1)
          : 0;

      return {
        target: rows[0].target,
        completed: rows[0].completed,
        numOfStars: rows[0].numOfStars,
        progress,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in getTodayStats:", error);
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
      const firstDay = `${year}-${month.toString().padStart(2, "0")}-01`;
      const lastDay =
        month === 12
          ? `${year + 1}-01-01`
          : `${year}-${(month + 1).toString().padStart(2, "0")}-01`;

      // Get sum of numOfStars for the current month
      const [rows] = await connection.query(
        "SELECT SUM(numOfStars) as totalStars FROM salesagentstars WHERE salesagentId = ? AND date >= ? AND date < ?",
        [salesAgentId, firstDay, lastDay],
      );

      return {
        totalStars: rows[0].totalStars || 0,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in getMonthlyStats:", error);
    throw new Error(`Failed to get monthly stats: ${error.message}`);
  }
};

exports.getCombinedStats = async (salesAgentId) => {
  try {
    const dailyStats = await exports.getTodayStats(salesAgentId);
    const monthlyStats = await exports.getMonthlyStats(salesAgentId);

    return {
      daily: dailyStats,
      monthly: monthlyStats,
    };
  } catch (error) {
    console.error("Error in getCombinedStats:", error);
    throw new Error(`Failed to get combined stats: ${error.message}`);
  }
};

exports.getAllAgentStats = async (salesAgentId) => {
  try {
    const connection = await db.marketPlace.promise().getConnection();

    try {
      // Get today's stats
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;

      const [todayStats] = await connection.query(
        "SELECT target, completed, numOfStars FROM salesagentstars WHERE salesAgentId = ? AND date = ?",
        [salesAgentId, formattedDate],
      );

      // Calculate today's progress
      const dailyStats =
        todayStats.length > 0
          ? {
            target: todayStats[0].target,
            completed: todayStats[0].completed,
            numOfStars: todayStats[0].numOfStars,
            progress:
              todayStats[0].target > 0
                ? Math.min(todayStats[0].completed / todayStats[0].target, 1)
                : 0,
          }
          : {
            target: 10,
            completed: 0,
            numOfStars: 0,
            progress: 0,
          };

      // Get total number of stars for the agent (all time)
      const [totalStarsResult] = await connection.query(
        "SELECT SUM(numOfStars) as totalStars FROM salesagentstars WHERE salesAgentId = ?",
        [salesAgentId],
      );

      // Get count of total entries for this agent
      const [totalEntriesResult] = await connection.query(
        "SELECT COUNT(*) as totalEntries FROM salesagentstars WHERE salesAgentId = ?",
        [salesAgentId],
      );

      return {
        daily: dailyStats,
        monthly: {
          totalStars: totalStarsResult[0].totalStars || 0,
        },
        totalEntries: totalEntriesResult[0].totalEntries || 0,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in getAllAgentStats:", error);
    throw new Error(`Failed to get agent stats: ${error.message}`);
  }
};

async function updateSalesAgentStars(connection, salesAgentId) {
  // Get current date in YYYY-MM-DD format
  const today = new Date();
  const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, "0")}-${today.getDate().toString().padStart(2, "0")}`;

  // Check if a record exists for this sales agent on the current date
  const [existingRows] = await connection.query(
    "SELECT id, completed, target, numOfStars FROM salesagentstars WHERE salesagentId = ? AND date = ?",
    [salesAgentId, formattedDate],
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
      "UPDATE salesagentstars SET completed = ?, numOfStars = ? WHERE id = ?",
      [newCompleted, numOfStars, currentRecord.id],
    );
  } else {
    await connection.query(
      "INSERT INTO salesagentstars (salesagentId, date, completed, target, numOfStars) VALUES (?, ?, ?, ?, ?)",
      [salesAgentId, formattedDate, 1, 0, 0], // Initialize with defaults
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
            SELECT rr.rsnEnglish as returnReason , dro.note as otherReason
            FROM market_place.processorders po
            INNER JOIN collection_officer.driverorders do ON do.orderId = po.id
            INNER JOIN collection_officer.driverreturnorders dro ON dro.drvOrderId = do.id
            INNER JOIN collection_officer.returnreason rr ON rr.id = dro.returnReasonId
            WHERE po.orderId = ?
            LIMIT 1
        `;

    const [result] = await connection.query(returnReasonSql, [orderId]);

    if (!result || result.length === 0) {
      return { message: "Return reason not found" };
    }

    return {
      returnReason: result[0].returnReason,
      otherReason: result[0].otherReason || null,
    };
  } catch (err) {
    console.error("Database error in getReturnReason:", err);
    throw err;
  } finally {
    // Always release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
};

exports.getHold = async (orderId) => {
  let connection;
  try {
    connection = await db.marketPlace.promise().getConnection();

    const holdCheckSql = `
      SELECT 
        po.orderId        AS businessOrderId,
        dho.id            AS holdRecordId,
        dho.drvOrderId,
        dho.restartedTime,
        dho.createdAt     AS holdCreatedAt,
        hr.rsnEnglish     AS holdReason
      FROM market_place.processorders po
      LEFT JOIN collection_officer.driverorders  do  ON po.id      = do.orderId
      LEFT JOIN collection_officer.driverholdorders dho ON do.id   = dho.drvOrderId
      LEFT JOIN collection_officer.holdreason     hr  ON dho.holdReasonId = hr.id
      WHERE po.orderId = ?
        AND dho.id IS NOT NULL
      ORDER BY dho.createdAt ASC
    `;

    const [rows] = await connection.query(holdCheckSql, [orderId]);

    if (!rows || rows.length === 0) {
      return { success: true, data: [] };
    }

    const holdEvents = rows.map((row) => ({
      holdRecordId: row.holdRecordId,
      isHold: row.restartedTime === null,
      holdReason: row.holdReason ?? null,
      otherReason: null,
      restartedTime: row.restartedTime ?? null,
      holdCreatedAt: row.holdCreatedAt,
    }));

    return { success: true, data: holdEvents };
  } catch (err) {
    console.error("Database error in getHold:", err);
    throw err;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.checkOrderPaymentStatus = async (orderId) => {
  let connection;
  try {
    connection = await db.marketPlace.promise().getConnection();

    const paymentCheckSql = `
      SELECT 
        o.id,
        o.userId,
        po.orderId,
        po.isPaid,
        po.amount,
        mu.cusId
      FROM market_place.processorders po
      LEFT JOIN market_place.orders o ON o.id = po.orderId
      LEFT JOIN market_place.marketplaceusers mu ON mu.id = o.userId
      WHERE po.orderId = ?
      LIMIT 1
    `;

    const [rows] = await connection.query(paymentCheckSql, [orderId]);

    if (!rows || rows.length === 0) {
      return { success: true, data: { isPaid: 0, amount: 0, cusId: null } };
    }

    const row = rows[0];
    const amount = Number(row.amount) || 0;
    const isPaid = Number(row.isPaid) === 1 && amount > 0 ? 1 : 0;

    return {
      success: true,
      data: {
        isPaid,
        amount,
        cusId: row.cusId ?? null,
      },
    };
  } catch (err) {
    console.error("Database error in checkOrderPaymentStatus:", err);
    throw err;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
