const asyncHandler = require("express-async-handler");
const packageDAO = require("../dao/package-dao");

// exports.getAllPackages = asyncHandler(async (req, res) => {
//     console.log("hitt")
//     try {
//         const packages = await packageDAO.getAllPackages();
//         console.log(",,,,,,,,,,", packages)

//         if (!packages || packages.length === 0) {
//             return res.status(404).json({ message: "No packages found" });
//         }

//         res.status(200).json({ message: "Packages fetched successfully", data: packages });
//     } catch (error) {
//         console.error("Error fetching packages:", error);
//         res.status(500).json({ message: "Failed to fetch packages" });
//     }
// });


// Enhanced Endpoint
exports.getAllPackages = asyncHandler(async (req, res) => {
    console.log("getAllPackages endpoint hit");
    try {
        // Extract query parameters for filtering
        const filters = {
            status: req.query.status || 'Enabled',
            minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : null,
            maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : null,
            search: req.query.search || null,
            limit: req.query.limit ? parseInt(req.query.limit) : null,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };

        const packages = await packageDAO.getAllPackages(filters);
        console.log("Packages fetched:", packages?.length || 0);

        if (!packages || packages.length === 0) {
            return res.status(404).json({
                message: "No packages found",
                data: [],
                total: 0
            });
        }

        res.status(200).json({
            message: "Packages fetched successfully",
            data: packages,
            total: packages.length,
            filters: filters
        });
    } catch (error) {
        console.error("Error fetching packages:", error);
        res.status(500).json({
            message: "Failed to fetch packages",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});



exports.getItemsForPackage = asyncHandler(async (req, res) => {
    console.log("get package item")
    const { packageId } = req.params;
    console.log("packageid", packageId)

    try {
        const items = await packageDAO.getItemsByPackageId(packageId);

        if (!items || items.length === 0) {
            return res.status(404).json({ message: "No items found for this package" });
        }

        res.status(200).json({ message: "Items fetched successfully", data: items });
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
        const marketplaceItem = await packageDAO.getMarketplaceItemDetails(mpItemId);

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
        res.status(500).json({ message: "Failed to fetch marketplace item", error: error.message });
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
        const marketplaceIPackage = await packageDAO.getMarketplacePackage(packageid);

        // Check if marketplace item exists
        if (!marketplaceIPackage) {
            return res.status(404).json({ message: "Marketplace item not found" });
        }

        // Send successful response with the marketplace item details
        res.status(200).json({
            message: "Marketplace item fetched successfully",
            data: marketplaceIPackage, // Directly returning the single record
        });
    } catch (error) {
        console.error("Error fetching marketplace item:", error);
        res.status(500).json({ message: "Failed to fetch marketplace item", error: error.message });
    }
});


exports.getAllCrops = asyncHandler(async (req, res) => {
    console.log("✅ API /crops/all hit!");
    const cusId = req.query;
    console.log(cusId)

    try {
        const crops = await packageDAO.getAllCrops(cusId);
        if (!crops || crops.length === 0) {
            console.log("🚨 No crops found in DB");
            return res.status(404).json({ message: "No crops found" });
        }

        console.log("✅ Crops fetched:", crops);
        res.status(200).json({
            message: "Crops fetched successfully",
            data: crops,
        });
    } catch (error) {
        console.error("❌ Error fetching crops:", error);
        res.status(500).json({ message: "Failed to fetch crops", error: error.message });
    }
});

exports.getCropById = async (req, res) => {
    const cropId = req.params.cropId;  // Extract cropId from URL parameters
    console.log("Fetching details for cropId:", cropId);

    try {
        // Fetch crop details from the DAO method
        const crop = await packageDAO.getCropById(cropId);

        if (!crop) {
            console.log("🚨 Crop not found");
            return res.status(404).json({ message: "Crop not found" });  // If no crop found, send 404
        }

        console.log("✅ Crop details fetched:", crop);
        res.status(200).json({
            message: "Crop fetched successfully",
            data: crop,  // Return the crop data in the response
        });
    } catch (error) {
        console.error("❌ Error fetching crop:", error);
        res.status(500).json({ message: "Failed to fetch crop", error: error.message });  // If error occurs, send 500
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
        const packageItemDetails = await packageDAO.getPackageItemByProductId(packageId, productId);

        // Check if package item exists
        if (!packageItemDetails) {
            return res.status(404).json({
                message: `Package item not found for packageId: ${packageId}, productId: ${productId}`
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
            error: error.message
        });
    }
});


exports.getChangeByValue = asyncHandler(async (req, res) => {
    const { mpItemId } = req.params;

    console.log("[[[[[[[[[[[[[[[[[[[[[[[[")
    // Validate mpItemId
    if (!mpItemId || isNaN(mpItemId)) {
        return res.status(400).json({ message: "Invalid marketplace item ID" });
    }
    try {
        // Get marketplace item details
        const marketplaceItem = await packageDAO.getChangeByValue(mpItemId);

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
        res.status(500).json({ message: "Failed to fetch marketplace item", error: error.message });
    }
});