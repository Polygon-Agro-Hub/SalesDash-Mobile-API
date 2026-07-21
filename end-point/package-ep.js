const asyncHandler = require("express-async-handler");
const packageDAO = require("../dao/package-dao");

exports.getAllPackages = asyncHandler(async (req, res) => {
  try {
    // Extract query parameters for filtering
    const filters = {
      status: req.query.status || "Enabled",
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : null,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : null,
      search: req.query.search || null,
      limit: req.query.limit ? parseInt(req.query.limit) : null,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
    };

    const packages = await packageDAO.getAllPackages(filters);

    if (!packages || packages.length === 0) {
      return res.status(404).json({
        message: "No packages found",
        data: [],
        total: 0,
      });
    }

    res.status(200).json({
      message: "Packages fetched successfully",
      data: packages,
      total: packages.length,
      filters: filters,
    });
  } catch (error) {
    console.error("Error fetching packages:", error);
    res.status(500).json({
      message: "Failed to fetch packages",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

exports.getItemsForPackage = asyncHandler(async (req, res) => {
  const { packageId } = req.params;

  try {
    const items = await packageDAO.getItemsByPackageId(packageId);

    if (!items || items.length === 0) {
      return res
        .status(404)
        .json({ message: "No items found for this package" });
    }

    res
      .status(200)
      .json({ message: "Items fetched successfully", data: items });
  } catch (error) {
    console.error("Error fetching items:", error);
    res.status(500).json({ message: "Failed to fetch items" });
  }
});

exports.getMarketplaceItemDetails = asyncHandler(async (req, res) => {
  const { mpItemId } = req.params;
  // Validate mpItemId
  if (!mpItemId || isNaN(mpItemId)) {
    return res.status(400).json({ message: "Invalid marketplace item ID" });
  }
  try {
    // Get marketplace item details
    const marketplaceItem =
      await packageDAO.getMarketplaceItemDetails(mpItemId);

    // Check if marketplace item exists
    if (!marketplaceItem) {
      return res.status(404).json({ message: "Marketplace item not found" });
    }

    // Send successful response with the marketplace item details
    res.status(200).json({
      message: "Marketplace item fetched successfully",
      data: marketplaceItem, // Directly returning the single record
    });
  } catch (error) {
    console.error("Error fetching marketplace item:", error);
    res
      .status(500)
      .json({
        message: "Failed to fetch marketplace item",
        error: error.message,
      });
  }
});

exports.getMarketplacePackage = asyncHandler(async (req, res) => {
  const { packageid } = req.params;
  // Validate mpItemId
  if (!packageid || isNaN(packageid)) {
    return res.status(400).json({ message: "Invalid package item ID" });
  }
  try {
    // Get marketplace item details
    const marketplaceIPackage =
      await packageDAO.getMarketplacePackage(packageid);

    // Check if marketplace item exists
    if (!marketplaceIPackage) {
      return res.status(404).json({ message: "Marketplace item not found" });
    }

    // Send successful response with the marketplace item details
    res.status(200).json({
      message: "Marketplace item fetched successfully",
      data: marketplaceIPackage, 
    });
  } catch (error) {
    console.error("Error fetching marketplace item:", error);
    res
      .status(500)
      .json({
        message: "Failed to fetch marketplace item",
        error: error.message,
      });
  }
});

exports.getAllCrops = asyncHandler(async (req, res) => {
  const cusId = req.query;

  try {
    const crops = await packageDAO.getAllCrops(cusId);
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

exports.getCropById = async (req, res) => {
  const cropId = req.params.cropId;

  try {
    const crop = await packageDAO.getCropById(cropId);

    if (!crop) {
      return res.status(404).json({ message: "Crop not found" });
    }

    res.status(200).json({
      message: "Crop fetched successfully",
      data: crop, 
    });
  } catch (error) {
    console.error(" Error fetching crop:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch crop", error: error.message }); 
  }
};

exports.getPackageItemByProductId = asyncHandler(async (req, res) => {
  const { packageId, productId } = req.params;

  // Validate parameters
  if (!packageId || isNaN(packageId)) {
    return res.status(400).json({ message: "Invalid package ID" });
  }

  if (!productId || isNaN(productId)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    // Get package item details using packageId and productId (mpItemId)
    const packageItemDetails = await packageDAO.getPackageItemByProductId(
      packageId,
      productId,
    );

    // Check if package item exists
    if (!packageItemDetails) {
      return res.status(404).json({
        message: `Package item not found for packageId: ${packageId}, productId: ${productId}`,
      });
    }

    // Send successful response with the package item details
    res.status(200).json({
      message: "Package item details fetched successfully",
      data: packageItemDetails,
    });
  } catch (error) {
    console.error("Error fetching package item details:", error);
    res.status(500).json({
      message: "Failed to fetch package item details",
      error: error.message,
    });
  }
});

exports.getChangeByValue = asyncHandler(async (req, res) => {
  const { mpItemId } = req.params;

  if (!mpItemId || isNaN(mpItemId)) {
    return res.status(400).json({ message: "Invalid marketplace item ID" });
  }
  try {
    const marketplaceItem = await packageDAO.getChangeByValue(mpItemId);

    if (!marketplaceItem) {
      return res.status(404).json({ message: "Marketplace item not found" });
    }

    res.status(200).json({
      message: "Marketplace item fetched successfully",
      data: marketplaceItem,
    });
  } catch (error) {
    console.error("Error fetching marketplace item:", error);
    res
      .status(500)
      .json({
        message: "Failed to fetch marketplace item",
        error: error.message,
      });
  }
});

exports.validatePackageItems = asyncHandler(async (req, res) => {
  const { packageId, itemIds } = req.body;
  try {
    const result = await packageDAO.checkDisabledItems(packageId, itemIds);
    const hasDisabled = result.packageDisabled || result.disabledItems.length > 0;
    res.status(200).json({
      success: true,
      hasDisabled,
      data: result
    });
  } catch (error) {
    console.error("Error validating package items:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error"
    });
  }
});

