const express = require('express');
const router = express.Router();
const bettingController = require('../controllers/bettingController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/tables', bettingController.getBettingTables);

// Protected routes
router.post('/tables', authMiddleware, bettingController.createBettingTable);
router.post('/place-bet', authMiddleware, bettingController.placeBet);
router.get('/my-bets', authMiddleware, bettingController.getUserBets);
router.post('/tables/:tableId/settle', authMiddleware, bettingController.settleBets);

module.exports = router;
