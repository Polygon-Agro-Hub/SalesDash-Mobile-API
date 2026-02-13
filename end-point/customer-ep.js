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

    const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(
      customerData.phoneNumber,
    );
    if (phoneNumberValidation.error) {
      console.log(
        "Phone validation error:",
        phoneNumberValidation.error.details[0].message,
      );
      return res
        .status(400)
        .json({ error: phoneNumberValidation.error.details[0].message });
    }

    if (!customerData.firstName || customerData.firstName.trim() === "") {
      return res.status(400).json({ error: "First name is required" });
    }
    if (!customerData.lastName || customerData.lastName.trim() === "") {
      return res.status(400).json({ error: "Last name is required" });
    }

    if (!customerData.buildingType) {
      return res.status(400).json({ error: "Building type is required" });
    }

    if (!["House", "Apartment"].includes(customerData.buildingType)) {
      return res.status(400).json({
        error: "Invalid building type. Must be either 'House' or 'Apartment'",
      });
    }

    if (customerData.buildingType === "House") {
      const houseData = {
        houseNo: customerData.houseNo,
        streetName: customerData.streetName,
        city: customerData.city,
      };
      const houseValidation = ValidationSchema.houseSchema.validate(houseData);
      if (houseValidation.error) {
        console.log(
          "House validation error:",
          houseValidation.error.details[0].message,
        );
        return res
          .status(400)
          .json({ error: houseValidation.error.details[0].message });
      }
    } else if (customerData.buildingType === "Apartment") {
      const apartmentData = {
        buildingNo: customerData.buildingNo,
        buildingName: customerData.buildingName,
        unitNo: customerData.unitNo,
        floorNo: customerData.floorNo,
        houseNo: customerData.houseNo,
        streetName: customerData.streetName,
        city: customerData.city,
      };
      const apartmentValidation =
        ValidationSchema.apartmentSchema.validate(apartmentData);
      if (apartmentValidation.error) {
        console.log(
          "Apartment validation error:",
          apartmentValidation.error.details[0].message,
        );
        return res
          .status(400)
          .json({ error: apartmentValidation.error.details[0].message });
      }
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

    // Handle specific database errors
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        error: "Customer already exists with this information",
      });
    }

    // Handle validation errors
    if (error.message && error.message.includes("validation")) {
      return res.status(400).json({ error: error.message });
    }

    // Generic error response
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

  let customerData;
  let buildingData;

  if (req.body.customerData) {
    customerData = req.body.customerData;
    buildingData = req.body.buildingData;
  } else {
    customerData = {
      title: req.body.title,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phoneNumber: req.body.phoneNumber,
      email: req.body.email,
      buildingType: req.body.buildingType,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
    };

    buildingData = req.body.buildingData;
  }

  try {
    // Validate the customer data exists
    if (!customerData || !customerData.phoneNumber) {
      return res.status(400).json({
        message: "Customer data is incomplete - phone number is required",
        errors: { general: true },
      });
    }

    // Validate phone number
    const phoneNumberValidation = ValidationSchema.phoneNumberSchema.validate(
      customerData.phoneNumber,
    );
    if (phoneNumberValidation.error) {
      return res.status(400).json({
        message: phoneNumberValidation.error.details[0].message,
        errors: { phoneNumber: true },
      });
    }

    // Validate email only if provided
    if (customerData.email && customerData.email.trim() !== "") {
      const emailValidation = ValidationSchema.emailSchema.validate(
        customerData.email,
      );
      if (emailValidation.error) {
        return res.status(400).json({
          message: emailValidation.error.details[0].message,
          errors: { email: true },
        });
      }
    }

    // Update customer data through DAO
    const result = await customerDAO.updateCustomerData(
      cusId,
      customerData,
      buildingData,
    );

    // Send success response
    res.status(200).json({
      message: "Customer data updated successfully",
      result,
    });
  } catch (error) {
    console.error("Error while updating customer data:", error);

    // Handle specific validation errors from DAO
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
      // Generic server error
      return res.status(500).json({
        message: "Internal server error during update",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
});

exports.checkCustomer = (req, res) => {
  const { phoneNumber, email, excludeId } = req.body;

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

exports.getCustomerDataLocation = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  try {
    const result = await customerDAO.getCustomerDataLocation(customerId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
