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

// Create Customer Schema
exports.createCustomerSchema = Joi.object({
  title: Joi.string().trim().optional(),
  firstName: Joi.string().trim().required().messages({
    "string.empty": "First name is required",
  }),
  lastName: Joi.string().trim().required().messages({
    "string.empty": "Last name is required",
  }),
  phoneNumber: exports.phoneNumberSchema,
  email: Joi.string().email().optional().allow("", null).messages({
    "string.email": "Email must be a valid email address",
  }),
  city: Joi.string().trim().required().messages({
    "string.empty": "City is required",
  }),
  buildingType: Joi.string().valid("House", "Apartment").required().messages({
    "any.only": "Invalid building type. Must be either 'House' or 'Apartment'",
    "any.required": "Building type is required",
  }),
  houseNo: Joi.string().trim().required().messages({
    "string.empty": "House number is required",
  }),
  streetName: Joi.string().trim().required().messages({
    "string.empty": "Street name is required",
  }),
  buildingNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required().messages({
      "string.empty": "Building number is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  buildingName: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(100).required().messages({
      "string.empty": "Building name is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(100).optional().allow("", null),
  }),
  unitNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required().messages({
      "string.empty": "Unit number is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  floorNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(10).required().messages({
      "string.empty": "Floor number is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(10).optional().allow("", null),
  }),
});

// Update Customer Schema
exports.updateCustomerSchema = Joi.object({
  title: Joi.string().trim().optional().allow("", null),
  firstName: Joi.string().trim().required().messages({
    "string.empty": "First name is required",
  }),
  lastName: Joi.string().trim().required().messages({
    "string.empty": "Last name is required",
  }),
  phoneNumber: exports.phoneNumberSchema,
  email: Joi.string().email().optional().allow("", null).messages({
    "string.email": "Email must be a valid email address",
  }),
});

// Crop List Schema (Exclude/Prefer Lists)
exports.cropListSchema = Joi.object({
  customerId: Joi.number().integer().positive().required().messages({
    "number.base": "Customer ID must be a number",
    "any.required": "Customer ID is required",
  }),
  selectedCrops: Joi.array().items(Joi.number().integer().positive()).required().messages({
    "array.base": "Selected crops must be an array",
    "any.required": "Selected crops are required",
  }),
});

// Update Residential Address Schema
exports.updateResidentialAddressSchema = Joi.object({
  buildingType: Joi.string().valid("House", "Apartment").required().messages({
    "any.only": "Invalid building type. Must be either 'House' or 'Apartment'",
    "any.required": "Building type is required",
  }),
  nearestCity: Joi.string().trim().optional().allow("", null),
  houseNo: Joi.string().trim().required().messages({
    "string.empty": "House number is required",
  }),
  streetName: Joi.string().trim().required().messages({
    "string.empty": "Street name is required",
  }),
  buildingNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required().messages({
      "string.empty": "Building number is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  buildingName: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(100).required().messages({
      "string.empty": "Building name is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(100).optional().allow("", null),
  }),
  unitNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required().messages({
      "string.empty": "Unit number is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  floorNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(10).required().messages({
      "string.empty": "Floor number is required for Apartment",
    }),
    otherwise: Joi.string().trim().max(10).optional().allow("", null),
  }),
});

// Saved Address Schema (Address Book)
exports.savedAddressSchema = Joi.object({
  customerId: Joi.number().integer().positive().required(),
  saveAs: Joi.string().trim().required(),
  billingTitle: Joi.string().trim().optional().allow("", null),
  billingName: Joi.string().trim().required(),
  billingPhone1: exports.phoneNumberSchema,
  billingPhone2: Joi.alternatives().try(
    Joi.string().pattern(/^\d+$/).min(10).max(15),
    Joi.number().integer().min(1000000000).max(999999999999999).custom((value) => String(value))
  ).optional().allow("", null),
  buildingType: Joi.string().valid("House", "Apartment").required(),
  houseNo: Joi.string().trim().required(),
  streetName: Joi.string().trim().required(),
  nearestCity: Joi.string().trim().required(),
  latitude: Joi.number().optional().allow(null),
  longitude: Joi.number().optional().allow(null),
  buildingNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required(),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  buildingName: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(100).required(),
    otherwise: Joi.string().trim().max(100).optional().allow("", null),
  }),
  unitNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required(),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  floorNo: Joi.when("buildingType", {
    is: "Apartment",
    then: Joi.string().trim().max(10).required(),
    otherwise: Joi.string().trim().max(10).optional().allow("", null),
  }),
});

// Update Saved Address Schema
exports.updateSavedAddressSchema = Joi.object({
  customerId: Joi.number().integer().positive().optional(),
  saveAs: Joi.string().trim().required(),
  billingTitle: Joi.string().trim().optional().allow("", null),
  billingName: Joi.string().trim().required(),
  billingPhone1: exports.phoneNumberSchema,
  billingPhone2: Joi.alternatives().try(
    Joi.string().pattern(/^\d+$/).min(10).max(15),
    Joi.number().integer().min(1000000000).max(999999999999999).custom((value) => String(value))
  ).optional().allow("", null),
  type: Joi.string().valid("House", "Apartment").required(),
  houseNo: Joi.string().trim().required(),
  streetName: Joi.string().trim().required(),
  nearestCity: Joi.string().trim().required(),
  latitude: Joi.number().optional().allow(null),
  longitude: Joi.number().optional().allow(null),
  buildingNo: Joi.when("type", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required(),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  buildingName: Joi.when("type", {
    is: "Apartment",
    then: Joi.string().trim().max(100).required(),
    otherwise: Joi.string().trim().max(100).optional().allow("", null),
  }),
  unitNo: Joi.when("type", {
    is: "Apartment",
    then: Joi.string().trim().max(50).required(),
    otherwise: Joi.string().trim().max(50).optional().allow("", null),
  }),
  floorNo: Joi.when("type", {
    is: "Apartment",
    then: Joi.string().trim().max(10).required(),
    otherwise: Joi.string().trim().max(10).optional().allow("", null),
  }),
});

// Check Customer Schema
exports.checkCustomerSchema = Joi.object({
  phoneNumber: Joi.alternatives().try(
    Joi.string().pattern(/^\d+$/).min(10).max(15),
    Joi.number().integer().min(1000000000).max(999999999999999).custom((value) => String(value))
  ).required(),
  email: Joi.string().email().optional().allow("", null),
  excludeId: Joi.number().integer().positive().optional().allow(null),
});
