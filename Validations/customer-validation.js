const Joi = require("joi");

// Phone Schema Validation
exports.phoneNumberSchema = Joi.alternatives()
  .try(
    Joi.string().pattern(/^\d+$/).min(10).max(15),
    Joi.number()
      .integer()
      .min(1000000000)
      .max(999999999999999)
      .custom((value) => String(value)),
  )
  .required()
  .messages({
    "string.pattern.base": "Phone number must be numeric",
    "string.min": "Phone number must be at least 10 digits",
    "string.max": "Phone number cannot exceed 15 digits",
    "any.required": "Phone number is required",
  });

// Email Schema Validation
exports.emailSchema = Joi.string().email().required().messages({
  "string.email": "Email must be a valid email address",
  "any.required": "Email is required",
});

// House Schema (House-Specific Fields) Validation
exports.houseSchema = Joi.object({
  houseNo: Joi.string().required(),
  streetName: Joi.string().required(),
  city: Joi.string().required(),
});

// Apartment Schema Validation
exports.apartmentSchema = Joi.object({
  buildingNo: Joi.string().max(50),
  buildingName: Joi.string().max(100),
  unitNo: Joi.string().max(50),
  floorNo: Joi.string().max(10),
  houseNo: Joi.string().max(10),
  streetName: Joi.string().max(100),
  city: Joi.string().max(50),
});
