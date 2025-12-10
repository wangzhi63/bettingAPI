const serverless = require('serverless-http');
const app = require('./src/server');

// Wrap Express app for Lambda
const handler = serverless(app, {
  // Binary content types for API Gateway
  binary: ['image/*', 'application/pdf'],
  
  // Request/response transformations
  request: (request, event, context) => {
    // Add API Gateway event and context to request
    request.apiGateway = {
      event,
      context
    };
  }
});

module.exports.handler = handler;
