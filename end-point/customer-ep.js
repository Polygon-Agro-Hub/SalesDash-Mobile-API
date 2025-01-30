const asyncHandler = require("express-async-handler");
const customerDAO = require('../dao/customer-dao');

// Customer data endpoint
exports.customerData = asyncHandler(async (req, res) => {
    const customerData = req.body; // Extracting customer data from the request body
    console.log(req.body)
    try {
        const result = await customerDAO.addCustomer(customerData);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


exports.getCustomers = asyncHandler(async (req, res) => {
    try {
        const customers = await customerDAO.getAllCustomers();
        res.status(200).json(customers);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

