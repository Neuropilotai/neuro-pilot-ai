const AIInventoryMonitor = require('./ai_inventory_monitor');

async function runContinuousMonitoring() {
    const monitor = new AIInventoryMonitor();
    await monitor.initialize();

    console.log('🤖 AI Monitoring Agent Started');
    console.log('📊 Monitoring interval: Every 5 minutes');
    console.log('');

    // Run monitoring every 5 minutes
    setInterval(async () => {
        try {
            const timestamp = new Date().toISOString();
            console.log(`\n[${timestamp}] Running inventory check...`);
            await monitor.monitorInventory();
        } catch (err) {
            console.error('Error during monitoring:', err.message);
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Run immediately on start
    setTimeout(async () => {
        try {
            await monitor.monitorInventory();
        } catch (err) {
            console.error('Error during initial monitoring:', err.message);
        }
    }, 5000);
}

runContinuousMonitoring().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
