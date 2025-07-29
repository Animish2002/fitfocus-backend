const { PrismaClient } = require("@prisma/client");
const notificationController = require("./notificationController");

const prisma = new PrismaClient();

const goalController = {
  async createGoal(req, res) {
    try {
      const userId = req.user.userId; // Get userId from authenticated token
      const {
        name,
        category,
        targetValue,
        unit,
        dueDate,
        description,
        initialProgress,
      } = req.body;

      // Basic validation
      if (!name || !category) {
        return res
          .status(400)
          .json({ message: "Goal name and category are required." });
      }

      // Prepare data, handling optional fields and type conversions
      const goalData = {
        name,
        category,
        userId,
        progress: initialProgress || 0, // Default progress to 0 if not provided
        status: "In Progress", // Default status for new goals
      };

      // Validate and assign targetValue
      if (targetValue !== undefined) {
        if (typeof targetValue === "number" && !isNaN(targetValue)) {
          goalData.targetValue = targetValue;
        } else {
          return res
            .status(400)
            .json({ message: "targetValue must be a number." });
        }
      }

      if (unit !== undefined) {
        goalData.unit = unit;
      }
      if (dueDate) {
        // Ensure dueDate is a valid date string that can be parsed
        const parsedDate = new Date(dueDate);
        if (isNaN(parsedDate.getTime())) {
          return res
            .status(400)
            .json({ message: "Invalid dueDate format. Use YYYY-MM-DD." });
        }
        goalData.dueDate = parsedDate;
      }
      if (description !== undefined) {
        goalData.description = description;
      }

      const newGoal = await prisma.goal.create({
        data: goalData,
      });

      await notificationController.sendNotificationToUser(
        newGoal.userId,
        "New Goal Added!",
        `You added a new goal: "${newGoal.name}" 🎉`,
        "/dashboard/goals" // Link to goals page
      );

      res.status(201).json({
        message: "Goal created successfully.",
        goal: newGoal,
      });
    } catch (error) {
      console.error("Error creating goal:", error);
      res.status(500).json({
        message: "An unexpected error occurred while creating the goal.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getGoals(req, res) {
    try {
      const userId = req.user.userId;
      const { category, status, sortBy, limit, page } = req.query;

      let whereClause = { userId: userId };
      let orderByClause = { createdAt: "desc" }; // Default sort by creation date, newest first
      let take = parseInt(limit) || 10; // Default limit to 10 items per page
      let skip = (parseInt(page) - 1) * take || 0; // Calculate skip for pagination

      if (category) {
        whereClause.category = category;
      }
      if (status) {
        whereClause.status = status;
      }

      // Example sorting options
      // Note: Prisma's orderBy for nullable fields might place nulls first or last.
      // If precise null handling is needed, fetch and sort in application logic.
      if (sortBy === "dueDateAsc") {
        orderByClause = { dueDate: "asc" };
      } else if (sortBy === "dueDateDesc") {
        orderByClause = { dueDate: "desc" };
      } else if (sortBy === "progressAsc") {
        orderByClause = { progress: "asc" };
      } else if (sortBy === "progressDesc") {
        orderByClause = { progress: "desc" };
      }

      const goals = await prisma.goal.findMany({
        where: whereClause,
        orderBy: orderByClause,
        take: take,
        skip: skip,
      });

      // Optionally, get total count for pagination metadata
      const totalGoals = await prisma.goal.count({ where: whereClause });

      res.status(200).json({
        goals,
        pagination: {
          total: totalGoals,
          page: parseInt(page) || 1,
          limit: take,
          totalPages: Math.ceil(totalGoals / take),
        },
      });
    } catch (error) {
      console.error("Error fetching goals:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching goals.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getGoalById(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const goal = await prisma.goal.findUnique({
        where: { id: id, userId: userId }, // Ensure user owns the goal
      });

      if (!goal) {
        return res
          .status(404)
          .json({ message: "Goal not found or unauthorized." });
      }

      res.status(200).json(goal);
    } catch (error) {
      console.error("Error fetching goal by ID:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching the goal.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async updateGoal(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;
      const {
        name,
        category,
        progress,
        status,
        targetValue,
        unit,
        dueDate,
        description,
      } = req.body;

      // 1. Fetch the existing goal to compare status/progress later
      const existingGoal = await prisma.goal.findUnique({
        where: { id: id, userId: userId },
      });

      if (!existingGoal) {
        return res
          .status(404)
          .json({ message: "Goal not found or unauthorized to update." });
      }

      // Prepare data for update, only include provided fields
      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (category !== undefined) updateData.category = category;

      if (progress !== undefined) {
        const parsedProgress = parseInt(progress);
        if (
          isNaN(parsedProgress) ||
          parsedProgress < 0 ||
          parsedProgress > 100
        ) {
          return res
            .status(400)
            .json({ message: "Progress must be a number between 0 and 100." });
        }
        updateData.progress = parsedProgress;
      }
      if (status !== undefined) updateData.status = status;

      if (targetValue !== undefined) {
        if (typeof targetValue === "number" && !isNaN(targetValue)) {
          updateData.targetValue = targetValue;
        } else if (targetValue === null) {
          // Allow setting to null
          updateData.targetValue = null;
        } else {
          return res
            .status(400)
            .json({ message: "targetValue must be a number or null." });
        }
      }
      if (unit !== undefined) updateData.unit = unit;

      if (dueDate !== undefined) {
        if (dueDate === null) {
          // Allow setting to null
          updateData.dueDate = null;
        } else {
          const parsedDate = new Date(dueDate);
          if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({
              message: "Invalid dueDate format. Use YYYY-MM-DD or null.",
            });
          }
          updateData.dueDate = parsedDate;
        }
      }
      if (description !== undefined) updateData.description = description;

      // 2. Perform the update
      const updatedGoal = await prisma.goal.update({
        where: { id: id, userId: userId }, // Ensure user owns the goal
        data: updateData,
      });

      

      res.status(200).json({
        message: "Goal updated successfully.",
        goal: updatedGoal,
      });
    } catch (error) {
      console.error("Error updating goal:", error);
      if (error.code === "P2025") {
        // Prisma error code for record not found
        return res
          .status(404)
          .json({ message: "Goal not found or unauthorized to update." });
      }
      res.status(500).json({
        message: "An unexpected error occurred while updating the goal.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async deleteGoal(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      // Check if the goal exists and belongs to the user before deleting
      const goalToDelete = await prisma.goal.findUnique({
        where: { id: id, userId: userId },
      });

      if (!goalToDelete) {
        return res
          .status(404)
          .json({ message: "Goal not found or unauthorized to delete." });
      }

      await prisma.goal.delete({
        where: { id: id },
      });

      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error("Error deleting goal:", error);
      if (error.code === "P2025") {
        // Prisma error code for record not found
        return res
          .status(404)
          .json({ message: "Goal not found or unauthorized to delete." });
      }
      res.status(500).json({
        message: "An unexpected error occurred while deleting the goal.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = goalController;
