const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch").default; // .default is important for commonjs imports

const prisma = new PrismaClient();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Check if GEMINI_API_KEY is set
if (!GEMINI_API_KEY) {
  console.error(
    "FATAL ERROR: GEMINI_API_KEY is not defined in environment variables."
  );
  process.exit(1);
}

/**
 * Helper function to call Gemini API.
 * This function will now ALWAYS return the raw JSON response from Gemini,
 * allowing the caller to parse it as needed.
 * @param {object} payload - The contents array for Gemini.
 * @param {object | null} responseSchema - Optional, for direct JSON output from Gemini (ignored in this function's return logic).
 * @param {object | null} tools - Optional, for enabling function calling.
 * @returns {object} - The raw JSON object returned by the Gemini API.
 */
async function callGeminiApi(payload, responseSchema = null, tools = null) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  const requestBody = {
    contents: payload.contents,
  };

  // Keep these configs, as they affect how Gemini generates the content,
  // even if this function itself isn't parsing the final result based on them.
  if (responseSchema) {
    requestBody.generationConfig = {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
    };
  }

  if (tools) {
    requestBody.tools = tools;
    requestBody.toolConfig = {
      functionCallingConfig: {
        mode: "AUTO", // Allow Gemini to automatically call tools
      },
    };
  }

  const fetchOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  };

  const aiResponse = await fetch(apiUrl, fetchOptions);

  if (!aiResponse.ok) {
    const errorData = await aiResponse.json();
    console.error("Gemini API Error:", errorData);
    throw new Error(
      errorData.error?.message || "Failed to get AI response from Gemini API."
    );
  }

  const result = await aiResponse.json();
  // We will ALWAYS return the full 'result' object now.
  console.log(
    "DEBUG: callGeminiApi is ABOUT TO RETURN THE RAW RESULT (STEP 2 - aiController):",
    JSON.stringify(result, null, 2)
  );
  return result; // <--- THE ONLY RETURN STATEMENT FOR AI RESPONSE
}

