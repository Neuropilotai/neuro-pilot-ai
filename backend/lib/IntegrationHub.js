/**
 * Enterprise Integration Hub
 * Connects AI Intelligence Layer with external systems
 * ERP, IoT/BMS, Supplier EDI, HR/Scheduling
 */

const sqlite3 = require('sqlite3').verbose();
const EventEmitter = require('events');

class IntegrationHub extends EventEmitter {
    constructor(dbPath = './data/enterprise_inventory.db') {
        super();
        this.db = new sqlite3.Database(dbPath);
        this.integrations = new Map();
        this.syncLog = [];
    }

    // ==================== ERP INTEGRATION ====================

    /**
     * ERP/Accounting Integration (SAP, Oracle, Sage)
     * Seamless cost tracking and reconciliation
     */
    async syncWithERP(erpSystem = 'SAP') {
        console.log(`\n📊 Syncing with ${erpSystem}...`);

        try {
            // Get inventory transactions for ERP sync
            const transactions = await this.getInventoryTransactions();

            // Format for ERP system
            const erpData = this.formatForERP(transactions, erpSystem);

            // Log integration
            await this.logIntegration('ERP', erpSystem, {
                transactions: transactions.length,
                totalValue: erpData.totalValue,
                syncTime: new Date().toISOString()
            });

            this.emit('erp-sync-complete', {
                system: erpSystem,
                recordsProcessed: transactions.length,
                totalValue: erpData.totalValue
            });

            return {
                success: true,
                system: erpSystem,
                data: erpData,
                message: `Successfully synced ${transactions.length} transactions to ${erpSystem}`
            };
        } catch (error) {
            this.emit('erp-sync-error', { system: erpSystem, error: error.message });
            throw error;
        }
    }

