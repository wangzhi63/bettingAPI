const { query } = require('../config/database');

// Get leaderboard
exports.getLeaderboard = async (req, res, next) => {
  try {
    const { sortBy = 'net_profit', limit = 50 } = req.query;

    const validSortColumns = {
      net_profit: 'net_profit',
      win_rate: 'win_rate',
      total_wins: 'total_wins',
      total_wagered: 'total_wagered',
      best_streak: 'best_streak'
    };

    const sortColumn = validSortColumns[sortBy] || 'net_profit';

    const result = await query(
      `SELECT u.user_id, u.username, u.full_name,
              s.total_bets, s.total_wins, s.total_losses, s.win_rate,
              s.total_wagered, s.total_won, s.net_profit, s.current_streak, s.best_streak,
              w.chip_balance
       FROM user_statistics s
       JOIN users u ON s.user_id = u.user_id
       LEFT JOIN wallets w ON u.user_id = w.user_id
       WHERE s.total_bets > 0
       ORDER BY ${sortColumn} DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      data: {
        leaderboard: result.rows.map((row, index) => ({
          rank: index + 1,
          userId: row.user_id,
          username: row.username,
          fullName: row.full_name,
          chipBalance: parseFloat(row.chip_balance),
          statistics: {
            totalBets: row.total_bets,
            totalWins: row.total_wins,
            totalLosses: row.total_losses,
            winRate: parseFloat(row.win_rate),
            totalWagered: parseFloat(row.total_wagered),
            totalWon: parseFloat(row.total_won),
            netProfit: parseFloat(row.net_profit),
            currentStreak: row.current_streak,
            bestStreak: row.best_streak
          }
        })),
        sortedBy: sortBy
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get user's rank and stats
exports.getUserRank = async (req, res, next) => {
  try {
    const result = await query(
      `WITH ranked_users AS (
         SELECT user_id, net_profit,
                ROW_NUMBER() OVER (ORDER BY net_profit DESC) as rank
         FROM user_statistics
         WHERE total_bets > 0
       )
       SELECT ru.rank, s.*
       FROM ranked_users ru
       JOIN user_statistics s ON ru.user_id = s.user_id
       WHERE s.user_id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: {
          rank: null,
          message: 'No bets placed yet'
        }
      });
    }

    const stats = result.rows[0];

    res.json({
      success: true,
      data: {
        rank: parseInt(stats.rank),
        statistics: {
          totalBets: stats.total_bets,
          totalWins: stats.total_wins,
          totalLosses: stats.total_losses,
          winRate: parseFloat(stats.win_rate),
          totalWagered: parseFloat(stats.total_wagered),
          totalWon: parseFloat(stats.total_won),
          netProfit: parseFloat(stats.net_profit),
          currentStreak: stats.current_streak,
          bestStreak: stats.best_streak
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
