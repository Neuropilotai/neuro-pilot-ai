/**
 * PostgreSQL Migration Runner
 * Runs pending migrations from backend/migrations/postgres/
 * Called automatically on server startup
 */

const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations/postgres');

/**
 * Run all PostgreSQL migrations
 * @param {Pool} pool - PostgreSQL connection pool
 * @returns {Promise<{success: boolean, migrationsRun: number, error?: string}>}
 */
async function runPostgresMigrations(pool) {
  const result = {
    success: true,
    migrationsRun: 0,
    errors: []
  };

  try {
    // Get all .sql files in migrations directory
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.log('  [PG-Migrate] No postgres migrations directory found');
      return result;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Files are numbered (001_, 003_, 004_, etc.)

    if (files.length === 0) {
      console.log('  [PG-Migrate] No migration files found');
      return result;
    }

    console.log(`  [PG-Migrate] Found ${files.length} migration files`);

    // Run each migration file sequentially
    for (const file of files) {
      const filePath = path.join(MIGRATIONS_DIR, file);

      try {
        const sql = fs.readFileSync(filePath, 'utf8');
        await pool.query(sql);
        result.migrationsRun++;
      } catch (error) {
        // Skip if table already exists (42P07) or duplicate key (23505)
        if (error.code === '42P07' || error.code === '23505') {
          // Silently skip - table/data already exists
          continue;
        }

        // Skip if column already exists (42701)
        if (error.code === '42701') {
          continue;
        }

        // Skip if object already exists (42710)
        if (error.code === '42710') {
          continue;
        }

        // Log non-critical errors but continue
        result.errors.push(`${file}: ${error.message}`);
        console.warn(`  [PG-Migrate] Warning in ${file}: ${error.message}`);
      }
    }

    if (result.errors.length > 0) {
      console.log(`  [PG-Migrate] Completed with ${result.errors.length} warnings`);
    }

    return result;
  } catch (error) {
    result.success = false;
    result.error = error.message;
    return result;
  }
}

module.exports = { runPostgresMigrations };
