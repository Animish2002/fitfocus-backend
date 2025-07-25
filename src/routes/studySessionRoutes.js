const express = require("express");
const studySessionController = require("../controllers/studySessionController");
const authenticateToken = require("../middlewares/authenticateToken"); // Import authentication middleware

const router = express.Router();

// Apply authentication middleware to all study session routes
router.use(authenticateToken);

// POST /api/study/sessions - Create a new study session
router.post("/", studySessionController.createStudySession);

// GET /api/study/sessions - Get all study sessions for the user (with optional filters)
router.get("/get-sessions", studySessionController.getStudySessions);

// GET /api/study/sessions/:id - Get a single study session by ID
router.get("/get-sessions/:id", studySessionController.getStudySessionById);

// PUT /api/study/sessions/:id - Update an existing study session by ID
router.put("/:id", studySessionController.updateStudySession);

// DELETE /api/study/sessions/:id - Delete a study session by ID
router.delete("/delete-sessions/:id", studySessionController.deleteStudySession);

module.exports = router;