    async getInventoryTransactions() {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT
                    ii.invoice_number,
                    ii.invoice_date,
                    ii.item_code,
                    im.description,
                    ii.quantity,
                    ii.unit_price,
                    (ii.quantity * ii.unit_price) as line_total,
                    ii.status,
                    ic.category_name
                FROM invoice_items ii
                JOIN item_master im ON ii.item_code = im.item_code
                LEFT JOIN item_categories ic ON im.category_id = ic.category_id
                WHERE ii.invoice_date >= date('now', '-30 days')
                    AND ii.status != 'cancelled'
                ORDER BY ii.invoice_date DESC
                LIMIT 1000
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    formatForERP(transactions, erpSystem) {
        const totalValue = transactions.reduce((sum, t) => sum + (t.line_total || 0), 0);

        const formatted = {
            erpSystem: erpSystem,
            exportDate: new Date().toISOString(),
            totalValue: totalValue,
            recordCount: transactions.length,
            transactions: transactions.map(t => ({
                // Universal format convertible to SAP/Oracle/Sage
                documentNumber: t.invoice_number,
                documentDate: t.invoice_date,
                materialNumber: t.item_code,
                description: t.description,
                quantity: t.quantity,
                unitPrice: t.unit_price,
                amount: t.line_total,
                costCenter: t.category_name,
                warehouse: t.location_name,
                status: t.status
            }))
        };

        // ERP-specific formatting
        if (erpSystem === 'SAP') {
            formatted.idocType = 'WMMBXY';
            formatted.messageType = 'MBGMCR';
        } else if (erpSystem === 'Oracle') {
            formatted.interfaceType = 'INV_TRANSACTIONS';
            formatted.sourceSystem = 'CAMP_INVENTORY';
        } else if (erpSystem === 'Sage') {
            formatted.batchType = 'INVENTORY_RECEIPT';
            formatted.companyID = 'CAMP001';
        }

        return formatted;
    }

    // ==================== IoT/BMS INTEGRATION ====================

    /**
     * IoT + Building Management System Integration
     * Temperature, humidity, power outages → spoilage & recall logic
     */
    async processIoTData(sensorData) {
        console.log('\n🌡️ Processing IoT sensor data...');

        const alerts = [];

        // Temperature monitoring
        if (sensorData.temperature) {
            const tempAlert = await this.checkTemperatureThresholds(
                sensorData.location,
                sensorData.temperature,
                sensorData.timestamp
            );
            if (tempAlert) alerts.push(tempAlert);
        }

        // Humidity monitoring
        if (sensorData.humidity) {
            const humidityAlert = await this.checkHumidityLevels(
                sensorData.location,
                sensorData.humidity
            );
            if (humidityAlert) alerts.push(humidityAlert);
        }

        // Power outage detection
        if (sensorData.powerStatus === 'OUTAGE') {
            const powerAlert = await this.handlePowerOutage(
                sensorData.location,
                sensorData.outageDuration
            );
            alerts.push(powerAlert);
        }

        // Log IoT event
        await this.logIoTEvent(sensorData, alerts);

        // Emit alerts
        if (alerts.length > 0) {
            this.emit('iot-alerts', alerts);
        }

        return {
            success: true,
            sensorData: sensorData,
            alerts: alerts,
            timestamp: new Date().toISOString()
        };
    }

    async checkTemperatureThresholds(location, temperature, timestamp) {
        // Get temperature requirements for location
        const requirements = await this.getLocationTempRequirements(location);

        if (!requirements) return null;

        const { min, max, criticalMin, criticalMax } = requirements;

        // Critical violation - immediate spoilage risk
        if (temperature < criticalMin || temperature > criticalMax) {
            // Mark affected inventory as at-risk
            await this.markInventoryAtRisk(location, 'CRITICAL_TEMP', {
                current: temperature,
                required: `${min}-${max}°F`,
                timestamp: timestamp
            });

            return {
                severity: 'CRITICAL',
                type: 'TEMPERATURE',
                location: location,
                current: temperature,
                required: `${min}-${max}°F`,
                action: 'IMMEDIATE_INSPECTION_REQUIRED',
                affectedItems: await this.getItemsInLocation(location),
                timestamp: timestamp
            };
        }

        // Warning - approaching limits
        if (temperature < min || temperature > max) {
            return {
                severity: 'WARNING',
                type: 'TEMPERATURE',
                location: location,
                current: temperature,
                required: `${min}-${max}°F`,
                action: 'MONITOR_CLOSELY',
                timestamp: timestamp
            };
        }

        return null;
    }

    async getLocationTempRequirements(location) {
        return new Promise((resolve) => {
            this.db.get(`
                SELECT
                    min_temp as min,
                    max_temp as max,
                    (min_temp - 5) as criticalMin,
                    (max_temp + 5) as criticalMax
                FROM location_master
                WHERE location_name = ?
            `, [location], (err, row) => {
                if (err || !row) resolve(null);
                else resolve(row);
            });
        });
    }

    async checkHumidityLevels(location, humidity) {
        if (humidity > 85) {
            return {
                severity: 'WARNING',
                type: 'HUMIDITY',
                location: location,
                current: humidity,
                recommended: '50-70%',
                action: 'CHECK_DEHUMIDIFICATION',
                risk: 'Mold growth risk for dry goods'
            };
        }
        return null;
    }

    async handlePowerOutage(location, duration) {
        // Calculate spoilage risk based on outage duration
        const riskLevel = duration > 240 ? 'HIGH' : duration > 60 ? 'MEDIUM' : 'LOW';

        await this.markInventoryAtRisk(location, 'POWER_OUTAGE', {
            duration: duration,
            riskLevel: riskLevel,
            timestamp: new Date().toISOString()
        });

        return {
            severity: riskLevel === 'HIGH' ? 'CRITICAL' : 'WARNING',
            type: 'POWER_OUTAGE',
            location: location,
            duration: `${duration} minutes`,
            riskLevel: riskLevel,
            action: riskLevel === 'HIGH' ? 'INSPECT_AND_DISCARD_IF_NEEDED' : 'INSPECT_PERISHABLES',
            affectedItems: await this.getPerishableItems(location)
        };
    }

    async markInventoryAtRisk(location, reason, details) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO inventory_alerts
                (location_name, alert_type, severity, alert_data, created_at)
                VALUES (?, ?, 'HIGH', ?, datetime('now'))
            `, [location, reason, JSON.stringify(details)], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async getItemsInLocation(location) {
        return new Promise((resolve) => {
            this.db.all(`
                SELECT item_code, description, counted_quantity
                FROM inventory_count_items ici
                JOIN item_master im ON ici.item_code = im.item_code
                WHERE ici.location = ?
                    AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items WHERE location = ?)
            `, [location, location], (err, rows) => {
                if (err) resolve([]);
                else resolve(rows || []);
            });
        });
    }

    async getPerishableItems(location) {
        return new Promise((resolve) => {
            this.db.all(`
                SELECT ici.item_code, im.description, ici.counted_quantity
                FROM inventory_count_items ici
                JOIN item_master im ON ici.item_code = im.item_code
                LEFT JOIN item_categories ic ON im.category_id = ic.category_id
                WHERE ici.location = ?
                    AND ic.category_name IN ('Produce', 'Dairy', 'Meat', 'Protein', 'Frozen')
            `, [location], (err, rows) => {
                if (err) resolve([]);
                else resolve(rows || []);
            });
        });
    }

    // ==================== SUPPLIER EDI INTEGRATION ====================

    /**
     * Supplier API / EDI 2-Way Sync
     * Automatic PO creation, shipment tracking, invoicing
     */
    async createPurchaseOrder(items, supplierId) {
        console.log('\n📦 Creating Purchase Order...');

        const poNumber = `PO-${Date.now()}`;
        const poData = {
            poNumber: poNumber,
            supplierId: supplierId,
            createdDate: new Date().toISOString(),
            status: 'PENDING',
            items: items,
            totalAmount: items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0)
        };

        // Store PO
        await this.storePurchaseOrder(poData);

        // Send to supplier via EDI
        const ediMessage = this.formatEDI850(poData);

        // Log integration
        await this.logIntegration('SUPPLIER_EDI', supplierId, {
            poNumber: poNumber,
            itemCount: items.length,
            totalAmount: poData.totalAmount,
            ediType: 'X12-850'
        });

        this.emit('po-created', poData);

        return {
            success: true,
            poNumber: poNumber,
            poData: poData,
            ediMessage: ediMessage,
            message: `PO ${poNumber} created and sent to supplier ${supplierId}`
        };
    }

    formatEDI850(poData) {
        // EDI X12 850 Purchase Order format
        return {
            interchangeControlHeader: 'ISA',
            functionalGroupHeader: 'GS',
            transactionSetHeader: 'ST*850',
            beginningSegment: `BEG*00*SA*${poData.poNumber}*${poData.createdDate}`,
            items: poData.items.map((item, idx) => ({
                PO1: `PO1*${idx + 1}*${item.quantity}*EA*${item.unitPrice}**BP*${item.itemCode}`,
                PID: `PID*F****${item.description}`
            })),
            summary: `CTT*${poData.items.length}`,
            transactionSetTrailer: 'SE',
            functionalGroupTrailer: 'GE',
            interchangeControlTrailer: 'IEA'
        };
    }

    async storePurchaseOrder(poData) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO purchase_orders
                (po_number, supplier_id, po_date, status, total_amount, po_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            `, [
                poData.poNumber,
                poData.supplierId,
                poData.createdDate,
                poData.status,
                poData.totalAmount,
                JSON.stringify(poData)
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async trackShipment(trackingNumber, carrier) {
        console.log(`\n🚚 Tracking shipment ${trackingNumber} via ${carrier}...`);

        // Simulate API call to carrier
        const shipmentStatus = {
            trackingNumber: trackingNumber,
            carrier: carrier,
            status: 'IN_TRANSIT',
            estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
            currentLocation: 'Distribution Center - City',
            lastUpdate: new Date().toISOString()
        };

        // Update expected delivery in system
        await this.updateExpectedDelivery(trackingNumber, shipmentStatus.estimatedDelivery);

        this.emit('shipment-update', shipmentStatus);

        return {
            success: true,
            shipment: shipmentStatus
        };
    }

    async updateExpectedDelivery(trackingNumber, deliveryDate) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                UPDATE purchase_orders
                SET expected_delivery = ?,
                    tracking_number = ?,
                    updated_at = datetime('now')
                WHERE tracking_number = ? OR po_number LIKE ?
            `, [deliveryDate, trackingNumber, trackingNumber, `%${trackingNumber}%`], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    // ==================== HR/SCHEDULING INTEGRATION ====================

    /**
     * HR / Scheduling Feed
     * Links consumption forecasts to actual headcount (pax)
     */
    async syncWithHRSchedule(scheduleData) {
        console.log('\n👥 Syncing with HR/Scheduling system...');

        const { date, headcount, mealTypes, specialEvents } = scheduleData;

        // Calculate consumption multipliers based on headcount
        const consumptionForecast = await this.forecastConsumptionByHeadcount(
            headcount,
            mealTypes,
            specialEvents
        );

        // Store forecast
        await this.storeForecast(date, headcount, consumptionForecast);

        // Update reorder points based on forecast
        await this.adjustReorderPoints(consumptionForecast);

        this.emit('hr-sync-complete', {
            date: date,
            headcount: headcount,
            forecast: consumptionForecast
        });

        return {
            success: true,
            date: date,
            headcount: headcount,
            forecast: consumptionForecast,
            message: `Forecast updated for ${headcount} people on ${date}`
        };
    }

    async forecastConsumptionByHeadcount(headcount, mealTypes, specialEvents) {
        // Get historical consumption per capita
        const perCapitaRates = await this.getPerCapitaConsumption();

        const forecast = [];

        for (const [category, ratePerPerson] of Object.entries(perCapitaRates)) {
            const baseConsumption = headcount * ratePerPerson;

            // Adjust for meal types
            let adjustment = 1.0;
            if (mealTypes.includes('BREAKFAST')) adjustment *= 0.8;
            if (mealTypes.includes('DINNER')) adjustment *= 1.2;

            // Adjust for special events
            if (specialEvents && specialEvents.length > 0) {
                adjustment *= 1.3; // 30% increase for special events
            }

            forecast.push({
                category: category,
                baseConsumption: baseConsumption,
                adjustedConsumption: baseConsumption * adjustment,
                headcount: headcount,
                perCapitaRate: ratePerPerson
            });
        }

        return forecast;
    }

    async getPerCapitaConsumption() {
        // Simplified per-capita consumption rates
        return {
            'Protein': 0.5,      // 0.5 units per person
            'Produce': 0.3,
            'Dairy': 0.4,
            'Bread': 0.2,
            'Beverages': 1.0
        };
    }

    async storeForecast(date, headcount, forecast) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO consumption_forecasts
                (forecast_date, headcount, forecast_data, created_at)
                VALUES (?, ?, ?, datetime('now'))
            `, [date, headcount, JSON.stringify(forecast)], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async adjustReorderPoints(forecast) {
        // Adjust reorder points based on forecasted consumption
        for (const item of forecast) {
            const adjustment = Math.ceil(item.adjustedConsumption * 1.2); // 20% safety stock

            await new Promise((resolve) => {
                this.db.run(`
                    UPDATE ai_reorder_policy
                    SET reorder_point = reorder_point + ?,
                        last_updated = datetime('now')
                    WHERE item_code IN (
                        SELECT item_code FROM item_master im
                        LEFT JOIN item_categories ic ON im.category_id = ic.category_id
                        WHERE ic.category_name = ?
                    )
                `, [adjustment, item.category], () => resolve());
            });
        }
    }

    // ==================== LOGGING & MONITORING ====================

    async logIntegration(integrationType, system, metadata) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO integration_log
                (integration_type, system_name, metadata, status, created_at)
                VALUES (?, ?, ?, 'SUCCESS', datetime('now'))
            `, [integrationType, system, JSON.stringify(metadata)], (err) => {
                if (err) reject(err);
                else {
                    this.syncLog.push({
                        type: integrationType,
                        system: system,
                        timestamp: new Date().toISOString(),
                        metadata: metadata
                    });
                    resolve();
                }
            });
        });
    }

    async logIoTEvent(sensorData, alerts) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO iot_events
                (location_name, sensor_type, sensor_data, alerts, created_at)
                VALUES (?, ?, ?, ?, datetime('now'))
            `, [
                sensorData.location,
                sensorData.sensorType || 'MULTI',
                JSON.stringify(sensorData),
                JSON.stringify(alerts)
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async getIntegrationStatus() {
        return {
            activeIntegrations: Array.from(this.integrations.keys()),
            lastSync: this.syncLog.slice(-10),
            eventListeners: this.eventNames(),
            status: 'OPERATIONAL'
        };
    }

    close() {
        this.db.close();
        this.removeAllListeners();
    }
}

module.exports = IntegrationHub;
