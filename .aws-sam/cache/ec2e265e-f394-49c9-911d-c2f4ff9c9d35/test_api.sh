#!/bin/bash

echo "🧪 Testing Betting Game API..."
echo ""

# Health check
echo "1. Health Check:"
curl -s http://localhost:3000/health | python3 -m json.tool
echo -e "\n"

# Get shop cards
echo "2. Card Shop (first 3 cards):"
curl -s http://localhost:3000/api/cards/shop | python3 -m json.tool | head -50
echo -e "\n"

# Register a test user
echo "3. Register Test User:"
curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testplayer@example.com",
    "username": "testplayer",
    "password": "test123",
    "fullName": "Test Player"
  }' | python3 -m json.tool

echo -e "\n✅ API Tests Complete"
