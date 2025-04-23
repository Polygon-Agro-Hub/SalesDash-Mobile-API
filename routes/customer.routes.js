const express = require('express');
const router = express.Router();

const customerEp = require('../end-point/customer-ep');
const auth = require('../Middlewares/auth.middleware');


router.post('/add-customer', auth, customerEp.customerData);


router.get('/get-customers', customerEp.getCustomers);

router.get('/get-customer-data/:cusId', customerEp.getCustomerData);

router.put('/update-customer-data/:cusId', customerEp.updateCustomerData);

router.post("/check-customer", customerEp.checkCustomer);

router.get('/cutomer-count', auth, customerEp.getCustomerCountBySalesAgent);




module.exports = router;
