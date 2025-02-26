const asyncHandler = require("express-async-handler");
const packageDAO = require("../dao/package-dao");

exports.getAllPackages = asyncHandler(async (req, res) => {
    try {
        const packages = await packageDAO.getAllPackages();

        if (!packages || packages.length === 0) {
            return res.status(404).json({ message: "No packages found" });
        }

        res.status(200).json({ message: "Packages fetched successfully", data: packages });
    } catch (error) {
        console.error("Error fetching packages:", error);
        res.status(500).json({ message: "Failed to fetch packages" });
    }
});

exports.getItemsForPackage = asyncHandler(async (req, res) => {
    const { packageId } = req.params;

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
