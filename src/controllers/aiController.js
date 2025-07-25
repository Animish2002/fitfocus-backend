// src/controllers/aiController.js
const { PrismaClient } = require("@prisma/client");
const fetch = require("node-fetch").default;

const prisma = new PrismaClient();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Check if GEMINI_API_KEY is set
if (!GEMINI_API_KEY) {
  console.error(
    "FATAL ERROR: JWT_SECRET or GEMINI_API_KEY is not defined in environment variables."
  );
  process.exit(1);
}

// Helper function to call Gemini API with a specific payload
async function callGeminiApi(payload, responseSchema) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const fetchOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: payload.contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    }),
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
  // Directly parse the text part which should be JSON
  return JSON.parse(result.candidates[0].content.parts[0].text);
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

  async processNaturalLanguageCommand(req, res) {
    try {
      const userId = req.user.userId;
      const { command } = req.body;

      if (!command) {
        return res.status(400).json({ message: "Command is required." });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, age: true, bodyweight: true, bmi: true },
      });

      const userName = user?.name || "User";
      const userAge = user?.age || "N/A";
      const userWeight = user?.bodyweight ? parseFloat(user.bodyweight) : null;
      const userBMI = user?.bmi ? parseFloat(user.bmi) : null;

      const aiPrompt = `
        The user has provided a command. Your task is to extract the intent and relevant details from this command in a structured JSON format.
        User's Profile: Name: ${userName}, Age: ${userAge}, Weight: ${
        userWeight || "N/A"
      } kg, BMI: ${userBMI || "N/A"}.

        Possible intents and their required fields:
        1.  "complete_schedule_item": User completed a scheduled activity.
            Fields: { "intent": "complete_schedule_item", "activityName": "string", "date": "YYYY-MM-DD" (optional, default today), "type": "fitness" | "study" | "misc" (optional) }
        2.  "set_goal_progress": User updated progress on a goal.
            Fields: { "intent": "set_goal_progress", "goalName": "string", "progress": "number (0-100)" }
        3.  "log_fitness_activity": User completed a fitness activity not necessarily on schedule.
            Fields: { "intent": "log_fitness_activity", "workoutName": "string", "durationMinutes": "number", "caloriesBurned": "number (optional)", "type": "cardio" | "weight_training" | "yoga" | "other" (optional) }
        4.  "log_study_session": User completed a study session.
            Fields: { "intent": "log_study_session", "topic": "string", "durationMinutes": "number", "notes": "string (optional)" }
        5.  "create_goal": User wants to create a new goal.
            Fields: { "intent": "create_goal", "name": "string", "category": "fitness" | "study" | "personal" | "wellness", "targetValue": "number (optional)", "unit": "string (optional)", "dueDate": "YYYY-MM-DD (optional)", "description": "string (optional)" }
        6.  "create_schedule_item": User wants to add a new schedule item.
            Fields: { "intent": "create_schedule_item", "activity": "string", "time": "HH:MM (24-hour format) or HH:MM AM/PM", "date": "YYYY-MM-DD (optional, default today)", "type": "fitness" | "study" | "misc" (optional) }
        7.  "suggest_study_plan": User wants a study plan.
            Fields: { "intent": "suggest_study_plan", "topic": "string (required)", "context": "string (optional, additional details)" }
        8.  "suggest_fitness_plan": User wants a fitness/diet plan.
            Fields: { "intent": "suggest_fitness_plan", "targetWeightKg": "number (optional)", "targetTimePeriodDays": "number (optional)", "context": "string (optional, e.g., current activity level, dietary preferences)" }
        9.  "unknown": If the intent cannot be clearly determined.
            Fields: { "intent": "unknown", "reason": "string" }

        Strictly output only the JSON object. Do not include any other text or markdown.
        User command: "${command}"
      `;

      // Schema for the *initial* intent recognition and parameter extraction
      const intentRecognitionSchema = {
        type: "OBJECT",
        properties: {
          intent: { type: "STRING" },
          activityName: { type: "STRING" },
          goalName: { type: "STRING" },
          progress: { type: "NUMBER" },
          workoutName: { type: "STRING" },
          durationMinutes: { type: "NUMBER" },
          caloriesBurned: { type: "NUMBER" },
          type: { type: "STRING" },
          topic: { type: "STRING" },
          notes: { type: "STRING" },
          name: { type: "STRING" },
          category: { type: "STRING" },
          targetValue: { type: "NUMBER" },
          unit: { type: "STRING" },
          dueDate: { type: "STRING" },
          description: { type: "STRING" },
          activity: { type: "STRING" },
          time: { type: "STRING" },
          date: { type: "STRING" },
          targetWeightKg: { type: "NUMBER" },
          targetTimePeriodDays: { type: "NUMBER" },
          context: { type: "STRING" },
          reason: { type: "STRING" },
        },
      };

      const aiParsedIntent = await callGeminiApi(
        { contents: [{ role: "user", parts: [{ text: aiPrompt }] }] },
        intentRecognitionSchema
      );
      console.log("AI Parsed Intent Data:", aiParsedIntent);

      let responseMessage = "Command processed.";
      let updatedEntity = null;
      let suggestedPlan = null; // New field for plan suggestions

      // --- Process AI's Intent ---
      switch (aiParsedIntent.intent) {
        case "complete_schedule_item": {
          const { activityName, date, type } = aiParsedIntent;
          const targetDate = date ? new Date(date) : new Date();
          targetDate.setUTCHours(0, 0, 0, 0);

          const queryDate = new Date(targetDate);
          const nextDay = new Date(targetDate);
          nextDay.setDate(targetDate.getDate() + 1);

          const scheduleItem = await prisma.scheduleItem.findFirst({
            where: {
              userId: userId,
              activity: { contains: activityName, mode: "insensitive" },
              date: { gte: queryDate, lt: nextDay },
              status: { not: "completed" },
              ...(type && { type: type }),
            },
            orderBy: { createdAt: "desc" },
          });

          if (scheduleItem) {
            updatedEntity = await prisma.scheduleItem.update({
              where: { id: scheduleItem.id },
              data: { status: "completed" },
            });
            responseMessage = `Marked "${updatedEntity.activity}" as completed.`;
          } else {
            responseMessage = `Could not find a pending or in-progress schedule item matching "${activityName}" for today.`;
          }
          break;
        }

        case "set_goal_progress": {
          const { goalName, progress } = aiParsedIntent;
          if (typeof progress !== "number" || progress < 0 || progress > 100) {
            responseMessage = "Invalid progress value provided by AI.";
            break;
          }

          const goal = await prisma.goal.findFirst({
            where: {
              userId: userId,
              name: { contains: goalName, mode: "insensitive" },
            },
            orderBy: { createdAt: "desc" },
          });

          if (goal) {
            updatedEntity = await prisma.goal.update({
              where: { id: goal.id },
              data: {
                progress: progress,
                status: progress === 100 ? "Completed" : "In Progress",
              },
            });
            responseMessage = `Updated progress for "${updatedEntity.name}" to ${updatedEntity.progress}%.`;
          } else {
            responseMessage = `Could not find a goal named "${goalName}".`;
          }
          break;
        }

        case "log_fitness_activity": {
          const { workoutName, durationMinutes, caloriesBurned, type } =
            aiParsedIntent;
          if (!workoutName || typeof durationMinutes !== "number") {
            responseMessage =
              "Missing required fields for logging fitness activity.";
            break;
          }
          updatedEntity = await prisma.fitnessLog.create({
            data: {
              userId: userId,
              workoutName,
              durationMinutes,
              caloriesBurned,
              type,
              date: new Date(),
            },
          });
          responseMessage = `Logged fitness activity "${updatedEntity.workoutName}" for ${updatedEntity.durationMinutes} minutes.`;
          break;
        }

        case "log_study_session": {
          const { topic, durationMinutes, notes } = aiParsedIntent;
          if (!topic || typeof durationMinutes !== "number") {
            responseMessage =
              "Missing required fields for logging study session.";
            break;
          }
          updatedEntity = await prisma.studySession.create({
            data: {
              userId: userId,
              topic,
              durationMinutes,
              notes,
              date: new Date(),
              status: "completed",
            },
          });
          responseMessage = `Logged study session on "${updatedEntity.topic}" for ${updatedEntity.durationMinutes} minutes.`;
          break;
        }

        case "create_goal": {
          const { name, category, targetValue, unit, dueDate, description } =
            aiParsedIntent;
          if (!name || !category) {
            responseMessage =
              "Missing required fields for creating a goal (name, category).";
            break;
          }
          const goalData = {
            name,
            category,
            userId,
            progress: 0,
            status: "In Progress",
            targetValue:
              typeof targetValue === "number" ? targetValue : undefined,
            unit,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            description,
          };
          updatedEntity = await prisma.goal.create({ data: goalData });
          responseMessage = `Created a new goal: "${updatedEntity.name}".`;
          break;
        }

        case "create_schedule_item": {
          const { activity, time, date, type } = aiParsedIntent;
          if (!activity || !time) {
            responseMessage =
              "Missing required fields for creating a schedule item (activity, time).";
            break;
          }
          const scheduleItemData = {
            userId: userId,
            activity,
            time,
            type,
            date: date ? new Date(date) : new Date(),
            status: "pending",
          };
          updatedEntity = await prisma.scheduleItem.create({
            data: scheduleItemData,
          });
          responseMessage = `Added "${updatedEntity.activity}" to your schedule at ${updatedEntity.time}.`;
          break;
        }

        case "suggest_study_plan": {
          const { topic, context } = aiParsedIntent;
          if (!topic) {
            return res
              .status(400)
              .json({
                message: "Study topic is required for suggesting a study plan.",
              });
          }

          const studyPlanPrompt = `
            Generate a structured study plan in JSON format for the topic: "${topic}".
            ${context ? `Consider this additional context: "${context}".` : ""}
            User's Profile: Name: ${userName}, Age: ${userAge}.

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
          const studyPlanSchema = {
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
          suggestedPlan = await callGeminiApi(
            {
              contents: [{ role: "user", parts: [{ text: studyPlanPrompt }] }],
            },
            studyPlanSchema
          );
          responseMessage = "Study plan suggested successfully.";
          break;
        }

        case "suggest_fitness_plan": {
          const { targetWeightKg, targetTimePeriodDays, context } =
            aiParsedIntent;

          // If AI couldn't extract targetWeightKg/targetTimePeriodDays, use defaults or prompt user
          // For now, let's assume if the intent is recognized, some form of goal is implied.
          // The AI prompt will be structured to handle missing specific numbers if it couldn't infer them.
          let fitnessPromptContext = "";
          if (userWeight && userBMI) {
            fitnessPromptContext = `Current stats: Weight ${userWeight} kg, BMI ${userBMI}.`;
          } else if (userWeight) {
            fitnessPromptContext = `Current weight: ${userWeight} kg.`;
          } else if (userBMI) {
            fitnessPromptContext = `Current BMI: ${userBMI}.`;
          } else {
            fitnessPromptContext = `Current stats are not fully available.`;
          }

          const fitnessPlanPrompt = `
            Generate a personalized fitness and diet plan in JSON format for ${userName} (Age: ${userAge}).
            ${fitnessPromptContext}
            ${
              targetWeightKg
                ? `Goal: Reduce weight to ${targetWeightKg} kg.`
                : ""
            }
            ${
              targetTimePeriodDays
                ? `Time period: ${targetTimePeriodDays} days.`
                : ""
            }
            ${context ? `Additional context: "${context}".` : ""}

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

          const fitnessPlanSchema = {
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
                      enum: [
                        "Cardio",
                        "Weight Training",
                        "Flexibility",
                        "Other",
                      ],
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
                    category: {
                      type: "STRING",
                      enum: ["Fitness", "Nutrition"],
                    },
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

          suggestedPlan = await callGeminiApi(
            {
              contents: [
                { role: "user", parts: [{ text: fitnessPlanPrompt }] },
              ],
            },
            fitnessPlanSchema
          );
          responseMessage = "Fitness plan suggested successfully.";
          break;
        }

        case "unknown":
        default:
          responseMessage =
            aiParsedIntent.reason ||
            "I couldn't understand that command. Please be more specific.";
          break;
      }

      // Return the appropriate response based on intent
      if (suggestedPlan) {
        res.status(200).json({ message: responseMessage, suggestedPlan });
      } else {
        res.status(200).json({ message: responseMessage, updatedEntity });
      }
    } catch (error) {
      console.error("Error in processNaturalLanguageCommand:", error);
      res.status(500).json({
        message: "An unexpected error occurred while processing your command.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

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

      const payload = {
        contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      };

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json();
        console.error("Gemini API Study Plan Error:", errorData);
        return res.status(aiResponse.status).json({
          message:
            errorData.error?.message ||
            "Failed to generate study plan from AI.",
          error: process.env.NODE_ENV === "development" ? errorData : undefined,
        });
      }

      const result = await aiResponse.json();
      const aiParsedPlan = JSON.parse(
        result.candidates[0].content.parts[0].text
      );
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
      let { currentWeightKg, currentBMI } = req.body; // Allow these to be optional in request body

      // Validate required target parameters
      if (
        typeof targetWeightKg !== "number" ||
        isNaN(targetWeightKg) ||
        targetWeightKg <= 0 ||
        typeof targetTimePeriodDays !== "number" ||
        isNaN(targetTimePeriodDays) ||
        targetTimePeriodDays <= 0
      ) {
        return res.status(400).json({
          message: "Missing or invalid targetWeightKg or targetTimePeriodDays.",
        });
      }

      // Fetch user's profile data from the database
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, age: true, bodyweight: true, bmi: true },
      });

      // Prioritize request body data, then fall back to stored user data
      const actualCurrentWeight =
        currentWeightKg ||
        (user?.bodyweight ? parseFloat(user.bodyweight) : null);
      const actualCurrentBMI =
        currentBMI || (user?.bmi ? parseFloat(user.bmi) : null);
      const userName = user?.name || "User";
      const userAge = user?.age || "N/A";

      // Construct dynamic prompt based on available data
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
        Goal: Reduce weight to ${targetWeightKg} kg in ${targetTimePeriodDays} days.

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

      const payload = {
        contents: [{ role: "user", parts: [{ text: aiPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: responseSchema,
        },
      };

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

      const aiResponse = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!aiResponse.ok) {
        const errorData = await aiResponse.json();
        console.error("Gemini API Fitness Plan Error:", errorData);
        return res.status(aiResponse.status).json({
          message:
            errorData.error?.message ||
            "Failed to generate fitness plan from AI.",
          error: process.env.NODE_ENV === "development" ? errorData : undefined,
        });
      }

      const result = await aiResponse.json();
      const aiParsedPlan = JSON.parse(
        result.candidates[0].content.parts[0].text
      );
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
