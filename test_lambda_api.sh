#!/bin/bash

# Test Lambda Betting API Endpoints

API_URL="https://crkgob67va.execute-api.us-east-1.amazonaws.com/Prod"

echo "╔═══════════════════════════════════════════════╗"
echo "║   🧪 Testing Lambda Betting API                ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# Test 1: Health Check
echo "1️⃣  Testing Health Endpoint..."
HEALTH=$(curl -s "${API_URL}/health")
if echo "$HEALTH" | grep -q '"success":true'; then
  echo "   ✅ Health check passed"
  echo "   📊 $(echo $HEALTH | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"Database: {d[\"database\"]}")')"
else
  echo "   ❌ Health check failed"
  echo "   $HEALTH"
fi
echo ""

# Test 2: Login
echo "2️⃣  Testing Login..."
LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo123"}')

if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')
  echo "   ✅ Login successful"
  echo "   🎫 Token: ${TOKEN:0:50}..."
else
  echo "   ❌ Login failed"
  echo "   $LOGIN_RESPONSE"
  exit 1
fi
echo ""

# Test 3: Get Wallet
echo "3️⃣  Testing Wallet Endpoint..."
WALLET=$(curl -s "${API_URL}/api/wallet" \
  -H "Authorization: Bearer $TOKEN")
if echo "$WALLET" | grep -q '"chipBalance"'; then
  BALANCE=$(echo "$WALLET" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(f"{d[\"data\"][\"chipBalance\"]} chips")')
  echo "   ✅ Wallet retrieved: $BALANCE"
else
  echo "   ❌ Wallet retrieval failed"
  echo "   $WALLET"
fi
echo ""

# Test 4: Get Cards
echo "4️⃣  Testing Card Shop..."
CARDS=$(curl -s "${API_URL}/api/cards/shop" \
  -H "Authorization: Bearer $TOKEN")
if echo "$CARDS" | grep -q '"cardName"'; then
  CARD_COUNT=$(echo "$CARDS" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))')
  echo "   ✅ Card shop retrieved: $CARD_COUNT cards available"
else
  echo "   ❌ Card shop retrieval failed"
fi
echo ""

# Test 5: Get Betting Tables
echo "5️⃣  Testing Betting Tables..."
TABLES=$(curl -s "${API_URL}/api/betting/tables" \
  -H "Authorization: Bearer $TOKEN")
if echo "$TABLES" | grep -q '\[\]' || echo "$TABLES" | grep -q '"tableId"'; then
  TABLE_COUNT=$(echo "$TABLES" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))')
  echo "   ✅ Betting tables retrieved: $TABLE_COUNT tables"
else
  echo "   ❌ Betting tables retrieval failed"
fi
echo ""

# Test 6: Get Leaderboard
echo "6️⃣  Testing Leaderboard..."
LEADERBOARD=$(curl -s "${API_URL}/api/leaderboard" \
  -H "Authorization: Bearer $TOKEN")
if echo "$LEADERBOARD" | grep -q '"username"'; then
  PLAYER_COUNT=$(echo "$LEADERBOARD" | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["data"]))')
  echo "   ✅ Leaderboard retrieved: $PLAYER_COUNT players"
else
  echo "   ❌ Leaderboard retrieval failed"
fi
echo ""

echo "╔═══════════════════════════════════════════════╗"
echo "║   ✅ Lambda API Testing Complete              ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "🎮 Betting Game is now fully serverless!"
echo "🌐 API: $API_URL"
echo "📱 Update your Angular app to use this endpoint"
