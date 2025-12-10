#!/bin/bash

# Fix RDS Security Group to allow Lambda access

echo "🔧 Updating RDS Security Group for Lambda Access"
echo ""

# Get RDS security group ID
echo "📋 Finding RDS security group..."
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=*rds*" \
  --query "SecurityGroups[0].GroupId" \
  --output text 2>/dev/null)

if [ "$SG_ID" == "None" ] || [ -z "$SG_ID" ]; then
  echo "⚠️  Could not automatically find RDS security group"
  echo ""
  echo "Manual steps:"
  echo "1. Go to AWS Console → RDS → Databases → betting-game-db"
  echo "2. Click on the VPC security group"
  echo "3. Edit inbound rules"
  echo "4. Add rule: PostgreSQL (5432) from Source: 0.0.0.0/0"
  echo "   (For production, use Lambda's VPC CIDR instead)"
  echo ""
  echo "Alternative: Find security group ID and run:"
  echo "   aws ec2 authorize-security-group-ingress \\"
  echo "     --group-id <SECURITY-GROUP-ID> \\"
  echo "     --protocol tcp --port 5432 \\"
  echo "     --cidr 0.0.0.0/0"
  exit 1
fi

echo "✅ Found security group: $SG_ID"
echo ""

# Check if rule already exists
EXISTING=$(aws ec2 describe-security-groups \
  --group-ids "$SG_ID" \
  --query "SecurityGroups[0].IpPermissions[?FromPort==\`5432\`]" \
  --output json 2>/dev/null)

if echo "$EXISTING" | grep -q "0.0.0.0/0"; then
  echo "✅ Security group already allows public access on port 5432"
  exit 0
fi

# Add inbound rule
echo "📝 Adding inbound rule for PostgreSQL (5432) from 0.0.0.0/0..."
aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp \
  --port 5432 \
  --cidr 0.0.0.0/0

if [ $? -eq 0 ]; then
  echo "✅ Successfully updated security group"
  echo ""
  echo "⚠️  WARNING: This allows access from any IP address"
  echo "   For production, restrict to Lambda's VPC CIDR or specific IPs"
else
  echo "❌ Failed to update security group"
  echo "   Please update manually via AWS Console"
fi
