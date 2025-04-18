const Joi = require('joi');

const orderValidationSchema = Joi.object({
    customerId: Joi.number().required(),
    scheduleDate: Joi.string().required(),
    selectedTimeSlot: Joi.string().required(),
    paymentMethod: Joi.string().required(),
    fullTotal: Joi.number().required(),
    discount: Joi.number().required(),
    subtotal: Joi.number().required(),
    isSelectPackage: Joi.number().valid(0, 1).required(),
    isCustomPackage: Joi.number().valid(0, 1).required(),

    items: Joi.array().when('isCustomPackage', {
        is: 1,
        then: Joi.array().items(
            Joi.object({
                id: Joi.number().required(),
                name: Joi.string().required(),
                quantity: Joi.number().required(),
                unitType: Joi.string().required(),
                price: Joi.number().required(),
                normalPrice: Joi.number().required(),
                discountedPrice: Joi.number().required()
            })
        ).required(),
        otherwise: Joi.forbidden()
    }),

    packageId: Joi.number().when('isSelectPackage', { is: 1, then: Joi.required() }),

    isModifiedPlus: Joi.boolean(),
    isModifiedMin: Joi.boolean(),
    isAdditionalItems: Joi.boolean(),
    packageTotal: Joi.number(),
    packageDiscount: Joi.number(),
    packageSubTotal: Joi.number(),

    modifiedPlusItems: Joi.array().when('isModifiedPlus', {
        is: true,
        then: Joi.array().items(
            Joi.object({
                packageDetailsId: Joi.number().required(),
                originalQuantity: Joi.number().required(),
                modifiedQuantity: Joi.number().required(),
                originalPrice: Joi.number().required(),
                additionalPrice: Joi.number().required(),
                additionalDiscount: Joi.number().required()
            })
        ).required(),
        otherwise: Joi.forbidden()
    }),

    modifiedMinItems: Joi.array().when('isModifiedMin', {
        is: true,
        then: Joi.array().items(
            Joi.object({
                packageDetailsId: Joi.number().required(),
                originalQuantity: Joi.number().required(),
                modifiedQuantity: Joi.number().required(),
                originalPrice: Joi.number().required(),
                additionalPrice: Joi.number().required(),
                additionalDiscount: Joi.number().required()
            })
        ).required(),
        otherwise: Joi.forbidden()
    }),

    additionalItems: Joi.array().when('isAdditionalItems', {
        is: true,
        then: Joi.array().items(
            Joi.object({
                id: Joi.number().required(),
                quantity: Joi.number().required(),
                unitType: Joi.string().required(),
                total: Joi.number().required(),
                subtotal: Joi.number().required(),
                discount: Joi.number().required()
            })
        ).required(),
        otherwise: Joi.forbidden()
    }),

    finalOrderPackageList: Joi.array().items(
        Joi.object({
            productId: Joi.number().required(),
            quantity: Joi.number().required(),
            price: Joi.number().required().custom((value, helpers) => {
                return String(value);  // Transform number to string
            }),
            isPacking: Joi.number().required()
        })
    )

});

module.exports = orderValidationSchema;
