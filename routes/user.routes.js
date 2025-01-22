const express = require('express');
const router = express.Router();
const auth = require('../Middlewares/auth.middleware');

const userAuthEp = require('../end-point/userAuth-ep');

router.post('/login', userAuthEp.login);



module.exports = router;