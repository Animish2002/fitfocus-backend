const express = require("express");
const fitnessLogController = require("../controllers/fitnessLogController");
const authenticateToken = require("../middlewares/authenticateToken"); // Import authentication middleware

const router = express.Router();

// Apply authentication middleware to all fitness log routes
router.use(authenticateToken);

// POST /api/fitness/logs - Create a new fitness log
router.post("/", fitnessLogController.createFitnessLog);

// GET /api/fitness/logs - Get all fitness logs for the user (with optional filters)
router.get("/get-logs", fitnessLogController.getFitnessLogs);

// GET /api/fitness/logs/:id - Get a single fitness log by ID
router.get("/get-logs/:id", fitnessLogController.getFitnessLogById);

// PUT /api/fitness/logs/:id - Update an existing fitness log by ID
router.put("/:id", fitnessLogController.updateFitnessLog);

// DELETE /api/fitness/logs/:id - Delete a fitness log by ID
router.delete("/delete-logs/:id", fitnessLogController.deleteFitnessLog);

module.exports = router;