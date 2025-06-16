const asyncHandler = require("express-async-handler");
const customerDAO = require('../dao/customer-dao');
const ValidationSchema = require('..//Validations/customer-validation'); // Import the schema
const Joi = require('joi');


// exports.customerData = async (req, res) => {
//     console.log("Decoded user from token:", req.user);

//     if (!req.user || !req.user.id) {
//         return res.status(401).json({ error: "Unauthorized: No sales agent ID found" });
//     }

//     const customerData = req.body;
//     console.log('--- Received Data -----', customerData);

//     try {
//         const salesAgent = req.user.id;

//         // Validate phone number
//         const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(customerData.phoneNumber);
//         if (phoneNumberValidation.error) {
//             return res.status(400).json({ error: phoneNumberValidation.error.details[0].message });
//         }

//         // Validate email
//         const emailValidation = ValidationSchema.emailSchema.validate(customerData.email);
//         if (emailValidation.error) {
//             return res.status(400).json({ error: emailValidation.error.details[0].message });
//         }

//         // Add customer
//         const result = await customerDAO.addCustomer(customerData, salesAgent);

//         res.status(200).json({
//             status: "success",
//             message: "Customer added successfully",
//             customerId: result.customerId,
//         });

//     } catch (error) {
//         console.error("Error while adding customer:", error);
//         res.status(500).json({ error: error.message });
//     }
// };


exports.customerData = async (req, res) => {
    console.log("Decoded user from token:", req.user);

    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Unauthorized: No sales agent ID found" });
    }

    const customerData = req.body;
    console.log('--- Received Data -----', customerData);

    try {
        const salesAgent = req.user.id;

        // Check if customer already exists
        console.log('--- Checking if customer exists -----');
        const existingCustomer = await customerDAO.findCustomerByPhoneOrEmail(customerData.phoneNumber, customerData.email);
        if (existingCustomer) {
            return res.status(400).json({
                error: "Customer already exists with this phone number or email",
                existingCustomer: {
                    cusId: existingCustomer.cusId,
                    firstName: existingCustomer.firstName,
                    lastName: existingCustomer.lastName,
                    email: existingCustomer.email,
                    phoneNumber: existingCustomer.phoneCode + existingCustomer.phoneNumber
                }
            });
        }



        const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(customerData.phoneNumber);
        if (phoneNumberValidation.error) {
            console.log('Phone validation error:', phoneNumberValidation.error.details[0].message);
            return res.status(400).json({ error: phoneNumberValidation.error.details[0].message });
        }

        // Validate email

        const emailValidation = ValidationSchema.emailSchema.validate(customerData.email);
        if (emailValidation.error) {
            console.log('Email validation error:', emailValidation.error.details[0].message);
            return res.status(400).json({ error: emailValidation.error.details[0].message });
        }

        // Validate basic required fields

        if (!customerData.firstName || customerData.firstName.trim() === '') {
            return res.status(400).json({ error: "First name is required" });
        }
        if (!customerData.lastName || customerData.lastName.trim() === '') {
            return res.status(400).json({ error: "Last name is required" });
        }

        // Validate building type
        console.log('--- buildingtype -----', customerData.buildingType);
        if (!customerData.buildingType) {
            return res.status(400).json({ error: "Building type is required" });
        }

        if (!['House', 'Apartment'].includes(customerData.buildingType)) {
            return res.status(400).json({ error: "Invalid building type. Must be either 'House' or 'Apartment'" });
        }


        if (customerData.buildingType === 'House') {
            console.log('Validating house data...');
            const houseData = {
                houseNo: customerData.houseNo,
                streetName: customerData.streetName,
                city: customerData.city
            };
            const houseValidation = ValidationSchema.houseSchema.validate(houseData);
            if (houseValidation.error) {
                console.log('House validation error:', houseValidation.error.details[0].message);
                return res.status(400).json({ error: houseValidation.error.details[0].message });
            }
        } else if (customerData.buildingType === 'Apartment') {
            console.log('Validating apartment data...');
            const apartmentData = {
                buildingNo: customerData.buildingNo,
                buildingName: customerData.buildingName,
                unitNo: customerData.unitNo,
                floorNo: customerData.floorNo,
                houseNo: customerData.houseNo,
                streetName: customerData.streetName,
                city: customerData.city
            };
            const apartmentValidation = ValidationSchema.apartmentSchema.validate(apartmentData);
            if (apartmentValidation.error) {
                console.log('Apartment validation error:', apartmentValidation.error.details[0].message);
                return res.status(400).json({ error: apartmentValidation.error.details[0].message });
            }
        }

        // Add customer
        const result = await customerDAO.addCustomer(customerData, salesAgent);

        res.status(200).json({
            status: "success",
            message: "Customer added successfully",
            customerId: result.customerId,
        });

    } catch (error) {
        console.error("Error while adding customer:", error);

        // Handle specific database errors
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                error: "Customer already exists with this information"
            });
        }

        // Handle validation errors
        if (error.message && error.message.includes('validation')) {
            return res.status(400).json({ error: error.message });
        }

        // Generic error response
        res.status(500).json({
            error: "An error occurred while adding the customer",
            details: error.message
        });
    }
};

