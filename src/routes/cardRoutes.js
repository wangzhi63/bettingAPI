const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.get('/shop', cardController.getShopCards);
router.get('/:cardId', cardController.getCardDetails);

// Protected routes
router.get('/user/inventory', authMiddleware, cardController.getUserCards);
router.post('/purchase', authMiddleware, cardController.purchaseCard);

module.exports = router;
