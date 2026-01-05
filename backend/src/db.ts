import { Pool } from 'pg';

const pool = new Pool({
  user: process.env.DB_USER,
  host: 'localhost', // Use 'db' if Express is also running inside Docker
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432,
});

export default pool;