// exports.getCustomers = asyncHandler(async (req, res) => {

//     const saId = req.user.id;

//     console.log("", saId)
//     try {

//         const customers = await customerDAO.getAllCustomers();
//         res.status(200).json(customers);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

exports.getCustomers = asyncHandler(async (req, res) => {
    try {
        // Get the sales agent ID from the decoded token
        const salesAgentId = req.user.id;

        console.log("id", salesAgentId)

        // Get only customers assigned to this sales agent
        const customers = await customerDAO.getCustomersBySalesAgent(salesAgentId);

        //console.log("customers", customers)

        res.status(200).json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


exports.getCustomerData = asyncHandler(async (req, res) => {
    const { cusId } = req.params;  // Extract cusId from the URL params
    console.log("Requested cusId: ", cusId);  // For debugging

    try {
        const result = await customerDAO.getCustomerData(cusId);
        res.status(200).json(result);  // Return combined customer and building data
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});





exports.updateCustomerData = asyncHandler(async (req, res) => {
    const { cusId } = req.params;
    console.log("Request Body:", req.body);

    // Initialize variables
    let customerData;
    let buildingData;

    // Detect request format and extract data accordingly
    if (req.body.customerData) {
        // Format: { customerData: {...}, buildingData: {...} }
        customerData = req.body.customerData;
        buildingData = req.body.buildingData;
    } else {
        // Format: { title: '...', firstName: '...', buildingData: {...} }
        customerData = {
            title: req.body.title,
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            phoneNumber: req.body.phoneNumber,
            email: req.body.email,
            buildingType: req.body.buildingType
        };
        buildingData = req.body.buildingData;
    }

    console.log("Customer Data (extracted):", customerData);
    console.log("Building Data (extracted):", buildingData);

    try {
        // Validate the customer data exists
        if (!customerData || !customerData.phoneNumber || !customerData.email) {
            return res.status(400).json({ error: "Customer data is incomplete" });
        }

        // Validate phone number
        const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(customerData.phoneNumber);
        if (phoneNumberValidation.error) {
            return res.status(400).json({ error: phoneNumberValidation.error.details[0].message });
        }

        // Validate email
        const emailValidation = ValidationSchema.emailSchema.validate(customerData.email);
        if (emailValidation.error) {
            return res.status(400).json({ error: emailValidation.error.details[0].message });
        }

        // Update customer data through DAO
        const result = await customerDAO.updateCustomerData(cusId, customerData, buildingData);

        // Send success response
        res.status(200).json({ message: "Customer data updated successfully", result });

    } catch (error) {
        console.error("Error while updating customer data:", error);
        res.status(500).json({ error: error.message });
    }
});

exports.checkCustomer = (req, res) => {
    console.log("Check customer route hit.");
    const { phoneNumber, email } = req.body;

    customerDAO.findCustomerByPhoneOrEmail(phoneNumber, email)
        .then(existingCustomer => {
            console.log("Existing Customer:", existingCustomer);
            if (existingCustomer) {
                return res.status(400).json({ message: "Phone number or email already exists." });
            }

            res.status(200).json({ message: "Valid new customer." });
        })
        .catch(error => {
            console.error("Error checking customer:", error);
            res.status(500).json({ message: "Internal server error" });
        });
};


exports.getCustomerCountBySalesAgent = async (req, res) => {
    try {

        const salesAgentId = req.user.id
        const result = await customerDAO.getCustomerCountBySalesAgent(salesAgentId);

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error in getCustomerCountBySalesAgent:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch order count by sales agent',
            error: error.message
        });
    }
};



exports.getAllPCity = asyncHandler(async (req, res) => {
    console.log("hitt")
    try {
        const packages = await customerDAO.getAllCity();

        if (!packages || packages.length === 0) {
            return res.status(404).json({ message: "No City found" });
        }

        res.status(200).json({ message: "City fetched successfully", data: packages });
    } catch (error) {
        console.error("Error fetching city:", error);
        res.status(500).json({ message: "Failed to fetch city" });
    }
});





















