const db = require("../startup/database");

exports.addCustomer = (customerData, salesAgent) => {
  return new Promise(async (resolve, reject) => {
    try {
      const newCustomerId = await generateCustomerId();

      let phoneCode = "";
      let phoneNumber = "";

      if (customerData.phoneNumber) {
        const fullPhone = customerData.phoneNumber.toString();

        if (fullPhone.startsWith("+94")) {
          phoneCode = "+94";
          phoneNumber = fullPhone.substring(3);
        } else if (fullPhone.startsWith("94") && fullPhone.length > 9) {
          phoneCode = "+94";
          phoneNumber = fullPhone.substring(2);
        } else if (fullPhone.startsWith("0")) {
          phoneCode = "+94";
          phoneNumber = fullPhone.substring(1);
        } else {
          phoneCode = "+94";
          phoneNumber = fullPhone;
        }

        phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, "");
      }

      // Column name in DB is `nearesCity`, but the frontend sends it as `city`.
      const sqlCustomer = `INSERT INTO marketplaceusers (cusId, firstName, lastName, phoneCode, phoneNumber, email, title, nearesCity, salesAgent, isDashUser)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

      db.marketPlace.query(
        sqlCustomer,
        [
          newCustomerId,
          customerData.firstName,
          customerData.lastName,
          phoneCode,
          phoneNumber,
          customerData.email,
          customerData.title,
          customerData.city,
          salesAgent,
          1,
        ],
        (err, customerResult) => {
          if (err) {
            return reject(err);
          }

          const customerId = customerResult.insertId;

          insertBuildingData(customerId, customerData)
            .then(() => {
              resolve({ success: true, customerId });
            })
            .catch((buildingError) => {
              reject(buildingError);
            });
        },
      );
    } catch (error) {
      reject(error);
    }
  });
};

const generateCustomerId = async () => {
  const sqlGetLastCustomerId = `
        SELECT cusId 
        FROM marketplaceusers 
        WHERE cusId LIKE 'CUS-%' 
        ORDER BY CAST(SUBSTRING(cusId, 5) AS UNSIGNED) DESC 
        LIMIT 1
    `;

  const [result] = await db.marketPlace.promise().query(sqlGetLastCustomerId);

  let newCustomerId = "CUS-00001";

  if (result.length > 0 && result[0].cusId) {
    const lastIdParts = result[0].cusId.split("-");
    const lastNumber = parseInt(lastIdParts[1], 10);
    const nextNumber = lastNumber + 1;
    const paddedNumber = String(nextNumber).padStart(5, "0");
    newCustomerId = `CUS-${paddedNumber}`;
  }

  return newCustomerId;
};

const insertBuildingData = async (customerId, customerData) => {
  let insertQuery;
  let queryParams;

  if (customerData.buildingType === "House") {
    insertQuery = `INSERT INTO dashuserhouse (customerId, houseNo, streetName) VALUES (?, ?, ?)`;
    queryParams = [customerId, customerData.houseNo, customerData.streetName];
  } else if (customerData.buildingType === "Apartment") {
    if (
      !customerData.buildingNo ||
      !customerData.buildingName ||
      !customerData.unitNo ||
      !customerData.floorNo ||
      !customerData.houseNo ||
      !customerData.streetName
    ) {
      throw new Error("Missing required fields for apartment");
    }
    insertQuery = `INSERT INTO dashuserapartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    queryParams = [
      customerId,
      customerData.buildingNo,
      customerData.buildingName,
      customerData.unitNo,
      customerData.floorNo,
      customerData.houseNo,
      customerData.streetName,
    ];
  } else {
    throw new Error("Invalid building type");
  }
  await db.marketPlace.promise().query(insertQuery, queryParams);
};

exports.getCustomersBySalesAgent = (salesAgentId, page = 1, limit = 10) => {
  return new Promise((resolve, reject) => {
    // Calculate offset for pagination
    const offset = (page - 1) * limit;

    // First, get the total count
    const countQuery = `
            SELECT COUNT(DISTINCT c.id) as totalCount
            FROM marketplaceusers c
            WHERE c.salesAgent = ?
        `;

    // Main query with pagination
    const dataQuery = `
            SELECT 
                c.id,
                c.cusId,
                c.title,
                c.firstName,
                c.lastName,
                c.phoneCode,
                c.phoneNumber,
                c.email,
               
              
                COUNT(o.id) AS orderCount
            FROM marketplaceusers c
            LEFT JOIN orders o ON c.id = o.userId
            WHERE c.salesAgent = ?
            GROUP BY c.id, c.cusId, c.title, c.firstName, c.lastName, c.phoneCode, c.phoneNumber, c.email
            ORDER BY c.id
            LIMIT ? OFFSET ?
        `;

    // Execute count query first
    db.marketPlace
      .promise()
      .query(countQuery, [salesAgentId])
      .then(([countResult]) => {
        const totalCount = countResult[0].totalCount;
        const totalPages = Math.ceil(totalCount / limit);
        const hasMore = page < totalPages;

        // Execute data query
        return db.marketPlace
          .promise()
          .query(dataQuery, [salesAgentId, limit, offset])
          .then(([rows]) => {
            // Process each row to combine phoneCode and phoneNumber
            const processedRows = rows.map((customer) => {
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
            });

            const result = {
              customers: processedRows,
              currentPage: page,
              totalPages: totalPages,
              totalCount: totalCount,
              hasMore: hasMore,
              limit: limit,
            };

            resolve(result);
          });
      })
      .catch((error) => {
        console.error("Database query error:", error);
        reject(error);
      });
  });
};

exports.getCustomerData = async (cusId) => {
  const sqlCustomerQuery = `SELECT * FROM marketplaceusers WHERE id = ?`;

  const [customerRows] = await db.marketPlace
    .promise()
    .query(sqlCustomerQuery, [cusId]);

  if (customerRows.length === 0) {
    throw new Error("Customer not found");
  }

  const customerData = customerRows[0];

  // Combine phoneCode and phoneNumber into a single phoneNumber field
  if (customerData.phoneCode && customerData.phoneNumber) {
    customerData.phoneNumber = `${customerData.phoneCode}${customerData.phoneNumber}`;
  } else if (customerData.phoneNumber && !customerData.phoneCode) {
    customerData.phoneNumber = customerData.phoneNumber;
  } else if (customerData.phoneCode && !customerData.phoneNumber) {
    customerData.phoneNumber = `${customerData.phoneCode}`;
  } else {
    customerData.phoneNumber = "";
  }
  delete customerData.phoneCode;

  const [houseRows] = await db.marketPlace
    .promise()
    .query(`SELECT * FROM dashuserhouse WHERE customerId = ?`, [
      customerData.id,
    ]);

  let buildingData = null;

  if (houseRows.length > 0) {
    buildingData = houseRows[0];
    customerData.buildingType = "House";
  } else {
    const [apartmentRows] = await db.marketPlace
      .promise()
      .query(`SELECT * FROM dashuserapartment WHERE customerId = ?`, [
        customerData.id,
      ]);

    if (apartmentRows.length > 0) {
      buildingData = apartmentRows[0];
      customerData.buildingType = "Apartment";
    } else {
      customerData.buildingType = "House";
    }
  }

  const [houseCountRows] = await db.marketPlace
    .promise()
    .query(`SELECT COUNT(*) AS count FROM house WHERE customerId = ?`, [
      customerData.id,
    ]);

  const [apartmentCountRows] = await db.marketPlace
    .promise()
    .query(`SELECT COUNT(*) AS count FROM apartment WHERE customerId = ?`, [
      customerData.id,
    ]);

  const savedAddressCount =
    Number(houseCountRows[0]?.count || 0) +
    Number(apartmentCountRows[0]?.count || 0);

  return {
    customer: customerData,
    building: buildingData,
    savedAddressCount,
  };
};

exports.getCusDataExc = async (customerId) => {
  try {
    const connection = await db.marketPlace.promise().getConnection();
    try {
      // First try the most likely case
      const [results] = await connection.query(
        "SELECT * FROM marketplaceusers WHERE cusId = ? OR id = ? LIMIT 1",
        [customerId, customerId],
      );

      if (results.length === 0) {
        // Return empty but successful response instead of error
        return {
          success: true,
          data: null,
        };
      }

      const customerData = results[0];
      return {
        success: true,
        data: {
          ...customerData,
          name: customerData.firstName || customerData.name,
          number: customerData.phoneNumber || customerData.number,
        },
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in getCusDataExc DAO:", error);
    return {
      success: false,
      message: "Database error occurred",
    };
  }
};

exports.updateCustomerData = async (cusId, customerData) => {
  let connection;

  try {
    connection = await db.marketPlace.promise().getConnection();
    await connection.beginTransaction();

    // Parse phone number to extract phone code and number
    let phoneCode = "";
    let phoneNumber = "";

    if (customerData.phoneNumber) {
      const fullPhone = customerData.phoneNumber.toString();

      if (fullPhone.startsWith("+94")) {
        phoneCode = "+94";
        phoneNumber = fullPhone.substring(3);
      } else if (fullPhone.startsWith("94") && fullPhone.length > 9) {
        phoneCode = "+94";
        phoneNumber = fullPhone.substring(2);
      } else if (fullPhone.startsWith("0")) {
        phoneCode = "+94";
        phoneNumber = fullPhone.substring(1);
      } else {
        phoneCode = "+94";
        phoneNumber = fullPhone;
      }

      phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, "");
    }

    // Check if customer exists
    const getCustomerIdQuery = `SELECT id, phoneCode, phoneNumber, email FROM marketplaceusers WHERE id = ?`;
    const [customerResult] = await connection.query(getCustomerIdQuery, [
      cusId,
    ]);

    if (customerResult.length === 0) {
      throw new Error("Customer not found");
    }

    const customerId = customerResult[0].id;
    const existingPhoneCode = customerResult[0].phoneCode;
    const existingPhoneNumber = customerResult[0].phoneNumber;
    const existingEmail = customerResult[0].email;

    // Check for duplicate phone number (only if changed)
    if (
      phoneCode !== existingPhoneCode ||
      phoneNumber !== existingPhoneNumber
    ) {
      const checkPhoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ? AND id != ?`;
      const [phoneResult] = await connection.query(checkPhoneQuery, [
        phoneCode,
        phoneNumber,
        customerId,
      ]);

      if (phoneResult.length > 0) {
        throw new Error("Phone number already exists.");
      }
    } else {
      console.log("Phone number not changed, skipping phone duplicate check");
    }

    // Handle email validation and duplicate check
    let finalEmail = null;

    if (customerData.email && customerData.email.trim() !== "") {
      finalEmail = customerData.email.trim();

      if (finalEmail !== existingEmail) {
        const checkEmailQuery = `SELECT id FROM marketplaceusers WHERE email = ? AND id != ?`;
        const [emailResult] = await connection.query(checkEmailQuery, [
          finalEmail,
          customerId,
        ]);

        if (emailResult.length > 0) {
          throw new Error("Email already exists.");
        }
      } else {
        console.log("Email not changed, skipping email duplicate check");
      }
    } else {
      finalEmail = null;
    }

    // Update only the 4 relevant fields (+ phone, since it's parsed here)
    const updateCustomerQuery = `
      UPDATE marketplaceusers 
      SET title = ?, firstName = ?, lastName = ?, phoneCode = ?, phoneNumber = ?, email = ?
      WHERE id = ?`;

    const customerParams = [
      customerData.title,
      customerData.firstName,
      customerData.lastName,
      phoneCode,
      phoneNumber,
      finalEmail,
      cusId,
    ];

    await connection.query(updateCustomerQuery, customerParams);

    await connection.commit();
    return "Customer data updated successfully.";
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Error during update: ", error);
    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

exports.findCustomerByPhoneOrEmail = async (
  phoneNumber,
  email,
  excludeId = null,
) => {
  try {
    let phoneExists = false;
    let emailExists = false;

    // Check phone number if provided
    if (phoneNumber) {
      // Parse the incoming phone number (your existing code)
      let phoneCodeToCheck = "";
      let phoneNumberToCheck = "";

      const fullPhone = phoneNumber.toString();
      if (fullPhone.startsWith("+94")) {
        phoneCodeToCheck = "+94";
        phoneNumberToCheck = fullPhone.substring(3);
      }
      // Modify the query to exclude current user if excludeId is provided
      let phoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ?`;
      const phoneParams = [phoneCodeToCheck, phoneNumberToCheck];

      if (excludeId) {
        phoneQuery += ` AND id != ?`;
        phoneParams.push(excludeId);
      }

      const [phoneRows] = await db.marketPlace
        .promise()
        .query(phoneQuery, phoneParams);
      phoneExists = phoneRows.length > 0;
    }

    // Check email if provided
    if (email) {
      let emailQuery = `SELECT id FROM marketplaceusers WHERE email = ?`;
      const emailParams = [email];

      if (excludeId) {
        emailQuery += ` AND id != ?`;
        emailParams.push(excludeId);
      }

      const [emailRows] = await db.marketPlace
        .promise()
        .query(emailQuery, emailParams);
      emailExists = emailRows.length > 0;
    }

    return {
      phoneExists,
      emailExists,
      hasConflict: phoneExists || emailExists,
    };
  } catch (error) {
    console.error("Error finding customer:", error);
    throw error;
  }
};

exports.getCustomerCountBySalesAgent = async (salesAgentId) => {
  try {
    const connection = await db.marketPlace.promise().getConnection();
    try {
      const [rows] = await connection.query(
        `
        SELECT salesAgent, COUNT(*) AS customerCount
        FROM marketplaceusers
        WHERE salesAgent = ?
        GROUP BY salesAgent
      `,
        [salesAgentId],
      );

      // Return the count for the specific agent, or default object if no customers found
      return rows.length > 0
        ? rows[0]
        : { salesAgent: parseInt(salesAgentId), customerCount: 0 };
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("Error in getCustomerCountBySalesAgent:", error);
    throw new Error(`Failed to get customer count: ${error.message}`);
  }
};

exports.getAllCity = async () => {
  return new Promise((resolve, reject) => {
    const query = `
        SELECT
          d.city,
          MAX(d.charge) AS charge,
          MAX(d.createdAt) AS createdAt,
          MAX(
            CASE WHEN EXISTS (
              SELECT 1 FROM centerowncity c WHERE c.cityId = d.id
            ) THEN 1 ELSE 0 END
          ) AS hasCenter
        FROM deliverycharge d
        GROUP BY d.city
        ORDER BY d.city ASC
        `;
    db.collectionofficer.query(query, (error, results) => {
      if (error) {
        console.error("Error fetching packages:", error);
        reject(error);
      } else {
        resolve(results);
      }
    });
  });
};

exports.getAllCrops = async (cusId) => {
  const CustomerId = cusId.customerId;
  try {
    const query = `
        SELECT 
            mpi.id, 
            mpi.varietyId, 
            mpi.displayName,
            mpi.category,  -- Added category field
            pc.image
        FROM marketplaceitems mpi
        JOIN plant_care.cropvariety pc ON pc.id = mpi.varietyId
        WHERE mpi.category = 'Retail'
        ORDER BY mpi.displayName ASC;
        `;

    const [results] = await db.marketPlace.promise().query(query);
    return results;
  } catch (error) {
    console.error("Error fetching crops:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.addExcludeList = async (customerId, selectedCrops) => {
  try {
    const [existingRows] = await db.marketPlace
      .promise()
      .query(`SELECT mpItemId FROM excludelist WHERE userId = ?`, [customerId]);
    const existingIds = existingRows.map((row) => row.mpItemId);

    // Newly selected items that aren't in the table yet
    const toInsert = selectedCrops.filter((id) => !existingIds.includes(id));
    // Previously saved items that were just deselected
    const toRemove = existingIds.filter((id) => !selectedCrops.includes(id));

    if (toInsert.length > 0) {
      const values = toInsert.map((cropId) => [customerId, cropId]);
      await db.marketPlace
        .promise()
        .query(`INSERT INTO excludelist (userId, mpItemId) VALUES ?`, [values]);
    }

    if (toRemove.length > 0) {
      await db.marketPlace
        .promise()
        .query(`DELETE FROM excludelist WHERE userId = ? AND mpItemId IN (?)`, [
          customerId,
          toRemove,
        ]);
    }

    return { message: "Exclude list updated successfully" };
  } catch (error) {
    console.error("Error adding exclude list:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.addPreList = async (customerId, selectedCrops) => {
  try {
    const [existingRows] = await db.marketPlace
      .promise()
      .query(`SELECT mpItemId FROM preferlist WHERE userId = ?`, [customerId]);
    const existingIds = existingRows.map((row) => row.mpItemId);

    const toInsert = selectedCrops.filter((id) => !existingIds.includes(id));
    const toRemove = existingIds.filter((id) => !selectedCrops.includes(id));

    if (toInsert.length > 0) {
      const values = toInsert.map((cropId) => [customerId, cropId]);
      await db.marketPlace
        .promise()
        .query(`INSERT INTO preferlist (userId, mpItemId) VALUES ?`, [values]);
    }

    if (toRemove.length > 0) {
      await db.marketPlace
        .promise()
        .query(`DELETE FROM preferlist WHERE userId = ? AND mpItemId IN (?)`, [
          customerId,
          toRemove,
        ]);
    }

    return { message: "Prefer list updated successfully" };
  } catch (error) {
    console.error("Error adding prefer list:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.getExcludeList = async (customerId) => {
  try {
    const query = `
      SELECT 
        el.id AS excludeId, 
        el.userId, 
        mpi.id AS marketplaceItemId, 
        mpi.displayName, 
        pc.image,
        mps.cusId,
        mps.firstName,
        mps.lastName,
        mps.title,
        mps.phoneNumber
      FROM marketplaceusers mps
      LEFT JOIN excludelist el ON el.userId = mps.id
      LEFT JOIN marketplaceitems mpi ON mpi.id = el.mpItemId 
      LEFT JOIN plant_care.cropvariety pc ON pc.id = mpi.varietyId  
      WHERE mps.id = ?  -- Filter by customerId
      ORDER BY mpi.displayName ASC; 
    `;
    const [results] = await db.marketPlace.promise().query(query, [customerId]);

    return results;
    ta;
  } catch (error) {
    console.error("Error fetching exclude list:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.getCustomerPreferlist = async (customerId) => {
  try {
    const query = `
      SELECT 
        pr.id AS preId, 
        pr.userId, 
        mpi.id AS marketplaceItemId, 
        mpi.displayName, 
        pc.image,
        mps.cusId,
        mps.firstName,
        mps.lastName,
        mps.title,
        mps.phoneNumber
      FROM marketplaceusers mps
      LEFT JOIN preferlist pr ON pr.userId = mps.id
      LEFT JOIN marketplaceitems mpi ON mpi.id = pr.mpItemId
      LEFT JOIN plant_care.cropvariety pc ON pc.id = mpi.varietyId  
      WHERE mps.id = ?
      ORDER BY mpi.displayName ASC; 
    `;
    const [results] = await db.marketPlace.promise().query(query, [customerId]);
    return results;
  } catch (error) {
    console.error("Error fetching prefer list:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.deleteExcludeItem = async (excludeId) => {
  try {
    const query = `
      DELETE FROM excludelist 
      WHERE Id = ?
    `;
    await db.marketPlace.promise().query(query, [excludeId]);

    return { message: "Exclude list updated successfully" };
  } catch (error) {
    console.error("Error adding exclude list:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.deletePreferItem = async (preferId) => {
  try {
    const query = `
      DELETE FROM preferlist 
      WHERE Id = ?
    `;
    await db.marketPlace.promise().query(query, [preferId]);

    return { message: "Exclude list updated successfully" };
  } catch (error) {
    console.error("Error adding exclude list:", error);
    throw new Error("Database error: " + error.message);
  }
};

exports.getCustomerDataLocation = async (customerId) => {
  return new Promise((resolve, reject) => {
    const query = `
            SELECT 
                id,
                salesAgent,
                googleId,
                cusId,
                title,
                firstName,
                lastName,
                phoneCode,
                phoneCode2,
                phoneNumber,
                phoneNumber2,
                buyerType,
                creditBalance,
                email,
                password,
                image,
                
                created_at
            FROM marketplaceusers 
            WHERE cusId = ?
        `;

    db.marketPlace.query(query, [customerId], (error, results) => {
      if (error) {
        console.error("Error fetching customer data:", error);
        reject(error);
      } else {
        // Return the first result if exists, otherwise null
        resolve(results.length > 0 ? results[0] : null);
      }
    });
  });
};

exports.checkDeliveredOrder = async (customerId) => {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT o.id
      FROM orders o
      INNER JOIN processorders po ON po.orderId = o.id
      WHERE o.userId = ? AND po.status = 'Delivered'
      LIMIT 1
    `;
    db.marketPlace
      .promise()
      .query(sql, [customerId])
      .then(([rows]) => {
        resolve({ isHaveDeliveryOrder: rows.length > 0 ? 1 : 0 });
      })
      .catch((error) => reject(error));
  });
};

exports.updateResidentialAddress = async (cusId, data) => {
  return new Promise((resolve, reject) => {
    const {
      buildingType,
      nearestCity,
      houseNo,
      streetName,
      buildingNo,
      buildingName,
      unitNo,
      floorNo,
    } = data;

    const updateNearestCity = () => {
      if (!nearestCity || !nearestCity.trim()) {
        return Promise.resolve();
      }
      return db.marketPlace
        .promise()
        .query(`UPDATE marketplaceusers SET nearesCity = ? WHERE id = ?`, [
          nearestCity.trim(),
          cusId,
        ]);
    };

    updateNearestCity()
      .then(async () => {
        if (buildingType === "House") {
          await db.marketPlace
            .promise()
            .query(`DELETE FROM dashuserapartment WHERE customerId = ?`, [
              cusId,
            ]);

          const [existingHouseRows] = await db.marketPlace
            .promise()
            .query(`SELECT id FROM dashuserhouse WHERE customerId = ?`, [
              cusId,
            ]);

          if (existingHouseRows.length > 0) {
            await db.marketPlace
              .promise()
              .query(
                `UPDATE dashuserhouse SET houseNo = ?, streetName = ? WHERE customerId = ?`,
                [houseNo.trim(), streetName.trim(), cusId],
              );
          } else {
            await db.marketPlace
              .promise()
              .query(
                `INSERT INTO dashuserhouse (customerId, houseNo, streetName) VALUES (?, ?, ?)`,
                [cusId, houseNo.trim(), streetName.trim()],
              );
          }
        } else if (buildingType === "Apartment") {
          await db.marketPlace
            .promise()
            .query(`DELETE FROM dashuserhouse WHERE customerId = ?`, [cusId]);

          const [existingAptRows] = await db.marketPlace
            .promise()
            .query(`SELECT id FROM dashuserapartment WHERE customerId = ?`, [
              cusId,
            ]);

          if (existingAptRows.length > 0) {
            await db.marketPlace.promise().query(
              `UPDATE dashuserapartment
                   SET buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?, houseNo = ?, streetName = ?
                 WHERE customerId = ?`,
              [
                buildingNo.trim(),
                buildingName.trim(),
                unitNo.trim(),
                floorNo.trim(),
                houseNo.trim(),
                streetName.trim(),
                cusId,
              ],
            );
          } else {
            await db.marketPlace.promise().query(
              `INSERT INTO dashuserapartment
                   (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                cusId,
                buildingNo.trim(),
                buildingName.trim(),
                unitNo.trim(),
                floorNo.trim(),
                houseNo.trim(),
                streetName.trim(),
              ],
            );
          }
        } else {
          throw new Error("Invalid buildingType");
        }

        resolve({ message: "Residential address updated successfully" });
      })
      .catch((error) => reject(error));
  });
};

exports.getAddressBook = async (customerId) => {
  const [houseRows] = await db.marketPlace
    .promise()
    .query(`SELECT * FROM house WHERE customerId = ? ORDER BY id DESC`, [
      customerId,
    ]);

  const [apartmentRows] = await db.marketPlace
    .promise()
    .query(`SELECT * FROM apartment WHERE customerId = ? ORDER BY id DESC`, [
      customerId,
    ]);

  const formatPhone = (code, number) => {
    if (code && number) return `${code}${number}`;
    if (number) return number;
    if (code) return code;
    return "";
  };

  const houseAddresses = houseRows.map((row) => ({
    id: row.id,
    type: "House",
    label: row.saveAs || "Address",
    billingTitle: row.billingTitle,
    billingName: row.billingName,
    billingPhone1: formatPhone(row.billingPhoneCode1, row.billingPhone1),
    billingPhone2: formatPhone(row.billingPhoneCode2, row.billingPhone2),
    houseNo: row.houseNo,
    streetName: row.streetName,
    latitude: row.latitude,
    longitude: row.longitude,
    city: row.city,
  }));

  const apartmentAddresses = apartmentRows.map((row) => ({
    id: row.id,
    type: "Apartment",
    label: row.saveAs || "Address",
    billingTitle: row.billingTitle,
    billingName: row.billingName,
    billingPhone1: formatPhone(row.billingPhoneCode1, row.billingPhone1),
    billingPhone2: formatPhone(row.billingPhoneCode2, row.billingPhone2),
    buildingNo: row.buildingNo,
    buildingName: row.buildingName,
    unitNo: row.unitNo,
    floorNo: row.floorNo,
    houseNo: row.houseNo,
    streetName: row.streetName,
    latitude: row.latitude,
    longitude: row.longitude,
    city: row.city,
  }));

  return [...houseAddresses, ...apartmentAddresses].sort((a, b) => b.id - a.id);
};

const parsePhone = (phone) => {
  if (!phone) return { code: null, number: null };
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length >= 9) {
    const number = cleaned.slice(-9);
    const code = "+94";
    return { code, number };
  }
  return { code: "+94", number: cleaned || null };
};

exports.getSavedAddress = async (addressId, type) => {
  const table = type === "Apartment" ? "apartment" : "house";
  const [rows] = await db.marketPlace
    .promise()
    .query(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`, [addressId]);
  if (!rows.length) return null;
  const row = rows[0];

  const formatPhone = (code, number) => {
    if (code && number) return `${code}${number}`;
    if (number) return number;
    if (code) return code;
    return "";
  };

  return {
    ...row,
    type,
    nearestCity: row.city || "",
    billingPhone1: formatPhone(row.billingPhoneCode1, row.billingPhone1),
    billingPhone2: formatPhone(row.billingPhoneCode2, row.billingPhone2),
  };
};

exports.addSavedAddress = async ({
  customerId,
  saveAs,
  billingTitle,
  billingName,
  billingPhone1,
  billingPhone2,
  buildingType,
  houseNo,
  streetName,
  nearestCity,
  latitude,
  longitude,
  buildingNo,
  buildingName,
  unitNo,
  floorNo,
}) => {
  const conn = await db.marketPlace.promise().getConnection();
  try {
    await conn.beginTransaction();

    const phone1Parsed = parsePhone(billingPhone1);
    const phone2Parsed = billingPhone2
      ? parsePhone(billingPhone2)
      : { code: null, number: null };

    let insertId;
    if (buildingType === "Apartment") {
      const [result] = await conn.query(
        `INSERT INTO apartment
          (customerId, saveAs, billingTitle, billingName, billingPhoneCode1, billingPhone1, billingPhoneCode2, billingPhone2,
           buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          saveAs,
          billingTitle,
          billingName,
          phone1Parsed.code,
          phone1Parsed.number,
          phone2Parsed.code,
          phone2Parsed.number,
          buildingNo,
          buildingName,
          unitNo,
          floorNo,
          houseNo,
          streetName,
          nearestCity || null,
          latitude || null,
          longitude || null,
        ],
      );
      insertId = result.insertId;
    } else {
      const [result] = await conn.query(
        `INSERT INTO house
          (customerId, saveAs, billingTitle, billingName, billingPhoneCode1, billingPhone1, billingPhoneCode2, billingPhone2,
           houseNo, streetName, city, latitude, longitude)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          customerId,
          saveAs,
          billingTitle,
          billingName,
          phone1Parsed.code,
          phone1Parsed.number,
          phone2Parsed.code,
          phone2Parsed.number,
          houseNo,
          streetName,
          nearestCity || null,
          latitude || null,
          longitude || null,
        ],
      );
      insertId = result.insertId;
    }

    // Keep the customer's profile field in sync too
    await conn.query(
      `UPDATE marketplaceusers SET nearesCity = ? WHERE id = ?`,
      [nearestCity, customerId],
    );

    await conn.commit();
    return { id: insertId, type: buildingType, customerId, nearestCity };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

// ---- UPDATE ----
exports.updateSavedAddress = async (
  addressId,
  {
    customerId,
    saveAs,
    billingTitle,
    billingName,
    billingPhone1,
    billingPhone2,
    type,
    houseNo,
    streetName,
    nearestCity,
    latitude,
    longitude,
    buildingNo,
    buildingName,
    unitNo,
    floorNo,
  },
) => {
  const table = type === "Apartment" ? "apartment" : "house";
  const conn = await db.marketPlace.promise().getConnection();
  try {
    await conn.beginTransaction();

    const phone1Parsed = parsePhone(billingPhone1);
    const phone2Parsed = billingPhone2
      ? parsePhone(billingPhone2)
      : { code: null, number: null };

    let result;
    if (type === "Apartment") {
      [result] = await conn.query(
        `UPDATE apartment SET
           saveAs = ?, billingTitle = ?, billingName = ?, billingPhoneCode1 = ?, billingPhone1 = ?, billingPhoneCode2 = ?, billingPhone2 = ?,
           buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?,
           houseNo = ?, streetName = ?, city = ?, latitude = ?, longitude = ?
         WHERE id = ?`,
        [
          saveAs,
          billingTitle,
          billingName,
          phone1Parsed.code,
          phone1Parsed.number,
          phone2Parsed.code,
          phone2Parsed.number,
          buildingNo,
          buildingName,
          unitNo,
          floorNo,
          houseNo,
          streetName,
          nearestCity || null,
          latitude || null,
          longitude || null,
          addressId,
        ],
      );
    } else {
      [result] = await conn.query(
        `UPDATE house SET
           saveAs = ?, billingTitle = ?, billingName = ?, billingPhoneCode1 = ?, billingPhone1 = ?, billingPhoneCode2 = ?, billingPhone2 = ?,
           houseNo = ?, streetName = ?, city = ?, latitude = ?, longitude = ?
         WHERE id = ?`,
        [
          saveAs,
          billingTitle,
          billingName,
          phone1Parsed.code,
          phone1Parsed.number,
          phone2Parsed.code,
          phone2Parsed.number,
          houseNo,
          streetName,
          nearestCity || null,
          latitude || null,
          longitude || null,
          addressId,
        ],
      );
    }

    if (result.affectedRows === 0) {
      await conn.rollback();
      return null;
    }

    // Resolve customerId if the caller didn't pass it (fetch from the row we just touched)
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId) {
      const [rows] = await conn.query(
        `SELECT customerId FROM ${table} WHERE id = ?`,
        [addressId],
      );
      resolvedCustomerId = rows[0]?.customerId;
    }

    if (resolvedCustomerId) {
      await conn.query(
        `UPDATE marketplaceusers SET nearesCity = ? WHERE id = ?`,
        [nearestCity, resolvedCustomerId],
      );
    }

    await conn.commit();
    return { id: addressId, type, customerId: resolvedCustomerId, nearestCity };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
