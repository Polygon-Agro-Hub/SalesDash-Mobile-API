const db = require('../startup/database');

exports.addCustomer = (customerData, salesAgent) => {
    return new Promise(async (resolve, reject) => {
        try {
            const newCustomerId = await generateCustomerId();

            // Parse phone number to extract phone code and number
            let phoneCode = '';
            let phoneNumber = '';

            if (customerData.phoneNumber) {
                const fullPhone = customerData.phoneNumber.toString();

                // Check if phone number starts with +94 (Sri Lanka)
                if (fullPhone.startsWith('+94')) {
                    phoneCode = '+94';
                    phoneNumber = fullPhone.substring(3); // Remove +94
                }
                // Check if phone number starts with 94 (without +)
                else if (fullPhone.startsWith('94') && fullPhone.length > 9) {
                    phoneCode = '+94';
                    phoneNumber = fullPhone.substring(2); // Remove 94
                }
                // Check if phone number starts with 0 (local format)
                else if (fullPhone.startsWith('0')) {
                    phoneCode = '+94';
                    phoneNumber = fullPhone.substring(1); // Remove leading 0
                }
                // Default case - assume it's already in correct format
                else {
                    phoneCode = '+94'; // Default to Sri Lanka
                    phoneNumber = fullPhone;
                }

                // Clean up phone number (remove any spaces, dashes, etc.)
                phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
            }

            const sqlCustomer = `INSERT INTO marketplaceusers (cusId, firstName, lastName, phoneCode, phoneNumber, email, title, buildingType, salesAgent, isDashUser)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`;

            db.marketPlace.query(sqlCustomer, [
                newCustomerId,
                customerData.firstName,
                customerData.lastName,
                phoneCode,
                phoneNumber,
                customerData.email,
                customerData.title,
                customerData.buildingType,
                salesAgent,
                1,
            ], (err, customerResult) => {
                if (err) {
                    return reject(err);
                }

                const customerId = customerResult.insertId;

                // Insert building data (assuming this function exists)
                insertBuildingData(customerId, customerData)
                    .then(() => {
                        resolve({ success: true, customerId });
                    })
                    .catch((buildingError) => {
                        reject(buildingError);
                    });
            });

        } catch (error) {
            reject(error);
        }
    });
};

// Function to generate a custom customer ID

const generateCustomerId = async () => {
    // Use CAST to convert the numeric part to integer for proper sorting
    const sqlGetLastCustomerId = `
        SELECT cusId 
        FROM marketplaceusers 
        WHERE cusId LIKE 'CUS-%' 
        ORDER BY CAST(SUBSTRING(cusId, 5) AS UNSIGNED) DESC 
        LIMIT 1
    `;

    const [result] = await db.marketPlace.promise().query(sqlGetLastCustomerId);

    // Default starting ID if no customers exist
    let newCustomerId = 'CUS-00001';

    if (result.length > 0 && result[0].cusId) {
        // Extract the number part from the existing ID
        const lastIdParts = result[0].cusId.split('-');
        const lastNumber = parseInt(lastIdParts[1], 10);

        // Format with leading zeros to ensure 5 digits
        const nextNumber = lastNumber + 1;
        const paddedNumber = String(nextNumber).padStart(5, '0');

        newCustomerId = `CUS-${paddedNumber}`;
    }

    return newCustomerId;
};


const insertBuildingData = async (customerId, customerData) => {
    let insertQuery;
    let queryParams;

    if (customerData.buildingType === 'House') {
        insertQuery = `INSERT INTO house (customerId, houseNo, streetName, city) VALUES (?, ?, ?, ?)`;
        queryParams = [customerId, customerData.houseNo, customerData.streetName, customerData.city];
    } else if (customerData.buildingType === 'Apartment') {
        if (!customerData.buildingNo || !customerData.buildingName || !customerData.unitNo || !customerData.floorNo || !customerData.houseNo || !customerData.streetName || !customerData.city) {
            throw new Error('Missing required fields for apartment');
        }
        insertQuery = `INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        queryParams = [
            customerId,
            customerData.buildingNo,
            customerData.buildingName,
            customerData.unitNo,
            customerData.floorNo,
            customerData.houseNo,
            customerData.streetName,
            customerData.city

        ];
    } else {
        throw new Error('Invalid building type');
    }
    await db.marketPlace.promise().query(insertQuery, queryParams);
};



// Function to retrieve all customers from the database
// exports.getAllCustomers = () => {
//     return new Promise((resolve, reject) => {
//         const sqlQuery = `SELECT * FROM customer`;

//         db.dash.promise().query(sqlQuery)
//             .then(([rows]) => resolve(rows))
//             .catch(error => reject(error));
//     });
// };

// exports.getCustomersBySalesAgent = (salesAgentId) => {
//     console.log(salesAgentId)
//     return new Promise((resolve, reject) => {
//         const sqlQuery = `SELECT * FROM customer WHERE salesAgent = ?`;

//         db.dash.promise().query(sqlQuery, [salesAgentId])
//             .then(([rows]) => resolve(rows))
//             .catch(error => reject(error));
//     });
// };

// DAO
exports.getCustomersBySalesAgent = (salesAgentId, page = 1, limit = 10) => {
    console.log(`Getting customers for sales agent ID: ${salesAgentId}, Page: ${page}, Limit: ${limit}`);

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
                c.buildingType,
                COUNT(o.id) AS orderCount
            FROM marketplaceusers c
            LEFT JOIN orders o ON c.id = o.userId
            WHERE c.salesAgent = ?
            GROUP BY c.id, c.cusId, c.title, c.firstName, c.lastName, c.phoneCode, c.phoneNumber, c.email, c.buildingType
            ORDER BY c.id
            LIMIT ? OFFSET ?
        `;

        // Execute count query first
        db.marketPlace.promise().query(countQuery, [salesAgentId])
            .then(([countResult]) => {
                const totalCount = countResult[0].totalCount;
                const totalPages = Math.ceil(totalCount / limit);
                const hasMore = page < totalPages;

                console.log(`Total customers: ${totalCount}, Total pages: ${totalPages}, Current page: ${page}`);

                // Execute data query
                return db.marketPlace.promise().query(dataQuery, [salesAgentId, limit, offset])
                    .then(([rows]) => {
                        console.log(`Found ${rows.length} customers for sales agent ${salesAgentId} on page ${page}`);

                        // Process each row to combine phoneCode and phoneNumber
                        const processedRows = rows.map(customer => {
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

                            return customer;
                        });

                        const result = {
                            customers: processedRows,
                            currentPage: page,
                            totalPages: totalPages,
                            totalCount: totalCount,
                            hasMore: hasMore,
                            limit: limit
                        };

                        console.log('Processed query result:', result);
                        resolve(result);
                    });
            })
            .catch(error => {
                console.error('Database query error:', error);
                reject(error);
            });
    });
};



