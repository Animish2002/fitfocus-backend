const express = require("express");
const userController = require("../controllers/userController");
const router = express.Router();

router.get("/profile/:id", userController.getProfile);
router.put("/edit-profile/:id", userController.editProfile);

module.exports = router;