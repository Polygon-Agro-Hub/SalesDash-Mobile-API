const express = require('express');
const router = express.Router();

const orderEp = require('../end-point/order-ep');
const auth = require('../Middlewares/auth.middleware')

router.post('/create-order',auth ,orderEp.createOrder)
router.get('/get-orders',orderEp.getAllOrderDetails)
router.get('/get-order/:orderId',orderEp.getOrderById)


module.exports = router;