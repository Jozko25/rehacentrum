// Database adapter that chooses between SQLite (local) and PostgreSQL (production)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT || process.env.DATABASE_URL;

let database;

if (isProduction) {
  console.log('🔧 Using PostgreSQL database for production');
  database = require('./database-postgres');
} else {
  console.log('🔧 Using SQLite database for development');
  database = require('./database');
}

module.exports = database;