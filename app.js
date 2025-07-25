require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

// CORS Configuration
app.use(
  cors({
    // origin: "http://localhost:5173", // Replace with your frontend URL in production
    // methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // Specify allowed HTTP methods
    // credentials: true, // Allow cookies, authorization headers, etc.
    // optionsSuccessStatus: 204, // For preflight requests
  })
);

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

app.get("/", (req, res) => {
  res.send("FitFocus Backend API is running!");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
