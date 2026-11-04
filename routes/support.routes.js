const express = require("express");
const router = express.Router();
const supportEp = require("../end-point/support-ep");

/**
 * @openapi
 * /api/support/crash-report:
 *   post:
 *     tags:
 *       - Support
 *     summary: Submit a crash report from the mobile app
 *     description: Generates an email alert and sends it to configured developers via Nodemailer
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               errorMessage:
 *                 type: string
 *               errorStack:
 *                 type: string
 *               screenName:
 *                 type: string
 *               appVersion:
 *                 type: string
 *               buildNumber:
 *                 type: integer
 *               deviceInfo:
 *                 type: object
 *               userInfo:
 *                 type: object
 *               userComment:
 *                 type: string
 *     responses:
 *       200:
 *         description: Crash report sent successfully
 */
router.post("/crash-report", supportEp.reportCrash);

/**
 * @openapi
 * /api/support/crash-recipients:
 *   get:
 *     tags:
 *       - Support
 *     summary: Get configured crash report recipients
 */
router.get("/crash-recipients", supportEp.getRecipients);

module.exports = router;
