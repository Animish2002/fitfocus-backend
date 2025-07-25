const express = require("express");
const goalController = require("../controllers/goalController");
const authenticateToken = require("../middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

router.post("/", goalController.createGoal);

router.get("/get-goals", goalController.getGoals);

router.get("/get-goals/:id", goalController.getGoalById);

router.put("/:id", goalController.updateGoal);

router.delete("/delete-goals/:id", goalController.deleteGoal);

module.exports = router;
