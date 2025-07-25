const express = require("express");
const scheduleController = require("../controllers/scheduleController");
const authenticateToken = require("../middlewares/authenticateToken"); // Import authentication middleware

const router = express.Router();

// Apply authentication middleware to all schedule routes
router.use(authenticateToken);

// POST /api/schedule - Create a new schedule item
router.post("/", scheduleController.createScheduleItem);

// GET /api/schedule - Get all schedule items for the user (with optional filters)
router.get("/get-schedule", scheduleController.getScheduleItems);

// GET /api/schedule/:id - Get a single schedule item by ID
router.get("/get-schedule/:id", scheduleController.getScheduleItemById);

// PUT /api/schedule/:id - Update an existing schedule item by ID
router.put("/:id", scheduleController.updateScheduleItem);

// DELETE /api/schedule/:id - Delete a schedule item by ID
router.delete("/delete-schedule/:id", scheduleController.deleteScheduleItem);

module.exports = router;
