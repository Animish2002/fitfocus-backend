const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const fitnessLogController = {
 
  async createFitnessLog(req, res) {
    try {
      const userId = req.user.userId; // Get userId from authenticated token
      const {
        workoutName,
        durationMinutes,
        caloriesBurned,
        type,
        weightLiftedKg,
        reps,
        sets,
        distanceKm,
        avgHeartRateBpm,
      } = req.body;

      // Basic validation
      if (!workoutName || typeof durationMinutes !== 'number' || isNaN(durationMinutes) || durationMinutes <= 0) {
        return res.status(400).json({ message: "Workout name and valid durationMinutes are required." });
      }

      // Prepare data, handling optional fields and type conversions
      const logData = {
        workoutName,
        durationMinutes,
        userId,
        date: new Date(), // Logged at current time
      };

      if (caloriesBurned !== undefined && typeof caloriesBurned === 'number' && !isNaN(caloriesBurned)) {
        logData.caloriesBurned = caloriesBurned;
      }
      if (type !== undefined) {
        logData.type = type;
      }
      if (weightLiftedKg !== undefined && typeof weightLiftedKg === 'number' && !isNaN(weightLiftedKg)) {
        logData.weightLiftedKg = weightLiftedKg;
      }
      if (reps !== undefined && typeof reps === 'number' && !isNaN(reps)) {
        logData.reps = reps;
      }
      if (sets !== undefined && typeof sets === 'number' && !isNaN(sets)) {
        logData.sets = sets;
      }
      if (distanceKm !== undefined && typeof distanceKm === 'number' && !isNaN(distanceKm)) {
        logData.distanceKm = distanceKm;
      }
      if (avgHeartRateBpm !== undefined && typeof avgHeartRateBpm === 'number' && !isNaN(avgHeartRateBpm)) {
        logData.avgHeartRateBpm = avgHeartRateBpm;
      }

      const newFitnessLog = await prisma.fitnessLog.create({
        data: logData,
      });

      res.status(201).json({
        message: "Fitness log created successfully.",
        fitnessLog: newFitnessLog,
      });
    } catch (error) {
      console.error("Error creating fitness log:", error);
      res.status(500).json({
        message: "An unexpected error occurred while creating the fitness log.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

  async getFitnessLogs(req, res) {
    try {
      const userId = req.user.userId;
      const { date, type, sortBy, limit, page } = req.query;

      let whereClause = { userId: userId };
      let orderByClause = { date: 'desc' }; // Default sort by newest first

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
      if (type) {
        whereClause.type = type;
      }

      // Basic pagination
      let take = parseInt(limit) || 10;
      let skip = (parseInt(page) - 1) * take || 0;

      const fitnessLogs = await prisma.fitnessLog.findMany({
        where: whereClause,
        orderBy: orderByClause,
        take: take,
        skip: skip,
      });

      const totalLogs = await prisma.fitnessLog.count({ where: whereClause });

      res.status(200).json({
        fitnessLogs,
        pagination: {
          total: totalLogs,
          page: parseInt(page) || 1,
          limit: take,
          totalPages: Math.ceil(totalLogs / take),
        },
      });
    } catch (error) {
      console.error("Error fetching fitness logs:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching fitness logs.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

  async getFitnessLogById(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      const fitnessLog = await prisma.fitnessLog.findUnique({
        where: { id: id, userId: userId }, // Ensure user owns the log
      });

      if (!fitnessLog) {
        return res.status(404).json({ message: "Fitness log not found or unauthorized." });
      }

      res.status(200).json(fitnessLog);
    } catch (error) {
      console.error("Error fetching single fitness log:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching the fitness log.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

  async updateFitnessLog(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;
      const {
        workoutName,
        durationMinutes,
        caloriesBurned,
        type,
        weightLiftedKg,
        reps,
        sets,
        distanceKm,
        avgHeartRateBpm,
      } = req.body;

      // Prepare data for update, only include provided fields
      const updateData = {};
      if (workoutName !== undefined) updateData.workoutName = workoutName;
      if (durationMinutes !== undefined && typeof durationMinutes === 'number' && !isNaN(durationMinutes) && durationMinutes > 0) {
        updateData.durationMinutes = durationMinutes;
      } else if (durationMinutes !== undefined) { // If provided but invalid
        return res.status(400).json({ message: "durationMinutes must be a positive number." });
      }

      if (caloriesBurned !== undefined && typeof caloriesBurned === 'number' && !isNaN(caloriesBurned)) {
        updateData.caloriesBurned = caloriesBurned;
      } else if (caloriesBurned === null) { updateData.caloriesBurned = null; } // Allow clearing
      
      if (type !== undefined) updateData.type = type;

      if (weightLiftedKg !== undefined && typeof weightLiftedKg === 'number' && !isNaN(weightLiftedKg)) {
        updateData.weightLiftedKg = weightLiftedKg;
      } else if (weightLiftedKg === null) { updateData.weightLiftedKg = null; }

      if (reps !== undefined && typeof reps === 'number' && !isNaN(reps)) {
        updateData.reps = reps;
      } else if (reps === null) { updateData.reps = null; }

      if (sets !== undefined && typeof sets === 'number' && !isNaN(sets)) {
        updateData.sets = sets;
      } else if (sets === null) { updateData.sets = null; }

      if (distanceKm !== undefined && typeof distanceKm === 'number' && !isNaN(distanceKm)) {
        updateData.distanceKm = distanceKm;
      } else if (distanceKm === null) { updateData.distanceKm = null; }

      if (avgHeartRateBpm !== undefined && typeof avgHeartRateBpm === 'number' && !isNaN(avgHeartRateBpm)) {
        updateData.avgHeartRateBpm = avgHeartRateBpm;
      } else if (avgHeartRateBpm === null) { updateData.avgHeartRateBpm = null; }


      const updatedFitnessLog = await prisma.fitnessLog.update({
        where: { id: id, userId: userId }, // Ensure user owns the log
        data: updateData,
      });

      res.status(200).json({
        message: "Fitness log updated successfully.",
        fitnessLog: updatedFitnessLog,
      });
    } catch (error) {
      console.error("Error updating fitness log:", error);
      if (error.code === 'P2025') { // Prisma error code for record not found
        return res.status(404).json({ message: "Fitness log not found or unauthorized to update." });
      }
      res.status(500).json({
        message: "An unexpected error occurred while updating the fitness log.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },

 
  async deleteFitnessLog(req, res) {
    try {
      const userId = req.user.userId;
      const { id } = req.params;

      // Check if the log exists and belongs to the user before deleting
      const logToDelete = await prisma.fitnessLog.findUnique({
        where: { id: id, userId: userId },
      });

      if (!logToDelete) {
        return res.status(404).json({ message: "Fitness log not found or unauthorized to delete." });
      }

      await prisma.fitnessLog.delete({
        where: { id: id },
      });

      res.status(204).send(); // 204 No Content for successful deletion
    } catch (error) {
      console.error("Error deleting fitness log:", error);
      if (error.code === 'P2025') { // Prisma error code for record not found
        return res.status(404).json({ message: "Fitness log not found or unauthorized to delete." });
      }
      res.status(500).json({
        message: "An unexpected error occurred while deleting the fitness log.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
};

module.exports = fitnessLogController;