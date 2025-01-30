const db = require('../startup/database'); // Assuming db connection

// Function to insert customer into the database with a custom customerId pattern
exports.addCustomer = (customerData) => {
    return new Promise((resolve, reject) => {
        db.dash.beginTransaction(async (err) => {
            if (err) return reject(new Error('Transaction start failed'));

            try {
                // Generate custom customer ID
                const newCustomerId = await generateCustomerId();

                // Insert into customer table
                const sqlCustomer = `INSERT INTO customer (cusId, firstName, lastName, phoneNumber, email, title, buildingType) VALUES (?, ?, ?, ?, ?, ?, ?)`;
                const [customerResult] = await db.dash.promise().query(sqlCustomer, [
                    newCustomerId,
                    customerData.firstName,
                    customerData.lastName,
                    customerData.phoneNumber,
                    customerData.email,
                    customerData.title,
                    customerData.buildingType,
                ]);

                const customerId = customerResult.insertId;
                await insertBuildingData(customerId, customerData);

                await db.dash.promise().commit();
                resolve({ success: true, customerId });
            } catch (error) {
                await db.dash.promise().rollback();
                reject(error);
            }
        });
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
        ];
    } else {
        throw new Error('Invalid building type');
    }
    await db.dash.promise().query(insertQuery, queryParams);
};


// Function to retrieve all customers from the database
exports.getAllCustomers = () => {
    return new Promise((resolve, reject) => {
        const sqlQuery = `SELECT * FROM customer`;

        db.dash.promise().query(sqlQuery)
            .then(([rows]) => resolve(rows))
            .catch(error => reject(error));
    });
};
