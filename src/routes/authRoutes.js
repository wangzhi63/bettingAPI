const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

// Public routes
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/oauth', authController.oauthLogin); // Google/Apple OAuth

// Protected routes
router.get('/profile', authMiddleware, authController.getProfile);

module.exports = router;
