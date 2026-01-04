const { Pool } = require('pg');

const pool = new Pool({
  user: 'myuser',
  host: 'localhost', // Use 'db' if Express is also running inside Docker
  database: 'mydatabase',
  password: 'mypassword',
  port: 5432,
});

module.exports = pool;