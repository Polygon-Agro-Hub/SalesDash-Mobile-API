const Joi = require("joi");

// Item Validation
const itemSchema = Joi.object({
  productId: Joi.number().integer().positive().required(),
  qty: Joi.number().positive().required(),
  unit: Joi.string().trim().required(),
  price: Joi.number().min(0).required(),
  discount: Joi.number().min(0).default(0),
});

// Order Validation
const orderValidationSchema = Joi.object({
  orderData: Joi.object({
    userId: Joi.number().required(),
    isPackage: Joi.number().valid(0, 1).required(),
    total: Joi.number().required(),
    fullTotal: Joi.number().required(),
    discount: Joi.number().required(),
    deliveryCharge: Joi.number().required(),
    sheduleDate: Joi.string().required(),
    sheduleTime: Joi.string().required(),
    paymentMethod: Joi.string().required(),
    isPaid: Joi.number().valid(0, 1).optional(),
    status: Joi.string().optional(),
    transactionId: Joi.alternatives()
      .try(Joi.string(), Joi.number(), Joi.allow(null))
      .optional(),

    // Package ID - only allowed when isPackage = 1
    packageId: Joi.when("isPackage", {
      is: 1,
      then: Joi.number().required(),
      otherwise: Joi.forbidden(),
    }),

    items: Joi.array().items(itemSchema).optional(),
    isFinalizeImdt: Joi.number().valid(0, 1).optional(),
    deliveryAddress: Joi.object().allow(null).optional(),
  }).required(),
});

module.exports = orderValidationSchema;
