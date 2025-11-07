/**
 * Daily Maintenance Job - v20.1
 * Runs at 02:05 UTC (21:05 Toronto time during EST)
 */

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Daily maintenance tasks
 * @param {object} context - { db, cache, logger }
 */
async function runDailyMaintenance(context) {
  const { db, cache, logger } = context;

  const startTime = Date.now();
  const torontoTime = dayjs().tz('America/Toronto').format('YYYY-MM-DD HH:mm:ss z');

  logger.info('='.repeat(60));
  logger.info('🔧 Daily Maintenance Job Starting');
  logger.info(`UTC Time: ${new Date().toISOString()}`);
  logger.info(`Toronto Time: ${torontoTime}`);
  logger.info('='.repeat(60));

  const tasks = [];

  // Task 1: Warm cache with inventory summary
  tasks.push(
    (async () => {
      try {
        logger.info('[Task 1/4] Warming cache: inventory summary...');

        const summary = await new Promise((resolve, reject) => {
          const queries = {
            totalItems: 'SELECT COUNT(DISTINCT sku) as count FROM inventory',
            totalQuantity: 'SELECT SUM(quantity) as total FROM inventory',
            locations: 'SELECT COUNT(DISTINCT location) as count FROM inventory',
            lowStock: `
              SELECT COUNT(*) as count FROM items i
              LEFT JOIN (
                SELECT sku, SUM(quantity) as total_qty
                FROM inventory
                GROUP BY sku
              ) inv ON i.sku = inv.sku
              WHERE i.active = 1 AND (inv.total_qty IS NULL OR inv.total_qty < i.par_level)
            `,
          };

          const results = {};
          let completed = 0;
          const total = Object.keys(queries).length;

          Object.entries(queries).forEach(([key, sql]) => {
            db.get(sql, (err, row) => {
              if (!err) {
                results[key] = row.count !== undefined ? row.count : row.total || 0;
              } else {
                results[key] = 0;
              }
              completed++;

              if (completed === total) {
                resolve(results);
              }
            });
          });
        });

        // Cache the summary
        if (cache && typeof cache.set === 'function') {
          await cache.set('inventory:summary:v1', summary, 3600); // 1 hour
          logger.info('✅ Cached inventory summary', summary);
        }

        return { success: true, task: 'cache_warming', data: summary };
      } catch (err) {
        logger.error('❌ Task 1 failed:', err.message);
        return { success: false, task: 'cache_warming', error: err.message };
      }
    })()
  );

  // Task 2: Warm cache with active items
  tasks.push(
    (async () => {
      try {
        logger.info('[Task 2/4] Warming cache: active items...');

        const items = await new Promise((resolve, reject) => {
          db.all('SELECT * FROM items WHERE active = 1 ORDER BY name', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });

        if (cache && typeof cache.set === 'function') {
          await cache.set('items:all:active', items, 300); // 5 min
          logger.info(`✅ Cached ${items.length} active items`);
        }

        return { success: true, task: 'cache_items', count: items.length };
      } catch (err) {
        logger.error('❌ Task 2 failed:', err.message);
        return { success: false, task: 'cache_items', error: err.message };
      }
    })()
  );

  // Task 3: Database health check
  tasks.push(
    (async () => {
      try {
        logger.info('[Task 3/4] Running database health check...');

        const itemCount = await new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM items', (err, row) => {
            resolve(err ? 0 : row.count);
          });
        });

        const inventoryCount = await new Promise((resolve) => {
          db.get('SELECT COUNT(*) as count FROM inventory', (err, row) => {
            resolve(err ? 0 : row.count);
          });
        });

        logger.info(`✅ Database health: ${itemCount} items, ${inventoryCount} inventory records`);

        return {
          success: true,
          task: 'db_health',
          items: itemCount,
          inventory: inventoryCount,
        };
      } catch (err) {
        logger.error('❌ Task 3 failed:', err.message);
        return { success: false, task: 'db_health', error: err.message };
      }
    })()
  );

  // Task 4: Cache statistics
  tasks.push(
    (async () => {
      try {
        logger.info('[Task 4/4] Collecting cache statistics...');

        let cacheStats = { connected: false };

        if (cache && typeof cache.stats === 'function') {
          cacheStats = await cache.stats();
        }

        logger.info('✅ Cache stats:', JSON.stringify(cacheStats));

        return { success: true, task: 'cache_stats', data: cacheStats };
      } catch (err) {
        logger.error('❌ Task 4 failed:', err.message);
        return { success: false, task: 'cache_stats', error: err.message };
      }
    })()
  );

  // Execute all tasks
  const results = await Promise.allSettled(tasks);

  const duration = Date.now() - startTime;
  const successCount = results.filter((r) => r.status === 'fulfilled').length;

  logger.info('='.repeat(60));
  logger.info(`✅ Daily Maintenance Complete`);
  logger.info(`Duration: ${duration}ms`);
  logger.info(`Tasks: ${successCount}/${results.length} succeeded`);
  logger.info('='.repeat(60));

  return {
    success: true,
    duration,
    tasks_completed: successCount,
    tasks_total: results.length,
    results: results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason })),
  };
}

module.exports = {
  runDailyMaintenance,
};
