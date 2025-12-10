const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
});

console.log('Testing database connection...');
console.log('Host:', process.env.DB_HOST);

pool.query('SELECT 1', (err, res) => {
  if (err) {
    console.error('❌ Database error:', err);
  } else {
    console.log('✅ Database connected successfully!');
    console.log('Result:', res.rows);
  }
  pool.end();
});
