const express = require('express');
const router = express.Router();
const auth = require('../Middlewares/auth.middleware');

const userAuthEp = require('../end-point/userAuth-ep');

router.post('/login', userAuthEp.login);

router.put("/user-updateUser", auth, userAuthEp.updateUserProfile);

router.get('/user/profile', auth, userAuthEp.getUserProfile);





module.exports = router;