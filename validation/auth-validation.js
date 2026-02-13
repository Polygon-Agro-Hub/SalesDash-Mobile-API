const Joi = require("joi");

// Login Schema
const loginSchema = Joi.object({
  empId: Joi.string().trim().min(3).max(50).required().messages({
    "string.empty": "Employee ID is required",
    "string.min": "Employee ID must be at least 3 characters long",
    "string.max": "Employee ID must be at most 50 characters long",
  }),
  password: Joi.string().trim().min(6).max(100).required().messages({
    "string.empty": "Password is required",
    "string.min": "Password must be at least 6 characters long",
    "string.max": "Password must be at most 100 characters long",
  }),
});

// Password Update Schema
const updatePasswordSchema = Joi.object({
  oldPassword: Joi.string().min(6).max(100).required().messages({
    "string.empty": "Old password is required",
    "string.min": "Old password must be at least 6 characters long",
    "string.max": "Old password must be at most 100 characters long",
  }),
  newPassword: Joi.string().min(6).max(100).required().messages({
    "string.empty": "New password is required",
    "string.min": "New password must be at least 6 characters long",
    "string.max": "New password must be at most 100 characters long",
  }),
});

module.exports = {
  loginSchema,
  updatePasswordSchema,
};
