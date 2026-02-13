const express = require('express');
const router = express.Router();
const complainEp = require('../end-point/complain-ep');
const auth = require('../middleware/auth.middleware');

// Add Complain
router.post('/add-complain', auth, complainEp.createComplain);

// Get All Complains
router.get('/get-complains', auth, complainEp.getComplains);

// Get All Complain Category By App Name
router.get('/get-complain/category/:appName', complainEp.getComplainCategory)

module.exports = router;