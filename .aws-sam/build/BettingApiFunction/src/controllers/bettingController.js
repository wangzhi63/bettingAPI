const axios = require('axios');
const { query, transaction } = require('../config/database');
require('dotenv').config();

const QUERY_API_URL = process.env.QUERY_API_URL || 'http://localhost:5001';

// Get all betting tables
exports.getBettingTables = async (req, res, next) => {
  try {
    const { status = 'open' } = req.query;

    let queryText = `
      SELECT table_id, match_id, match_name, match_date, status,
             total_bets_placed, total_chips_wagered, opened_at, closed_at, settled_at
      FROM betting_tables
    `;
    const params = [];

    if (status && status !== 'all') {
      queryText += ' WHERE status = $1';
      params.push(status);
    }

    queryText += ' ORDER BY match_date DESC, opened_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows.map(table => ({
        tableId: table.table_id,
        matchId: table.match_id,
        matchName: table.match_name,
        matchDate: table.match_date,
        status: table.status,
        totalBetsPlaced: table.total_bets_placed,
        totalChipsWagered: parseFloat(table.total_chips_wagered),
        openedAt: table.opened_at,
        closedAt: table.closed_at,
        settledAt: table.settled_at
      }))
    });
  } catch (error) {
    next(error);
  }
};

// Create a new betting table
exports.createBettingTable = async (req, res, next) => {
  try {
    const { matchId, matchName, matchDate } = req.body;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        error: 'Match ID is required'
      });
    }

    // Check if table already exists for this match
    const existing = await query(
      'SELECT table_id FROM betting_tables WHERE match_id = $1',
      [matchId]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Betting table already exists for this match'
      });
    }

    const result = await query(
      `INSERT INTO betting_tables (match_id, match_name, match_date, status)
       VALUES ($1, $2, $3, 'open')
       RETURNING table_id, match_id, match_name, match_date, status, opened_at`,
      [matchId, matchName || `Match ${matchId}`, matchDate || null]
    );

    const table = result.rows[0];

    res.status(201).json({
      success: true,
      message: 'Betting table created successfully',
      data: {
        tableId: table.table_id,
        matchId: table.match_id,
        matchName: table.match_name,
        matchDate: table.match_date,
        status: table.status,
        openedAt: table.opened_at
      }
    });
  } catch (error) {
    next(error);
  }
};

