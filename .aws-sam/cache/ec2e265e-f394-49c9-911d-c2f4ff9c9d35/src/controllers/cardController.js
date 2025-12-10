const { query, transaction } = require('../config/database');

// Get all available cards in shop
exports.getShopCards = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.card_id, c.card_name, c.query_name, c.query_description,
              c.rarity, c.base_multiplier, c.chip_cost, c.is_tradeable,
              cs.is_available, cs.stock_quantity, cs.discount_percentage, cs.featured
       FROM cards c
       LEFT JOIN card_shop cs ON c.card_id = cs.card_id
       WHERE c.is_active = true
       ORDER BY 
         CASE c.rarity
           WHEN 'common' THEN 1
           WHEN 'rare' THEN 2
           WHEN 'epic' THEN 3
           WHEN 'legendary' THEN 4
         END,
         c.chip_cost ASC`
    );

    res.json({
      success: true,
      data: result.rows.map(card => ({
        cardId: card.card_id,
        cardName: card.card_name,
        queryName: card.query_name,
        description: card.query_description,
        rarity: card.rarity,
        baseMultiplier: parseFloat(card.base_multiplier),
        chipCost: parseFloat(card.chip_cost),
        isTradeable: card.is_tradeable,
        isAvailable: card.is_available !== false,
        stockQuantity: card.stock_quantity,
        discountPercentage: parseFloat(card.discount_percentage || 0),
        featured: card.featured || false
      }))
    });
  } catch (error) {
    next(error);
  }
};

// Get user's card inventory (pocket)
exports.getUserCards = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT uc.user_card_id, uc.card_id, uc.quantity, uc.acquired_at, uc.acquisition_type,
              c.card_name, c.query_name, c.query_description, c.rarity, c.base_multiplier
       FROM user_cards uc
       JOIN cards c ON uc.card_id = c.card_id
       WHERE uc.user_id = $1
       ORDER BY c.rarity DESC, uc.acquired_at DESC`,
      [req.user.userId]
    );

    res.json({
      success: true,
      data: result.rows.map(card => ({
        userCardId: card.user_card_id,
        cardId: card.card_id,
        cardName: card.card_name,
        queryName: card.query_name,
        description: card.query_description,
        rarity: card.rarity,
        baseMultiplier: parseFloat(card.base_multiplier),
        quantity: card.quantity,
        acquiredAt: card.acquired_at,
        acquisitionType: card.acquisition_type
      }))
    });
  } catch (error) {
    next(error);
  }
};

// Purchase a card
exports.purchaseCard = async (req, res, next) => {
  try {
    const { cardId } = req.body;

    if (!cardId) {
      return res.status(400).json({
        success: false,
        error: 'Card ID is required'
      });
    }

    const result = await transaction(async (client) => {
      // Get card info
      const cardResult = await client.query(
        'SELECT card_id, card_name, chip_cost, is_active FROM cards WHERE card_id = $1',
        [cardId]
      );

      if (cardResult.rows.length === 0) {
        throw new Error('Card not found');
      }

      const card = cardResult.rows[0];

      if (!card.is_active) {
        throw new Error('Card is not available for purchase');
      }

      const cost = parseFloat(card.chip_cost);

      // Get user's wallet
      const walletResult = await client.query(
        'SELECT wallet_id, chip_balance FROM wallets WHERE user_id = $1',
        [req.user.userId]
      );

      if (walletResult.rows.length === 0) {
        throw new Error('Wallet not found');
      }

      const wallet = walletResult.rows[0];
      const currentBalance = parseFloat(wallet.chip_balance);

      // Check if user has enough chips
      if (currentBalance < cost) {
        const error = new Error('Insufficient chips');
        error.status = 400;
        throw error;
      }

      const newBalance = currentBalance - cost;

      // Update wallet balance
      await client.query(
        `UPDATE wallets 
         SET chip_balance = $1, total_spent = total_spent + $2
         WHERE wallet_id = $3`,
        [newBalance, cost, wallet.wallet_id]
      );

      // Record transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, amount, transaction_type, description, 
          balance_before, balance_after, reference_id, reference_type)
         VALUES ($1, $2, $3, 'card_purchase', $4, $5, $6, $7, 'card')`,
        [
          wallet.wallet_id,
          req.user.userId,
          -cost,
          `Purchased card: ${card.card_name}`,
          currentBalance,
          newBalance,
          card.card_id
        ]
      );

      // Add card to user's inventory (or increment quantity)
      const existingCard = await client.query(
        'SELECT user_card_id, quantity FROM user_cards WHERE user_id = $1 AND card_id = $2',
        [req.user.userId, cardId]
      );

      if (existingCard.rows.length > 0) {
        // Increment quantity
        await client.query(
          'UPDATE user_cards SET quantity = quantity + 1 WHERE user_card_id = $1',
          [existingCard.rows[0].user_card_id]
        );
      } else {
        // Add new card
        await client.query(
          `INSERT INTO user_cards (user_id, card_id, quantity, acquisition_type)
           VALUES ($1, $2, 1, 'purchase')`,
          [req.user.userId, cardId]
        );
      }

      return { cardName: card.card_name, cost, newBalance };
    });

    res.json({
      success: true,
      message: 'Card purchased successfully',
      data: {
        cardName: result.cardName,
        cost: result.cost,
        newBalance: result.newBalance
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get card details
exports.getCardDetails = async (req, res, next) => {
  try {
    const { cardId } = req.params;

    const result = await query(
      `SELECT c.card_id, c.card_name, c.query_name, c.query_description,
              c.rarity, c.base_multiplier, c.chip_cost, c.is_tradeable, c.is_active,
              COUNT(uc.user_card_id) as owners_count,
              SUM(uc.quantity) as total_owned
       FROM cards c
       LEFT JOIN user_cards uc ON c.card_id = uc.card_id
       WHERE c.card_id = $1
       GROUP BY c.card_id`,
      [cardId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Card not found'
      });
    }

    const card = result.rows[0];

    res.json({
      success: true,
      data: {
        cardId: card.card_id,
        cardName: card.card_name,
        queryName: card.query_name,
        description: card.query_description,
        rarity: card.rarity,
        baseMultiplier: parseFloat(card.base_multiplier),
        chipCost: parseFloat(card.chip_cost),
        isTradeable: card.is_tradeable,
        isActive: card.is_active,
        statistics: {
          ownersCount: parseInt(card.owners_count),
          totalOwned: parseInt(card.total_owned || 0)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
