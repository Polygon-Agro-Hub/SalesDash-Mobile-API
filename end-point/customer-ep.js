const asyncHandler = require("express-async-handler");
const customerDAO = require('../dao/customer-dao');
const ValidationSchema = require('..//Validations/customer-validation'); // Import the schema
const Joi = require('joi');


exports.customerData = async (req, res) => {
    console.log("Decoded user from token:", req.user);

    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "Unauthorized: No sales agent ID found" });
    }

    const customerData = req.body;
    console.log('--- Received Data -----', customerData);

    try {
        const salesAgent = req.user.id;

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

        // Add customer
        const result = await customerDAO.addCustomer(customerData, salesAgent);

        res.status(200).json({
            status: "success",
            message: "Customer added successfully",
            customerId: result.customerId,
        });

    } catch (error) {
        console.error("Error while adding customer:", error);
        res.status(500).json({ error: error.message });
    }
};


exports.getCustomers = asyncHandler(async (req, res) => {
    try {
        const customers = await customerDAO.getAllCustomers();
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
        const result = await customerDAO.getCustomerCountBySalesAgent();

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





















