const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const oldDb = new sqlite3.Database(path.join(__dirname, '../../../backend/data/enterprise_inventory.db'));
const newDb = new sqlite3.Database(path.join(__dirname, '../db/inventory_enterprise.db'));

async function getTableInfo(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function getTableList(db) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(r => r.name));
    });
  });
}

async function getRowCount(db, tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as count FROM ${tableName}`, (err, row) => {
      if (err) resolve(0);
      else resolve(row.count);
    });
  });
}

async function main() {
  try {
    const oldTables = await getTableList(oldDb);
    const newTables = await getTableList(newDb);

    const commonTables = oldTables.filter(t => newTables.includes(t));
    const oldOnlyTables = oldTables.filter(t => !newTables.includes(t));
    const newOnlyTables = newTables.filter(t => !oldTables.includes(t));

    let report = `# Database Schema Comparison Report\n\n`;
    report += `**Generated**: ${new Date().toISOString()}\n\n`;
    report += `## Executive Summary\n\n`;
    report += `- **Old Database**: ../../backend/data/enterprise_inventory.db (${oldTables.length} tables)\n`;
    report += `- **New Database**: db/inventory_enterprise.db (${newTables.length} tables)\n`;
    report += `- **Common Tables**: ${commonTables.length}\n`;
    report += `- **Removed Tables**: ${oldOnlyTables.length}\n`;
    report += `- **New Tables**: ${newOnlyTables.length}\n\n`;

    // Tables only in old
    report += `## Removed Tables (in old, not in new)\n\n`;
    for (const table of oldOnlyTables) {
      const count = await getRowCount(oldDb, table);
      report += `- \`${table}\` (${count} rows)\n`;
    }
    report += `\n`;

    // Tables only in new
    report += `## New Tables (in new, not in old)\n\n`;
    for (const table of newOnlyTables) {
      const count = await getRowCount(newDb, table);
      report += `- \`${table}\` (${count} rows)\n`;
    }
    report += `\n`;

    // Detailed comparison of common critical tables
    report += `## Critical Table Comparisons\n\n`;

    const criticalTables = ['item_master', 'inventory_counts', 'inventory_count_items',
                           'invoice_items', 'processed_invoices', 'item_locations', 'location_assignments'];

    for (const table of criticalTables) {
      if (commonTables.includes(table)) {
        report += `### ${table}\n\n`;

        const oldInfo = await getTableInfo(oldDb, table);
        const newInfo = await getTableInfo(newDb, table);
        const oldCount = await getRowCount(oldDb, table);
        const newCount = await getRowCount(newDb, table);

        report += `**Row counts**: Old = ${oldCount}, New = ${newCount}\n\n`;

        const oldFields = oldInfo.map(f => f.name);
        const newFields = newInfo.map(f => f.name);
        const commonFields = oldFields.filter(f => newFields.includes(f));
        const removedFields = oldFields.filter(f => !newFields.includes(f));
        const addedFields = newFields.filter(f => !oldFields.includes(f));

        report += `**Schema changes**:\n`;
        report += `- Common fields: ${commonFields.length}\n`;
        report += `- Removed fields: ${removedFields.length}\n`;
        report += `- Added fields: ${addedFields.length}\n\n`;

        if (removedFields.length > 0) {
          report += `**Removed fields**: ${removedFields.join(', ')}\n\n`;
        }
        if (addedFields.length > 0) {
          report += `**Added fields**: ${addedFields.join(', ')}\n\n`;
        }

        report += `#### Old Schema\n\n\`\`\`\n`;
        oldInfo.forEach(f => {
          report += `${f.name} ${f.type}${f.pk ? ' PRIMARY KEY' : ''}${f.notnull ? ' NOT NULL' : ''}${f.dflt_value ? ` DEFAULT ${f.dflt_value}` : ''}\n`;
        });
        report += `\`\`\`\n\n`;

        report += `#### New Schema\n\n\`\`\`\n`;
        newInfo.forEach(f => {
          report += `${f.name} ${f.type}${f.pk ? ' PRIMARY KEY' : ''}${f.notnull ? ' NOT NULL' : ''}${f.dflt_value ? ` DEFAULT ${f.dflt_value}` : ''}\n`;
        });
        report += `\`\`\`\n\n`;
      }
    }

    // Check for location table differences
    report += `### Location Tables (location_master → storage_locations)\n\n`;

    if (oldTables.includes('location_master')) {
      const oldLocInfo = await getTableInfo(oldDb, 'location_master');
      const oldLocCount = await getRowCount(oldDb, 'location_master');
      report += `**location_master** (old): ${oldLocCount} rows\n\n`;
      report += `\`\`\`\n`;
      oldLocInfo.forEach(f => {
        report += `${f.name} ${f.type}${f.pk ? ' PRIMARY KEY' : ''}\n`;
      });
      report += `\`\`\`\n\n`;
    }

    if (newTables.includes('storage_locations')) {
      const newLocInfo = await getTableInfo(newDb, 'storage_locations');
      const newLocCount = await getRowCount(newDb, 'storage_locations');
      report += `**storage_locations** (new): ${newLocCount} rows\n\n`;
      report += `\`\`\`\n`;
      newLocInfo.forEach(f => {
        report += `${f.name} ${f.type}${f.pk ? ' PRIMARY KEY' : ''}\n`;
      });
      report += `\`\`\`\n\n`;
    }

    // Save report
    const reportPath = path.join(__dirname, '../docs/PARITY_SCHEMA_DIFF.md');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report);

    console.log(`✅ Schema comparison report generated: ${reportPath}`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    oldDb.close();
    newDb.close();
  }
}

main();
