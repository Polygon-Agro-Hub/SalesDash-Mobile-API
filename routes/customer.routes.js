const express = require('express');
const router = express.Router();

const customerEp = require('../end-point/customer-ep');
const auth = require('../Middlewares/auth.middleware');


router.post('/add-customer', auth, customerEp.customerData);


router.get('/get-customers', auth, customerEp.getCustomers);

router.get('/get-customer-data/:cusId', customerEp.getCustomerData);

router.get('/get-customer-excludelist/:customerId', customerEp.getCusDataExc);

router.put('/update-customer-data/:cusId', customerEp.updateCustomerData);

router.post("/check-customer", customerEp.checkCustomer);

router.get('/cutomer-count', auth, customerEp.getCustomerCountBySalesAgent);


router.get("/get-city", auth, customerEp.getAllPCity);

router.get('/croplist', auth, customerEp.getAllCrops);
router.post('/add/excludelist', customerEp.addExcludeList)
router.get('/excludelist', customerEp.getCustomerExludelist)

router.delete('/excludelist/delete', customerEp.deleteExcludeItem)
module.exports = router;
