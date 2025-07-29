// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authenticateToken'); // Assuming you have this
const notificationController = require('../controllers/notificationController');

router.post('/subscribe', authMiddleware, notificationController.subscribe);
router.post('/send-test', authMiddleware, notificationController.sendTestNotification); // For testing

module.exports = router;

