const db = require('../startup/database');

exports.addCustomer = (customerData, salesAgent) => {
    return new Promise(async (resolve, reject) => {

        try {

            const newCustomerId = await generateCustomerId();


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
                salesAgent,
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
    const sqlGetLastCustomerId = `SELECT cusId FROM customer ORDER BY cusId DESC LIMIT 1`;
    const [result] = await db.dash.promise().query(sqlGetLastCustomerId);
    let newCustomerId = 'CUS-1001';
    if (result.length > 0 && result[0].cusId) {
        const lastNumber = parseInt(result[0].cusId.split('-')[1], 10);
        newCustomerId = `CUS-${lastNumber + 1}`;
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
    await db.dash.promise().query(insertQuery, queryParams);
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

exports.getCustomersBySalesAgent = (salesAgentId) => {
    console.log(salesAgentId)
    return new Promise((resolve, reject) => {
        const sqlQuery = `SELECT * FROM customer WHERE salesAgent = ?`;

        db.dash.promise().query(sqlQuery, [salesAgentId])
            .then(([rows]) => resolve(rows))
            .catch(error => reject(error));
    });
};


// Function to get customer data along with related building data (House or Apartment)
exports.getCustomerData = async (cusId) => {
    return new Promise((resolve, reject) => {

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


exports.updateCustomerData = async (cusId, customerData, buildingData) => {
    let connection;

    try {
        // Get a connection from the pool
        connection = await db.dash.promise().getConnection();

        // Start transaction
        await connection.beginTransaction();

        // Check if customer exists
        const getCustomerIdQuery = `SELECT id, phoneNumber, email, buildingType FROM customer WHERE id = ?`;
        const [customerResult] = await connection.query(getCustomerIdQuery, [cusId]);

        console.log("Customer ID query result:", customerResult);

        if (customerResult.length === 0) {
            throw new Error('Customer not found');
        }

        const customerId = customerResult[0].id;
        const existingPhoneNumber = customerResult[0].phoneNumber;
        const existingEmail = customerResult[0].email;
        const existingBuildingType = customerResult[0].buildingType;
        console.log("Using customerId:", customerId);

        // Check for duplicate phone number
        if (customerData.phoneNumber !== existingPhoneNumber) {
            const checkPhoneQuery = `SELECT id FROM customer WHERE phoneNumber = ? AND id != ?`;
            const [phoneResult] = await connection.query(checkPhoneQuery, [customerData.phoneNumber, customerId]);

            if (phoneResult.length > 0) {
                throw new Error('Phone number already exists.');
            }
        }

        // Check for duplicate email
        if (customerData.email !== existingEmail) {
            const checkEmailQuery = `SELECT id FROM customer WHERE email = ? AND id != ?`;
            const [emailResult] = await connection.query(checkEmailQuery, [customerData.email, customerId]);

            if (emailResult.length > 0) {
                throw new Error('Email already exists.');
            }
        }

        // Update customer
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



exports.findCustomerByPhoneOrEmail = (phoneNumber, email) => {
    return new Promise((resolve, reject) => {
        const sqlQuery = `
            SELECT * FROM customer 
            WHERE phoneNumber = ? OR email = ?`;

        db.dash.promise().query(sqlQuery, [phoneNumber, email])
            .then(([rows]) => {
                if (rows.length > 0) {
                    resolve(rows[0]);
                } else {
                    resolve(null);
                }
            })
            .catch(error => {
                console.error("Error finding customer:", error);
                reject(error);
            });
    });
};

exports.getCustomerCountBySalesAgent = async () => {
    try {
        const connection = await db.dash.promise().getConnection();
        try {
            const [rows] = await connection.query(`
        SELECT salesAgent, COUNT(*) AS customerCount
        FROM customer
        GROUP BY salesAgent
      `);
            return rows;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in getCustomerCountBySalesAgent:', error);
        throw new Error(`Failed to get customer count: ${error.message}`);
    }
};











