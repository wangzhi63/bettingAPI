#!/bin/bash

# Comprehensive Betting Game API Test
# Demonstrates the complete workflow

API_URL="http://localhost:3000"

echo "🎮 Betting Game API - Complete Workflow Test"
echo "=============================================="
echo ""

# Register new user
echo "📝 Step 1: Register New User"
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player1@example.com",
    "username": "player1",
    "password": "password123",
    "fullName": "Player One"
  }')

echo "$REGISTER_RESPONSE" | python3 -m json.tool
TOKEN=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -z "$TOKEN" ]; then
    echo "❌ Registration failed or user already exists"
    echo "Trying to login instead..."
    LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
      -H "Content-Type: application/json" \
      -d '{
        "email": "player1@example.com",
        "password": "password123"
      }')
    TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['token'])")
fi

echo ""
echo "🔑 Token obtained: ${TOKEN:0:50}..."
echo ""

# Check wallet
echo "💰 Step 2: Check Wallet Balance"
curl -s "$API_URL/api/wallet/balance" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# Browse shop
echo "🛒 Step 3: Browse Card Shop"
curl -s "$API_URL/api/cards/shop" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'Available cards: {len(data[\"data\"])}')
print('Top 5 cards:')
for i, card in enumerate(data['data'][:5], 1):
    print(f'  {i}. {card[\"cardName\"]} ({card[\"rarity\"]}) - {card[\"chipCost\"]} chips - {card[\"baseMultiplier\"]}x multiplier')
"
echo ""

# Purchase cards
echo "🎴 Step 4: Purchase Cards"
echo "Purchasing Basic Penalty Stats..."
curl -s -X POST "$API_URL/api/cards/purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cardId": 1}' | python3 -m json.tool
echo ""

echo "Purchasing Advanced Penalty Analysis..."
curl -s -X POST "$API_URL/api/cards/purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"cardId": 2}' | python3 -m json.tool
echo ""

# Check inventory
echo "👜 Step 5: Check Card Inventory"
curl -s "$API_URL/api/cards/user/inventory" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# Create betting table
echo "🎲 Step 6: Create Betting Table"
TABLE_RESPONSE=$(curl -s -X POST "$API_URL/api/betting/tables" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"matchId": "16029", "matchName": "Premier League Match"}')
echo "$TABLE_RESPONSE" | python3 -m json.tool
TABLE_ID=$(echo "$TABLE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['tableId'])")
echo ""

# Place bet
echo "🎰 Step 7: Place Bet"
curl -s -X POST "$API_URL/api/betting/place-bet" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"tableId\": $TABLE_ID, \"cardId\": 1, \"wagerAmount\": 50}" | python3 -m json.tool
echo ""

# Check my bets
echo "📊 Step 8: View My Bets"
curl -s "$API_URL/api/betting/my-bets" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# Check profile
echo "👤 Step 9: View Profile & Stats"
curl -s "$API_URL/api/auth/profile" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
echo ""

# View betting tables
echo "🎯 Step 10: View All Betting Tables"
curl -s "$API_URL/api/betting/tables" | python3 -m json.tool
echo ""

echo "✅ Complete workflow test finished!"
echo ""
echo "📌 Next steps:"
echo "  - Ensure Python query API is running on port 5001"
echo "  - Settle the bet with: curl -X POST $API_URL/api/betting/tables/$TABLE_ID/settle -H \"Authorization: Bearer \$TOKEN\""
echo "  - Check leaderboard: curl -s $API_URL/api/leaderboard | python3 -m json.tool"
