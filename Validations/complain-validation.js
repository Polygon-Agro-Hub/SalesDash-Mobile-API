const Joi = require("joi");


// Joi validation schema
exports.createComplain = Joi.object({
    language: Joi.string().required().messages({
        "string.empty": "Language is required.",
    }),
    complain: Joi.string().required().messages({
        "string.empty": "Complain description is required.",
    }),
    category: Joi.number().required().messages({
        "string.empty": "Category is required.",
    }),
    saId: Joi.number().integer().required().messages({
        "number.base": "salesagentId must be a number.",
        "any.required": "salesagentId is required.",
    })

});