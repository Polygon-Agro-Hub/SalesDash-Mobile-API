const express = require('express');
const router = express.Router();

const customerEp = require('../end-point/customer-ep'); // Corrected import for endpoint

// POST route to add a new customer
router.post('/add-customer', customerEp.customerData);


router.get('/get-customers', customerEp.getCustomers);

router.get('/get-customer-data/:cusId', customerEp.getCustomerData);

router.put('/update-customer-data/:cusId', customerEp.updateCustomerData);

router.post("/check-customer", customerEp.checkCustomer);




module.exports = router;
