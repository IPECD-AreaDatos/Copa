const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env' });

const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: 'datalake_economico',
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
