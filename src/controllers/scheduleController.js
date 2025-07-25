const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const scheduleController = {
  async createScheduleItem(req, res) {
    try {
      const userId = req.user.userId; // Get userId from authenticated token
      const { activity, time, type, status, date, notes } = req.body;

      // Basic validation
      if (!activity || !time || !type || !status || !date) {
        return res
          .status(400)
          .json({
            message:
              "Missing required fields: activity, time, type, status, date.",
          });
      }

      // Validate date format
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }

      const newScheduleItem = await prisma.scheduleItem.create({
        data: {
          activity,
          time,
          type,
          status,
          date: parsedDate,
          notes,
          userId, // Link to the authenticated user
        },
      });

      res.status(201).json({
        message: "Schedule item created successfully.",
        scheduleItem: newScheduleItem,
      });
    } catch (error) {
      console.error("Error creating schedule item:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while creating the schedule item.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getScheduleItems(req, res) {
    try {
      const userId = req.user.userId;
      const { date, type, status, sortBy, limit, page } = req.query;

      let whereClause = { userId: userId };
      let orderByClause = { time: "asc" }; // Default sort by time

      if (date) {
        // Filter by date (start of day to end of day)
        const targetDate = new Date(date);
        targetDate.setUTCHours(0, 0, 0, 0); // Normalize to start of the day in UTC
        const nextDay = new Date(targetDate);
        nextDay.setDate(targetDate.getDate() + 1); // Get start of next day

        whereClause.date = {
          gte: targetDate, // Greater than or equal to start of target date
          lt: nextDay, // Less than start of next day
        };
      }
      if (type) {
        whereClause.type = type;
      }
      if (status) {
        whereClause.status = status;
      }

      // Basic pagination
      let take = parseInt(limit) || 10;
      let skip = (parseInt(page) - 1) * take || 0;

      const scheduleItems = await prisma.scheduleItem.findMany({
        where: whereClause,
        orderBy: orderByClause,
        take: take,
        skip: skip,
      });

      const totalItems = await prisma.scheduleItem.count({
        where: whereClause,
      });

      res.status(200).json({
        scheduleItems,
        pagination: {
          total: totalItems,
          page: parseInt(page) || 1,
          limit: take,
          totalPages: Math.ceil(totalItems / take),
        },
      });
    } catch (error) {
      console.error("Error fetching schedule items:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching schedule items.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async getScheduleItemById(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const scheduleItem = await prisma.scheduleItem.findUnique({
        where: { id: id, userId: userId }, // Ensure user owns the item
      });

      if (!scheduleItem) {
        return res
          .status(404)
          .json({ message: "Schedule item not found or unauthorized." });
      }

      res.status(200).json(scheduleItem);
    } catch (error) {
      console.error("Error fetching single schedule item:", error);
      res.status(500).json({
        message:
          "An unexpected error occurred while fetching the schedule item.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async updateScheduleItem(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;
      const { activity, time, type, status, date, notes } = req.body;

      // Prepare data for update, only include provided fields
      const updateData = {};
      if (activity !== undefined) updateData.activity = activity;
      if (time !== undefined) updateData.time = time;
      if (type !== undefined) updateData.type = type;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      if (date !== undefined) {
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
          return res
            .status(400)
            .json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
        updateData.date = parsedDate;
      }

      const updatedScheduleItem = await prisma.scheduleItem.update({
        where: { id: id, userId: userId }, // Ensure user owns the item
        data: updateData,
      });

      res.status(200).json({
        message: "Schedule item updated successfully.",
        scheduleItem: updatedScheduleItem,
      });
    } catch (error) {
      console.error("Error updating schedule item:", error);
      if (error.code === "P2025") {
        // Prisma error code for record not found
        return res
          .status(404)
          .json({
            message: "Schedule item not found or unauthorized to update.",
          });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while updating the schedule item.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },

  async deleteScheduleItem(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      // Check if the item exists and belongs to the user before deleting
      const itemToDelete = await prisma.scheduleItem.findUnique({
        where: { id: id, userId: userId },
      });

      if (!itemToDelete) {
        return res
          .status(404)
          .json({
            message: "Schedule item not found or unauthorized to delete.",
          });
      }

      await prisma.scheduleItem.delete({
        where: { id: id },
      });

      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error("Error deleting schedule item:", error);
      if (error.code === "P2025") {
        // Prisma error code for record not found
        return res
          .status(404)
          .json({
            message: "Schedule item not found or unauthorized to delete.",
          });
      }
      res.status(500).json({
        message:
          "An unexpected error occurred while deleting the schedule item.",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
};

module.exports = scheduleController;
