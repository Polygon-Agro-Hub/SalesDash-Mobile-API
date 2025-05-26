const express = require('express');
const router = express.Router();
const notificationEp = require('../end-point/notification-ep');
const auth = require('../Middlewares/auth.middleware');


router.get('/', auth, notificationEp.getNotifications);

router.patch('/mark-read/:id', auth, notificationEp.markAsReadByOrderId);

router.delete('/:id', notificationEp.deleteByOrderId);

router.post('/payment-reminders', auth, notificationEp.createPaymentReminders);


module.exports = router;