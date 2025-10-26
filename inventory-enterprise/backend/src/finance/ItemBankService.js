/**
 * ItemBankService.js (v16.2.0)
 *
 * Authoritative Item Bank service for SKU catalog management
 * - CRUD operations on item_bank
 * - CSV import/export
 * - Search and filtering
 * - Finance code validation
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const crypto = require('crypto');

class ItemBankService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Import items from CSV data
   * Expected format: gfs_item_no,description,pack_size,uom,finance_code,taxable_gst,taxable_qst,vendor_sku,upc
   */
  async importFromCSV(csvData, options = {}) {
    const { upsert = true, createdBy = 'system' } = options;

    // Parse CSV (simple implementation - assumes header row)
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim());

    const imported = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());

      if (values.length !== headers.length) {
        errors.push({ line: i + 1, error: 'Column count mismatch' });
        continue;
      }

      const item = {};
      headers.forEach((header, idx) => {
        item[header] = values[idx] || null;
      });

      try {
        // Validate required fields
        if (!item.gfs_item_no || !item.description || !item.finance_code) {
          errors.push({ line: i + 1, error: 'Missing required fields' });
          continue;
        }

        // Validate finance code
        const validCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'];
        if (!validCodes.includes(item.finance_code)) {
          errors.push({ line: i + 1, error: `Invalid finance_code: ${item.finance_code}` });
          continue;
        }

        // Upsert item
        if (upsert) {
          await this.upsertItem(item.gfs_item_no, {
            vendor_sku: item.vendor_sku,
            upc: item.upc,
            description: item.description,
            pack_size: item.pack_size,
            uom: item.uom || 'EA',
            finance_code: item.finance_code,
            taxable_gst: item.taxable_gst === '1' || item.taxable_gst === 'true' ? 1 : 0,
            taxable_qst: item.taxable_qst === '1' || item.taxable_qst === 'true' ? 1 : 0,
            status: item.status || 'ACTIVE'
          });
        } else {
          await this.createItem({
            gfs_item_no: item.gfs_item_no,
            vendor_sku: item.vendor_sku,
            upc: item.upc,
            description: item.description,
            pack_size: item.pack_size,
            uom: item.uom || 'EA',
            finance_code: item.finance_code,
            taxable_gst: item.taxable_gst === '1' || item.taxable_gst === 'true' ? 1 : 0,
            taxable_qst: item.taxable_qst === '1' || item.taxable_qst === 'true' ? 1 : 0,
            status: item.status || 'ACTIVE'
          });
        }

        imported.push(item.gfs_item_no);
      } catch (error) {
        errors.push({ line: i + 1, error: error.message });
      }
    }

    return {
      success: true,
      imported_count: imported.length,
      error_count: errors.length,
      imported,
      errors
    };
  }

  /**
   * Create a new item
   */
  async createItem(itemData) {
    const {
      gfs_item_no,
      vendor_sku,
      upc,
      description,
      pack_size,
      uom = 'EA',
      finance_code,
      taxable_gst = 1,
      taxable_qst = 1,
      status = 'ACTIVE',
      notes
    } = itemData;

    // Validate required fields
    if (!gfs_item_no || !description || !finance_code) {
      throw new Error('Missing required fields: gfs_item_no, description, finance_code');
    }

    await this.db.run(`
      INSERT INTO item_bank (
        gfs_item_no, vendor_sku, upc, description, pack_size, uom,
        finance_code, taxable_gst, taxable_qst, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      gfs_item_no, vendor_sku, upc, description, pack_size, uom,
      finance_code, taxable_gst, taxable_qst, status, notes
    ]);

    return await this.getItem(gfs_item_no);
  }

  /**
   * Upsert (insert or update) an item
   */
  async upsertItem(gfs_item_no, itemData) {
    const existing = await this.getItem(gfs_item_no);

    if (existing) {
      return await this.updateItem(gfs_item_no, itemData);
    } else {
      return await this.createItem({ gfs_item_no, ...itemData });
    }
  }

  /**
   * Update an existing item
   */
  async updateItem(gfs_item_no, updates) {
    const existing = await this.getItem(gfs_item_no);
    if (!existing) {
      throw new Error(`Item not found: ${gfs_item_no}`);
    }

    const fields = [];
    const values = [];

    const allowedFields = [
      'vendor_sku', 'upc', 'description', 'pack_size', 'uom',
      'finance_code', 'taxable_gst', 'taxable_qst', 'status', 'notes'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    values.push(gfs_item_no);

    await this.db.run(`
      UPDATE item_bank
      SET ${fields.join(', ')}
      WHERE gfs_item_no = ?
    `, values);

    return await this.getItem(gfs_item_no);
  }

  /**
   * Get item by GFS item number
   */
  async getItem(gfs_item_no) {
    return await this.db.get(`
      SELECT * FROM item_bank WHERE gfs_item_no = ?
    `, [gfs_item_no]);
  }

  /**
   * Search items with filters
   */
  async searchItems(filters = {}) {
    const {
      q,                    // Search query (description, SKU, UPC)
      finance_code,         // Filter by finance code
      status = 'ACTIVE',   // Filter by status
      taxable_gst,         // Filter by GST taxability
      taxable_qst,         // Filter by QST taxability
      limit = 100,
      offset = 0
    } = filters;

    let query = 'SELECT * FROM item_bank WHERE 1=1';
    const params = [];

    if (q) {
      query += ` AND (
        description LIKE ? COLLATE NOCASE OR
        gfs_item_no LIKE ? OR
        vendor_sku LIKE ? OR
        upc LIKE ?
      )`;
      const searchPattern = `%${q}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (finance_code) {
      query += ` AND finance_code = ?`;
      params.push(finance_code);
    }

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (taxable_gst !== undefined) {
      query += ` AND taxable_gst = ?`;
      params.push(taxable_gst);
    }

    if (taxable_qst !== undefined) {
      query += ` AND taxable_qst = ?`;
      params.push(taxable_qst);
    }

    query += ` ORDER BY description LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const items = await this.db.all(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM item_bank WHERE 1=1';
    const countParams = [];

    if (q) {
      countQuery += ` AND (
        description LIKE ? COLLATE NOCASE OR
        gfs_item_no LIKE ? OR
        vendor_sku LIKE ? OR
        upc LIKE ?
      )`;
      const searchPattern = `%${q}%`;
      countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (finance_code) {
      countQuery += ` AND finance_code = ?`;
      countParams.push(finance_code);
    }

    if (status) {
      countQuery += ` AND status = ?`;
      countParams.push(status);
    }

    if (taxable_gst !== undefined) {
      countQuery += ` AND taxable_gst = ?`;
      countParams.push(taxable_gst);
    }

    if (taxable_qst !== undefined) {
      countQuery += ` AND taxable_qst = ?`;
      countParams.push(taxable_qst);
    }

    const { total } = await this.db.get(countQuery, countParams);

    return {
      items,
      total,
      limit,
      offset,
      has_more: offset + limit < total
    };
  }

  /**
   * Get item bank statistics
   */
  async getStatistics() {
    const totalActive = await this.db.get(`
      SELECT COUNT(*) as count FROM item_bank WHERE status = 'ACTIVE'
    `);

    const totalRetired = await this.db.get(`
      SELECT COUNT(*) as count FROM item_bank WHERE status = 'RETIRED'
    `);

    const byFinanceCode = await this.db.all(`
      SELECT
        finance_code,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'RETIRED' THEN 1 ELSE 0 END) as retired
      FROM item_bank
      GROUP BY finance_code
      ORDER BY finance_code
    `);

    return {
      total_active: totalActive.count,
      total_retired: totalRetired.count,
      total: totalActive.count + totalRetired.count,
      by_finance_code: byFinanceCode
    };
  }

  /**
   * Retire an item (soft delete)
   */
  async retireItem(gfs_item_no) {
    await this.updateItem(gfs_item_no, { status: 'RETIRED' });
    return await this.getItem(gfs_item_no);
  }

  /**
   * Activate a retired item
   */
  async activateItem(gfs_item_no) {
    await this.updateItem(gfs_item_no, { status: 'ACTIVE' });
    return await this.getItem(gfs_item_no);
  }

  /**
   * Export items to CSV format
   */
  async exportToCSV(filters = {}) {
    const { items } = await this.searchItems({ ...filters, limit: 10000, offset: 0 });

    const headers = [
      'gfs_item_no', 'vendor_sku', 'upc', 'description', 'pack_size', 'uom',
      'finance_code', 'taxable_gst', 'taxable_qst', 'status', 'notes', 'created_at', 'updated_at'
    ];

    const csvLines = [headers.join(',')];

    for (const item of items) {
      const row = headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) return '';
        // Escape commas and quotes
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      csvLines.push(row.join(','));
    }

    return csvLines.join('\n');
  }

  /**
   * Bulk update finance codes
   */
  async bulkUpdateFinanceCode(gfs_item_nos, finance_code) {
    const placeholders = gfs_item_nos.map(() => '?').join(',');

    await this.db.run(`
      UPDATE item_bank
      SET finance_code = ?, updated_at = datetime('now')
      WHERE gfs_item_no IN (${placeholders})
    `, [finance_code, ...gfs_item_nos]);

    return {
      updated_count: gfs_item_nos.length,
      finance_code
    };
  }
}

module.exports = ItemBankService;
