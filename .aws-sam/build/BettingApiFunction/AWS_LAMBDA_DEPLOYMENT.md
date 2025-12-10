# AWS Lambda Deployment Guide - Betting API

## Overview
This guide explains how to deploy the Betting Game API (Node.js Express) to AWS Lambda using AWS SAM (Serverless Application Model).

## Architecture
- **Lambda Function**: Runs Express app using `serverless-http` wrapper
- **API Gateway**: HTTP API with proxy integration
- **PostgreSQL RDS**: Existing database (betting-game-db.ckp2ggowssdy.us-east-1.rds.amazonaws.com)
- **Runtime**: Node.js 18.x

## Prerequisites
1. AWS CLI configured with credentials
2. AWS SAM CLI installed (`brew install aws-sam-cli`)
3. Node.js 18+ installed
4. PostgreSQL RDS database already running (betting-game-db)

## File Structure
```
bettingAPI/
├── lambda.js              # Lambda handler wrapper
├── template.yaml          # SAM template
├── samconfig.toml         # SAM configuration
├── build.sh              # Build script
├── deploy.sh             # Deploy script
├── src/                  # Express app source code
│   ├── server.js         # Express app (exports app)
│   ├── routes/           # API routes
│   ├── controllers/      # Business logic
│   ├── middleware/       # Auth, error handling
│   └── config/           # Database config
└── package.json          # Dependencies (includes serverless-http)
```

## Deployment Steps

### 1. Install Dependencies
```bash
cd /Users/zhiwang/tommy-project/bettingAPI
npm install
```

### 2. Build the Application
```bash
chmod +x build.sh deploy.sh
./build.sh
```

This will:
- Install all dependencies
- Build the SAM application
- Package the Lambda function

### 3. First-time Deployment (Guided)
```bash
sam deploy --guided
```

Follow the prompts:
- Stack Name: `betting-api`
- AWS Region: `us-east-1`
- Confirm changes: `Y`
- Allow SAM CLI IAM role creation: `Y`
- Save arguments to config: `Y`

### 4. Subsequent Deployments
```bash
./deploy.sh
```

Or manually:
```bash
sam build && sam deploy --no-confirm-changeset
```

## Environment Variables

The following environment variables are configured in `template.yaml`:

```yaml
NODE_ENV: production
DB_HOST: betting-game-db.ckp2ggowssdy.us-east-1.rds.amazonaws.com
DB_PORT: 5432
DB_NAME: betting
DB_USER: bettingadmin
DB_PASSWORD: BettingGame2025
DB_SSL: true
JWT_SECRET: your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN: 7d
FLASK_API_URL: http://localhost:5001  # Update to Lambda URL after deploying Flask API
```

**⚠️ IMPORTANT**: Update `JWT_SECRET` in production!

## Get API Endpoint URL

After deployment, get your API URL:

```bash
aws cloudformation describe-stacks \
  --stack-name betting-api \
  --query 'Stacks[0].Outputs[?OutputKey==`BettingApiUrl`].OutputValue' \
  --output text
```

Example output: `https://abc123xyz.execute-api.us-east-1.amazonaws.com/Prod/`

## Update Angular Frontend

After deployment, update `bettingUI/src/app/services/betting.service.ts`:

```typescript
private apiUrl = 'https://YOUR-API-ID.execute-api.us-east-1.amazonaws.com/Prod/api';
```

## Testing the Deployment

### 1. Health Check
```bash
API_URL=$(aws cloudformation describe-stacks --stack-name betting-api --query 'Stacks[0].Outputs[?OutputKey==`BettingApiUrl`].OutputValue' --output text)
curl "${API_URL}health"
```

Expected response:
```json
{
  "success": true,
  "message": "Server is healthy",
  "database": "connected"
}
```

### 2. Test Registration
```bash
curl -X POST "${API_URL}api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 3. Test Login
```bash
curl -X POST "${API_URL}api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

## Local Testing with SAM

Test locally before deploying:

```bash
# Start local API
sam local start-api --port 3001

# Test in another terminal
curl http://localhost:3001/health
```

## Monitoring and Logs

### View Lambda Logs
```bash
sam logs -n BettingApiFunction --stack-name betting-api --tail
```

### CloudWatch Logs
```bash
aws logs tail /aws/lambda/betting-api-BettingApiFunction --follow
```

## Cost Optimization

- **Memory**: 512 MB (adjust based on usage)
- **Timeout**: 30 seconds
- **Free Tier**: 1M requests/month + 400,000 GB-seconds compute time
- **Estimated Cost**: ~$0-5/month for moderate usage

## Troubleshooting

### Database Connection Issues
- Ensure RDS security group allows Lambda traffic
- Check RDS is publicly accessible or Lambda is in same VPC
- Verify DB credentials in template.yaml

### CORS Errors
- CORS is configured in template.yaml under `Globals.Api.Cors`
- Adjust `AllowOrigin` if needed for production domain

### Cold Start Performance
- First request may take 3-5 seconds (cold start)
- Subsequent requests are fast (<100ms)
- Consider provisioned concurrency for production

### Lambda Timeout
- Default: 30 seconds
- Increase in template.yaml if needed: `Timeout: 60`

## Cleanup

To delete the deployment:

```bash
sam delete --stack-name betting-api
```

## Next Steps

1. ✅ Deploy Betting API to Lambda
2. Deploy Flask Query API to Lambda (separate stack)
3. Update FLASK_API_URL environment variable
4. Update Angular frontend with Lambda endpoints
5. Configure custom domain (optional)
6. Set up CI/CD with GitHub Actions (optional)

## Security Recommendations

1. **JWT Secret**: Use AWS Secrets Manager instead of environment variable
2. **Database Password**: Use AWS Secrets Manager
3. **VPC**: Place Lambda in VPC with RDS for better security
4. **API Gateway**: Add rate limiting and API keys
5. **CORS**: Restrict AllowOrigin to specific domains in production
