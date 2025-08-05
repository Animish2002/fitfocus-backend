require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 8000;
const frontendUrl = process.env.FRONTEND_URL;

app.use(express.json());

// CORS Configuration
app.use((req, res, next) => {
  // Set the Access-Control-Allow-Origin header to your frontend URL
  res.setHeader("Access-Control-Allow-Origin", frontendUrl);
  // Set the allowed HTTP methods
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  // Set the allowed headers
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  // Allow credentials
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Handle the preflight OPTIONS request
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
  } else {
    next();
  }
});

// Routes
const authRoutes = require("./src/routes/authRoutes");
app.use("/api/auth", authRoutes);

const userRoutes = require("./src/routes/userRoutes");
app.use("/api/user", userRoutes);

const aiRoutes = require("./src/routes/aiRoutes");
app.use("/api/ai", aiRoutes);

const goalRoutes = require("./src/routes/goalRoutes");
app.use("/api/goals", goalRoutes);

const scheduleRoutes = require("./src/routes/scheduleRoutes");
app.use("/api/schedule", scheduleRoutes);

const fitnessLogRoutes = require("./src/routes/fitnessLogRoutes");
app.use("/api/fitness/logs", fitnessLogRoutes);

const studySessionRoutes = require("./src/routes/studySessionRoutes");
app.use("/api/study/sessions", studySessionRoutes);

const dashboardRoutes = require("./src/routes/dashboardRoutes");
app.use("/api/dashboard", dashboardRoutes);

const notificationRoutes = require("./src/routes/notificationRoutes");
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => {
  res.send("FitFocus Backend API is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
