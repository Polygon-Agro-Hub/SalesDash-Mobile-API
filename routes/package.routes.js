const express = require("express");
const router = express.Router();
const packagesEp = require("../end-point/package-ep");
const auth = require('../Middlewares/auth.middleware');

router.get("/get-packages", auth, packagesEp.getAllPackages);
router.get("/:packageId/items", auth, packagesEp.getItemsForPackage);

router.get("/marketplace-item/:mpItemId", auth, packagesEp.getMarketplaceItemDetails);


router.get('/crops/all', auth, packagesEp.getAllCrops);


router.get("/crops/:cropId", auth, packagesEp.getCropById);

module.exports = router;
