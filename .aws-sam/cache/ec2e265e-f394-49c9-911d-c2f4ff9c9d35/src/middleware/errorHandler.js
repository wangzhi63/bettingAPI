const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Database errors
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Resource already exists (duplicate entry)'
    });
  }

  if (err.code === '23503') {
    return res.status(400).json({
      success: false,
      error: 'Referenced resource does not exist'
    });
  }

  if (err.code === '23514') {
    return res.status(400).json({
      success: false,
      error: 'Constraint violation: ' + (err.detail || 'Invalid data')
    });
  }

  // Validation errors
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      error: err.details[0].message
    });
  }

  // Default error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
};

module.exports = errorHandler;
