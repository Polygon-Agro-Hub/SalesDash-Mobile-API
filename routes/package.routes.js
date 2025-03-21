const express = require("express");
const router = express.Router();
const packagesEp = require("../end-point/package-ep");
//const auth = require("../middlewares/auth.middleware");
const auth = require('../Middlewares/auth.middleware');

router.get("/get-packages", auth, packagesEp.getAllPackages);
router.get("/:packageId/items", auth, packagesEp.getItemsForPackage);
//router.get("/:marketplaceItemId/crop-group", auth, packagesEp.getCropGroupForMarketplaceItem);
//router.get("/:mpItemId/package-item", auth, packagesEp.getPackegeItemEdit);

//router.get("/marketplace-item/:itemId", auth, packagesEp.getMarketplaceItemDetails);
router.get("/marketplace-item/:mpItemId", auth, packagesEp.getMarketplaceItemDetails);


router.get('/crops/all', auth, packagesEp.getAllCrops);




module.exports = router;
