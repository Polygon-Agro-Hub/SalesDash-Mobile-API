const userDao = require("../dao/userAuth-dao");
const jwt = require("jsonwebtoken");
const {
  loginSchema,
  updateUserProfileSchema,
  updatePasswordSchema,
} = require("../Validations/Auth-validations");
const asyncHandler = require("express-async-handler");

exports.login = asyncHandler(async (req, res) => {
  const { error } = loginSchema.validate(req.body, { abortEarly: false });
  console.log(error);
  if (error) {
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors: error.details.map((err) => err.message),
    });
  }

  const { empId, password } = req.body;

  try {
    const result = await userDao.loginUser(empId, password);

    const token = jwt.sign(
      {
        empId: result.empId,
        id: result.id,
        passwordUpdate: result.passwordUpdate,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    res.cookie("authToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 8 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        empId: result.empId,
        token,
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

    return res.status(401).json({
      success: false,
      message: err.message,
    });
  }
});

exports.getUserProfile = asyncHandler(async (req, res) => {
  const id = req.user.id;

  try {
    const user = await userDao.getUserProfile(id);
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

exports.updateUserProfile = asyncHandler(async (req, res) => {
  const id = req.user.id;

  const updatedData = req.body;

  const { error } = updateUserProfileSchema.validate(updatedData, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      status: "error",
      message: "Validation failed",
      errors: error.details.map((err) => err.message),
    });
  }

  try {
    const result = await userDao.updateUserProfile(id, updatedData); // Update the profile using DAO
    return res.status(200).json({
      status: "success",
      message: "User profile updated successfully",
    });
  } catch (err) {
    return res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
});

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
    const result = await userDao.updatePassword(
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

exports.getPassword = asyncHandler(async (req, res) => {
  const id = req.user.id;
  try {
    const user = await userDao.getPassword(id);
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
