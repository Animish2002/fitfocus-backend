const express = require("express");
const goalController = require("../controllers/goalController");
const authenticateToken = require("../middlewares/authenticateToken");

const router = express.Router();

router.use(authenticateToken);

router.post("/", goalController.createGoal);

router.get("/", goalController.getGoals);

router.get("/:id", goalController.getGoalById);

router.put("/:id", goalController.updateGoal);

router.delete("/:id", goalController.deleteGoal);

module.exports = router;
