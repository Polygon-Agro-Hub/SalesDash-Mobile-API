const express = require("express");
const router = express.Router();
const otpEp = require("../end-point/otp-ep");

router.post("/send", otpEp.sendOTP);
router.post("/verify", otpEp.verifyOTP);

module.exports = router;
