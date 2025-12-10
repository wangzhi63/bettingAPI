#!/bin/bash

# Build and Deploy Betting API to AWS Lambda
# This script builds the SAM application and deploys it to AWS

set -e

echo "╔═══════════════════════════════════════════════╗"
echo "║   🎮 Building Betting API for Lambda          ║"
echo "╚═══════════════════════════════════════════════╝"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build with SAM using Docker container (for bcrypt native bindings)
echo "🔨 Building SAM application in Docker container..."
echo "   (This ensures bcrypt is compiled for Lambda's Linux environment)"
sam build --use-container

echo "✅ Build complete!"
echo ""
echo "To deploy, run: sam deploy --guided"
echo "Or run: sam deploy --no-confirm-changeset"
