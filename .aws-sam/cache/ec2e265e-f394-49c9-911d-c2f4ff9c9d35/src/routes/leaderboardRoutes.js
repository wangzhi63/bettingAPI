const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/', leaderboardController.getLeaderboard);

// Protected routes
router.get('/my-rank', authMiddleware, leaderboardController.getUserRank);

module.exports = router;
