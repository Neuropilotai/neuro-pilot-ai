#!/usr/bin/env node

/**
 * Unlock Orders
 * Allows authorized user to unlock orders that were locked after cut-off
 * Requires password/authorization
 */

const fs = require('fs');
const path = require('path');
const EnterpriseInventoryManager = require('./enterprise_inventory_manager');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Simple authorization check (in production, use proper authentication)
const AUTHORIZED_USERS = {
  'david': 'admin123',  // Change this password!
  'admin': 'secure456'  // Change this password!
};

console.log('');
console.log('🔓 UNLOCK LOCKED ORDERS');
console.log('='.repeat(80));
console.log('');

async function main() {
  const manager = new EnterpriseInventoryManager();

  try {
    // Authorization
    console.log('🔐 Authorization Required');
    console.log('-'.repeat(80));

    const username = await question('Username: ');
    const password = await question('Password: ');

    if (!AUTHORIZED_USERS[username] || AUTHORIZED_USERS[username] !== password) {
      console.log('');
      console.log('❌ Access Denied: Invalid credentials');
      console.log('');
      rl.close();
      manager.close();
      return;
    }

    console.log('');
    console.log(`✅ Authorized: ${username}`);
    console.log('');

    // Get locked orders
    const lockedOrders = await new Promise((resolve, reject) => {
      manager.db.all(`
        SELECT DISTINCT
          invoice_number,
          order_date,
          locked_at,
          lock_reason,
          COUNT(*) as item_count,
          SUM(line_total) as total_value
        FROM invoice_items
        WHERE status = 'LOCKED'
        GROUP BY invoice_number, order_date, locked_at, lock_reason
        ORDER BY order_date ASC
      `, [], (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });

    if (lockedOrders.length === 0) {
      console.log('✅ No locked orders found');
      console.log('');
      rl.close();
      manager.close();
      return;
    }

    console.log(`🔒 Currently Locked Orders (${lockedOrders.length}):`);
    console.log('-'.repeat(80));
    console.log('Date       | Invoice     | Locked Date | Reason               | Value');
    console.log('-'.repeat(80));

    let totalValue = 0;

    for (const order of lockedOrders) {
      const lockedDate = order.locked_at ? order.locked_at.split('T')[0] : 'Unknown';
      const reason = (order.lock_reason || 'Unknown').substring(0, 19).padEnd(19);
      console.log(`${order.order_date} | ${order.invoice_number} | ${lockedDate} | ${reason} | $${order.total_value.toFixed(2)}`);
      totalValue += order.total_value;
    }

    console.log('-'.repeat(80));
    console.log(`TOTAL: $${totalValue.toFixed(2)}`);
    console.log('');

    console.log('📋 Unlock Options:');
    console.log('-'.repeat(80));
    console.log('1. Unlock ALL locked orders');
    console.log('2. Unlock specific invoice');
    console.log('3. Unlock orders after specific date');
    console.log('4. Cancel');
    console.log('');

    const choice = await question('Choose option (1-4): ');

    let unlockCondition = '';
    let unlockParams = [];
    let unlockDescription = '';

    switch (choice) {
      case '1':
        unlockCondition = 'status = ?';
        unlockParams = ['LOCKED'];
        unlockDescription = 'ALL locked orders';
        break;

      case '2':
        const invoiceNumber = await question('Enter invoice number: ');
        unlockCondition = 'status = ? AND invoice_number = ?';
        unlockParams = ['LOCKED', invoiceNumber];
        unlockDescription = `Invoice ${invoiceNumber}`;
        break;

      case '3':
        const afterDate = await question('Unlock orders after date (YYYY-MM-DD): ');
        unlockCondition = 'status = ? AND order_date > ?';
        unlockParams = ['LOCKED', afterDate];
        unlockDescription = `Orders after ${afterDate}`;
        break;

      case '4':
      default:
        console.log('❌ Cancelled');
        rl.close();
        manager.close();
        return;
    }

    console.log('');
    console.log(`⚠️  About to unlock: ${unlockDescription}`);
    const confirm = await question('Confirm unlock? (yes/no): ');

    if (confirm.toLowerCase() !== 'yes' && confirm.toLowerCase() !== 'y') {
      console.log('❌ Cancelled');
      rl.close();
      manager.close();
      return;
    }

    console.log('');
    console.log('🔓 Unlocking orders...');

    // Unlock the orders
    const unlocked = await new Promise((resolve, reject) => {
      manager.db.run(`
        UPDATE invoice_items
        SET status = 'PLACED',
            unlocked_at = datetime('now'),
            unlocked_by = ?
        WHERE ${unlockCondition}
      `, [username, ...unlockParams], function(err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });

    console.log(`✅ Unlocked ${unlocked} items`);
    console.log('');

    console.log('📊 Result:');
    console.log('-'.repeat(80));
    console.log(`Unlocked by: ${username}`);
    console.log(`Unlocked at: ${new Date().toISOString()}`);
    console.log(`Description: ${unlockDescription}`);
    console.log('');

    console.log('📝 Next Steps:');
    console.log('-'.repeat(80));
    console.log('These orders are now ACTIVE and will:');
    console.log('  ✅ Appear in inventory reports');
    console.log('  ✅ Be included in inventory totals');
    console.log('  ✅ Affect all calculations');
    console.log('');
    console.log('Run: node verify_system_accuracy.js');
    console.log('To see updated totals including unlocked orders');
    console.log('');

    rl.close();
    manager.close();

  } catch (err) {
    console.error('❌ Error:', err.message);
    rl.close();
    manager.close();
    process.exit(1);
  }
}

main();
