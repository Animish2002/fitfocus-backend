const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const authenticateToken = require("../middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);


router.get("/summary", dashboardController.getDashboardSummary);

module.exports = router;
