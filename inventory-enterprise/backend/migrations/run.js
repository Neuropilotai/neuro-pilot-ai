const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

/**
 * Simple migration runner
 */
async function runMigrations() {
  // Use environment variable or default path
  const dbPath = process.env.DB_PATH || '../data/enterprise_inventory.db';
  const resolvedPath = path.resolve(__dirname, dbPath);

  console.log(`📦 Opening database: ${resolvedPath}`);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Database not found at: ${resolvedPath}`);
    console.log('   Please ensure the database exists before running migrations.');
    process.exit(1);
  }

  const db = new sqlite3.Database(resolvedPath);

  // Create migrations table if not exists
  await new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Get applied migrations
  const appliedMigrations = await new Promise((resolve, reject) => {
    db.all('SELECT name FROM migrations', (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });

  // Get migration files
  const migrationsDir = __dirname;
  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js') && f !== 'run.js')
    .sort();

  console.log(`\n🔍 Found ${migrationFiles.length} migration(s)`);
  console.log(`📊 ${appliedMigrations.length} already applied\n`);

  if (migrationFiles.length === 0) {
    console.log('✅ No migrations to run');
    db.close();
    return;
  }

  // Run pending migrations
  let applied = 0;
  for (const file of migrationFiles) {
    const name = file.replace('.js', '');

    if (appliedMigrations.includes(name)) {
      console.log(`⏭  ${name} (already applied)`);
      continue;
    }

    console.log(`▶  Running ${name}...`);
    const migration = require(path.join(migrationsDir, file));

    try {
      await migration.up(db);

      // Mark as applied
      await new Promise((resolve, reject) => {
        db.run('INSERT INTO migrations (name) VALUES (?)', [name], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      console.log(`✅ ${name} applied successfully\n`);
      applied++;
    } catch (error) {
      console.error(`❌ Error running ${name}:`, error);
      db.close();
      throw error;
    }
  }

  db.close();

  if (applied > 0) {
    console.log(`\n✅ Successfully applied ${applied} migration(s)`);
  } else {
    console.log('\n✅ All migrations up to date');
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations().catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
}

module.exports = runMigrations;
