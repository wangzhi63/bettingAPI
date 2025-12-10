# Betting Game API

Node.js/Express API for the soccer query betting card game.

## Features

- **User Authentication** - JWT-based registration and login
- **Wallet Management** - Chip balance, transactions, deposits
- **Card System** - Browse shop, purchase cards, manage inventory
- **Betting** - Place bets, settle outcomes, track history
- **Leaderboard** - Rankings by net profit, win rate, etc.

## Tech Stack

- Node.js + Express
- PostgreSQL (AWS RDS)
- JWT Authentication
- bcrypt for password hashing

## Setup

1. Install dependencies:
```bash
cd bettingAPI
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Start the server:
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (auth required)

### Wallet
- `GET /api/wallet/balance` - Get chip balance (auth required)
- `GET /api/wallet/transactions` - Get transaction history (auth required)
- `POST /api/wallet/add-chips` - Add chips (auth required)

### Cards
- `GET /api/cards/shop` - Browse available cards
- `GET /api/cards/:cardId` - Get card details
- `GET /api/cards/user/inventory` - Get user's cards (auth required)
- `POST /api/cards/purchase` - Purchase a card (auth required)

### Betting
- `GET /api/betting/tables` - Get betting tables
- `POST /api/betting/tables` - Create betting table (auth required)
- `POST /api/betting/place-bet` - Place a bet (auth required)
- `GET /api/betting/my-bets` - Get user's bets (auth required)
- `POST /api/betting/tables/:tableId/settle` - Settle bets (auth required)

### Leaderboard
- `GET /api/leaderboard` - Get leaderboard
- `GET /api/leaderboard/my-rank` - Get user's rank (auth required)

## Authentication

Protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <token>
```

## Example Requests

### Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player@example.com",
    "username": "player1",
    "password": "password123",
    "fullName": "John Doe"
  }'
```

### Purchase Card
```bash
curl -X POST http://localhost:3000/api/cards/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "cardId": 1
  }'
```

### Place Bet
```bash
curl -X POST http://localhost:3000/api/betting/place-bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "tableId": 1,
    "cardId": 1,
    "wagerAmount": 50
  }'
```

## Database

PostgreSQL schema is in `/bettingDB/schema/betting_game_schema.sql`

Connection configured via environment variables in `.env`

## Integration

This API integrates with the Python Query API (`http://localhost:5001`) to execute card queries during bet settlement.
