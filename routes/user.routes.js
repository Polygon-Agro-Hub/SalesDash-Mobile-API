const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const userAuthEp = require("../end-point/user-ep");

// User Login

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login User
 *     description: Authenticate a user and receive a token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               empId:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully logged in, token returned in data.token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       400:
 *         description: Bad Request
 */
router.post("/login", userAuthEp.login);

// Get User Details
/**
 * @openapi
 * /api/auth/get-profile:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get Profile
 *     description: Retrieve the currently logged in user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 */
router.get("/user/profile", auth, userAuthEp.getUserProfile);

// Get User Password
/**
 * @openapi
 * /api/auth/password-update:
 *   get:
 *     tags:
 *       - Auth
 *     summary: Get Password
 *     description: Retrieve the currently logged in user's profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Password retrieved successfully
 */
router.get("/user/password-update", auth, userAuthEp.getPassword);

/**
 * @openapi
 * /api/auth/update-password:
 *   put:
 *     tags:
 *       - Auth
 *     summary: Update User Password
 *     description: Allows an authenticated user to update their password by providing the old and new password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: OldPass123
 *               newPassword:
 *                 type: string
 *                 example: NewPass456
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password updated successfully
 *       400:
 *         description: Validation failed - missing or invalid fields
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Validation failed
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       500:
 *         description: Internal server error (e.g. wrong old password, DB error)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Current Password does not match. Please Re-enter
 */
router.put("/user/update-password", auth, userAuthEp.updatePassword);

module.exports = router;