// Function to get customer data along with related building data (House or Apartment)
// exports.getCustomerData = async (cusId) => {
//     return new Promise((resolve, reject) => {

//         const sqlCustomerQuery = `SELECT * FROM marketplaceusers WHERE id = ?`;

//         db.marketPlace.promise().query(sqlCustomerQuery, [cusId])
//             .then(async ([customerRows]) => {
//                 console.log("Customer Rows: ", customerRows); // Log the result of the query

//                 if (customerRows.length === 0) {
//                     return reject(new Error('Customer not found'));
//                 }

//                 const customerData = customerRows[0];
//                 let buildingDataQuery = '';
//                 let buildingDataParams = [];

//                 if (customerData.buildingType === 'House') {
//                     buildingDataQuery = `SELECT * FROM house WHERE customerId = ?`;
//                     buildingDataParams = [customerData.id];
//                 } else if (customerData.buildingType === 'Apartment') {
//                     buildingDataQuery = `SELECT * FROM apartment WHERE customerId = ?`;
//                     buildingDataParams = [customerData.id];
//                 } else {
//                     return reject(new Error('Invalid building type'));
//                 }

//                 // Fetch building data
//                 const [buildingData] = await db.marketPlace.promise().query(buildingDataQuery, buildingDataParams);

//                 console.log("Building Data: ", buildingData); // Log the building data

//                 // Combine customer data with building data
//                 resolve({
//                     customer: customerData,
//                     building: buildingData.length > 0 ? buildingData[0] : null
//                 });
//             })
//             .catch(error => reject(error));
//     });
// };

exports.getCustomerData = async (cusId) => {
    return new Promise((resolve, reject) => {
        const sqlCustomerQuery = `SELECT * FROM marketplaceusers WHERE id = ?`;

        db.marketPlace.promise().query(sqlCustomerQuery, [cusId])
            .then(async ([customerRows]) => {
                console.log("Customer Rows: ", customerRows); // Log the result of the query

                if (customerRows.length === 0) {
                    return reject(new Error('Customer not found'));
                }

                const customerData = customerRows[0];

                // Combine phoneCode and phoneNumber into a single phoneNumber field
                if (customerData.phoneCode && customerData.phoneNumber) {
                    customerData.phoneNumber = `${customerData.phoneCode}${customerData.phoneNumber}`;
                } else if (customerData.phoneNumber && !customerData.phoneCode) {
                    // If only phoneNumber exists, keep it as is
                    customerData.phoneNumber = customerData.phoneNumber;
                } else if (customerData.phoneCode && !customerData.phoneNumber) {
                    // If only phoneCode exists, set phoneNumber to just the code
                    customerData.phoneNumber = `${customerData.phoneCode}`;
                } else {
                    // If neither exists, set to empty string
                    customerData.phoneNumber = '';
                }

                // Remove the separate phoneCode field since we've combined it
                delete customerData.phoneCode;

                let buildingDataQuery = '';
                let buildingDataParams = [];

                if (customerData.buildingType === 'House') {
                    buildingDataQuery = `SELECT * FROM house WHERE customerId = ?`;
                    buildingDataParams = [customerData.id];
                } else if (customerData.buildingType === 'Apartment') {
                    buildingDataQuery = `SELECT * FROM apartment WHERE customerId = ?`;
                    buildingDataParams = [customerData.id];
                } else {
                    return reject(new Error('Invalid building type'));
                }

                // Fetch building data
                const [buildingData] = await db.marketPlace.promise().query(buildingDataQuery, buildingDataParams);

                console.log("Building Data: ", buildingData); // Log the building data

                // Combine customer data with building data
                resolve({
                    customer: customerData,
                    building: buildingData.length > 0 ? buildingData[0] : null
                });
            })
            .catch(error => reject(error));
    });
};






