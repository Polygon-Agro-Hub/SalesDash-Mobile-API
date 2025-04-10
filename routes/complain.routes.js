const express = require('express');
const router = express.Router();

const complainEp = require('../end-point/complain-ep');
//const auth = require('../Middlewares/auth.middleware');

const auth = require('../Middlewares/auth.middleware');

router.post('/add-complain', auth, complainEp.createComplain);

router.get('/get-complains', auth, complainEp.getComplains);

router.get('/get-complain/category/:appName',complainEp.getComplainCategory)


module.exports = router;