#!/usr/bin/env node

/**
 * Setup Integration Hub Database Tables
 * Creates tables for ERP, IoT, EDI, and HR integrations
 */

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/enterprise_inventory.db');

console.log('🔧 Setting up Integration Hub tables...\n');

const tables = [
    {
        name: 'integration_log',
        sql: `
            CREATE TABLE IF NOT EXISTS integration_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                integration_type TEXT NOT NULL,
                system_name TEXT NOT NULL,
                metadata TEXT,
                status TEXT DEFAULT 'SUCCESS',
                error_message TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    {
        name: 'iot_events',
        sql: `
            CREATE TABLE IF NOT EXISTS iot_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                location_name TEXT NOT NULL,
                sensor_type TEXT NOT NULL,
                sensor_data TEXT,
                alerts TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    {
        name: 'purchase_orders',
        sql: `
            CREATE TABLE IF NOT EXISTS purchase_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                po_number TEXT UNIQUE NOT NULL,
                supplier_id TEXT NOT NULL,
                po_date TEXT NOT NULL,
                status TEXT DEFAULT 'PENDING',
                total_amount REAL DEFAULT 0.0,
                tracking_number TEXT,
                expected_delivery TEXT,
                po_data TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `
    },
    {
        name: 'consumption_forecasts',
        sql: `
            CREATE TABLE IF NOT EXISTS consumption_forecasts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                forecast_date TEXT NOT NULL,
                headcount INTEGER NOT NULL,
                forecast_data TEXT,
                actual_consumption TEXT,
                accuracy_score REAL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `
    }
];

// Create tables
let completed = 0;

tables.forEach(table => {
    db.run(table.sql, (err) => {
        if (err) {
            console.error(`❌ Error creating ${table.name}:`, err.message);
        } else {
            console.log(`✅ Created table: ${table.name}`);
        }

        completed++;
        if (completed === tables.length) {
            // Create indexes
            createIndexes();
        }
    });
});

function createIndexes() {
    console.log('\n🔧 Creating indexes...\n');

    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_integration_log_type ON integration_log(integration_type)',
        'CREATE INDEX IF NOT EXISTS idx_integration_log_created ON integration_log(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_iot_events_location ON iot_events(location_name)',
        'CREATE INDEX IF NOT EXISTS idx_iot_events_created ON iot_events(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number)',
        'CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)',
        'CREATE INDEX IF NOT EXISTS idx_forecast_date ON consumption_forecasts(forecast_date)'
    ];

    let indexCount = 0;

    indexes.forEach(indexSQL => {
        db.run(indexSQL, (err) => {
            if (err) {
                console.error(`❌ Error creating index:`, err.message);
            } else {
                console.log(`✅ Created index`);
            }

            indexCount++;
            if (indexCount === indexes.length) {
                insertSampleData();
            }
        });
    });
}

function insertSampleData() {
    console.log('\n🔧 Inserting sample integration data...\n');

    // Sample IoT event
    db.run(`
        INSERT INTO iot_events
        (location_name, sensor_type, sensor_data, alerts)
        VALUES (?, ?, ?, ?)
    `, [
        'Main Freezer',
        'TEMPERATURE',
        JSON.stringify({
            temperature: -10,
            humidity: 65,
            powerStatus: 'NORMAL',
            timestamp: new Date().toISOString()
        }),
        JSON.stringify([])
    ], (err) => {
        if (err) console.error('Error inserting IoT sample:', err.message);
        else console.log('✅ Inserted sample IoT event');
    });

    // Sample purchase order
    db.run(`
        INSERT INTO purchase_orders
        (po_number, supplier_id, po_date, status, total_amount, po_data)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [
        `PO-SAMPLE-${Date.now()}`,
        'GFS',
        new Date().toISOString(),
        'PENDING',
        1250.50,
        JSON.stringify({
            items: [
                { itemCode: '10010421', quantity: 50, unitPrice: 12.50 },
                { itemCode: '10011801', quantity: 30, unitPrice: 18.35 }
            ]
        })
    ], (err) => {
        if (err) console.error('Error inserting PO sample:', err.message);
        else console.log('✅ Inserted sample purchase order');
    });

    // Sample forecast
    db.run(`
        INSERT INTO consumption_forecasts
        (forecast_date, headcount, forecast_data)
        VALUES (?, ?, ?)
    `, [
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        250,
        JSON.stringify([
            { category: 'Protein', baseConsumption: 125, adjustedConsumption: 150 },
            { category: 'Produce', baseConsumption: 75, adjustedConsumption: 90 }
        ])
    ], (err) => {
        if (err) console.error('Error inserting forecast sample:', err.message);
        else console.log('✅ Inserted sample consumption forecast');

        // Finish
        finish();
    });
}

function finish() {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('✅ Integration Hub Setup Complete!');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Tables Created:');
    console.log('  • integration_log - Tracks all integration events');
    console.log('  • iot_events - Stores IoT/BMS sensor data');
    console.log('  • purchase_orders - EDI purchase order tracking');
    console.log('  • consumption_forecasts - HR/scheduling forecasts\n');

    db.close();
}
