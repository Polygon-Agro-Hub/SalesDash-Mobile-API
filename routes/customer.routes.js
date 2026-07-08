const express = require('express');
const router = express.Router();
const customerEp = require('../end-point/customer-ep');
const auth = require('../middleware/auth.middleware');

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

router.post('/add/preferlist', customerEp.addPreList)

router.get('/excludelist', customerEp.getCustomerExludelist)

router.get('/preferlist', customerEp.getCustomerPreferlist)

router.delete('/excludelist/delete', customerEp.deleteExcludeItem)

router.delete('/preferlist/delete', customerEp.deletePreferItem)

router.get('/customerData/:customerId', auth, customerEp.getCustomerDataLocation);

router.get('/check-delivered-order/:customerId', customerEp.checkDeliveredOrder);

router.put('/update-residential-address/:cusId', customerEp.updateResidentialAddress);

router.get('/get-address-book/:customerId', customerEp.getAddressBook);

router.get('/get-saved-address/:addressId', customerEp.getSavedAddress);
router.post('/add-saved-address', customerEp.addSavedAddress);
router.put('/update-saved-address/:addressId', customerEp.updateSavedAddress);

module.exports = router;
