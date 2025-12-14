const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { OAuth2Client } = require('google-auth-library');
const axios = require('axios');
const { query, transaction } = require('../config/database');
require('dotenv').config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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

// OAuth Login/Register (Google/Apple)
exports.oauthLogin = async (req, res, next) => {
  try {
    const { provider, token } = req.body;

    if (!provider || !token) {
      return res.status(400).json({
        success: false,
        error: 'Provider and token are required'
      });
    }

    let email, fullName, providerId;

    // Verify token based on provider
    if (provider === 'google') {
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        email = payload.email;
        fullName = payload.name;
        providerId = payload.sub;
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Google token'
        });
      }
    } else if (provider === 'apple') {
      // Apple token verification (requires more setup)
      try {
        // Decode Apple ID token (simplified - in production, verify signature)
        const decodedToken = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        email = decodedToken.email;
        providerId = decodedToken.sub;
        fullName = email.split('@')[0]; // Default name from email
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Apple token'
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported OAuth provider'
      });
    }

    // Check if user exists by email or OAuth provider
    let existingUser = await query(
      'SELECT * FROM users WHERE email = $1 OR (oauth_provider = $2 AND oauth_provider_id = $3)',
      [email, provider, providerId]
    );

    let userId;

    if (existingUser.rows.length > 0) {
      // User exists - update OAuth info if not set
      const user = existingUser.rows[0];
      userId = user.user_id;

      if (!user.oauth_provider) {
        await query(
          'UPDATE users SET oauth_provider = $1, oauth_provider_id = $2 WHERE user_id = $3',
          [provider, providerId, userId]
        );
      }
    } else {
      // New user - create account with OAuth
      const username = email.split('@')[0] + '_' + Math.random().toString(36).substring(7);
      
      const result = await transaction(async (client) => {
        // Insert user with OAuth info
        const userResult = await client.query(
          `INSERT INTO users (email, username, full_name, oauth_provider, oauth_provider_id, password_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           RETURNING user_id, email, username, full_name, created_at`,
          [email, username, fullName, provider, providerId, 'oauth'] // Use 'oauth' as placeholder password
        );

        userId = userResult.rows[0].user_id;

        // Create wallet with initial balance
        await client.query(
          `INSERT INTO wallets (user_id, chip_balance, total_earned, total_spent, created_at, updated_at)
           VALUES ($1, 1000, 0, 0, NOW(), NOW())`,
          [userId]
        );

        // Add initial transaction
        await client.query(
          `INSERT INTO wallet_transactions (user_id, wallet_id, transaction_type, amount, balance_before, balance_after, description, created_at)
           SELECT $1, wallet_id, 'deposit', 1000, 0, 1000, 'Initial signup bonus', NOW()
           FROM wallets WHERE user_id = $1`,
          [userId]
        );

        return userResult.rows[0];
      });
    }

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: userId, email: email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get user info with wallet
    const userInfo = await query(
      `SELECT u.user_id, u.email, u.username, u.full_name, u.created_at,
              w.wallet_id, w.chip_balance
       FROM users u
       LEFT JOIN wallets w ON u.user_id = w.user_id
       WHERE u.user_id = $1`,
      [userId]
    );

    const user = userInfo.rows[0];

    res.json({
      success: true,
      message: existingUser.rows.length > 0 ? 'Login successful' : 'Account created successfully',
      token: jwtToken,
      user: {
        id: user.user_id,
        email: user.email,
        username: user.username,
        fullName: user.full_name,
        walletId: user.wallet_id,
        balance: parseFloat(user.chip_balance || 0)
      }
    });
  } catch (error) {
    console.error('OAuth error:', error);
    next(error);
  }
};
