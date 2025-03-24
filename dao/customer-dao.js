const db = require('../startup/database'); // Assuming db connection

exports.addCustomer = (customerData, salesAgent) => {
    return new Promise(async (resolve, reject) => {

        try {
            // Generate customer ID
            const newCustomerId = await generateCustomerId();

            // Insert into `customer` table
            const sqlCustomer = `INSERT INTO customer (cusId, firstName, lastName, phoneNumber, email, title, buildingType, salesAgent) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;



            db.dash.query(sqlCustomer, [
                newCustomerId,
                customerData.firstName,
                customerData.lastName,
                customerData.phoneNumber,
                customerData.email,
                customerData.title,
                customerData.buildingType,
                salesAgent,  // Ensure this is the correct variable
            ], (err, customerResult) => {
                if (err) {
                    return reject(err);  // Reject promise if error occurs
                }

                const customerId = customerResult.insertId;

                // Insert building data (assuming this function exists)
                insertBuildingData(customerId, customerData)
                    .then(() => {
                        resolve({ success: true, customerId });  // Resolve promise if everything is successful
                    })
                    .catch((buildingError) => {
                        reject(buildingError);  // Reject if there's an error in inserting building data
                    });
            });

        } catch (error) {
            reject(error);  // Reject if there's an error in the try block
        }
    });
};

// Function to generate a custom customer ID
const generateCustomerId = async () => {
    const sqlGetLastCustomerId = `SELECT cusId FROM customer ORDER BY cusId DESC LIMIT 1`;
    const [result] = await db.dash.promise().query(sqlGetLastCustomerId);
    let newCustomerId = 'CUS-1001';
    if (result.length > 0 && result[0].cusId) {
        const lastNumber = parseInt(result[0].cusId.split('-')[1], 10);
        newCustomerId = `CUS-${lastNumber + 1}`;
    }
    return newCustomerId;
};


// Function to insert building-related data
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
            customerData.city,
            salesAgent,
        ];
    } else {
        throw new Error('Invalid building type');
    }
    await db.dash.promise().query(insertQuery, queryParams);
};


// exports.addCustomer = (customerData, salesAgentId) => {
//     return new Promise(async (resolve, reject) => {
//         try {
//             // Generate customer ID
//             const newCustomerId = await generateCustomerId();

//             // Insert into `customer` table
//             const sqlCustomer = `INSERT INTO customer (cusId, firstName, lastName, phoneNumber, email, title, buildingType, salesAgentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`;

//             db.dash.query(sqlCustomer, [
//                 newCustomerId,
//                 customerData.firstName,
//                 customerData.lastName,
//                 customerData.phoneNumber,
//                 customerData.email,
//                 customerData.title,
//                 customerData.buildingType,
//                 salesAgentId, // Pass the sales agent ID
//             ], (err, customerResult) => {
//                 if (err) {
//                     console.error('Error inserting customer:', err);  // Log error if insertion fails
//                     return reject(err);
//                 }

//                 console.log('Customer inserted, ID:', customerResult.insertId);  // Log the inserted ID

//                 const customerId = customerResult.insertId;

//                 // Insert building data
//                 insertBuildingData(customerId, customerData)
//                     .then(() => {
//                         resolve({ success: true, customerId });
//                     })
//                     .catch((buildingError) => {
//                         console.error('Error inserting building data:', buildingError);  // Log any error with building data
//                         reject(buildingError);
//                     });
//             });

//         } catch (error) {
//             console.error('Error while adding customer:', error);  // Log error if the whole process fails
//             reject(error);
//         }
//     });
// };


// Function to retrieve all customers from the database
exports.getAllCustomers = () => {
    return new Promise((resolve, reject) => {
        const sqlQuery = `SELECT * FROM customer`;

        db.dash.promise().query(sqlQuery)
            .then(([rows]) => resolve(rows))
            .catch(error => reject(error));
    });
};

// Function to get customer data along with related building data (House or Apartment)
exports.getCustomerData = async (cusId) => {
    return new Promise((resolve, reject) => {
        // First, get the customer details based on cusId
        const sqlCustomerQuery = `SELECT * FROM customer WHERE id = ?`;

        db.dash.promise().query(sqlCustomerQuery, [cusId])
            .then(async ([customerRows]) => {
                console.log("Customer Rows: ", customerRows); // Log the result of the query

                if (customerRows.length === 0) {
                    return reject(new Error('Customer not found'));
                }

                const customerData = customerRows[0];
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
                const [buildingData] = await db.dash.promise().query(buildingDataQuery, buildingDataParams);

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





// exports.updateCustomerData = async (cusId, customerData, buildingData) => {
//     return new Promise((resolve, reject) => {
//         // Start a transaction
//         db.dash.promise().beginTransaction()
//             .then(async () => {
//                 try {
//                     // Get the customer ID from cusId to update related building tables
//                     const getCustomerIdQuery = `SELECT id FROM customer WHERE id = ?`;
//                     const [customerResult] = await db.dash.promise().query(getCustomerIdQuery, [cusId]);

//                     console.log("Customer ID query result:", customerResult);

//                     if (customerResult.length === 0) {
//                         throw new Error('Customer not found');
//                     }

//                     const customerId = customerResult[0].id;  // Use the retrieved customerId here
//                     console.log("Using customerId:", customerId);

//                     // Update the customer data
//                     const updateCustomerQuery = `
//                         UPDATE customer 
//                         SET title = ?, firstName = ?, lastName = ?, phoneNumber = ?, email = ?, buildingType = ? 
//                         WHERE id = ?`;

//                     const customerParams = [
//                         customerData.title,
//                         customerData.firstName,
//                         customerData.lastName,
//                         customerData.phoneNumber,
//                         customerData.email,
//                         customerData.buildingType,
//                         cusId  // This is the original customer ID from URL params
//                     ];

//                     await db.dash.promise().query(updateCustomerQuery, customerParams);
//                     console.log("Customer data updated.");

//                     let updateBuildingQuery = '';
//                     let buildingParams = [];

//                     // Update the corresponding building data (house or apartment)
//                     if (customerData.buildingType === 'House') {
//                         updateBuildingQuery = `
//                             UPDATE house 
//                             SET houseNo = ?, streetName = ?, city = ? 
//                             WHERE customerId = ?`;
//                         buildingParams = [
//                             buildingData.houseNo,
//                             buildingData.streetName,
//                             buildingData.city,
//                             customerId // Use the customerId fetched from the customer query
//                         ];
//                         console.log("House data updated.");
//                     } else if (customerData.buildingType === 'Apartment') {
//                         updateBuildingQuery = `
//                             UPDATE apartment 
//                             SET buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?, houseNo = ?, streetName = ?, city = ? 
//                             WHERE customerId = ?`;
//                         buildingParams = [
//                             buildingData.buildingNo,
//                             buildingData.buildingName,
//                             buildingData.unitNo,
//                             buildingData.floorNo,
//                             buildingData.houseNo,
//                             buildingData.streetName,
//                             buildingData.city,
//                             customerId // Use the customerId fetched from the customer query
//                         ];
//                         console.log("Apartment data updated.");
//                     } else {
//                         // If the building type is invalid, reject the transaction
//                         throw new Error('Invalid building type');
//                     }

//                     // Update building data (house or apartment)
//                     await db.dash.promise().query(updateBuildingQuery, buildingParams);
//                     console.log("Building data updated.");

//                     // Commit the transaction after both updates succeed
//                     await db.dash.promise().commit();
//                     resolve("Customer and building data updated successfully.");
//                 } catch (error) {
//                     // If any error occurs, rollback the transaction
//                     await db.dash.promise().rollback();
//                     console.error("Error during update: ", error);
//                     reject(error);
//                 }
//             })
//             .catch(async (error) => {
//                 // Handle any error during the transaction start
//                 await db.dash.promise().rollback();
//                 console.error("Transaction failed: ", error);
//                 reject(error);
//             });
//     });
// };


exports.updateCustomerData = async (cusId, customerData, buildingData) => {
    return new Promise((resolve, reject) => {
        // Start a transaction
        db.dash.promise().beginTransaction()
            .then(async () => {
                try {
                    // Get the customer ID from cusId to update related building tables
                    const getCustomerIdQuery = `SELECT id, phoneNumber, email FROM customer WHERE id = ?`;
                    const [customerResult] = await db.dash.promise().query(getCustomerIdQuery, [cusId]);

                    console.log("Customer ID query result:", customerResult);

                    if (customerResult.length === 0) {
                        throw new Error('Customer not found');
                    }

                    const customerId = customerResult[0].id;  // Use the retrieved customerId here
                    const existingPhoneNumber = customerResult[0].phoneNumber;  // Get the existing phone number
                    const existingEmail = customerResult[0].email;  // Get the existing email for validation
                    console.log("Using customerId:", customerId);

                    // Check for duplicate phone number (but allow duplicate emails)
                    if (customerData.phoneNumber !== existingPhoneNumber) {
                        const checkPhoneQuery = `SELECT id FROM customer WHERE phoneNumber = ?`;
                        const [phoneResult] = await db.dash.promise().query(checkPhoneQuery, [customerData.phoneNumber]);

                        if (phoneResult.length > 0) {
                            throw new Error('Phone number already exists.');
                        }
                    }

                    // Check for duplicate email (but allow same email for the same customer)
                    if (customerData.email !== existingEmail) {
                        const checkEmailQuery = `SELECT id FROM customer WHERE email = ?`;
                        const [emailResult] = await db.dash.promise().query(checkEmailQuery, [customerData.email]);

                        if (emailResult.length > 0) {
                            throw new Error('Email already exists.');
                        }
                    }

                    // Update the customer data
                    const updateCustomerQuery = `
                        UPDATE customer 
                        SET title = ?, firstName = ?, lastName = ?, phoneNumber = ?, email = ?, buildingType = ? 
                        WHERE id = ?`;

                    const customerParams = [
                        customerData.title,
                        customerData.firstName,
                        customerData.lastName,
                        customerData.phoneNumber,
                        customerData.email,
                        customerData.buildingType,
                        cusId  // This is the original customer ID from URL params
                    ];

                    await db.dash.promise().query(updateCustomerQuery, customerParams);
                    console.log("Customer data updated.");

                    let updateBuildingQuery = '';
                    let buildingParams = [];

                    // Update the corresponding building data (house or apartment)
                    if (customerData.buildingType === 'House') {
                        updateBuildingQuery = `
                            UPDATE house 
                            SET houseNo = ?, streetName = ?, city = ? 
                            WHERE customerId = ?`;
                        buildingParams = [
                            buildingData.houseNo,
                            buildingData.streetName,
                            buildingData.city,
                            customerId // Use the customerId fetched from the customer query
                        ];
                        console.log("House data updated.");
                    } else if (customerData.buildingType === 'Apartment') {
                        updateBuildingQuery = `
                            UPDATE apartment 
                            SET buildingNo = ?, buildingName = ?, unitNo = ?, floorNo = ?, houseNo = ?, streetName = ?, city = ? 
                            WHERE customerId = ?`;
                        buildingParams = [
                            buildingData.buildingNo,
                            buildingData.buildingName,
                            buildingData.unitNo,
                            buildingData.floorNo,
                            buildingData.houseNo,
                            buildingData.streetName,
                            buildingData.city,
                            customerId // Use the customerId fetched from the customer query
                        ];
                        console.log("Apartment data updated.");
                    } else {
                        // If the building type is invalid, reject the transaction
                        throw new Error('Invalid building type');
                    }

                    // Update building data (house or apartment)
                    await db.dash.promise().query(updateBuildingQuery, buildingParams);
                    console.log("Building data updated.");

                    // Commit the transaction after both updates succeed
                    await db.dash.promise().commit();
                    resolve("Customer and building data updated successfully.");
                } catch (error) {
                    // If any error occurs, rollback the transaction
                    await db.dash.promise().rollback();
                    console.error("Error during update: ", error);
                    reject(error);
                }
            })
            .catch(async (error) => {
                // Handle any error during the transaction start
                await db.dash.promise().rollback();
                console.error("Transaction failed: ", error);
                reject(error);
            });
    });
};





exports.findCustomerByPhoneOrEmail = (phoneNumber, email) => {
    return new Promise((resolve, reject) => {
        const sqlQuery = `
            SELECT * FROM customer 
            WHERE phoneNumber = ? OR email = ?`;

        db.dash.promise().query(sqlQuery, [phoneNumber, email])
            .then(([rows]) => {
                if (rows.length > 0) {
                    resolve(rows[0]);  // Resolving with the first customer found (if any)
                } else {
                    resolve(null);  // No customer found, resolve with null
                }
            })
            .catch(error => {
                console.error("Error finding customer:", error);
                reject(error);
            });
    });
};









