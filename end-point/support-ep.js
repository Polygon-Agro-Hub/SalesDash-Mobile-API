const asyncHandler = require("express-async-handler");
const { sendCrashReport } = require("../services/crash-reporter.service");
const { CRASH_REPORT_RECIPIENTS } = require("../constants/crash-report-recipients");

/**
 * Handle incoming crash report from mobile app
 */
exports.reportCrash = asyncHandler(async (req, res) => {
  const {
    errorMessage,
    errorStack,
    screenName,
    appVersion,
    buildNumber,
    deviceInfo,
    userInfo,
    userComment,
    timestamp,
  } = req.body;

  try {
    const mailResult = await sendCrashReport({
      errorMessage: errorMessage || "Unknown error",
      errorStack: errorStack || "",
      screenName: screenName || "General",
      appVersion: appVersion || "1.0.6",
      buildNumber: buildNumber || 20,
      deviceInfo: deviceInfo || {},
      userInfo: userInfo || {},
      userComment: userComment || "",
      timestamp: timestamp || new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Crash report processed successfully",
      data: {
        recipients: mailResult.recipients,
        previewUrl: mailResult.previewUrl,
        isTestAccount: mailResult.isTestAccount,
        messageId: mailResult.messageId,
      },
    });
  } catch (error) {
    console.error("❌ Failed to send crash report email:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send crash report email",
      error: error.message,
    });
  }
});

/**
 * Health / check endpoint for crash reporting recipients
 */
exports.getRecipients = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      recipients: CRASH_REPORT_RECIPIENTS,
    },
  });
});
