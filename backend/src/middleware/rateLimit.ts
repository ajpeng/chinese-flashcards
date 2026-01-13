import rateLimit from 'express-rate-limit';

// Rate limiter for authentication routes (login, signup)
// More strict to prevent brute force attacks
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for general API routes
// More lenient for regular API usage
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for article creation
// Prevents abuse of AI lookup API by limiting article creation
export const articleCreationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 articles per hour
  message: 'Too many articles created. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
