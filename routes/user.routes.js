const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const userAuthEp = require("../end-point/user-ep");

// User Login
router.post("/login", userAuthEp.login);

// Get User Details
router.get("/user/profile", auth, userAuthEp.getUserProfile);

// Get User Password
router.get("/user/password-update", auth, userAuthEp.getPassword);

// Update User Password
router.put("/user/update-password", auth, userAuthEp.updatePassword);

module.exports = router;
