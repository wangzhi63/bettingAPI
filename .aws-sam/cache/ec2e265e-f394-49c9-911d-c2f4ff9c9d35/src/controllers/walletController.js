const { query, transaction } = require('../config/database');

// Get wallet balance
exports.getBalance = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT chip_balance, total_earned, total_spent, updated_at
       FROM wallets
       WHERE user_id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Wallet not found'
      });
    }

    const wallet = result.rows[0];

    res.json({
      success: true,
      data: {
        chipBalance: parseFloat(wallet.chip_balance),
        totalEarned: parseFloat(wallet.total_earned),
        totalSpent: parseFloat(wallet.total_spent),
        updatedAt: wallet.updated_at
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get transaction history
exports.getTransactions = async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, type } = req.query;

    let queryText = `
      SELECT transaction_id, amount, transaction_type, description,
             balance_before, balance_after, created_at, reference_id, reference_type
      FROM wallet_transactions
      WHERE user_id = $1
    `;
    const params = [req.user.userId];

    if (type) {
      queryText += ` AND transaction_type = $${params.length + 1}`;
      params.push(type);
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryText, params);

    // Get total count
    const countResult = await query(
      type 
        ? 'SELECT COUNT(*) FROM wallet_transactions WHERE user_id = $1 AND transaction_type = $2'
        : 'SELECT COUNT(*) FROM wallet_transactions WHERE user_id = $1',
      type ? [req.user.userId, type] : [req.user.userId]
    );

    res.json({
      success: true,
      data: {
        transactions: result.rows.map(tx => ({
          transactionId: tx.transaction_id,
          amount: parseFloat(tx.amount),
          type: tx.transaction_type,
          description: tx.description,
          balanceBefore: parseFloat(tx.balance_before),
          balanceAfter: parseFloat(tx.balance_after),
          createdAt: tx.created_at,
          referenceId: tx.reference_id,
          referenceType: tx.reference_type
        })),
        pagination: {
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Add chips (for testing/admin purposes)
exports.addChips = async (req, res, next) => {
  try {
    const { amount, description = 'Manual deposit' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    const result = await transaction(async (client) => {
      // Get current balance
      const walletResult = await client.query(
        'SELECT wallet_id, chip_balance FROM wallets WHERE user_id = $1',
        [req.user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      const wallet = walletResult.rows[0];
      const currentBalance = parseFloat(wallet.chip_balance);
      const newBalance = currentBalance + parseFloat(amount);

      // Update wallet
      await client.query(
        `UPDATE wallets 
         SET chip_balance = $1, total_earned = total_earned + $2
         WHERE wallet_id = $3`,
        [newBalance, amount, wallet.wallet_id]
      );

      // Record transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, amount, transaction_type, description, 
          balance_before, balance_after, reference_type)
         VALUES ($1, $2, $3, 'deposit', $4, $5, $6, 'system')`,
        [wallet.wallet_id, req.user.userId, amount, description, currentBalance, newBalance]
      );

      return { newBalance };
    });

    res.json({
      success: true,
      message: 'Chips added successfully',
      data: {
        amount: parseFloat(amount),
        newBalance: result.newBalance
      }
    });
  } catch (error) {
    next(error);
  }
};
