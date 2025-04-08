const express = require('express');
const router = express.Router();
const notificationEp = require('../end-point/notification-ep');
const auth = require('../Middlewares/auth.middleware');


router.get('/',auth, notificationEp.getNotifications);

router.patch('/mark-read/:id',auth, notificationEp.markAsReadByOrderId);

// Delete notifications by orderId
router.delete('/:id', notificationEp.deleteByOrderId);

module.exports = router;