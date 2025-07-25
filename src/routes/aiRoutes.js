const express = require("express");
const aiController = require("../controllers/aiController");
const authenticateToken = require("../middlewares/authenticateToken"); 

const router = express.Router();

router.use(authenticateToken);

// POST /api/ai/chat - Send a prompt to AI and get response, manage conversation history (general chat)
router.post("/chat", aiController.chatWithAI);

// POST /api/ai/command - Interpret natural language commands for structured updates
router.post("/command", aiController.processNaturalLanguageCommand);

// POST /api/ai/suggest-study-plan - Get a structured study plan from AI
router.post("/suggest-study-plan", aiController.suggestStudyPlan);

router.get("/conversations", aiController.getConversations);

router.get("/conversations/:id", aiController.getConversationById);

router.delete("/delete-conversations/:id", aiController.deleteConversation);

module.exports = router;
