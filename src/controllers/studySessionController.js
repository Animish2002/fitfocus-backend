const { PrismaClient } = require("@prisma/client");
const notificationController = require("./notificationController");

const prisma = new PrismaClient();

const studySessionController = {
  async createStudySession(req, res) {
    try {
      const userId = req.user.userId; // Get userId from authenticated token
      const { topic, durationMinutes, notes, status } = req.body;

      // Basic validation
      if (
        !topic ||
        typeof durationMinutes !== "number" ||
        isNaN(durationMinutes) ||
        durationMinutes <= 0
      ) {
        return res
          .status(400)
          .json({ message: "Topic and valid durationMinutes are required." });
      }
      // Status is often 'completed' for a logged session, but could be 'in-progress' if tracking live
      if (!status) {
        return res
          .status(400)
          .json({
            message: "Status is required (e.g., 'completed', 'in-progress').",
          });
      }

      const newStudySession = await prisma.studySession.create({
        data: {
          topic,
          durationMinutes,
          notes,
          status,
          userId,
          date: new Date(), // Logged at current time
        },
      });

      await notificationController.sendNotificationToUser(
        userId,
        "Study Session Logged! 📚",
        `You just completed a ${newStudySession.durationMinutes}-minute study session on "${newStudySession.topic}". Great focus!`,
        "/dashboard/study-logs" // Assuming a page to view study logs
      );
      console.log(
        `Notification sent for new study session: ${newStudySession.topic}`
      );

      res.status(201).json({
        message: "Study session created successfully.",
        studySession: newStudySession,
      });
    } catch (error) {
      console.error("Error creating study session:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while creating the study session.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getStudySessions(req, res) {
    try {
      const userId = req.user.userId;
      const { date, topic, status, sortBy, limit, page } = req.query;

      let whereClause = { userId: userId };
      let orderByClause = { date: "desc" }; // Default sort by newest first

      if (date) {
        const targetDate = new Date(date);
        targetDate.setUTCHours(0, 0, 0, 0);
        const nextDay = new Date(targetDate);
        nextDay.setDate(targetDate.getDate() + 1);

        whereClause.date = {
          gte: targetDate,
          lt: nextDay,
        };
      }
      if (topic) {
        whereClause.topic = { contains: topic, mode: "insensitive" }; // Case-insensitive search
      }
      if (status) {
        whereClause.status = status;
      }

      // Basic pagination
      let take = parseInt(limit) || 10;
      let skip = (parseInt(page) - 1) * take || 0;

      const studySessions = await prisma.studySession.findMany({
        where: whereClause,
        orderBy: orderByClause,
        take: take,
        skip: skip,
      });

      const totalSessions = await prisma.studySession.count({
        where: whereClause,
      });

      res.status(200).json({
        studySessions,
        pagination: {
          total: totalSessions,
          page: parseInt(page) || 1,
          limit: take,
          totalPages: Math.ceil(totalSessions / take),
        },
      });
    } catch (error) {
      console.error("Error fetching study sessions:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching study sessions.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getStudySessionById(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const studySession = await prisma.studySession.findUnique({
        where: { id: id, userId: userId }, // Ensure user owns the session
      });

      if (!studySession) {
        return res
          .status(404)
          .json({ message: "Study session not found or unauthorized." });
      }

      res.status(200).json(studySession);
    } catch (error) {
      console.error("Error fetching single study session:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while fetching the study session.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async updateStudySession(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;
      const { topic, durationMinutes, notes, status } = req.body;

      // Prepare data for update, only include provided fields
      const updateData = {};
      if (topic !== undefined) updateData.topic = topic;
      if (
        durationMinutes !== undefined &&
        typeof durationMinutes === "number" &&
        !isNaN(durationMinutes) &&
        durationMinutes > 0
      ) {
        updateData.durationMinutes = durationMinutes;
      } else if (durationMinutes !== undefined) {
        // If provided but invalid
        return res
          .status(400)
          .json({ message: "durationMinutes must be a positive number." });
      }
      if (notes !== undefined) updateData.notes = notes;
      if (status !== undefined) updateData.status = status;

      const updatedStudySession = await prisma.studySession.update({
        where: { id: id, userId: userId }, // Ensure user owns the session
        data: updateData,
      });

      res.status(200).json({
        message: "Study session updated successfully.",
        studySession: updatedStudySession,
      });
    } catch (error) {
      console.error("Error updating study session:", error);
      if (error.code === "P2025") {
        // Prisma error code for record not found
        return res
          .status(404)
          .json({
            message: "Study session not found or unauthorized to update.",
          });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while updating the study session.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async deleteStudySession(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      // Check if the session exists and belongs to the user before deleting
      const sessionToDelete = await prisma.studySession.findUnique({
        where: { id: id, userId: userId },
      });

      if (!sessionToDelete) {
        return res
          .status(404)
          .json({
            message: "Study session not found or unauthorized to delete.",
          });
      }

      await prisma.studySession.delete({
        where: { id: id },
      });

      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error("Error deleting study session:", error);
      if (error.code === "P2025") {
        // Prisma error code for record not found
        return res
          .status(404)
          .json({
            message: "Study session not found or unauthorized to delete.",
          });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while deleting the study session.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = studySessionController;
