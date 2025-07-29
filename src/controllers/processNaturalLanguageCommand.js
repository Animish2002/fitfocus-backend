// controllers/processNaturalLanguageCommand.js

/**
 * Handles natural language commands by routing them to appropriate backend actions
 * via Gemini's function calling.
 *
 * @param {object} dependencies - Object containing necessary dependencies.
 * @param {PrismaClient} dependencies.prisma - Prisma client instance.
 * @param {function} dependencies.callGeminiApi - Helper function to call Gemini API.
 * @param {string} dependencies.GEMINI_API_KEY - Gemini API Key.
 * @returns {function} Express.js middleware function.
 */
module.exports =
  ({ prisma, callGeminiApi, GEMINI_API_KEY }) =>
  async (req, res) => {
    // --- IMPORT NOTIFICATION CONTROLLER HERE ---
    const notificationController = require("./notificationController");
    // --- END IMPORT ---

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

      // Define tools for Gemini's function calling
      const tools = {
        functionDeclarations: [
          {
            name: "complete_schedule_item",
            description:
              "Updates the status of an EXISTING schedule item (e.g., marks it as 'completed' or 'in-progress'). Use this when the user indicates they have finished an activity or want to change its state. Requires the name of the activity to be updated.",
            parameters: {
              type: "OBJECT",
              properties: {
                activityName: {
                  type: "STRING",
                  description:
                    "The name or a unique part of the activity to update its status.",
                },
                status: {
                  type: "STRING",
                  description:
                    "The new status for the activity (e.g., 'completed', 'in-progress', 'pending'). Defaults to 'completed' if not specified.",
                },
                date: {
                  type: "STRING",
                  description:
                    "The date of the activity in YYYY-MM-DD format (optional, defaults to today if not specified).",
                },
              },
              required: ["activityName"],
            },
          },
          {
            name: "set_goal_progress",
            description:
              "Updates the progress percentage of an existing goal. Use this when the user states a goal's new completion percentage.",
            parameters: {
              type: "OBJECT",
              properties: {
                goalName: {
                  type: "STRING",
                  description: "The name of the goal to update.",
                },
                progress: {
                  type: "NUMBER",
                  description: "The new progress percentage (0-100).",
                },
              },
              required: ["goalName", "progress"],
            },
          },
          {
            name: "log_fitness_activity",
            description:
              "Logs a new fitness activity or workout session. Use this when the user reports completing a workout or exercise.",
            parameters: {
              type: "OBJECT",
              properties: {
                workoutName: {
                  type: "STRING",
                  description:
                    "The name of the workout or activity (e.g., 'Morning HIIT', 'Strength Training').",
                },
                durationMinutes: {
                  type: "NUMBER",
                  description: "The duration of the workout in minutes.",
                },
                caloriesBurned: {
                  type: "NUMBER",
                  description: "Optional: Calories burned during the workout.",
                },
                type: {
                  type: "STRING",
                  description:
                    "Optional: Type of workout (e.g., 'Cardio', 'Strength', 'Yoga', 'Other').",
                },
                date: {
                  type: "STRING",
                  description:
                    "Optional: The date of the workout in YYYY-MM-DD format (defaults to today).",
                },
              },
              required: ["workoutName", "durationMinutes"],
            },
          },
          {
            name: "log_study_session",
            description:
              "Logs a new study session. Use this when the user reports completing a study period on a topic.",
            parameters: {
              type: "OBJECT",
              properties: {
                topic: {
                  type: "STRING",
                  description: "The topic or subject studied.",
                },
                durationMinutes: {
                  type: "NUMBER",
                  description: "The duration of the study session in minutes.",
                },
                notes: {
                  type: "STRING",
                  description:
                    "Optional: Any specific notes about the study session.",
                },
                date: {
                  type: "STRING",
                  description:
                    "Optional: The date of the study session in YYYY-MM-DD format (defaults to today).",
                },
              },
              required: ["topic", "durationMinutes"],
            },
          },
          {
            name: "create_goal",
            description:
              "Creates a new personal goal for the user. Use this when the user explicitly states they want to set a new goal.",
            parameters: {
              type: "OBJECT",
              properties: {
                name: {
                  type: "STRING",
                  description: "The name of the new goal.",
                },
                category: {
                  type: "STRING",
                  description:
                    "The category of the goal (e.g., 'Fitness', 'Study', 'Personal Development', 'Wellness').",
                },
                targetValue: {
                  type: "NUMBER",
                  description:
                    "Optional: A numerical target for the goal (e.g., 10 for 10kg, 100 for 100%).",
                },
                unit: {
                  type: "STRING",
                  description:
                    "Optional: The unit for the target value (e.g., 'kg', '%', 'books', 'sessions').",
                },
                dueDate: {
                  type: "STRING",
                  description:
                    "Optional: The target completion date in YYYY-MM-DD format.",
                },
                description: {
                  type: "STRING",
                  description: "Optional: A detailed description of the goal.",
                },
              },
              required: ["name", "category"],
            },
          },
          {
            name: "create_schedule_item",
            description:
              "Adds a NEW activity or task to the user's daily schedule. Use this when the user wants to plan something for the future or add a new one-off task. This is for adding new items, not updating existing ones.",
            parameters: {
              type: "OBJECT",
              properties: {
                activity: {
                  type: "STRING",
                  description:
                    "The name or description of the activity to add.",
                },
                time: {
                  type: "STRING",
                  description:
                    "The time of the activity (e.g., '06:00 AM', '11:00'). Use 24-hour format if possible, e.g., '14:30' for 2:30 PM.",
                },
                type: {
                  type: "STRING",
                  description:
                    "Category of the activity (e.g., 'fitness', 'study', 'misc', 'work', 'wellness'). Defaults to 'misc'.",
                },
                status: {
                  type: "STRING",
                  description:
                    "Initial status (e.g., 'pending', 'in-progress'). Defaults to 'pending'.",
                },
                date: {
                  type: "STRING",
                  description:
                    "The date for this scheduled item in YYYY-MM-DD format (optional, defaults to today).",
                },
                notes: {
                  type: "STRING",
                  description: "Optional notes for the activity.",
                },
              },
              required: ["activity", "time"],
            },
          },
          {
            name: "suggest_study_plan",
            description:
              "Generates a structured study plan based on a topic and optional context. Use this when the user explicitly asks for a study plan.",
            parameters: {
              type: "OBJECT",
              properties: {
                topic: {
                  type: "STRING",
                  description: "The main topic for the study plan.",
                },
                context: {
                  type: "STRING",
                  description:
                    "Optional: Additional context or specific areas to focus on.",
                },
              },
              required: ["topic"],
            },
          },
          {
            name: "suggest_fitness_plan",
            description:
              "Generates a personalized fitness and diet plan. Use this when the user explicitly asks for a fitness plan or diet advice.",
            parameters: {
              type: "OBJECT",
              properties: {
                targetWeightKg: {
                  type: "NUMBER",
                  description:
                    "Optional: The user's target weight in kilograms.",
                },
                targetTimePeriodDays: {
                  type: "NUMBER",
                  description:
                    "Optional: The number of days within which to achieve the goal.",
                },
                currentWeightKg: {
                  type: "NUMBER",
                  description:
                    "Optional: The user's current weight in kilograms.",
                },
                currentBMI: {
                  type: "NUMBER",
                  description: "Optional: The user's current BMI.",
                },
              },
            },
          },
          {
            name: "unknown_command",
            description:
              "Call this function if the user's command cannot be mapped to any other specific function. Provide a reason.",
            parameters: {
              type: "OBJECT",
              properties: {
                reason: {
                  type: "STRING",
                  description:
                    "Brief explanation why the command was not understood.",
                },
              },
              required: ["reason"],
            },
          },
        ],
      };

      const aiPromptForToolSelection = `
        You are an AI assistant for a personal well-being application. Your primary goal is to help users manage their fitness, study, and general life activities.
        Your capabilities include:
        - Logging fitness activities (e.g., 'I ran for 30 minutes', 'I did weight training for an hour').
        - Logging study sessions (e.g., 'I studied math for 2 hours', 'Finished my chemistry notes').
        - Setting and updating personal goals (e.g., 'Set a goal to run a marathon', 'I'm 50% done with my CAT syllabus goal').
        - Scheduling new activities (e.g., 'Schedule a yoga session for tomorrow at 7 AM', 'Add a meeting at 2 PM on Friday').
        - Marking scheduled items as complete or in-progress (e.g., 'Mark my morning workout as complete').
        - Suggesting structured study plans based on a topic (e.g., 'Suggest a plan to study linear algebra').
        - Suggesting personalized fitness and diet plans based on current stats and goals (e.g., 'Suggest a fitness plan for weight loss').

        Current User Information:
        - Name: ${userName}
        - Age: ${userAge}
        ${userWeight ? `- Bodyweight: ${userWeight} kg` : ""}
        ${userBMI ? `- BMI: ${userBMI}` : ""}

        Based on the user's command, determine the most appropriate action. If the command clearly maps to one of your defined functions, call that function with the extracted arguments.
        If the command is unclear or doesn't fit any specific function, use the 'unknown_command' tool and provide a brief reason.

        User Command: "${command}"
      `;

      // Call Gemini for tool selection
      const rawGeminiResponse = await callGeminiApi(
        {
          contents: [
            { role: "user", parts: [{ text: aiPromptForToolSelection }] },
          ],
        },
        null, // No responseSchema for the initial tool selection
        tools
      );

      console.log(
        "DEBUG: rawGeminiResponse after callGeminiApi (STEP 2 - processNaturalLanguageCommand):",
        JSON.stringify(rawGeminiResponse, null, 2)
      );

      let functionCall = null;
      let textResponse = null;

      if (
        rawGeminiResponse.candidates &&
        rawGeminiResponse.candidates.length > 0
      ) {
        const candidate = rawGeminiResponse.candidates[0];

        if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts.length > 0 &&
          candidate.content.parts[0].functionCall
        ) {
          functionCall = candidate.content.parts[0].functionCall;
        } else if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts.length > 0
        ) {
          textResponse = candidate.content.parts[0].text;
        } else if (candidate.text) {
          textResponse = candidate.text;
        }
      }

      let responseMessage = "Command processed.";
      let updatedEntity = null;
      let suggestedPlan = null;

      // Process AI's Function Call or Text Response
      if (functionCall) {
        const call = functionCall;
        console.log(
          "Gemini called function:",
          call.name,
          "with args:",
          call.args
        );

        switch (call.name) {
          case "complete_schedule_item": {
            const { activityName, status = "completed", date } = call.args;
            const targetDate = date ? new Date(date) : new Date();

            const existingItem = await prisma.scheduleItem.findFirst({
              where: {
                userId: userId,
                activity: { contains: activityName, mode: "insensitive" },
                date: {
                  gte: new Date(targetDate.setHours(0, 0, 0, 0)),
                  lt: new Date(targetDate.setHours(23, 59, 59, 999)),
                },
              },
            });

            if (existingItem) {
              const updatedScheduleItem = await prisma.scheduleItem.update({
                where: { id: existingItem.id },
                data: { status: status },
              });
              updatedEntity = updatedScheduleItem; // Set updatedEntity here

              responseMessage = `Schedule item "${updatedScheduleItem.activity}" marked as ${updatedScheduleItem.status}.`;

              // --- NOTIFICATION FOR SCHEDULE ITEM COMPLETION/IN-PROGRESS ---
              const wasCompleted = updatedScheduleItem.status === "completed";
              const hadPreviouslyCompleted =
                existingItem.status === "completed";
              const wasInProgress =
                updatedScheduleItem.status === "in-progress";
              const hadPreviouslyInProgress =
                existingItem.status === "in-progress";

              if (wasCompleted && !hadPreviouslyCompleted) {
                await notificationController.sendNotificationToUser(
                  userId,
                  "Activity Completed! ✅",
                  `You marked "${updatedScheduleItem.activity}" as completed. Great job!`,
                  "/dashboard/schedule"
                );
                console.log(
                  `Notification sent for completed schedule item via AI: ${updatedScheduleItem.activity}`
                );
              } else if (wasInProgress && !hadPreviouslyInProgress) {
                await notificationController.sendNotificationToUser(
                  userId,
                  "Activity In Progress! ⏳",
                  `"${updatedScheduleItem.activity}" is now in progress. Keep pushing!`,
                  "/dashboard/schedule"
                );
                console.log(
                  `Notification sent for in-progress schedule item via AI: ${updatedScheduleItem.activity}`
                );
              }
              // --- END NOTIFICATION ---
            } else {
              responseMessage = `Could not find a schedule item matching "${activityName}" for the specified date.`;
            }
            break;
          }

          case "set_goal_progress": {
            const { goalName, progress } = call.args;
            if (
              typeof progress !== "number" ||
              progress < 0 ||
              progress > 100
            ) {
              responseMessage =
                "Invalid progress value. Please provide a number between 0 and 100.";
              break;
            }
            const existingGoal = await prisma.goal.findFirst({
              where: {
                userId: userId,
                name: { contains: goalName, mode: "insensitive" },
              },
            });

            if (existingGoal) {
              const updatedGoal = await prisma.goal.update({
                where: { id: existingGoal.id },
                data: { progress: progress },
              });
              updatedEntity = updatedGoal; // Set updatedEntity here

              responseMessage = `Goal "${updatedGoal.name}" progress updated to ${updatedGoal.progress}%.`;

              // --- NOTIFICATION FOR GOAL COMPLETION ---
              const wasCompleted =
                updatedGoal.progress >= 100 ||
                updatedGoal.status === "Completed";
              const hadPreviouslyCompleted =
                existingGoal.progress >= 100 ||
                existingGoal.status === "Completed";

              if (wasCompleted && !hadPreviouslyCompleted) {
                await notificationController.sendNotificationToUser(
                  userId,
                  "Goal Achieved! 🎉",
                  `Congratulations! You completed your goal: "${updatedGoal.name}"!`,
                  "/dashboard/goals"
                );
                console.log(
                  `Notification sent for completed goal via AI: ${updatedGoal.name}`
                );
              }
              // --- END NOTIFICATION ---
            } else {
              responseMessage = `Could not find a goal named "${goalName}".`;
            }
            break;
          }

          case "log_fitness_activity": {
            const { workoutName, durationMinutes, caloriesBurned, type, date } =
              call.args;
            if (
              !workoutName ||
              typeof durationMinutes !== "number" ||
              durationMinutes <= 0
            ) {
              responseMessage =
                "Missing required fields (workout name, duration) for logging fitness activity.";
              break;
            }
            const newFitnessLog = await prisma.fitnessLog.create({
              data: {
                userId: userId,
                workoutName,
                durationMinutes,
                caloriesBurned:
                  typeof caloriesBurned === "number" ? caloriesBurned : null,
                type: type || "Other",
                date: date ? new Date(date) : new Date(),
              },
            });
            updatedEntity = newFitnessLog; // Set updatedEntity here

            responseMessage = `Logged fitness activity "${newFitnessLog.workoutName}" for ${newFitnessLog.durationMinutes} minutes.`;

            // --- NOTIFICATION FOR NEW FITNESS LOG ---
            await notificationController.sendNotificationToUser(
              userId,
              "Workout Logged! 💪",
              `You just logged "${newFitnessLog.workoutName}" for ${newFitnessLog.durationMinutes} minutes. Keep up the great work!`,
              "/dashboard/fitness-logs"
            );
            console.log(
              `Notification sent for new fitness log via AI: ${newFitnessLog.workoutName}`
            );
            // --- END NOTIFICATION ---

            break;
          }

          case "log_study_session": {
            const { topic, durationMinutes, notes, date } = call.args;
            if (
              !topic ||
              typeof durationMinutes !== "number" ||
              durationMinutes <= 0
            ) {
              responseMessage =
                "Missing required fields (topic, duration) for logging study session.";
              break;
            }
            const newStudySession = await prisma.studySession.create({
              data: {
                userId: userId,
                topic,
                durationMinutes,
                notes,
                date: date ? new Date(date) : new Date(),
                status: "completed",
              },
            });
            updatedEntity = newStudySession; // Set updatedEntity here

            responseMessage = `Logged study session on "${newStudySession.topic}" for ${newStudySession.durationMinutes} minutes.`;

            // --- NOTIFICATION FOR NEW STUDY SESSION ---
            await notificationController.sendNotificationToUser(
              userId,
              "Study Session Logged! 📚",
              `You just completed a ${newStudySession.durationMinutes}-minute study session on "${newStudySession.topic}". Great focus!`,
              "/dashboard/study-logs"
            );
            console.log(
              `Notification sent for new study session via AI: ${newStudySession.topic}`
            );
            // --- END NOTIFICATION ---

            break;
          }

          case "create_goal": {
            const { name, category, targetValue, unit, dueDate, description } =
              call.args;
            if (!name || !category) {
              responseMessage =
                "Missing required fields (name, category) for creating a goal.";
              break;
            }
            const newGoal = await prisma.goal.create({
              data: {
                userId: userId,
                name,
                category,
                targetValue:
                  typeof targetValue === "number" ? targetValue : null,
                unit: unit || null,
                dueDate: dueDate ? new Date(dueDate) : null,
                status: "In Progress",
                description: description || null,
              },
            });
            updatedEntity = newGoal; // Set updatedEntity here

            responseMessage = `Created a new goal: "${newGoal.name}" in category "${newGoal.category}".`;

            // --- NOTIFICATION FOR NEW GOAL ---
            await notificationController.sendNotificationToUser(
              userId,
              "New Goal Set! 🎯",
              `You just created a new goal: "${newGoal.name}". Let's achieve it!`,
              "/dashboard/goals"
            );
            console.log(
              `Notification sent for new goal via AI: ${newGoal.name}`
            );
            // --- END NOTIFICATION ---

            break;
          }

          case "create_schedule_item": {
            const {
              activity,
              time,
              type = "misc",
              status = "pending",
              date,
              notes,
            } = call.args;
            if (!activity || !time) {
              responseMessage =
                "Missing required fields (activity, time) for creating a schedule item.";
              break;
            }
            const newScheduleItem = await prisma.scheduleItem.create({
              data: {
                userId: userId,
                activity,
                time,
                type,
                status,
                date: date ? new Date(date) : new Date(),
                notes,
              },
            });
            updatedEntity = newScheduleItem; // Set updatedEntity here

            responseMessage = `Scheduled "${newScheduleItem.activity}" for ${
              newScheduleItem.time
            } ${newScheduleItem.date.toISOString().split("T")[0]}.`;

            // --- NOTIFICATION FOR NEW SCHEDULE ITEM ---
            await notificationController.sendNotificationToUser(
              userId,
              "Activity Scheduled! 🗓️",
              `"${newScheduleItem.activity}" is now scheduled for ${
                newScheduleItem.date.toISOString().split("T")[0]
              } at ${newScheduleItem.time}.`,
              "/dashboard/schedule"
            );
            console.log(
              `Notification sent for new schedule item via AI: ${newScheduleItem.activity}`
            );
            // --- END NOTIFICATION ---

            break;
          }

          case "suggest_study_plan": {
            const { topic, context } = call.args;
            if (!topic || topic.trim() === "") {
              responseMessage =
                "Study topic is required for suggesting a study plan.";
              break;
            }

            const userContext = user
              ? `User Name: ${userName}, Age: ${userAge}.`
              : "";

            const studyPlanPrompt = `
              Generate a structured study plan in JSON format for the topic: "${topic}".
              ${
                context ? `Consider this additional context: "${context}".` : ""
              }
              ${
                userContext ? `Consider the user's profile: ${userContext}` : ""
              }

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
            const rawPlanResponse = await callGeminiApi(
              {
                contents: [
                  { role: "user", parts: [{ text: studyPlanPrompt }] },
                ],
              },
              studyPlanSchema
            );

            if (
              rawPlanResponse.candidates &&
              rawPlanResponse.candidates.length > 0 &&
              rawPlanResponse.candidates[0].content &&
              rawPlanResponse.candidates[0].content.parts &&
              rawPlanResponse.candidates[0].content.parts.length > 0
            ) {
              try {
                suggestedPlan = JSON.parse(
                  rawPlanResponse.candidates[0].content.parts[0].text
                );
                responseMessage = "Study plan suggested successfully.";
              } catch (e) {
                console.error(
                  "Failed to parse JSON for study plan:",
                  e.message
                );
                responseMessage =
                  "AI provided a study plan, but it could not be parsed. Please try again.";
                suggestedPlan = null;
              }
            } else {
              responseMessage =
                "AI did not provide a structured study plan response.";
            }
            break;
          }

          case "suggest_fitness_plan": {
            const {
              targetWeightKg,
              targetTimePeriodDays,
              currentWeightKg,
              currentBMI,
            } = call.args;

            const actualCurrentWeight =
              currentWeightKg ||
              (user?.bodyweight ? parseFloat(user.bodyweight) : null);
            const actualCurrentBMI =
              currentBMI || (user?.bmi ? parseFloat(user.bmi) : null);

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

            const rawPlanResponse = await callGeminiApi(
              { contents: [{ role: "user", parts: [{ text: aiPrompt }] }] },
              responseSchema
            );

            if (
              rawPlanResponse.candidates &&
              rawPlanResponse.candidates.length > 0 &&
              rawPlanResponse.candidates[0].content &&
              rawPlanResponse.candidates[0].content.parts &&
              rawPlanResponse.candidates[0].content.parts.length > 0
            ) {
              try {
                suggestedPlan = JSON.parse(
                  rawPlanResponse.candidates[0].content.parts[0].text
                );
                responseMessage = "Fitness plan suggested successfully.";
              } catch (e) {
                console.error(
                  "Failed to parse JSON for fitness plan:",
                  e.message
                );
                responseMessage =
                  "AI provided a fitness plan, but it could not be parsed. Please try again.";
                suggestedPlan = null;
              }
            } else {
              responseMessage =
                "AI did not provide a structured fitness plan response.";
            }
            break;
          }

          case "unknown_command":
          default:
            responseMessage =
              call.args?.reason ||
              "I couldn't understand that command. Please be more specific.";
            break;
        }
      } else if (textResponse) {
        responseMessage = textResponse;
      } else {
        responseMessage =
          "AI did not provide a clear function call or text response.";
        if (
          rawGeminiResponse.candidates &&
          rawGeminiResponse.candidates.length > 0 &&
          rawGeminiResponse.candidates[0].content &&
          rawGeminiResponse.candidates[0].content.parts &&
          rawGeminiResponse.candidates[0].content.parts.length > 0
        ) {
          responseMessage =
            rawGeminiResponse.candidates[0].content.parts[0].text ||
            responseMessage;
        }
      }

      res.status(200).json({
        message: responseMessage,
        updatedEntity: updatedEntity,
        suggestedPlan: suggestedPlan,
      });
    } catch (error) {
      console.error("Error in processNaturalLanguageCommand:", error);
      res.status(500).json({
        message: "An unexpected error occurred while processing your command.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  };
