#!/bin/bash

# Deploy Betting API to AWS Lambda
set -e

echo "╔═══════════════════════════════════════════════╗"
echo "║   🚀 Deploying Betting API to AWS             ║"
echo "╚═══════════════════════════════════════════════╝"

# Build first
./build.sh

# Deploy
echo "📤 Deploying to AWS..."
sam deploy --no-confirm-changeset

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 To get the API URL, run:"
echo "   aws cloudformation describe-stacks --stack-name betting-api --query 'Stacks[0].Outputs[?OutputKey==\`BettingApiUrl\`].OutputValue' --output text"
