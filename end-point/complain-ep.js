const asyncHandler = require("express-async-handler");
const complainDAO = require("../dao/complain-dao");
const { createComplain } = require("../validation/complain-validation");

// Add Complain
exports.createComplain = asyncHandler(async (req, res) => {
  try {
    const saId = req.user.id; 
    const input = { ...req.body, saId };

    // Validate input using Joi
    const { value, error } = createComplain.validate(input);
    if (error) {
      return res.status(400).json({
        status: "error",
        message: error.details[0].message,
      });
    }

    const { language, complain, category, refNo } = value;
    const status = "Opened";

    // Create the complaint in the database
    const newComplainId = await complainDAO.createComplainDAO(
      saId,
      language,
      complain,
      category,
      status,
      refNo,
    );

    res.status(201).json({
      status: "success",
      message: "Complain created successfully.",
      complainId: newComplainId,
    });
  } catch (err) {
    console.error("Error creating complain:", err);
    res.status(500).json({
      status: "error",
      message: "Internal Server Error",
    });
  }
});

// Get All Complains
exports.getComplains = asyncHandler(async (req, res) => {
  try {
    const userId = req.user.id;
    const complains = await complainDAO.getAllComplaintsByUserIdDAO(userId);

    if (!complains || complains.length === 0) {
      return res.status(404).json({ message: "No complaints found" });
    }

    res.status(200).json(complains);
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ message: "Failed to fetch complaints" });
  }
});

// Get All Complain Category By App Name
exports.getComplainCategory = asyncHandler(async (req, res) => {
  try {
    const appName = req.params.appName;
    const categories = await complainDAO.getComplainCategoriesDAO(appName);

    if (!categories || categories.length === 0) {
      return res.status(404).json({ message: "No categories found" });
    }

    res.status(200).json({ status: "success", data: categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});
