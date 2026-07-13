const asyncHandler = require("express-async-handler");
const customerDAO = require("../dao/customer-dao");
const ValidationSchema = require("../validation/customer-validation");

exports.customerData = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res
      .status(401)
      .json({ error: "Unauthorized: No sales agent ID found" });
  }

  const customerData = req.body;

  try {
    const salesAgent = req.user.id;

    const { error, value } = ValidationSchema.createCustomerSchema.validate(customerData, {
      abortEarly: true,
    });
    if (error) {
      console.error("⚠️ Customer validation error:", error.details[0].message);
      return res.status(400).json({ error: error.details[0].message });
    }

    // Add customer
    const result = await customerDAO.addCustomer(customerData, salesAgent);

    res.status(200).json({
      status: "success",
      message: "Customer added successfully",
      customerId: result.customerId,
    });
  } catch (error) {
    console.error("Error while adding customer:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        error: "Customer already exists with this information",
      });
    }

    if (error.message && error.message.includes("validation")) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({
      error: "An error occurred while adding the customer",
      details: error.message,
    });
  }
};

exports.getCustomers = asyncHandler(async (req, res) => {
  try {
    const salesAgentId = req.user.id;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await customerDAO.getCustomersBySalesAgent(
      salesAgentId,
      page,
      limit,
    );

    res.status(200).json({
      success: true,
      data: result.customers,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      totalCount: result.totalCount,
      hasMore: result.hasMore,
      limit: result.limit,
    });
  } catch (error) {
    console.error("Error in getCustomers endpoint:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

exports.getCustomerData = asyncHandler(async (req, res) => {
  const { cusId } = req.params;

  try {
    const result = await customerDAO.getCustomerData(cusId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.getCusDataExc = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  try {
    const result = await customerDAO.getCusDataExc(customerId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCusDataExc controller:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

exports.updateCustomerData = asyncHandler(async (req, res) => {
  const { cusId } = req.params;

  const customerData = {
    title: req.body.title,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    phoneNumber: req.body.phoneNumber,
    email: req.body.email,
  };

  try {
    // Validate using Joi schema
    const { error, value } = ValidationSchema.updateCustomerSchema.validate(customerData, {
      abortEarly: true,
    });
    if (error) {
      const isPhoneError = error.details[0].path.includes("phoneNumber");
      const isEmailError = error.details[0].path.includes("email");
      return res.status(400).json({
        message: error.details[0].message,
        errors: {
          phoneNumber: isPhoneError,
          email: isEmailError,
          general: !isPhoneError && !isEmailError,
        },
      });
    }

    // Update customer data through DAO
    const result = await customerDAO.updateCustomerData(cusId, customerData);

    // Send success response
    res.status(200).json({
      message: "Customer data updated successfully",
      result,
    });
  } catch (error) {
    console.error("Error while updating customer data:", error);

    if (error.message === "Email already exists.") {
      return res.status(400).json({
        message: "Email already exists.",
        errors: {
          email: true,
          phoneNumber: false,
        },
      });
    } else if (error.message === "Phone number already exists.") {
      return res.status(400).json({
        message: "Mobile Number already exists.",
        errors: {
          phoneNumber: true,
          email: false,
        },
      });
    } else if (error.message === "Customer not found") {
      return res.status(404).json({
        message: "Customer not found",
      });
    } else {
      return res.status(500).json({
        message: "Internal server error during update",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
});

exports.checkCustomer = (req, res) => {
  const { error, value } = ValidationSchema.checkCustomerSchema.validate(req.body, { abortEarly: true });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  const { phoneNumber, email, excludeId } = value;

  customerDAO
    .findCustomerByPhoneOrEmail(phoneNumber, email, excludeId)
    .then((result) => {
      if (result.phoneExists && result.emailExists) {
        return res.status(400).json({
          message: "Mobile Number and Email already exist.",
        });
      } else if (result.phoneExists) {
        return res.status(400).json({
          message: "Mobile Number already exists.",
        });
      } else if (result.emailExists) {
        return res.status(400).json({
          message: "Email already exists.",
        });
      }

      res.status(200).json({ message: "Valid new customer." });
    })
    .catch((error) => {
      console.error("Error checking customer:", error);
      res.status(500).json({ message: "Internal server error" });
    });
};

exports.getCustomerCountBySalesAgent = async (req, res) => {
  try {
    const salesAgentId = req.user.id;
    const result = await customerDAO.getCustomerCountBySalesAgent(salesAgentId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in getCustomerCountBySalesAgent:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order count by sales agent",
      error: error.message,
    });
  }
};

exports.getAllPCity = asyncHandler(async (req, res) => {
  try {
    const packages = await customerDAO.getAllCity();
    if (!packages || packages.length === 0) {
      return res.status(404).json({ message: "No City found" });
    }
    res
      .status(200)
      .json({ message: "City fetched successfully", data: packages });
  } catch (error) {
    console.error("Error fetching city:", error);
    res.status(500).json({ message: "Failed to fetch city" });
  }
});

exports.getAllCrops = asyncHandler(async (req, res) => {
  try {
    const cusId = req.query;

    const crops = await customerDAO.getAllCrops(cusId);
    if (!crops || crops.length === 0) {
      return res.status(404).json({ message: "No crops found" });
    }
    res.status(200).json({
      message: "Crops fetched successfully",
      data: crops,
    });
  } catch (error) {
    console.error("❌ Error fetching crops:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch crops", error: error.message });
  }
});

exports.addExcludeList = asyncHandler(async (req, res) => {
  try {
    const { customerId, selectedCrops } = req.body;

    if (!customerId || !Array.isArray(selectedCrops)) {
      return res.status(400).json({
        message:
          "Invalid request. 'customerId' and 'selectedCrops' are required.",
      });
    }

    const result = await customerDAO.addExcludeList(customerId, selectedCrops);

    if (result) {
      return res
        .status(200)
        .json({ message: "Exclude list updated successfully" });
    } else {
      return res
        .status(404)
        .json({ message: "Customer not found or no crops to update" });
    }
  } catch (err) {
    console.error("Error in addExcludeList controller:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
});

exports.addPreList = asyncHandler(async (req, res) => {
  try {
    const { customerId, selectedCrops } = req.body;

    if (!customerId || !Array.isArray(selectedCrops)) {
      return res.status(400).json({
        message:
          "Invalid request. 'customerId' and 'selectedCrops' are required.",
      });
    }

    const result = await customerDAO.addPreList(customerId, selectedCrops);

    if (result) {
      return res
        .status(200)
        .json({ message: "Exclude list updated successfully" });
    } else {
      return res
        .status(404)
        .json({ message: "Customer not found or no crops to update" });
    }
  } catch (err) {
    console.error("Error in addExcludeList controller:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
});


exports.getCustomerExludelist = asyncHandler(async (req, res) => {
  try {
    const { customerId } = req.query;
    const crops = await customerDAO.getExcludeList(customerId);
    if (!crops || crops.length === 0) {
      return res.status(404).json({ message: "No crops found" });
    }
    res.status(200).json({
      message: "Crops fetched successfully",
      data: crops,
    });
  } catch (error) {
    console.error("❌ Error fetching crops:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch crops", error: error.message });
  }
});

exports.getCustomerPreferlist = asyncHandler(async (req, res) => {
  try {
    const { customerId } = req.query;
    const crops = await customerDAO.getCustomerPreferlist(customerId);
    if (!crops || crops.length === 0) {
      return res.status(404).json({ message: "No crops found" });
    }
    res.status(200).json({
      message: "Crops fetched successfully",
      data: crops,
    });
  } catch (error) {
    console.error("❌ Error fetching crops:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch crops", error: error.message });
  }
});


exports.deleteExcludeItem = asyncHandler(async (req, res) => {
  try {
    const { excludeId } = req.query;

    if (!excludeId) {
      return res.status(400).json({ message: "excludeId is required" });
    }

    // Call the DAO to delete the item
    const result = await customerDAO.deleteExcludeItem(excludeId);

    res.status(200).json({
      message: "Item deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error deleting item:", error);
    res
      .status(500)
      .json({ message: "Failed to delete item", error: error.message });
  }
});

exports.deletePreferItem = asyncHandler(async (req, res) => {
  try {
    const { preferId } = req.query;

    if (!preferId) {
      return res.status(400).json({ message: "excludeId is required" });
    }

    // Call the DAO to delete the item
    const result = await customerDAO.deletePreferItem(preferId);

    res.status(200).json({
      message: "Item deleted successfully",
      data: result,
    });
  } catch (error) {
    console.error("❌ Error deleting item:", error);
    res
      .status(500)
      .json({ message: "Failed to delete item", error: error.message });
  }
});

exports.getCustomerDataLocation = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  try {
    const result = await customerDAO.getCustomerDataLocation(customerId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


exports.checkDeliveredOrder = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  try {
    const result = await customerDAO.checkDeliveredOrder(customerId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.updateResidentialAddress = asyncHandler(async (req, res) => {
  const { cusId } = req.params;
  const { error, value } = ValidationSchema.updateResidentialAddressSchema.validate(req.body, { abortEarly: true });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await customerDAO.updateResidentialAddress(cusId, req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.getAddressBook = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  try {
    const result = await customerDAO.getAddressBook(customerId);
    res.status(200).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

exports.getSavedAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const { type } = req.query;

  if (!type || !['House', 'Apartment'].includes(type)) {
    return res.status(400).json({ error: 'A valid type (House or Apartment) is required.' });
  }

  try {
    const result = await customerDAO.getSavedAddress(addressId, type);
    if (!result) {
      return res.status(404).json({ error: 'Address not found.' });
    }
    res.status(200).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/customer/add-saved-address
exports.addSavedAddress = asyncHandler(async (req, res) => {
  const { error, value } = ValidationSchema.savedAddressSchema.validate(req.body, { abortEarly: true });
  if (error) {
    console.error("Validation error in addSavedAddress:", error.details[0].message);
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await customerDAO.addSavedAddress(value);
    res.status(201).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/customer/update-saved-address/:addressId
exports.updateSavedAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const { error, value } = ValidationSchema.updateSavedAddressSchema.validate(req.body, { abortEarly: true });
  if (error) {
    console.error("Validation error in updateSavedAddress:", error.details[0].message);
    return res.status(400).json({ error: error.details[0].message });
  }

  try {
    const result = await customerDAO.updateSavedAddress(addressId, value);
    if (!result) {
      return res.status(404).json({ error: 'Address not found.' });
    }
    res.status(200).json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

