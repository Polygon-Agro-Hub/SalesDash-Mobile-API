const express = require('express');
const router = express.Router();
const notificationEp = require('../end-point/notification-ep');
const auth = require('../middleware/auth.middleware');

// Get All Notification
router.get('/', auth, notificationEp.getNotifications);

// Mark As Read Notification
router.patch('/mark-read/:id', auth, notificationEp.markAsReadByOrderId);

// Delete Notification
router.delete('/:id', notificationEp.deleteByOrderId);

// Register Device Push Token
router.post('/register-push-token', auth, notificationEp.registerPushToken);

// Send Notification (Triggers Expo Push Notification for background / closed app delivery)
router.post('/send', auth, notificationEp.sendNotification);

module.exports = router;