// Import the new command processor module
const processNaturalLanguageCommand =
  require("./processNaturalLanguageCommand")({
    prisma,
    callGeminiApi,
    GEMINI_API_KEY,
  });

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

      // NOTE: This part is for general chat, not tool calling.
      // It bypasses the `callGeminiApi` helper, which is fine, but good to remember
      // for debugging. The issue is with the tool-calling path.
      const payload = { contents: chatHistory };
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

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

  // Now using the imported function
  processNaturalLanguageCommand: processNaturalLanguageCommand,

  // ... (suggestStudyPlan and suggestFitnessPlan functions) ...
  // These will also now rely on the raw 'result' from callGeminiApi,
  // so their parsing logic needs to be updated too if they use callGeminiApi.
  // For now, let's focus on processNaturalLanguageCommand's path.
  async suggestStudyPlan(req, res) {
    try {
      const userId = req.user.userId;
      const { topic, context } = req.body;

      if (!topic) {
        return res.status(400).json({ message: "Study topic is required." });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, age: true },
      });

      const userContext = user
        ? `User Name: ${user.name || "N/A"}, Age: ${user.age || "N/A"}.`
        : "";

      const aiPrompt = `
        The user wants a study plan. Provide a structured study plan in JSON format for the topic: "${topic}".
        ${context ? `Consider this additional context: "${context}".` : ""}
        ${userContext ? `Consider the user's profile: ${userContext}` : ""}

        The plan should include:
        - 'topic': The main topic.
        - 'recommendedDurationMinutes': Recommended study duration in minutes.
        - 'practiceQuestions': Recommended number of practice questions.
        - 'difficultyLevel': Estimated difficulty (e.g., "Beginner", "Intermediate", "Advanced").
        - 'subtopics': An array of key sub-topics to cover.
        - 'briefOutline': A short summary of what the plan covers.
        - 'category': Always "Study".

        Strictly output only the JSON object. Do not include any other text or markdown.
      `;

      const responseSchema = {
        type: "OBJECT",
        properties: {
          topic: { type: "STRING" },
          recommendedDurationMinutes: { type: "NUMBER" },
          practiceQuestions: { type: "NUMBER" },
          difficultyLevel: { type: "STRING" },
          subtopics: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          briefOutline: { type: "STRING" },
          category: { type: "STRING", enum: ["Study"] },
        },
        required: [
          "topic",
          "recommendedDurationMinutes",
          "practiceQuestions",
          "difficultyLevel",
          "subtopics",
          "briefOutline",
          "category",
        ],
      };

      // Now callGeminiApi returns the raw result, so we parse it here.
      const rawAiResponse = await callGeminiApi(
        { contents: [{ role: "user", parts: [{ text: aiPrompt }] }] },
        responseSchema
      );

      let aiParsedPlan = null;
      if (
        rawAiResponse.candidates &&
        rawAiResponse.candidates.length > 0 &&
        rawAiResponse.candidates[0].content &&
        rawAiResponse.candidates[0].content.parts &&
        rawAiResponse.candidates[0].content.parts.length > 0
      ) {
        try {
          aiParsedPlan = JSON.parse(
            rawAiResponse.candidates[0].content.parts[0].text
          );
        } catch (e) {
          console.error(
            "Failed to parse JSON for suggestStudyPlan:",
            e.message
          );
          // Handle cases where AI doesn't return valid JSON despite schema
        }
      }

      console.log("AI Generated Study Plan:", aiParsedPlan);

      res.status(200).json({
        message: "Study plan suggested successfully.",
        suggestedPlan: aiParsedPlan,
      });
    } catch (error) {
      console.error("Error in suggestStudyPlan:", error);
      res.status(500).json({
        message: "An unexpected error occurred while suggesting a study plan.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async suggestFitnessPlan(req, res) {
    try {
      const userId = req.user.userId;
      const { targetWeightKg, targetTimePeriodDays } = req.body;
      let { currentWeightKg, currentBMI } = req.body;

      if (
        (targetWeightKg &&
          (typeof targetWeightKg !== "number" ||
            isNaN(targetWeightKg) ||
            targetWeightKg <= 0)) ||
        (targetTimePeriodDays &&
          (typeof targetTimePeriodDays !== "number" ||
            isNaN(targetTimePeriodDays) ||
            targetTimePeriodDays <= 0))
      ) {
        if (targetWeightKg || targetTimePeriodDays) {
          return res.status(400).json({
            message:
              "Invalid targetWeightKg or targetTimePeriodDays values provided.",
          });
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, age: true, bodyweight: true, bmi: true },
      });

      const actualCurrentWeight =
        currentWeightKg ||
        (user?.bodyweight ? parseFloat(user.bodyweight) : null);
      const actualCurrentBMI =
        currentBMI || (user?.bmi ? parseFloat(user.bmi) : null);
      const userName = user?.name || "User";
      const userAge = user?.age || "N/A";

      let currentStatsPrompt = "";
      if (actualCurrentWeight && actualCurrentBMI) {
        currentStatsPrompt = `Current stats: Weight ${actualCurrentWeight} kg, BMI ${actualCurrentBMI}.`;
      } else if (actualCurrentWeight) {
        currentStatsPrompt = `Current weight: ${actualCurrentWeight} kg.`;
      } else if (actualCurrentBMI) {
        currentStatsPrompt = `Current BMI: ${actualCurrentBMI}.`;
      } else {
        currentStatsPrompt = `Current stats are not fully available.`;
      }

      const aiPrompt = `
        Generate a personalized fitness and diet plan in JSON format for ${userName} (Age: ${userAge}).
        ${currentStatsPrompt}
        ${targetWeightKg ? `Goal: Reduce weight to ${targetWeightKg} kg.` : ""}
        ${
          targetTimePeriodDays
            ? `Time period: ${targetTimePeriodDays} days.`
            : ""
        }

        The plan should include:
        - 'summary': A brief motivational summary of the plan.
        - 'dailyCalorieIntake': Recommended daily calorie intake (number).
        - 'exerciseRecommendations': An array of exercise types and their details.
            Each exercise object should have:
            - 'type': "Cardio" | "Weight Training" | "Flexibility" | "Other"
            - 'name': Specific exercise name (e.g., "HIIT", "Full Body Strength", "Yoga")
            - 'frequencyPerWeek': Number of times per week (number).
            - 'durationMinutesPerSession': Duration per session in minutes (number).
            - 'notes': Specific instructions or examples (string).
        - 'dietTips': An array of general diet tips (string).
        - 'suggestedGoals': An array of specific goals derived from this plan.
            Each goal object should have:
            - 'name': Goal name (string).
            - 'category': "Fitness" | "Nutrition" (string).
            - 'targetValue': Numerical target (optional, number).
            - 'unit': Unit for target (optional, string).
            - 'dueDate': YYYY-MM-DD (optional, string).
            - 'description': Goal description (string).

        Strictly output only the JSON object. Do not include any other text or markdown.
      `;

      const responseSchema = {
        type: "OBJECT",
        properties: {
          summary: { type: "STRING" },
          dailyCalorieIntake: { type: "NUMBER" },
          exerciseRecommendations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                type: {
                  type: "STRING",
                  enum: ["Cardio", "Weight Training", "Flexibility", "Other"],
                },
                name: { type: "STRING" },
                frequencyPerWeek: { type: "NUMBER" },
                durationMinutesPerSession: { type: "NUMBER" },
                notes: { type: "STRING" },
              },
              required: [
                "type",
                "name",
                "frequencyPerWeek",
                "durationMinutesPerSession",
                "notes",
              ],
            },
          },
          dietTips: {
            type: "ARRAY",
            items: { type: "STRING" },
          },
          suggestedGoals: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                name: { type: "STRING" },
                category: { type: "STRING", enum: ["Fitness", "Nutrition"] },
                targetValue: { type: "NUMBER" },
                unit: { type: "STRING" },
                dueDate: { type: "STRING" },
                description: { type: "STRING" },
              },
              required: ["name", "category", "description"],
            },
          },
        },
        required: [
          "summary",
          "dailyCalorieIntake",
          "exerciseRecommendations",
          "dietTips",
          "suggestedGoals",
        ],
      };

      // Now callGeminiApi returns the raw result, so we parse it here.
      const rawAiResponse = await callGeminiApi(
        { contents: [{ role: "user", parts: [{ text: aiPrompt }] }] },
        responseSchema
      );

      let aiParsedPlan = null;
      if (
        rawAiResponse.candidates &&
        rawAiResponse.candidates.length > 0 &&
        rawAiResponse.candidates[0].content &&
        rawAiResponse.candidates[0].content.parts &&
        rawAiResponse.candidates[0].content.parts.length > 0
      ) {
        try {
          aiParsedPlan = JSON.parse(
            rawAiResponse.candidates[0].content.parts[0].text
          );
        } catch (e) {
          console.error(
            "Failed to parse JSON for suggestFitnessPlan:",
            e.message
          );
          // Handle cases where AI doesn't return valid JSON despite schema
        }
      }

      console.log("AI Generated Fitness Plan:", aiParsedPlan);

      res.status(200).json({
        message: "Fitness plan suggested successfully.",
        suggestedPlan: aiParsedPlan,
      });
    } catch (error) {
      console.error("Error in suggestFitnessPlan:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while suggesting a fitness plan.",
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
        where: { id: id, userId: userId },
        include: {
          messages: {
            orderBy: { timestamp: "asc" },
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
