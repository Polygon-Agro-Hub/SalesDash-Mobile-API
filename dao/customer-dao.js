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
// const generateCustomerId = async () => {
//     const sqlGetLastCustomerId = `SELECT cusId FROM customer ORDER BY cusId DESC LIMIT 1`;
//     const [result] = await db.dash.promise().query(sqlGetLastCustomerId);
//     let newCustomerId = 'CUS-1001';
//     if (result.length > 0 && result[0].cusId) {
//         const lastNumber = parseInt(result[0].cusId.split('-')[1], 10);
//         newCustomerId = `CUS-${lastNumber + 1}`;
//     }
//     return newCustomerId;
// };

const generateCustomerId = async () => {
    const sqlGetLastCustomerId = `SELECT cusId FROM marketplaceusers ORDER BY cusId DESC LIMIT 1`;
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

exports.getCustomersBySalesAgent = (salesAgentId) => {
    console.log(`Getting customers for sales agent ID: ${salesAgentId}`);

    return new Promise((resolve, reject) => {
        const sqlQuery = `
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
            GROUP BY c.id
            ORDER BY c.id
        `;

        // Use marketPlace directly or db.marketPlace if you updated the config
        db.marketPlace.promise().query(sqlQuery, [salesAgentId])
            .then(([rows]) => {
                console.log(`Found ${rows.length} customers for sales agent ${salesAgentId}`);

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

                console.log('Processed query result:', processedRows);
                resolve(processedRows);
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

        // Check for duplicate phone number (compare both phoneCode and phoneNumber)
        if (phoneCode !== existingPhoneCode || phoneNumber !== existingPhoneNumber) {
            const checkPhoneQuery = `SELECT id FROM marketplaceusers WHERE phoneCode = ? AND phoneNumber = ? AND id != ?`;
            const [phoneResult] = await connection.query(checkPhoneQuery, [phoneCode, phoneNumber, customerId]);

            if (phoneResult.length > 0) {
                throw new Error('Phone number already exists.');
            }
        }

        // Check for duplicate email
        if (customerData.email !== existingEmail) {
            const checkEmailQuery = `SELECT id FROM marketplaceusers WHERE email = ? AND id != ?`;
            const [emailResult] = await connection.query(checkEmailQuery, [customerData.email, customerId]);

            if (emailResult.length > 0) {
                throw new Error('Email already exists.');
            }
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
            customerData.email,
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
                    buildingData.houseNo || '',  // Default to empty string if undefined
                    buildingData.streetName || '',  // Default to empty string if undefined
                    buildingData.city || ''  // Default to empty string if undefined
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
                console.log("House exists check result:", houseExists); // Check the existing house data

                if (houseExists.length > 0) {
                    const updateHouseQuery = `
                        UPDATE house 
                        SET houseNo = ?, streetName = ?, city = ? 
                        WHERE customerId = ?`;

                    const updateParams = [
                        buildingData.houseNo || '',  // Default to empty string if undefined
                        buildingData.streetName || '',  // Default to empty string if undefined
                        buildingData.city || '',  // Default to empty string if undefined
                        customerId
                    ];
                    console.log("House update parameters:", updateParams);

                    const [updateResult] = await connection.query(updateHouseQuery, updateParams);
                    console.log("House update result:", updateResult);

                    const [verifyUpdate] = await connection.query('SELECT * FROM house WHERE customerId = ?', [customerId]);
                    console.log("After update - house data:", verifyUpdate);

                    if (updateResult.affectedRows === 0) {
                        console.warn("Warning: House update query did not update any rows!");
                    } else {
                        console.log(`House update successful, affected rows: ${updateResult.affectedRows}`);
                    }
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


exports.findCustomerByPhoneOrEmail = async (phoneNumber, email) => {
    try {
        // Parse the incoming phone number to extract phone code and number
        let phoneCodeToCheck = '';
        let phoneNumberToCheck = '';

        if (phoneNumber) {
            const fullPhone = phoneNumber.toString();

            // Check if phone number starts with +94 (Sri Lanka)
            if (fullPhone.startsWith('+94')) {
                phoneCodeToCheck = '+94';
                phoneNumberToCheck = fullPhone.substring(3); // Remove +94
            }
            // Check if phone number starts with 94 (without +)
            else if (fullPhone.startsWith('94') && fullPhone.length > 9) {
                phoneCodeToCheck = '+94';
                phoneNumberToCheck = fullPhone.substring(2); // Remove 94
            }
            // Check if phone number starts with 0 (local format)
            else if (fullPhone.startsWith('0')) {
                phoneCodeToCheck = '+94';
                phoneNumberToCheck = fullPhone.substring(1); // Remove leading 0
            }
            // Default case - assume it's already in correct format
            else {
                phoneCodeToCheck = '+94'; // Default to Sri Lanka
                phoneNumberToCheck = fullPhone;
            }

            // Clean up phone number (remove any spaces, dashes, etc.)
            phoneNumberToCheck = phoneNumberToCheck.replace(/[\s\-\(\)]/g, '');
        }

        const sqlQuery = `
            SELECT * FROM marketplaceusers 
            WHERE (phoneCode = ? AND phoneNumber = ?) OR email = ?`;

        const [rows] = await db.marketPlace.promise().query(sqlQuery, [phoneCodeToCheck, phoneNumberToCheck, email]);

        return rows.length > 0 ? rows[0] : null;
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











