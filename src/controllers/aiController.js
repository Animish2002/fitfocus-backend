const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch").default;


const prisma = new PrismaClient();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Check if GEMINI_API_KEY is set
if (!GEMINI_API_KEY) {
  console.error(
    "FATAL ERROR: GEMINI_API_KEY is not defined in environment variables."
  );
  process.exit(1);
}

const aiController = {
  async chatWithAI(req, res) {
    try {
      const userId = req.user.userId;
      const { prompt, conversationId } = req.body;

      if (!prompt) {
        return res.status(400).json({ message: "Prompt is required." });
      }

      let currentConversation;
      let chatHistory = [];

      if (conversationId) {
        currentConversation = await prisma.conversation.findUnique({
          where: { id: conversationId, userId: userId },
          include: { messages: { orderBy: { timestamp: "asc" } } },
        });

        if (!currentConversation) {
          return res
            .status(404)
            .json({ message: "Conversation not found or unauthorized." });
        }

        chatHistory = currentConversation.messages.map((msg) => ({
          role: msg.role,
          parts: [{ text: msg.text }],
        }));
      } else {
        currentConversation = await prisma.conversation.create({
          data: {
            userId: userId,

            title:
              prompt.length > 50 ? prompt.substring(0, 47) + "..." : prompt,
          },
        });
      }

      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      await prisma.message.create({
        data: {
          conversationId: currentConversation.id,
          role: "user",
          text: prompt,
          timestamp: new Date(),
        },
      });

      const payload = { contents: chatHistory };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      // Call Gemini API
      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json();
        console.error("Gemini API Error:", errorData);
        return res.status(aiResponse.status).json({
          message:
            errorData.error?.message ||
            "Failed to get AI response from Gemini API.",
          error: process.env.NODE_ENV === "development" ? errorData : undefined,
        });
      }

      const result = await aiResponse.json();
      let aiTextResponse = "No valid response from AI.";

      if (
        result.candidates &&
        result.candidates.length > 0 &&
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0
      ) {
        aiTextResponse = result.candidates[0].content.parts[0].text;
      }

      await prisma.message.create({
        data: {
          conversationId: currentConversation.id,
          role: "ai",
          text: aiTextResponse,
          timestamp: new Date(),
        },
      });

      res.status(200).json({
        response: aiTextResponse,
        conversationId: currentConversation.id,
      });
    } catch (error) {
      console.error("Error in chatWithAI:", error);
      res.status(500).json({
        message: "An unexpected error occurred while communicating with AI.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getConversations(req, res) {
    try {
      const userId = req.user.userId;

      const conversations = await prisma.conversation.findMany({
        where: { userId: userId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          messages: {
            orderBy: { timestamp: "desc" },
            take: 1,
            select: { text: true },
          },
        },
      });

      const formattedConversations = conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        lastMessageSnippet:
          conv.messages.length > 0 ? conv.messages[0].text : "No messages yet.",
      }));

      res.status(200).json(formattedConversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching conversations.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getConversationById(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const conversation = await prisma.conversation.findUnique({
        where: { id: id, userId: userId }, // Ensure user owns the conversation
        include: {
          messages: {
            orderBy: { timestamp: "asc" }, // Order messages chronologically
          },
        },
      });

      if (!conversation) {
        return res
          .status(404)
          .json({ message: "Conversation not found or unauthorized." });
      }

      res.status(200).json(conversation);
    } catch (error) {
      console.error("Error fetching conversation by ID:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching conversation.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async deleteConversation(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const conversationToDelete = await prisma.conversation.findUnique({
        where: { id: id, userId: userId },
      });

      if (!conversationToDelete) {
        return res.status(404).json({
          message: "Conversation not found or unauthorized to delete.",
        });
      }

      await prisma.conversation.delete({
        where: { id: id },
      });

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({
        message: "An unexpected error occurred while deleting conversation.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = aiController;
