const Joi = require("joi");

// Login Schema
const loginSchema = Joi.object({
  empId: Joi.string().trim().required().messages({
    "string.empty": "Employee ID is required",
  }),
  password: Joi.string().trim().required().messages({
    "string.empty": "Password is required",
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
