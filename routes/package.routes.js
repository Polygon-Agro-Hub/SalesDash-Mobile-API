const express = require("express");
const router = express.Router();
const packagesEp = require("../end-point/package-ep");
//const auth = require("../middlewares/auth.middleware");
const auth = require('../Middlewares/auth.middleware');

router.get("/get-packages", auth, packagesEp.getAllPackages);
router.get("/:packageId/items", auth, packagesEp.getItemsForPackage);

module.exports = router;
