// Database adapter that chooses between SQLite (local) and PostgreSQL (production)
const isProduction = process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT;

let database;

// Try PostgreSQL first in production if DATABASE_URL exists
if (isProduction && process.env.DATABASE_URL) {
  try {
    console.log('🔧 Attempting to use PostgreSQL database for production');
    database = require('./database-postgres');
  } catch (error) {
    console.log('⚠️ PostgreSQL connection failed, falling back to SQLite');
    database = require('./database');
  }
} else if (isProduction) {
  console.log('🔧 DATABASE_URL not found, using SQLite for production (data will not persist)');
  database = require('./database');
} else {
  console.log('🔧 Using SQLite database for development');
  database = require('./database');
}

module.exports = database;