const smsService = require("../services/sms-service");

/**
 * Send OTP Endpoint
 * Proxies to ShoutOUT OTP service using server-side API key
 */
exports.sendOTP = async (req, res) => {
  try {
    const { destination, phoneNumber, content, message, source } = req.body;
    const result = await smsService.sendOTP({
      destination,
      phoneNumber,
      content,
      message,
      source,
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error sending OTP:", error.response?.data || error.message);
    const statusCode = error.response?.status || 400;
    return res.status(statusCode).json({
      error: error.response?.data?.message || error.message || "Failed to send OTP",
      details: error.response?.data,
    });
  }
};

/**
 * Verify OTP Endpoint
 * Proxies to ShoutOUT OTP verify service using server-side API key
 */
exports.verifyOTP = async (req, res) => {
  try {
    const { code, referenceId } = req.body;
    const result = await smsService.verifyOTP({ code, referenceId });
    return res.status(200).json(result);
  } catch (error) {
    console.error("Error verifying OTP:", error.response?.data || error.message);
    const statusCode = error.response?.status || 400;
    return res.status(statusCode).json({
      error: error.response?.data?.message || error.message || "Failed to verify OTP",
      details: error.response?.data,
    });
  }
};
