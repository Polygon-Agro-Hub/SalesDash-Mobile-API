

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


// User Profile Update Schema
const updateUserProfileSchema = Joi.object({
    firstName: Joi.string().min(2).max(50).required().label('First Name'),
    lastName: Joi.string().min(2).max(50).required().label('Last Name'),
    phoneNumber1: Joi.string().min(10).max(15).optional().label('Phone Number 1'),
    phoneNumber2: Joi.string().min(10).max(15).optional().label('Phone Number 1'),
    email: Joi.string().email().optional().label('Email'),
    houseNumber: Joi.string().optional().label('House Number'),
    streetName: Joi.string().min(2).max(50).optional().label('Street Name'),
    city: Joi.string().min(2).max(50).optional().label('City'),
    district: Joi.string().min(2).max(50).optional().label('District'),
    province: Joi.string().min(2).max(50).optional().label('Province'),
    empId: Joi.string().optional().label('Employee ID'),  // Add if necessary
    nic: Joi.string().optional().label('NIC'),  // Add if necessary
    username: Joi.string().optional().label('Username'),  // Add if necessary
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
    updateUserProfileSchema,
    updatePasswordSchema
};

