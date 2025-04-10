const asyncHandler = require("express-async-handler");
const customerDAO = require('../dao/customer-dao');
const ValidationSchema = require('..//Validations/customer-validation'); // Import the schema
const Joi = require('joi');

//Customer data endpoint
// exports.customerData = asyncHandler(async (req, res) => {
//     const customerData = req.body; // Extracting customer data from the request body
//     console.log(req.body)
//     try {
//         const result = await customerDAO.addCustomer(customerData);
//         res.status(200).json(result);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });

// exports.customerData = asyncHandler(async (req, res) => {
//     let customerData = req.body;  // Extracting customer data from the request body
//     console.log('---data -----', customerData)

//     try {
//         // Step 1: Validate phone number
//         const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(customerData.phoneNumber);
//         if (phoneNumberValidation.error) {
//             return res.status(400).json({ error: phoneNumberValidation.error.details[0].message });
//         }

//         // Step 2: Validate email
//         const emailValidation = ValidationSchema.emailSchema.validate(customerData.email);
//         if (emailValidation.error) {
//             return res.status(400).json({ error: emailValidation.error.details[0].message });
//         }

//         // Step 3: Proceed with adding the entire customer data to the database
//         const result = await customerDAO.addCustomer(customerData);  // Send full customer data to DAO
//         res.status(200).json({
//             status: "success",
//             message: "Customer added successfully",
//             customerId: result.customerId,
//         });

//     } catch (error) {
//         console.error("Error while adding customer:", error);
//         res.status(500).json({ error: error.message });
//     }
// });


// exports.customerData = asyncHandler(async (req, res) => {
//     console.log("Decoded user from token:", req.user); // You can access the decoded token here

//     if (!req.user || !req.user.id) {
//         return res.status(401).json({ error: "Unauthorized: No sales agent ID found" });
//     }

//     let customerData = req.body;
//     console.log('--- Received Data -----', customerData);

//     try {
//         const salesAgentId = req.user.id; // Extract sales agent ID from the decoded token

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

//         // Add customer with salesAgentId
//         const result = await customerDAO.addCustomer(customerData, salesAgentId);

//         res.status(200).json({
//             status: "success",
//             message: "Customer added successfully",
//             customerId: result.customerId,
//         });

//     } catch (error) {
//         console.error("Error while adding customer:", error);
//         res.status(500).json({ error: error.message });
//     }
// });

// exports.customerData = async (req, res) => {
//     console.log("Decoded user from token:", req.user); // Make sure user is decoded correctly

//     if (!req.user || !req.user.id) {
//         return res.status(401).json({ error: "Unauthorized: No sales agent ID found" });
//     }

//     let customerData = req.body;
//     console.log('--- Received Data -----', customerData);

//     try {
//         const salesAgentId = req.user.id;

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
//         const result = await customerDAO.addCustomer(customerData, salesAgentId);

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



// exports.customerData = asyncHandler(async (req, res) => {
//     const customerData = req.body;

//     // Validate the customer data using the Joi schema for adding
//     const { error } = addCustomer.validate(customerData, { abortEarly: false });
//     if (error) {
//         // If validation fails, return a 400 Bad Request response
//         return res.status(400).json({
//             error: error.details.map(err => err.message).join(', ')
//         });
//     }

//     console.log(req.body); // Log the valid customer data for debugging
//     try {
//         const result = await customerDAO.addCustomer(customerData);
//         res.status(200).json(result);
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });




exports.getCustomers = asyncHandler(async (req, res) => {
    try {
        const customers = await customerDAO.getAllCustomers();
        res.status(200).json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// In your customerEp.js
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







// Inside your updateCustomerData function
// exports.updateCustomerData = asyncHandler(async (req, res) => {
//     const { cusId } = req.params;  // Extracting cusId from the URL parameter
//     const customerData = req.body;  // Assuming the body directly contains the customerData
//     const buildingData = req.body;  // Assuming the body directly contains the buildingData

//     console.log("Request Body:", req.body); // Add this log to verify the structure

//     try {
//         // Ensure customerData and buildingData are correctly structured
//         const result = await customerDAO.updateCustomerData(cusId, customerData, buildingData);
//         res.status(200).json({ message: result });  // Send success response
//     } catch (error) {
//         res.status(500).json({ error: error.message });  // Handle error and send error response
//     }
// });



exports.updateCustomerData = asyncHandler(async (req, res) => {
    const { cusId } = req.params;  // Extracting cusId from the URL parameter
    const customerData = req.body;  // Assuming the body directly contains the customerData
    const buildingData = req.body;  // Assuming the body directly contains the buildingData

    console.log("Request Body:", req.body); // Add this log to verify the structure

    try {
        // Step 1: Validate phone number
        const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(customerData.phoneNumber);
        if (phoneNumberValidation.error) {
            return res.status(400).json({ error: phoneNumberValidation.error.details[0].message });
        }

        // Step 2: Validate email
        const emailValidation = ValidationSchema.emailSchema.validate(customerData.email);
        if (emailValidation.error) {
            return res.status(400).json({ error: emailValidation.error.details[0].message });
        }

        // Step 3: Ensure customerData and buildingData are correctly structured
        const result = await customerDAO.updateCustomerData(cusId, customerData, buildingData);

        // Send success response
        res.status(200).json({ message: "Customer data updated successfully", result });

    } catch (error) {
        console.error("Error while updating customer data:", error); // Log the error
        res.status(500).json({ error: error.message });  // Handle error and send error response
    }
});

exports.checkCustomer = (req, res) => {
    console.log("Check customer route hit.");
    const { phoneNumber, email } = req.body;

    customerDAO.findCustomerByPhoneOrEmail(phoneNumber, email)
        .then(existingCustomer => {
            console.log("Existing Customer:", existingCustomer);  // Debugging log
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


// exports.checkCustomer = (req, res) => {
//     console.log("Check customer route hit.");
//     const { phoneNumber, email } = req.body;

//     customerDAO.findCustomerByPhoneOrEmail(phoneNumber, email)
//         .then(existingCustomer => {
//             console.log("Existing Customer:", existingCustomer);  // Debugging log
//             if (existingCustomer) {
//                 return res.status(400).json({ message: "Phone number or email already exists. Please use a different one." });
//             }

//             res.status(200).json({ message: "Valid new customer." });
//         })
//         .catch(error => {
//             // console.error("Error checking customer:", error);
//             //     res.status(500).json({ message: "Something went wrong. Please try again." });
//         });
// };
























