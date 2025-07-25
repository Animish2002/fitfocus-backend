const express = require("express");
const aiController = require("../controllers/aiController");
const authenticateToken = require("../middlewares/authenticateToken"); 

const router = express.Router();

router.use(authenticateToken);


router.post("/chat", aiController.chatWithAI);

router.get("/conversations", aiController.getConversations);

router.get("/conversations/:id", aiController.getConversationById);

router.delete("/delete-conversations/:id", aiController.deleteConversation);

module.exports = router;
