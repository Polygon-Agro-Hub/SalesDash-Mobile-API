const userDao = require("../dao/user-dao");
const jwt = require("jsonwebtoken");
const {
  loginSchema,
  updatePasswordSchema,
  refreshTokenSchema,
} = require("../validation/auth-validation");
const asyncHandler = require("express-async-handler");

// User Login
exports.login = asyncHandler(async (req, res) => {
  const { error } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    console.error("⚠️ Login validation error:", error.message);
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((err) => err.message),
    });
  }

  const { empId, password } = req.body;

  try {
    const result = await userDao.loginUserDAO(empId, password);

    const token = jwt.sign(
      {
        empId: result.empId,
        id: result.id,
        passwordUpdate: result.passwordUpdate,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const refreshToken = jwt.sign(
      {
        empId: result.empId,
        id: result.id,
        tokenType: "refresh",
      },
      refreshSecret,
      { expiresIn: "14d" },
    );

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        empId: result.empId,
        token,
        refreshToken,
        id: result.id,
        passwordUpdate: result.passwordUpdate,
      },
    });
  } catch (err) {
    console.error("Login failed:", err.message);

    if (err.message === "User not found") {
      return res.status(401).json({
        success: false,
        message: "Invalid Employee ID",
      });
    }

    if (err.message === "Invalid password") {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    if (err.message === "This Employee ID is rejected") {
      return res.status(403).json({
        success: false,
        message: "This Employee ID is rejected",
        statusType: "rejected",
      });
    }

    if (err.message === "This Employee ID is not approved") {
      return res.status(403).json({
        success: false,
        message: "This Employee ID is not approved",
        statusType: "not_approved",
      });
    }

    if (err.message === "Password not set for this account") {
      return res.status(403).json({
        success: false,
        message:
          "Password not set for this account. Please contact administrator.",
        statusType: "password_not_set",
      });
    }

    return res.status(401).json({
      success: false,
      message: err.message,
    });
  }
});

// Get User Details
exports.getUserProfile = asyncHandler(async (req, res) => {
  const id = req.user.id;

  try {
    const user = await userDao.getUserProfileDAO(id);
    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: user,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Get User Password
exports.getPassword = asyncHandler(async (req, res) => {
  const id = req.user.id;
  try {
    const user = await userDao.getPasswordDAO(id);
    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: user,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

// Update User Password
exports.updatePassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  // Validate the request body with Joi schema
  const { error } = updatePasswordSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: error.details.map((err) => err.message),
    });
  }

  const userId = req.user.id;
  try {
    const result = await userDao.updatePasswordDAO(
      userId,
      oldPassword,
      newPassword,
    );
    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Refresh Token
exports.refreshToken = asyncHandler(async (req, res) => {
  const { error } = refreshTokenSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Refresh token is required",
      errors: error.details.map((err) => err.message),
    });
  }

  const { refreshToken } = req.body;
  const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, refreshSecret);
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired refresh token",
    });
  }

  if (!decoded || decoded.tokenType !== "refresh") {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token",
    });
  }

  try {
    const user = await userDao.verifyUserForRefreshDAO(decoded.id);

    const token = jwt.sign(
      {
        empId: user.empId,
        id: user.id,
        passwordUpdate: user.passwordUpdate,
      },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );

    const newRefreshToken = jwt.sign(
      {
        empId: user.empId,
        id: user.id,
        tokenType: "refresh",
      },
      refreshSecret,
      { expiresIn: "14d" },
    );

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 12 * 60 * 60 * 1000,
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        token,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    if (err.message === "User not found") {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (err.message === "This Employee ID is rejected") {
      return res.status(403).json({
        success: false,
        message: "This Employee ID is rejected",
        statusType: "rejected",
      });
    }

    if (err.message === "This Employee ID is not approved") {
      return res.status(403).json({
        success: false,
        message: "This Employee ID is not approved",
        statusType: "not_approved",
      });
    }

    if (err.message === "Account status is pending verification") {
      return res.status(403).json({
        success: false,
        message: "Account status is pending verification",
        statusType: "pending",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error during token refresh",
    });
  }
});
