const express = require("express");
const userController = require("../controllers/userController");
const authenticateToken = require("../middlewares/authenticateToken");
const router = express.Router();

router.use(authenticateToken);

router.get("/profile/:id", userController.getProfile);
router.put("/edit-profile/:id", userController.editProfile);

module.exports = router;