// Place a bet
exports.placeBet = async (req, res, next) => {
  try {
    const { tableId, cardId, wagerAmount } = req.body;

    if (!tableId || !cardId || !wagerAmount) {
      return res.status(400).json({
        success: false,
        error: 'Table ID, card ID, and wager amount are required'
      });
    }

    if (wagerAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Wager amount must be greater than 0'
      });
    }

    const result = await transaction(async (client) => {
      // Get betting table
      const tableResult = await client.query(
        'SELECT table_id, match_id, status FROM betting_tables WHERE table_id = $1',
        [tableId]
      );

      if (tableResult.rows.length === 0) {
        throw new Error('Betting table not found');
      }

      const table = tableResult.rows[0];

      if (table.status !== 'open') {
        const error = new Error('Betting table is not open');
        error.status = 400;
        throw error;
      }

      // Check if user owns the card
      const cardResult = await client.query(
        `SELECT uc.user_card_id, uc.quantity, c.card_name, c.base_multiplier, c.query_name
         FROM user_cards uc
         JOIN cards c ON uc.card_id = c.card_id
         WHERE uc.user_id = $1 AND uc.card_id = $2`,
        [req.user.userId, cardId]
      );

      if (cardResult.rows.length === 0) {
        const error = new Error('You do not own this card');
        error.status = 400;
        throw error;
      }

      const userCard = cardResult.rows[0];
      const multiplier = parseFloat(userCard.base_multiplier);

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
      if (currentBalance < wagerAmount) {
        const error = new Error('Insufficient chips');
        error.status = 400;
        throw error;
      }

      const newBalance = currentBalance - parseFloat(wagerAmount);

      // Update wallet balance
      await client.query(
        `UPDATE wallets 
         SET chip_balance = $1, total_spent = total_spent + $2
         WHERE wallet_id = $3`,
        [newBalance, wagerAmount, wallet.wallet_id]
      );

      // Create bet record
      const betResult = await client.query(
        `INSERT INTO placed_bets 
         (user_id, table_id, card_id, wager_amount, multiplier, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING bet_id, potential_payout, placed_at`,
        [req.user.userId, tableId, cardId, wagerAmount, multiplier]
      );

      const bet = betResult.rows[0];

      // Record wallet transaction
      await client.query(
        `INSERT INTO wallet_transactions 
         (wallet_id, user_id, amount, transaction_type, description, 
          balance_before, balance_after, reference_id, reference_type)
         VALUES ($1, $2, $3, 'bet_placed', $4, $5, $6, $7, 'bet')`,
        [
          wallet.wallet_id,
          req.user.userId,
          -wagerAmount,
          `Bet placed: ${userCard.card_name} on Match ${table.match_id}`,
          currentBalance,
          newBalance,
          bet.bet_id
        ]
      );

      // Update betting table statistics
      await client.query(
        `UPDATE betting_tables 
         SET total_bets_placed = total_bets_placed + 1,
             total_chips_wagered = total_chips_wagered + $1
         WHERE table_id = $2`,
        [wagerAmount, tableId]
      );

      // Decrement card quantity
      if (userCard.quantity > 1) {
        await client.query(
          'UPDATE user_cards SET quantity = quantity - 1 WHERE user_card_id = $1',
          [userCard.user_card_id]
        );
      } else {
        await client.query(
          'DELETE FROM user_cards WHERE user_card_id = $1',
          [userCard.user_card_id]
        );
      }

      return {
        betId: bet.bet_id,
        cardName: userCard.card_name,
        queryName: userCard.query_name,
        wagerAmount,
        multiplier,
        potentialPayout: parseFloat(bet.potential_payout),
        placedAt: bet.placed_at,
        newBalance
      };
    });

    res.status(201).json({
      success: true,
      message: 'Bet placed successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// Get user's bets
exports.getUserBets = async (req, res, next) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let queryText = `
      SELECT pb.bet_id, pb.wager_amount, pb.multiplier, pb.potential_payout,
             pb.actual_payout, pb.status, pb.is_winning_card, pb.placed_at, pb.settled_at,
             c.card_name, c.query_name, c.rarity,
             bt.table_id, bt.match_id, bt.match_name, bt.status as table_status
      FROM placed_bets pb
      JOIN cards c ON pb.card_id = c.card_id
      JOIN betting_tables bt ON pb.table_id = bt.table_id
      WHERE pb.user_id = $1
    `;
    const params = [req.user.userId];

    if (status) {
      queryText += ` AND pb.status = $${params.length + 1}`;
      params.push(status);
    }

    queryText += ` ORDER BY pb.placed_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows.map(bet => ({
        betId: bet.bet_id,
        wagerAmount: parseFloat(bet.wager_amount),
        multiplier: parseFloat(bet.multiplier),
        potentialPayout: parseFloat(bet.potential_payout),
        actualPayout: parseFloat(bet.actual_payout),
        status: bet.status,
        isWinningCard: bet.is_winning_card,
        placedAt: bet.placed_at,
        settledAt: bet.settled_at,
        card: {
          name: bet.card_name,
          queryName: bet.query_name,
          rarity: bet.rarity
        },
        table: {
          tableId: bet.table_id,
          matchId: bet.match_id,
          matchName: bet.match_name,
          status: bet.table_status
        }
      }))
    });
  } catch (error) {
    next(error);
  }
};

// Settle bets for a table (execute queries and determine winners)
exports.settleBets = async (req, res, next) => {
  try {
    const { tableId } = req.params;

    const result = await transaction(async (client) => {
      // Get betting table
      const tableResult = await client.query(
        'SELECT table_id, match_id, status FROM betting_tables WHERE table_id = $1',
        [tableId]
      );

      if (tableResult.rows.length === 0) {
        throw new Error('Betting table not found');
      }

      const table = tableResult.rows[0];

      if (table.status === 'settled') {
        const error = new Error('Betting table already settled');
        error.status = 400;
        throw error;
      }

      // Close the table if still open
      if (table.status === 'open') {
        await client.query(
          `UPDATE betting_tables 
           SET status = 'closed', closed_at = CURRENT_TIMESTAMP
           WHERE table_id = $1`,
          [tableId]
        );
      }

      // Get all pending bets for this table
      const betsResult = await client.query(
        `SELECT pb.bet_id, pb.user_id, pb.card_id, pb.wager_amount, pb.multiplier,
                c.query_name, w.wallet_id
         FROM placed_bets pb
         JOIN cards c ON pb.card_id = c.card_id
         JOIN wallets w ON pb.user_id = w.user_id
         WHERE pb.table_id = $1 AND pb.status = 'pending'`,
        [tableId]
      );

      const bets = betsResult.rows;
      const settledBets = [];

      // Execute each bet's query
      for (const bet of bets) {
        try {
          // Call Python query API with correct endpoint format
          const queryResponse = await axios.post(
            `${QUERY_API_URL}/api/queries/${bet.query_name}/execute`,
            {
              match_id: table.match_id,  // Use snake_case to match Flask API
              parameters: {}
            }
          );

          const queryResult = queryResponse.data;
          
          // Filter results to only include the specific match
          const matchResults = queryResult.results?.filter(r => r.match_id === table.match_id) || [];
          const isWinning = matchResults.length > 0;  // Win if query returned results for THIS match

          let actualPayout = 0;
          let betStatus = 'lost';

          if (isWinning) {
            actualPayout = parseFloat(bet.wager_amount) * parseFloat(bet.multiplier);
            betStatus = 'won';

            // Update wallet
            await client.query(
              `UPDATE wallets 
               SET chip_balance = chip_balance + $1, total_earned = total_earned + $1
               WHERE wallet_id = $2`,
              [actualPayout, bet.wallet_id]
            );

            // Record winning transaction
            const walletResult = await client.query(
              'SELECT chip_balance FROM wallets WHERE wallet_id = $1',
              [bet.wallet_id]
            );
            const newBalance = parseFloat(walletResult.rows[0].chip_balance);

            await client.query(
              `INSERT INTO wallet_transactions 
               (wallet_id, user_id, amount, transaction_type, description, 
                balance_before, balance_after, reference_id, reference_type)
               VALUES ($1, $2, $3, 'bet_won', $4, $5, $6, $7, 'bet')`,
              [
                bet.wallet_id,
                bet.user_id,
                actualPayout,
                `Won bet on Match ${table.match_id}`,
                newBalance - actualPayout,
                newBalance,
                bet.bet_id
              ]
            );
          }

          // Update bet record
          await client.query(
            `UPDATE placed_bets 
             SET status = $1, is_winning_card = $2, actual_payout = $3,
                 query_result = $4, settled_at = CURRENT_TIMESTAMP
             WHERE bet_id = $5`,
            [betStatus, isWinning, actualPayout, JSON.stringify(queryResult), bet.bet_id]
          );

          // Update user statistics
          await client.query(
            `UPDATE user_statistics 
             SET total_bets = total_bets + 1,
                 total_wins = total_wins + $1,
                 total_losses = total_losses + $2,
                 total_wagered = total_wagered + $3,
                 total_won = total_won + $4,
                 net_profit = net_profit + $5,
                 win_rate = CASE WHEN total_bets + 1 > 0 
                   THEN (total_wins + $1)::decimal / (total_bets + 1) * 100 
                   ELSE 0 END,
                 last_bet_at = CURRENT_TIMESTAMP
             WHERE user_id = $6`,
            [
              isWinning ? 1 : 0,
              isWinning ? 0 : 1,
              bet.wager_amount,
              actualPayout,
              actualPayout - parseFloat(bet.wager_amount),
              bet.user_id
            ]
          );

          settledBets.push({
            betId: bet.bet_id,
            userId: bet.user_id,
            status: betStatus,
            actualPayout
          });
        } catch (error) {
          console.error(`Error settling bet ${bet.bet_id}:`, error);
          // Mark as cancelled if query execution failed
          await client.query(
            `UPDATE placed_bets 
             SET status = 'cancelled', settled_at = CURRENT_TIMESTAMP
             WHERE bet_id = $1`,
            [bet.bet_id]
          );
        }
      }

      // Mark table as settled
      await client.query(
        `UPDATE betting_tables 
         SET status = 'settled', settled_at = CURRENT_TIMESTAMP
         WHERE table_id = $1`,
        [tableId]
      );

      return { settledBets, totalBets: bets.length };
    });

    res.json({
      success: true,
      message: 'Bets settled successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};
