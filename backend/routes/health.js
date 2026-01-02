var express = require('express');
var router = express.Router();

// Basic health/readiness endpoint
router.get('/', function(req, res, next) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV || 'development'
  });
});

module.exports = router;
