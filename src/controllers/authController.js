const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { query, transaction } = require('../config/database');
require('dotenv').config();

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  fullName: Joi.string().max(255).optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// Register new user
exports.register = async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      throw error;
    }

    const { email, username, password, fullName } = value;

    // Check if user already exists
    const existingUser = await query(
      'SELECT user_id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email or username already exists'
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user and wallet in transaction
    const result = await transaction(async (client) => {
      // Insert user
      const userResult = await client.query(
        `INSERT INTO users (email, username, password_hash, full_name)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id, email, username, full_name, created_at`,
        [email, username, passwordHash, fullName || null]
      );

      const user = userResult.rows[0];

      // Create wallet with initial chips
      const initialChips = parseFloat(process.env.INITIAL_CHIPS) || 1000;
      await client.query(
        `INSERT INTO wallets (user_id, chip_balance)
         VALUES ($1, $2)`,
        [user.user_id, initialChips]
      );

      // Create initial transaction record
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, amount, transaction_type, description, balance_before, balance_after, reference_type)
         VALUES (
           (SELECT wallet_id FROM wallets WHERE user_id = $1),
           $1, $2, 'deposit', 'Initial welcome bonus', 0, $2, 'system'
         )`,
        [user.user_id, initialChips]
      );

      // Create user statistics entry
      await client.query(
        `INSERT INTO user_statistics (user_id) VALUES ($1)`,
        [user.user_id]
      );

      return user;
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: result.user_id, email: result.email, username: result.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          userId: result.user_id,
          email: result.email,
          username: result.username,
          fullName: result.full_name,
          createdAt: result.created_at
        },
        token,
        initialChips: parseFloat(process.env.INITIAL_CHIPS) || 1000
      }
    });
  } catch (error) {
    next(error);
  }
};

// Login user
exports.login = async (req, res, next) => {
  try {
    // Validate input
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      error.isJoi = true;
      throw error;
    }

    const { email, password } = value;

    // Find user
    const result = await query(
      `SELECT u.user_id, u.email, u.username, u.password_hash, u.full_name, u.is_active,
              w.chip_balance
       FROM users u
       LEFT JOIN wallets w ON u.user_id = w.user_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Update last login
    await query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
      [user.user_id]
    );

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          userId: user.user_id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          chipBalance: parseFloat(user.chip_balance)
        },
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get current user profile
exports.getProfile = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.user_id, u.email, u.username, u.full_name, u.created_at, u.last_login,
              w.chip_balance, w.total_earned, w.total_spent,
              s.total_bets, s.total_wins, s.total_losses, s.win_rate, s.net_profit
       FROM users u
       LEFT JOIN wallets w ON u.user_id = w.user_id
       LEFT JOIN user_statistics s ON u.user_id = s.user_id
       WHERE u.user_id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      data: {
        userId: user.user_id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        wallet: {
          chipBalance: parseFloat(user.chip_balance),
          totalEarned: parseFloat(user.total_earned),
          totalSpent: parseFloat(user.total_spent)
        },
        statistics: {
          totalBets: user.total_bets,
          totalWins: user.total_wins,
          totalLosses: user.total_losses,
          winRate: parseFloat(user.win_rate),
          netProfit: parseFloat(user.net_profit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
