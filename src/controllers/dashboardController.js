const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const dashboardController = {
  /**
   * Get a comprehensive summary of the authenticated user's activities and goals for the dashboard.
   * GET /api/dashboard/summary
   * Response: { totalGoals: number, completedGoals: number, pendingScheduleItems: number,
   * todayCompletedScheduleItems: number, totalFitnessMinutesLast7Days: number,
   * totalStudyMinutesLast7Days: number, currentStreaks: object, ... }
   */
  async getDashboardSummary(req, res) {
    try {
      const userId = req.user.userId;

      // --- 1. Goals Summary ---
      const totalGoals = await prisma.goal.count({ where: { userId } });
      const completedGoals = await prisma.goal.count({
        where: { userId, status: "Completed" },
      });
      const inProgressGoals = await prisma.goal.count({
        where: { userId, status: "In Progress" },
      });

      // --- 2. Schedule Summary (Today) ---
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      const todayScheduleItems = await prisma.scheduleItem.count({
        where: {
          userId,
          date: { gte: today, lt: tomorrow },
        },
      });
      const todayCompletedScheduleItems = await prisma.scheduleItem.count({
        where: {
          userId,
          date: { gte: today, lt: tomorrow },
          status: "completed",
        },
      });
      const todayPendingScheduleItems = todayScheduleItems - todayCompletedScheduleItems;


      // --- 3. Activity Summary (Last 7 Days) ---
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(today.getDate() - 7);
      sevenDaysAgo.setUTCHours(0, 0, 0, 0);

      const fitnessLogsLast7Days = await prisma.fitnessLog.findMany({
        where: {
          userId,
          date: { gte: sevenDaysAgo, lt: tomorrow }, // From 7 days ago to end of today
        },
        select: { durationMinutes: true },
      });
      const totalFitnessMinutesLast7Days = fitnessLogsLast7Days.reduce(
        (sum, log) => sum + log.durationMinutes,
        0
      );

      const studySessionsLast7Days = await prisma.studySession.findMany({
        where: {
          userId,
          date: { gte: sevenDaysAgo, lt: tomorrow },
        },
        select: { durationMinutes: true },
      });
      const totalStudyMinutesLast7Days = studySessionsLast7Days.reduce(
        (sum, session) => sum + session.durationMinutes,
        0
      );

      // --- 4. Streaks (Example - Daily Schedule Completion Streak) ---
      // This is a more complex calculation, often better handled with pre-computed data or a dedicated service
      // For simplicity, let's just count consecutive days with at least one completed schedule item.
      const allScheduleItems = await prisma.scheduleItem.findMany({
        where: { userId, status: "completed" },
        orderBy: { date: 'desc' },
        select: { date: true },
      });

      let scheduleCompletionStreak = 0;
      let currentDate = new Date(today);
      currentDate.setUTCHours(0, 0, 0, 0);

      const completedDates = new Set(
        allScheduleItems.map(item => item.date.toISOString().split('T')[0])
      ); // Store dates as "YYYY-MM-DD" strings

      while (true) {
        const dateString = currentDate.toISOString().split('T')[0];
        if (completedDates.has(dateString)) {
          scheduleCompletionStreak++;
          currentDate.setDate(currentDate.getDate() - 1); // Go to previous day
        } else if (currentDate.getTime() < today.getTime()) { // Only break if we're past today and didn't complete
           // If today was not completed, and we are looking at a past day, break.
           // If today was completed, and yesterday was not, break.
           break;
        } else { // If today is not completed, and we are checking for today, then streak is 0
            break;
        }
        // Prevent infinite loop if no completed items
        if (scheduleCompletionStreak > 365) break; // Arbitrary cap to prevent infinite loop
      }

      // --- Combine and Send Response ---
      res.status(200).json({
        message: "Dashboard summary fetched successfully.",
        summary: {
          goals: {
            total: totalGoals,
            completed: completedGoals,
            inProgress: inProgressGoals,
          },
          todaySchedule: {
            total: todayScheduleItems,
            completed: todayCompletedScheduleItems,
            pending: todayPendingScheduleItems,
          },
          last7Days: {
            totalFitnessMinutes: totalFitnessMinutesLast7Days,
            totalStudyMinutes: totalStudyMinutesLast7Days,
          },
          streaks: {
            scheduleCompletionDays: scheduleCompletionStreak,
            // Add more streaks (e.g., fitness, study) here if desired,
            // but they require more complex logic similar to scheduleCompletionStreak.
          },
          // Add other aggregated data as needed (e.g., average calories, most common workout type)
        },
      });
    } catch (error) {
      console.error("Error fetching dashboard summary:", error);
      res.status(500).json({
        message: "An unexpected error occurred while fetching dashboard summary.",
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  },
};

module.exports = dashboardController;