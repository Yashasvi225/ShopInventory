function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(err, req, res, next) {
  let status = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
  let message = status === 500 ? 'The server could not complete the request. Please try again.' : err.message;
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Request body must be valid JSON'; }
  if (err.type === 'entity.too.large') { status = 413; message = 'Request body is too large'; }
  if (err.name === 'ValidationError') { status = 400; message = Object.keys(err.errors).map(field => `${field} is invalid`).join(', '); }
  if (err.name === 'CastError') { status = 400; message = 'Invalid resource ID'; }
  if (err.code === 11000) { status = 409; message = `Duplicate value for ${Object.keys(err.keyPattern || err.keyValue || {})[0] || 'unique field'}`; }
  if (status === 500) console.error('API request failed', { method: req.method, code: 'INTERNAL_ERROR' });
  res.status(status).json({ message: message || 'Request could not be completed' });
}

module.exports = { notFound, errorHandler };
