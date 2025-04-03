const express = require('express');
const router = express.Router();

const orderEp = require('../end-point/order-ep');
const auth = require('../Middlewares/auth.middleware')

router.post('/create-order', auth, orderEp.createOrder)
router.get('/get-orders', orderEp.getAllOrderDetails)
router.get('/get-order/:orderId', orderEp.getOrderById)
router.get('/get-order-bycustomerId/:id', orderEp.getOrderByCustomerId)
router.get('/get-customer-data/:id', orderEp.getCustomerDetailsCustomerId)


module.exports = router;