// In your customer-dao.js
exports.getCusDataExc = async (customerId) => {
    try {
        const connection = await db.marketPlace.promise().getConnection();
        try {
            // First try the most likely case
            const [results] = await connection.query(
                "SELECT * FROM marketplaceusers WHERE cusId = ? OR id = ? LIMIT 1",
                [customerId, customerId]
            );

            if (results.length === 0) {
                // Return empty but successful response instead of error
                return {
                    success: true,
                    data: null // Explicitly return null
                };
            }

            const customerData = results[0];
            return {
                success: true,
                data: {
                    ...customerData,
                    name: customerData.firstName || customerData.name,
                    number: customerData.phoneNumber || customerData.number
                }
            };
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error in getCusDataExc DAO:", error);
        return {
            success: false,
            message: "Database error occurred"
        };
    }
};

// exports.updateCustomerData = async (cusId, customerData, buildingData) => {
//     let connection;

//     try {
//         // Get a connection from the pool
//         connection = await db.marketPlace.promise().getConnection();

//         // Start transaction
//         await connection.beginTransaction();

//         // Parse phone number to extract phone code and number
//         let phoneCode = '';
//         let phoneNumber = '';

//         if (customerData.phoneNumber) {
//             const fullPhone = customerData.phoneNumber.toString();

//             // Check if phone number starts with +94 (Sri Lanka)
//             if (fullPhone.startsWith('+94')) {
//                 phoneCode = '+94';
//                 phoneNumber = fullPhone.substring(3); // Remove +94
//             }
//             // Check if phone number starts with 94 (without +)
//             else if (fullPhone.startsWith('94') && fullPhone.length > 9) {
//                 phoneCode = '+94';
//                 phoneNumber = fullPhone.substring(2); // Remove 94
//             }
//             // Check if phone number starts with 0 (local format)
//             else if (fullPhone.startsWith('0')) {
//                 phoneCode = '+94';
//                 phoneNumber = fullPhone.substring(1); // Remove leading 0
//             }
//             // Default case - assume it's already in correct format
//             else {
//                 phoneCode = '+94'; // Default to Sri Lanka
//                 phoneNumber = fullPhone;
//             }

//             // Clean up phone number (remove any spaces, dashes, etc.)
//             phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
//         }

//         // Check if customer exists
//         const getCustomerIdQuery = `SELECT id, phoneCode, phoneNumber, email, buildingType FROM marketplaceusers WHERE id = ?`;
//         const [customerResult] = await connection.query(getCustomerIdQuery, [cusId]);

//         console.log("Customer ID query result:", customerResult);

//         if (customerResult.length === 0) {
//             throw new Error('Customer not found');
//         }

//         const customerId = customerResult[0].id;
//         const existingPhoneCode = customerResult[0].phoneCode;
//         const existingPhoneNumber = customerResult[0].phoneNumber;
//         const existingEmail = customerResult[0].email;
//         const existingBuildingType = customerResult[0].buildingType;
//         console.log("Using customerId:", customerId);

//         // Check for duplicate phone number (compare both phoneCode and phoneNumber)
//         if (phoneCode !== existingPhoneCode || phoneNumber !== existingPhoneNumber) {
//             const checkPhoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ? AND id != ?`;
//             const [phoneResult] = await connection.query(checkPhoneQuery, [phoneCode, phoneNumber, customerId]);

//             if (phoneResult.length > 0) {
//                 throw new Error('Phone number already exists.');
//             }
//         }

//         // Check for duplicate email
//         if (customerData.email !== existingEmail) {
//             const checkEmailQuery = `SELECT id FROM marketplaceusers WHERE email = ? AND id != ?`;
//             const [emailResult] = await connection.query(checkEmailQuery, [customerData.email, customerId]);

//             if (emailResult.length > 0) {
//                 throw new Error('Email already exists.');
//             }
//         }

//         // Update customer with separated phone fields
//         const updateCustomerQuery = `
//             UPDATE marketplaceusers 
//             SET title = ?, firstName = ?, lastName = ?, phoneCode = ?, phoneNumber = ?, email = ?, buildingType = ? 
//             WHERE id = ?`;

//         const customerParams = [
//             customerData.title,
//             customerData.firstName,
//             customerData.lastName,
//             phoneCode,
//             phoneNumber,
//             customerData.email,
//             customerData.buildingType,
//             cusId
//         ];

//         await connection.query(updateCustomerQuery, customerParams);
//         console.log("Customer data updated.");

//         // Handle building type change
//         if (customerData.buildingType !== existingBuildingType) {
//             console.log(`Building type changed from ${existingBuildingType} to ${customerData.buildingType}`);

//             // Delete existing building data no matter which type
//             if (existingBuildingType === 'House') {
//                 await connection.query('DELETE FROM house WHERE customerId = ?', [customerId]);
//                 console.log("Deleted old house data.");
//             } else if (existingBuildingType === 'Apartment') {
//                 await connection.query('DELETE FROM apartment WHERE customerId = ?', [customerId]);
//                 console.log("Deleted old apartment data.");
//             }

//             // Insert new building data
//             if (customerData.buildingType === 'House') {
//                 const insertHouseQuery = `
//                     INSERT INTO house (customerId, houseNo, streetName, city) 
//                     VALUES (?, ?, ?, ?)`;

//                 await connection.query(insertHouseQuery, [
//                     customerId,
//                     buildingData.houseNo || '',  // Default to empty string if undefined
//                     buildingData.streetName || '',  // Default to empty string if undefined
//                     buildingData.city || ''  // Default to empty string if undefined
//                 ]);
//                 console.log("New house data created.");
//             } else if (customerData.buildingType === 'Apartment') {
//                 const insertApartmentQuery = `
//                     INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) 
//                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//                 await connection.query(insertApartmentQuery, [
//                     customerId,
//                     buildingData.buildingNo || '',
//                     buildingData.buildingName || '',
//                     buildingData.unitNo || '',
//                     buildingData.floorNo || '',
//                     buildingData.houseNo || '',
//                     buildingData.streetName || '',
//                     buildingData.city || ''
//                 ]);
//                 console.log("New apartment data created.");
//             }

//         } else {
//             // If building type didn't change, update the existing building data
//             if (customerData.buildingType === 'House') {
//                 const [houseExists] = await connection.query('SELECT * FROM house WHERE customerId = ?', [customerId]);
//                 console.log("House exists check result:", houseExists); // Check the existing house data

//                 if (houseExists.length > 0) {
//                     const updateHouseQuery = `
//                         UPDATE house 
//                         SET houseNo = ?, streetName = ?, city = ? 
//                         WHERE customerId = ?`;

//                     const updateParams = [
//                         buildingData.houseNo || '',  // Default to empty string if undefined
//                         buildingData.streetName || '',  // Default to empty string if undefined
//                         buildingData.city || '',  // Default to empty string if undefined
//                         customerId
//                     ];
//                     console.log("House update parameters:", updateParams);

//                     const [updateResult] = await connection.query(updateHouseQuery, updateParams);
//                     console.log("House update result:", updateResult);

//                     const [verifyUpdate] = await connection.query('SELECT * FROM house WHERE customerId = ?', [customerId]);
//                     console.log("After update - house data:", verifyUpdate);

//                     if (updateResult.affectedRows === 0) {
//                         console.warn("Warning: House update query did not update any rows!");
//                     } else {
//                         console.log(`House update successful, affected rows: ${updateResult.affectedRows}`);
//                     }
//                 }
//             } else if (customerData.buildingType === 'Apartment') {
//                 const [apartmentExists] = await connection.query('SELECT 1 FROM apartment WHERE customerId = ?', [customerId]);

//                 if (apartmentExists.length > 0) {
//                     const updateApartmentQuery = `
//                         UPDATE apartment 
//                         SET buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?, houseNo = ?, streetName = ?, city = ? 
//                         WHERE customerId = ?`;

//                     await connection.query(updateApartmentQuery, [
//                         buildingData.buildingNo || '',
//                         buildingData.buildingName || '',
//                         buildingData.unitNo || '',
//                         buildingData.floorNo || '',
//                         buildingData.houseNo || '',
//                         buildingData.streetName || '',
//                         buildingData.city || '',
//                         customerId
//                     ]);
//                     console.log("Apartment data updated.");
//                 } else {
//                     const insertApartmentQuery = `
//                         INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) 
//                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//                     await connection.query(insertApartmentQuery, [
//                         customerId,
//                         buildingData.buildingNo || '',
//                         buildingData.buildingName || '',
//                         buildingData.unitNo || '',
//                         buildingData.floorNo || '',
//                         buildingData.houseNo || '',
//                         buildingData.streetName || '',
//                         buildingData.city || ''
//                     ]);
//                     console.log("New apartment data created for existing apartment type.");
//                 }
//             }
//         }

//         // Commit the transaction
//         await connection.commit();
//         return "Customer and building data updated successfully.";

//     } catch (error) {
//         // If there's an error, roll back the transaction
//         if (connection) {
//             await connection.rollback();
//         }
//         console.error("Error during update: ", error);
//         throw error;
//     } finally {
//         // Release the connection back to the pool
//         if (connection) {
//             connection.release();
//         }
//     }
// };

// exports.updateCustomerData = async (cusId, customerData, buildingData) => {
//     let connection;

//     try {
//         // Get a connection from the pool
//         connection = await db.marketPlace.promise().getConnection();

//         // Start transaction
//         await connection.beginTransaction();

//         // Parse phone number to extract phone code and number
//         let phoneCode = '';
//         let phoneNumber = '';

//         if (customerData.phoneNumber) {
//             const fullPhone = customerData.phoneNumber.toString();

//             // Check if phone number starts with +94 (Sri Lanka)
//             if (fullPhone.startsWith('+94')) {
//                 phoneCode = '+94';
//                 phoneNumber = fullPhone.substring(3); // Remove +94
//             }
//             // Check if phone number starts with 94 (without +)
//             else if (fullPhone.startsWith('94') && fullPhone.length > 9) {
//                 phoneCode = '+94';
//                 phoneNumber = fullPhone.substring(2); // Remove 94
//             }
//             // Check if phone number starts with 0 (local format)
//             else if (fullPhone.startsWith('0')) {
//                 phoneCode = '+94';
//                 phoneNumber = fullPhone.substring(1); // Remove leading 0
//             }
//             // Default case - assume it's already in correct format
//             else {
//                 phoneCode = '+94'; // Default to Sri Lanka
//                 phoneNumber = fullPhone;
//             }

//             // Clean up phone number (remove any spaces, dashes, etc.)
//             phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
//         }

//         // Check if customer exists
//         const getCustomerIdQuery = `SELECT id, phoneCode, phoneNumber, email, buildingType FROM marketplaceusers WHERE id = ?`;
//         const [customerResult] = await connection.query(getCustomerIdQuery, [cusId]);

//         console.log("Customer ID query result:", customerResult);

//         if (customerResult.length === 0) {
//             throw new Error('Customer not found');
//         }

//         const customerId = customerResult[0].id;
//         const existingPhoneCode = customerResult[0].phoneCode;
//         const existingPhoneNumber = customerResult[0].phoneNumber;
//         const existingEmail = customerResult[0].email;
//         const existingBuildingType = customerResult[0].buildingType;
//         console.log("Using customerId:", customerId);

//         // Debug: Log what we're comparing
//         console.log("Existing email:", existingEmail);
//         console.log("New email:", customerData.email);
//         console.log("Email comparison result:", customerData.email !== existingEmail);

//         // Check for duplicate phone number (compare both phoneCode and phoneNumber)
//         if (phoneCode !== existingPhoneCode || phoneNumber !== existingPhoneNumber) {
//             console.log("Phone number is being changed, checking for duplicates...");
//             const checkPhoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ? AND id != ?`;
//             const [phoneResult] = await connection.query(checkPhoneQuery, [phoneCode, phoneNumber, customerId]);

//             if (phoneResult.length > 0) {
//                 console.log("Phone number conflict found");
//                 throw new Error('Phone number already exists.');
//             }
//             console.log("No phone number conflict");
//         } else {
//             console.log("Phone number not changed, skipping phone duplicate check");
//         }

//         // Check for duplicate email ONLY if email is being changed
//         if (customerData.email && customerData.email.trim() !== existingEmail) {
//             console.log("Email is being changed, checking for duplicates...");
//             const checkEmailQuery = `SELECT id FROM marketplaceusers WHERE email = ? AND id != ?`;
//             const [emailResult] = await connection.query(checkEmailQuery, [customerData.email.trim(), customerId]);

//             console.log("Email check query:", checkEmailQuery);
//             console.log("Email check params:", [customerData.email.trim(), customerId]);
//             console.log("Email check result:", emailResult);

//             if (emailResult.length > 0) {
//                 console.log("Email conflict found with existing customer ID:", emailResult[0].id);
//                 throw new Error('Email already exists.');
//             }
//             console.log("No email conflict found");
//         } else {
//             console.log("Email not changed or empty, skipping email duplicate check");
//         }

//         // Update customer with separated phone fields
//         const updateCustomerQuery = `
//             UPDATE marketplaceusers 
//             SET title = ?, firstName = ?, lastName = ?, phoneCode = ?, phoneNumber = ?, email = ?, buildingType = ? 
//             WHERE id = ?`;

//         const customerParams = [
//             customerData.title,
//             customerData.firstName,
//             customerData.lastName,
//             phoneCode,
//             phoneNumber,
//             customerData.email,
//             customerData.buildingType,
//             cusId
//         ];

//         await connection.query(updateCustomerQuery, customerParams);
//         console.log("Customer data updated.");

//         // Handle building type change
//         if (customerData.buildingType !== existingBuildingType) {
//             console.log(`Building type changed from ${existingBuildingType} to ${customerData.buildingType}`);

//             // Delete existing building data no matter which type
//             if (existingBuildingType === 'House') {
//                 await connection.query('DELETE FROM house WHERE customerId = ?', [customerId]);
//                 console.log("Deleted old house data.");
//             } else if (existingBuildingType === 'Apartment') {
//                 await connection.query('DELETE FROM apartment WHERE customerId = ?', [customerId]);
//                 console.log("Deleted old apartment data.");
//             }

//             // Insert new building data
//             if (customerData.buildingType === 'House') {
//                 const insertHouseQuery = `
//                     INSERT INTO house (customerId, houseNo, streetName, city) 
//                     VALUES (?, ?, ?, ?)`;

//                 await connection.query(insertHouseQuery, [
//                     customerId,
//                     buildingData.houseNo || '',
//                     buildingData.streetName || '',
//                     buildingData.city || ''
//                 ]);
//                 console.log("New house data created.");
//             } else if (customerData.buildingType === 'Apartment') {
//                 const insertApartmentQuery = `
//                     INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) 
//                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//                 await connection.query(insertApartmentQuery, [
//                     customerId,
//                     buildingData.buildingNo || '',
//                     buildingData.buildingName || '',
//                     buildingData.unitNo || '',
//                     buildingData.floorNo || '',
//                     buildingData.houseNo || '',
//                     buildingData.streetName || '',
//                     buildingData.city || ''
//                 ]);
//                 console.log("New apartment data created.");
//             }

//         } else {
//             // If building type didn't change, update the existing building data
//             if (customerData.buildingType === 'House') {
//                 const [houseExists] = await connection.query('SELECT * FROM house WHERE customerId = ?', [customerId]);
//                 console.log("House exists check result:", houseExists);

//                 if (houseExists.length > 0) {
//                     const updateHouseQuery = `
//                         UPDATE house 
//                         SET houseNo = ?, streetName = ?, city = ? 
//                         WHERE customerId = ?`;

//                     const updateParams = [
//                         buildingData.houseNo || '',
//                         buildingData.streetName || '',
//                         buildingData.city || '',
//                         customerId
//                     ];
//                     console.log("House update parameters:", updateParams);

//                     const [updateResult] = await connection.query(updateHouseQuery, updateParams);
//                     console.log("House update result:", updateResult);

//                     if (updateResult.affectedRows === 0) {
//                         console.warn("Warning: House update query did not update any rows!");
//                     } else {
//                         console.log(`House update successful, affected rows: ${updateResult.affectedRows}`);
//                     }
//                 } else {
//                     // Create house record if it doesn't exist
//                     const insertHouseQuery = `
//                         INSERT INTO house (customerId, houseNo, streetName, city) 
//                         VALUES (?, ?, ?, ?)`;

//                     await connection.query(insertHouseQuery, [
//                         customerId,
//                         buildingData.houseNo || '',
//                         buildingData.streetName || '',
//                         buildingData.city || ''
//                     ]);
//                     console.log("New house data created for existing house type.");
//                 }
//             } else if (customerData.buildingType === 'Apartment') {
//                 const [apartmentExists] = await connection.query('SELECT 1 FROM apartment WHERE customerId = ?', [customerId]);

//                 if (apartmentExists.length > 0) {
//                     const updateApartmentQuery = `
//                         UPDATE apartment 
//                         SET buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?, houseNo = ?, streetName = ?, city = ? 
//                         WHERE customerId = ?`;

//                     await connection.query(updateApartmentQuery, [
//                         buildingData.buildingNo || '',
//                         buildingData.buildingName || '',
//                         buildingData.unitNo || '',
//                         buildingData.floorNo || '',
//                         buildingData.houseNo || '',
//                         buildingData.streetName || '',
//                         buildingData.city || '',
//                         customerId
//                     ]);
//                     console.log("Apartment data updated.");
//                 } else {
//                     const insertApartmentQuery = `
//                         INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) 
//                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

//                     await connection.query(insertApartmentQuery, [
//                         customerId,
//                         buildingData.buildingNo || '',
//                         buildingData.buildingName || '',
//                         buildingData.unitNo || '',
//                         buildingData.floorNo || '',
//                         buildingData.houseNo || '',
//                         buildingData.streetName || '',
//                         buildingData.city || ''
//                     ]);
//                     console.log("New apartment data created for existing apartment type.");
//                 }
//             }
//         }

//         // Commit the transaction
//         await connection.commit();
//         return "Customer and building data updated successfully.";

//     } catch (error) {
//         // If there's an error, roll back the transaction
//         if (connection) {
//             await connection.rollback();
//         }
//         console.error("Error during update: ", error);
//         throw error;
//     } finally {
//         // Release the connection back to the pool
//         if (connection) {
//             connection.release();
//         }
//     }
// };

exports.updateCustomerData = async (cusId, customerData, buildingData) => {
    let connection;

    try {
        // Get a connection from the pool
        connection = await db.marketPlace.promise().getConnection();

        // Start transaction
        await connection.beginTransaction();

        // Parse phone number to extract phone code and number
        let phoneCode = '';
        let phoneNumber = '';

        if (customerData.phoneNumber) {
            const fullPhone = customerData.phoneNumber.toString();

            // Check if phone number starts with +94 (Sri Lanka)
            if (fullPhone.startsWith('+94')) {
                phoneCode = '+94';
                phoneNumber = fullPhone.substring(3); // Remove +94
            }
            // Check if phone number starts with 94 (without +)
            else if (fullPhone.startsWith('94') && fullPhone.length > 9) {
                phoneCode = '+94';
                phoneNumber = fullPhone.substring(2); // Remove 94
            }
            // Check if phone number starts with 0 (local format)
            else if (fullPhone.startsWith('0')) {
                phoneCode = '+94';
                phoneNumber = fullPhone.substring(1); // Remove leading 0
            }
            // Default case - assume it's already in correct format
            else {
                phoneCode = '+94'; // Default to Sri Lanka
                phoneNumber = fullPhone;
            }

            // Clean up phone number (remove any spaces, dashes, etc.)
            phoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
        }

        // Check if customer exists
        const getCustomerIdQuery = `SELECT id, phoneCode, phoneNumber, email, buildingType FROM marketplaceusers WHERE id = ?`;
        const [customerResult] = await connection.query(getCustomerIdQuery, [cusId]);

        console.log("Customer ID query result:", customerResult);

        if (customerResult.length === 0) {
            throw new Error('Customer not found');
        }

        const customerId = customerResult[0].id;
        const existingPhoneCode = customerResult[0].phoneCode;
        const existingPhoneNumber = customerResult[0].phoneNumber;
        const existingEmail = customerResult[0].email;
        const existingBuildingType = customerResult[0].buildingType;
        console.log("Using customerId:", customerId);

        // Debug: Log what we're comparing
        console.log("Existing email:", existingEmail);
        console.log("New email:", customerData.email);

        // Check for duplicate phone number (compare both phoneCode and phoneNumber)
        if (phoneCode !== existingPhoneCode || phoneNumber !== existingPhoneNumber) {
            console.log("Phone number is being changed, checking for duplicates...");
            const checkPhoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ? AND id != ?`;
            const [phoneResult] = await connection.query(checkPhoneQuery, [phoneCode, phoneNumber, customerId]);

            if (phoneResult.length > 0) {
                console.log("Phone number conflict found");
                throw new Error('Phone number already exists.');
            }
            console.log("No phone number conflict");
        } else {
            console.log("Phone number not changed, skipping phone duplicate check");
        }

        // Handle email validation and duplicate check
        let finalEmail = null;

        // Check if email is provided and not empty
        if (customerData.email && customerData.email.trim() !== '') {
            finalEmail = customerData.email.trim();

            // Check for duplicate email ONLY if email is being changed and is not null/empty
            if (finalEmail !== existingEmail) {
                console.log("Email is being changed, checking for duplicates...");
                const checkEmailQuery = `SELECT id FROM marketplaceusers WHERE email = ? AND id != ?`;
                const [emailResult] = await connection.query(checkEmailQuery, [finalEmail, customerId]);

                console.log("Email check query:", checkEmailQuery);
                console.log("Email check params:", [finalEmail, customerId]);
                console.log("Email check result:", emailResult);

                if (emailResult.length > 0) {
                    console.log("Email conflict found with existing customer ID:", emailResult[0].id);
                    throw new Error('Email already exists.');
                }
                console.log("No email conflict found");
            } else {
                console.log("Email not changed, skipping email duplicate check");
            }
        } else {
            // Email is empty or not provided - set to null
            finalEmail = null;
            console.log("Email is empty or not provided, setting to null");
        }

        // Update customer with separated phone fields
        const updateCustomerQuery = `
            UPDATE marketplaceusers 
            SET title = ?, firstName = ?, lastName = ?, phoneCode = ?, phoneNumber = ?, email = ?, buildingType = ? 
            WHERE id = ?`;

        const customerParams = [
            customerData.title,
            customerData.firstName,
            customerData.lastName,
            phoneCode,
            phoneNumber,
            finalEmail, // Use finalEmail which can be null
            customerData.buildingType,
            cusId
        ];

        await connection.query(updateCustomerQuery, customerParams);
        console.log("Customer data updated.");

        // Handle building type change
        if (customerData.buildingType !== existingBuildingType) {
            console.log(`Building type changed from ${existingBuildingType} to ${customerData.buildingType}`);

            // Delete existing building data no matter which type
            if (existingBuildingType === 'House') {
                await connection.query('DELETE FROM house WHERE customerId = ?', [customerId]);
                console.log("Deleted old house data.");
            } else if (existingBuildingType === 'Apartment') {
                await connection.query('DELETE FROM apartment WHERE customerId = ?', [customerId]);
                console.log("Deleted old apartment data.");
            }

            // Insert new building data
            if (customerData.buildingType === 'House') {
                const insertHouseQuery = `
                    INSERT INTO house (customerId, houseNo, streetName, city) 
                    VALUES (?, ?, ?, ?)`;

                await connection.query(insertHouseQuery, [
                    customerId,
                    buildingData.houseNo || '',
                    buildingData.streetName || '',
                    buildingData.city || ''
                ]);
                console.log("New house data created.");
            } else if (customerData.buildingType === 'Apartment') {
                const insertApartmentQuery = `
                    INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

                await connection.query(insertApartmentQuery, [
                    customerId,
                    buildingData.buildingNo || '',
                    buildingData.buildingName || '',
                    buildingData.unitNo || '',
                    buildingData.floorNo || '',
                    buildingData.houseNo || '',
                    buildingData.streetName || '',
                    buildingData.city || ''
                ]);
                console.log("New apartment data created.");
            }

        } else {
            // If building type didn't change, update the existing building data
            if (customerData.buildingType === 'House') {
                const [houseExists] = await connection.query('SELECT * FROM house WHERE customerId = ?', [customerId]);
                console.log("House exists check result:", houseExists);

                if (houseExists.length > 0) {
                    const updateHouseQuery = `
                        UPDATE house 
                        SET houseNo = ?, streetName = ?, city = ? 
                        WHERE customerId = ?`;

                    const updateParams = [
                        buildingData.houseNo || '',
                        buildingData.streetName || '',
                        buildingData.city || '',
                        customerId
                    ];
                    console.log("House update parameters:", updateParams);

                    const [updateResult] = await connection.query(updateHouseQuery, updateParams);
                    console.log("House update result:", updateResult);

                    if (updateResult.affectedRows === 0) {
                        console.warn("Warning: House update query did not update any rows!");
                    } else {
                        console.log(`House update successful, affected rows: ${updateResult.affectedRows}`);
                    }
                } else {
                    // Create house record if it doesn't exist
                    const insertHouseQuery = `
                        INSERT INTO house (customerId, houseNo, streetName, city) 
                        VALUES (?, ?, ?, ?)`;

                    await connection.query(insertHouseQuery, [
                        customerId,
                        buildingData.houseNo || '',
                        buildingData.streetName || '',
                        buildingData.city || ''
                    ]);
                    console.log("New house data created for existing house type.");
                }
            } else if (customerData.buildingType === 'Apartment') {
                const [apartmentExists] = await connection.query('SELECT 1 FROM apartment WHERE customerId = ?', [customerId]);

                if (apartmentExists.length > 0) {
                    const updateApartmentQuery = `
                        UPDATE apartment 
                        SET buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?, houseNo = ?, streetName = ?, city = ? 
                        WHERE customerId = ?`;

                    await connection.query(updateApartmentQuery, [
                        buildingData.buildingNo || '',
                        buildingData.buildingName || '',
                        buildingData.unitNo || '',
                        buildingData.floorNo || '',
                        buildingData.houseNo || '',
                        buildingData.streetName || '',
                        buildingData.city || '',
                        customerId
                    ]);
                    console.log("Apartment data updated.");
                } else {
                    const insertApartmentQuery = `
                        INSERT INTO apartment (customerId, buildingNo, buildingName, unitNo, floorNo, houseNo, streetName, city) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

                    await connection.query(insertApartmentQuery, [
                        customerId,
                        buildingData.buildingNo || '',
                        buildingData.buildingName || '',
                        buildingData.unitNo || '',
                        buildingData.floorNo || '',
                        buildingData.houseNo || '',
                        buildingData.streetName || '',
                        buildingData.city || ''
                    ]);
                    console.log("New apartment data created for existing apartment type.");
                }
            }
        }

        // Commit the transaction
        await connection.commit();
        return "Customer and building data updated successfully.";

    } catch (error) {
        // If there's an error, roll back the transaction
        if (connection) {
            await connection.rollback();
        }
        console.error("Error during update: ", error);
        throw error;
    } finally {
        // Release the connection back to the pool
        if (connection) {
            connection.release();
        }
    }
};

// UPDATED FRONTEND ERROR HANDLING
const handleRegister = async () => {
    // ... existing validation code ...

    setIsSubmitting(true);

    try {
        // Only check for duplicates when phone number has changed
        if (phoneNumber !== originalPhoneNumber) {
            try {
                console.log("Checking customer with:", { phoneNumber, email });

                const checkResponse = await axios.post(
                    `${environment.API_BASE_URL}api/customer/check-customer`,
                    { phoneNumber, email },
                    {
                        headers: { 'Authorization': `Bearer ${token}` },
                        timeout: 10000
                    }
                );

                console.log("Customer check passed:", checkResponse.data);

                // Send OTP if validation passed
                const otpResponse = await sendOTP();
                if (otpResponse.status !== 200) {
                    Alert.alert("Error", "Failed to send OTP. Please try again.");
                    return;
                }

            } catch (err) {
                console.log("Customer check error:", checkError);

                if (checkError.response?.status === 400) {
                    const errorMessage = checkError.response.data.message;

                    if (errorMessage.includes("Mobile Number already exists")) {
                        setPhoneError("This mobile number is already registered.");
                        Alert.alert("Mobile Number Already Exists", "This mobile number is already registered. Please use a different mobile number.");
                        return;
                    } else if (errorMessage.includes("Email already exists")) {
                        setEmailError("This email address is already registered.");
                        Alert.alert("Email Already Exists", "This email address is already registered. Please use a different email address.");
                        return;
                    }
                }

                Alert.alert("Error", "Failed to validate customer information. Please try again.");
                return;
            }
        }

        // Prepare data for update
        const customerData = {
            title: selectedCategory,
            firstName,
            lastName,
            phoneNumber,
            email,
            buildingType,
        };

        const buildingData = buildingType === "House" ? {
            houseNo,
            streetName,
            city
        } : {
            buildingNo,
            buildingName,
            unitNo,
            floorNo,
            houseNo,
            streetName,
            city
        };

        if (phoneNumber !== originalPhoneNumber) {
            // Store data and navigate to OTP screen
            await AsyncStorage.setItem("pendingCustomerData", JSON.stringify({
                customerData,
                buildingData,
                originalBuildingType
            }));
            navigation.navigate("OtpScreenUp", { phoneNumber, id, token });
        } else {
            // Direct update without OTP
            try {
                console.log("Making direct update request...");
                const response = await axios.put(
                    `${environment.API_BASE_URL}api/customer/update-customer-data/${id}`,
                    { ...customerData, buildingData, originalBuildingType },
                    {
                        headers: { 'Authorization': `Bearer ${token}` },
                        timeout: 15000
                    }
                );

                if (response.status === 200) {
                    Alert.alert("Success", "Customer updated successfully.");
                    navigation.goBack();
                }
            } catch (err) {
                console.error("Update error:", updateError);

                if (updateError.response?.status === 400) {
                    const errorMessage = updateError.response.data.message;

                    if (errorMessage === "Email already exists.") {
                        setEmailError("This email address is already registered.");
                        Alert.alert("Email Already Exists", "This email address is already registered. Please use a different email address.");
                        return;
                    } else if (errorMessage === "Mobile Number already exists.") {
                        setPhoneError("This mobile number is already registered.");
                        Alert.alert("Mobile Number Already Exists", "This mobile number is already registered. Please use a different mobile number.");
                        return;
                    }

                    Alert.alert("Update Error", errorMessage);
                } else if (updateError.response?.status === 500) {
                    Alert.alert("Server Error", "There was a problem updating your information. Please try again.");
                } else {
                    Alert.alert("Error", "Failed to update customer. Please try again.");
                }
            }
        }
    } catch (err) {
        console.error("Unexpected error in handleRegister:", error);
        Alert.alert("Error", "An unexpected error occurred. Please try again.");
    } finally {
        setIsSubmitting(false);
    }
};

// exports.findCustomerByPhoneOrEmail = async (phoneNumber, email) => {
//     try {
//         const sqlQuery = `
//             SELECT * FROM marketplaceusers 
//             WHERE phoneNumber = ? OR email = ?`;

//         const [rows] = await db.marketPlace.promise().query(sqlQuery, [phoneNumber, email]);

//         return rows.length > 0 ? rows[0] : null;
//     } catch (error) {
//         console.error("Error finding customer:", error);
//         throw error;
//     }
// };


// exports.findCustomerByPhoneOrEmail = async (phoneNumber, email) => {
//     try {
//         // Parse the incoming phone number to extract phone code and number
//         let phoneCodeToCheck = '';
//         let phoneNumberToCheck = '';

//         if (phoneNumber) {
//             const fullPhone = phoneNumber.toString();

//             // Check if phone number starts with +94 (Sri Lanka)
//             if (fullPhone.startsWith('+94')) {
//                 phoneCodeToCheck = '+94';
//                 phoneNumberToCheck = fullPhone.substring(3); // Remove +94
//             }
//             // Check if phone number starts with 94 (without +)
//             else if (fullPhone.startsWith('94') && fullPhone.length > 9) {
//                 phoneCodeToCheck = '+94';
//                 phoneNumberToCheck = fullPhone.substring(2); // Remove 94
//             }
//             // Check if phone number starts with 0 (local format)
//             else if (fullPhone.startsWith('0')) {
//                 phoneCodeToCheck = '+94';
//                 phoneNumberToCheck = fullPhone.substring(1); // Remove leading 0
//             }
//             // Default case - assume it's already in correct format
//             else {
//                 phoneCodeToCheck = '+94'; // Default to Sri Lanka
//                 phoneNumberToCheck = fullPhone;
//             }

//             // Clean up phone number (remove any spaces, dashes, etc.)
//             phoneNumberToCheck = phoneNumberToCheck.replace(/[\s\-\(\)]/g, '');
//         }

//         const sqlQuery = `
//             SELECT * FROM marketplaceusers 
//             WHERE (phoneCode = ? AND phoneNumber = ?) OR email = ?`;

//         const [rows] = await db.marketPlace.promise().query(sqlQuery, [phoneCodeToCheck, phoneNumberToCheck, email]);

//         return rows.length > 0 ? rows[0] : null;
//     } catch (error) {
//         console.error("Error finding customer:", error);
//         throw error;
//     }
// };

exports.findCustomerByPhoneOrEmail = async (phoneNumber, email, excludeId = null) => {
    try {
        let phoneExists = false;
        let emailExists = false;

        // Check phone number if provided
        if (phoneNumber) {
            // Parse the incoming phone number (your existing code)
            let phoneCodeToCheck = '';
            let phoneNumberToCheck = '';

            const fullPhone = phoneNumber.toString();
            if (fullPhone.startsWith('+94')) {
                phoneCodeToCheck = '+94';
                phoneNumberToCheck = fullPhone.substring(3);
            }
            // ... rest of your phone parsing logic

            // Modify the query to exclude current user if excludeId is provided
            let phoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ?`;
            const phoneParams = [phoneCodeToCheck, phoneNumberToCheck];

            if (excludeId) {
                phoneQuery += ` AND id != ?`;
                phoneParams.push(excludeId);
            }

            const [phoneRows] = await db.marketPlace.promise().query(phoneQuery, phoneParams);
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

            const [emailRows] = await db.marketPlace.promise().query(emailQuery, emailParams);
            emailExists = emailRows.length > 0;
        }

        return {
            phoneExists,
            emailExists,
            hasConflict: phoneExists || emailExists
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
            const [rows] = await connection.query(`
        SELECT salesAgent, COUNT(*) AS customerCount
        FROM marketplaceusers
        WHERE salesAgent = ?
        GROUP BY salesAgent
      `, [salesAgentId]);


            console.log("vfas", rows)
            // Return the count for the specific agent, or default object if no customers found
            return rows.length > 0 ? rows[0] : { salesAgent: parseInt(salesAgentId), customerCount: 0 };
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in getCustomerCountBySalesAgent:', error);
        throw new Error(`Failed to get customer count: ${error.message}`);
    }
};




exports.getAllCity = async () => {
    console.log("hitpack")
    return new Promise((resolve, reject) => {
        const query = `
        SELECT id, city, charge,   createdAt
        FROM deliverycharge
      
        ORDER BY city ASC
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
    const CustomerId = cusId.customerId
    try {
        const query = `
        SELECT 
            mpi.id, mpi.varietyId, mpi.displayName,
            pc.image
        FROM marketplaceitems mpi
        JOIN plant_care.cropvariety pc ON pc.id = mpi.varietyId
       WHERE mpi.id NOT IN ( 
        SELECT mpItemId 
        FROM excludelist 
        WHERE userId = ?
      )
        ORDER BY displayName ASC;
        `;
        const [results] = await db.marketPlace.promise().query(query, [CustomerId]);
        return results;
    } catch (error) {
        console.error("Error fetching crops:", error);
        throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
    }
};

exports.addExcludeList = async (customerId, selectedCrops) => {
    try {
        // Prepare the query to insert each selected crop into the ExcludeList table
        const query = `
      INSERT INTO excludelist (userId, mpItemId)
      VALUES ?
    `;

        const values = selectedCrops.map((cropId) => [customerId, cropId]);
        console.log(values)

        // Execute the query
        await db.marketPlace.promise().query(query, [values]);

        return { message: "Exclude list updated successfully" };
    } catch (error) {
        console.error("Error adding exclude list:", error);
        throw new Error("Database error: " + error.message); // Throw error to be handled in the controller
    }
};

// exports.getExcludeList = async (customerId) => {
//   try {
//     // Correct query with parameterized customerId
// const query = `
//   SELECT 
//     el.id AS excludeId, 
//     el.userId, 
//     mpi.id AS marketplaceItemId, 
//     mpi.displayName, 
//     pc.image,
//     mps.cusId,
//     mps.firstName,
//     mps.lastName,
//      mps.title
//   FROM excludelist el
//   LEFT JOIN marketplaceitems mpi ON mpi.id = el.mpItemId 
//   LEFT JOIN plant_care.cropvariety pc ON pc.id = mpi.varietyId  
//   LEFT JOIN marketplaceusers mps ON mps.id = el.userId  
//   WHERE el.userId = ? 
//   ORDER BY mpi.displayName ASC; 
// `;
//     // Execute the query with customerId as a parameter
//     const [results] = await db.marketPlace.promise().query(query, [customerId]);

//     console.log("Exclude list for customer:", results);  // Log the results for debugging
//     return results;  // Return the exclude list data
//   } catch (error) {
//     console.error("Error fetching exclude list:", error);
//     throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
//   }
// };
exports.getExcludeList = async (customerId) => {
    console.log("cuuuuuuuuuuuu", customerId)
    try {
        // Correct query with parameterized customerId
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
        mps.title
      FROM marketplaceusers mps
      LEFT JOIN excludelist el ON el.userId = mps.id
      LEFT JOIN marketplaceitems mpi ON mpi.id = el.mpItemId 
      LEFT JOIN plant_care.cropvariety pc ON pc.id = mpi.varietyId  
      WHERE mps.id = ?  -- Filter by customerId
      ORDER BY mpi.displayName ASC; 
    `;
        // Execute the query with customerId as a parameter
        const [results] = await db.marketPlace.promise().query(query, [customerId]);

        console.log("Exclude list for customer:", results);  // Log the results for debugging
        return results;  // Return the exclude list data
    } catch (error) {
        console.error("Error fetching exclude list:", error);
        throw new Error("Database error: " + error.message);  // Throw the error to be handled in the controller
    }
};
exports.deleteExcludeItem = async (excludeId) => {
    console.log(excludeId)
    try {
        const query = `
      DELETE FROM excludelist 
      WHERE Id = ?
    `;
        await db.marketPlace.promise().query(query, [excludeId]);

        return { message: "Exclude list updated successfully" };
    } catch (error) {
        console.error("Error adding exclude list:", error);
        throw new Error("Database error: " + error.message); // Throw error to be handled in the controller
    }
};





