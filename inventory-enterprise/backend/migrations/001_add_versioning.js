/**
 * Migration: Add versioning columns to all tables
 */
module.exports = {
  up: (db) => {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        console.log('  Adding version columns to tables...');

        // Add version column to inventory_count_items
        db.run(`
          ALTER TABLE inventory_count_items
          ADD COLUMN version INTEGER DEFAULT 1;
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding version to inventory_count_items:', err);
          }
        });

        // Add version column to item_master
        db.run(`
          ALTER TABLE item_master
          ADD COLUMN version INTEGER DEFAULT 1;
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding version to item_master:', err);
          }
        });

        // Add version column to processed_invoices
        db.run(`
          ALTER TABLE processed_invoices
          ADD COLUMN version INTEGER DEFAULT 1;
        `, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding version to processed_invoices:', err);
          }
          resolve();
        });
      });
    });
  },

  down: (db) => {
    // SQLite doesn't support DROP COLUMN easily
    // In production, this would require table recreation
    return Promise.resolve();
  }
};
