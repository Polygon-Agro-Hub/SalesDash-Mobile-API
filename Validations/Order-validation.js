const Joi = require('joi');

// Define the item schema that will be reused
const itemSchema = Joi.object({
    productId: Joi.number().integer().positive().required(),
    qty: Joi.number().positive().required(),
    unit: Joi.string().trim().required(),
    price: Joi.number().min(0).required(),
    discount: Joi.number().min(0).default(0)
});

const orderValidationSchema = Joi.object({
    orderData: Joi.object({
        userId: Joi.number().required(),
        isPackage: Joi.number().valid(0, 1).required(),
        total: Joi.number().required(),
        fullTotal: Joi.number().required(),
        discount: Joi.number().required(),
        sheduleDate: Joi.string().required(),
        sheduleTime: Joi.string().required(),
        paymentMethod: Joi.string().required(),
        isPaid: Joi.number().valid(0, 1).optional(),
        status: Joi.string().optional(),
        transactionId: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.allow(null)).optional(),

        // Package ID - only allowed when isPackage = 1
        packageId: Joi.when('isPackage', {
            is: 1,
            then: Joi.number().required(),
            otherwise: Joi.forbidden()
        }),

        // Items array - always allowed, but required when isPackage = 0
        items: Joi.when('isPackage', {
            is: 0,
            then: Joi.array().items(itemSchema).min(1).required(),
            otherwise: Joi.array().items(itemSchema).optional()
        })
    }).required()
});

module.exports = orderValidationSchema;