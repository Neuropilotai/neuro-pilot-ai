/**
 * FinanceMappingService.js (v16.2.0)
 *
 * Finance code mapping service with precedence-based classification
 *
 * Mapping Precedence:
 *   1. ItemBank.finance_code (exact GFS item match) - confidence: 1.00
 *   2. Mapping Rules (SKU/VENDOR_SKU/REGEX/KEYWORD) - confidence: rule.confidence
 *   3. AI Classifier fallback - confidence: varies
 *   4. Manual assignment - confidence: 1.00
 *
 * All mapping decisions are recorded in mapping_audit for traceability.
 *
 * Author: NeuroPilot AI Development Team
 * Date: 2025-10-18
 */

const crypto = require('crypto');

class FinanceMappingService {
  constructor(db, itemBankService, aiClassifier = null) {
    this.db = db;
    this.itemBankService = itemBankService;
    this.aiClassifier = aiClassifier; // Optional AI classifier
  }

  /**
   * Map an invoice line to a finance code using precedence logic
   *
   * @param {Object} lineData - Invoice line data
   * @param {string} lineData.invoice_id - Invoice ID
   * @param {string} lineData.line_id - Line identifier
   * @param {string} lineData.gfs_item_no - GFS item number (if available)
   * @param {string} lineData.vendor_sku - Vendor SKU (if available)
   * @param {string} lineData.description - Item description
   * @param {string} lineData.actor - User/system performing mapping
   * @returns {Promise<Object>} { finance_code, confidence, strategy, rule_id?, audit_id }
   */
  async mapInvoiceLine(lineData) {
    const {
      invoice_id,
      line_id = null,
      gfs_item_no = null,
      vendor_sku = null,
      description,
      actor = 'system'
    } = lineData;

    // Strategy 1: ItemBank lookup (highest confidence)
    if (gfs_item_no) {
      const item = await this.itemBankService.getItem(gfs_item_no);
      if (item && item.status === 'ACTIVE') {
        const result = {
          finance_code: item.finance_code,
          confidence: 1.00,
          strategy: 'BANK',
          rule_id: null
        };

        // Record audit trail
        const audit_id = await this._recordAudit({
          invoice_id,
          line_id,
          gfs_item_no,
          description,
          strategy: 'BANK',
          confidence: 1.00,
          old_code: null,
          new_code: item.finance_code,
          actor
        });

        return { ...result, audit_id };
      }
    }

    // Strategy 2: Mapping Rules
    const ruleMatch = await this._findMatchingRule({
      gfs_item_no,
      vendor_sku,
      description
    });

    if (ruleMatch) {
      const result = {
        finance_code: ruleMatch.finance_code,
        confidence: ruleMatch.confidence,
        strategy: 'RULE',
        rule_id: ruleMatch.id
      };

      const audit_id = await this._recordAudit({
        invoice_id,
        line_id,
        gfs_item_no,
        description,
        strategy: 'RULE',
        confidence: ruleMatch.confidence,
        old_code: null,
        new_code: ruleMatch.finance_code,
        actor
      });

      return { ...result, audit_id };
    }

    // Strategy 3: AI Classifier (if available)
    if (this.aiClassifier) {
      const aiResult = await this.aiClassifier.classify(description);
      if (aiResult && aiResult.confidence >= 0.50) {
        const result = {
          finance_code: aiResult.finance_code,
          confidence: aiResult.confidence,
          strategy: 'AI',
          rule_id: null
        };

        const audit_id = await this._recordAudit({
          invoice_id,
          line_id,
          gfs_item_no,
          description,
          strategy: 'AI',
          confidence: aiResult.confidence,
          old_code: null,
          new_code: aiResult.finance_code,
          actor
        });

        return { ...result, audit_id };
      }
    }

    // Strategy 4: Fallback to 'OTHER' with low confidence
    const result = {
      finance_code: 'OTHER',
      confidence: 0.30,
      strategy: 'FALLBACK',
      rule_id: null
    };

    const audit_id = await this._recordAudit({
      invoice_id,
      line_id,
      gfs_item_no,
      description,
      strategy: 'FALLBACK',
      confidence: 0.30,
      old_code: null,
      new_code: 'OTHER',
      actor
    });

    return { ...result, audit_id };
  }

  /**
   * Find matching mapping rule with precedence: SKU > VENDOR_SKU > REGEX > KEYWORD
   */
  async _findMatchingRule({ gfs_item_no, vendor_sku, description }) {
    // Try SKU match first
    if (gfs_item_no) {
      const rule = await this.db.get(`
        SELECT * FROM finance_mapping_rules
        WHERE match_type = 'SKU' AND match_value = ? AND active = 1
        ORDER BY confidence DESC
        LIMIT 1
      `, [gfs_item_no]);
      if (rule) return rule;
    }

    // Try VENDOR_SKU match
    if (vendor_sku) {
      const rule = await this.db.get(`
        SELECT * FROM finance_mapping_rules
        WHERE match_type = 'VENDOR_SKU' AND match_value = ? AND active = 1
        ORDER BY confidence DESC
        LIMIT 1
      `, [vendor_sku]);
      if (rule) return rule;
    }

    // Try REGEX match
    const regexRules = await this.db.all(`
      SELECT * FROM finance_mapping_rules
      WHERE match_type = 'REGEX' AND active = 1
      ORDER BY confidence DESC
    `);

    for (const rule of regexRules) {
      try {
        const regex = new RegExp(rule.match_value, 'i');
        if (regex.test(description)) {
          return rule;
        }
      } catch (err) {
        // Invalid regex, skip
        continue;
      }
    }

    // Try KEYWORD match (case-insensitive substring)
    const keywordRules = await this.db.all(`
      SELECT * FROM finance_mapping_rules
      WHERE match_type = 'KEYWORD' AND active = 1
      ORDER BY confidence DESC
    `);

    for (const rule of keywordRules) {
      if (description.toLowerCase().includes(rule.match_value.toLowerCase())) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Record mapping decision in audit trail
   */
  async _recordAudit(auditData) {
    const {
      invoice_id,
      line_id,
      gfs_item_no,
      description,
      strategy,
      confidence,
      old_code,
      new_code,
      actor
    } = auditData;

    const id = crypto.randomUUID();

    await this.db.run(`
      INSERT INTO mapping_audit (
        id, invoice_id, line_id, gfs_item_no, description,
        strategy, confidence, old_code, new_code, actor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, invoice_id, line_id, gfs_item_no, description,
      strategy, confidence, old_code, new_code, actor
    ]);

    return id;
  }

  /**
   * Create a new mapping rule
   */
  async createMappingRule(ruleData) {
    const {
      match_type,
      match_value,
      finance_code,
      confidence = 1.0,
      source = 'MANUAL',
      created_by = 'system'
    } = ruleData;

    // Validate match_type
    const validMatchTypes = ['SKU', 'VENDOR_SKU', 'REGEX', 'KEYWORD'];
    if (!validMatchTypes.includes(match_type)) {
      throw new Error(`Invalid match_type: ${match_type}`);
    }

    // Validate finance_code
    const validCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'];
    if (!validCodes.includes(finance_code)) {
      throw new Error(`Invalid finance_code: ${finance_code}`);
    }

    // Validate regex if match_type is REGEX
    if (match_type === 'REGEX') {
      try {
        new RegExp(match_value);
      } catch (err) {
        throw new Error(`Invalid regex pattern: ${match_value}`);
      }
    }

    const id = crypto.randomUUID();

    await this.db.run(`
      INSERT INTO finance_mapping_rules (
        id, match_type, match_value, finance_code, confidence, source, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, match_type, match_value, finance_code, confidence, source, created_by]);

    return await this.getMappingRule(id);
  }

  /**
   * Update an existing mapping rule
   */
  async updateMappingRule(ruleId, updates) {
    const existing = await this.getMappingRule(ruleId);
    if (!existing) {
      throw new Error(`Mapping rule not found: ${ruleId}`);
    }

    const fields = [];
    const values = [];

    const allowedFields = ['match_value', 'finance_code', 'confidence', 'active'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    values.push(ruleId);

    await this.db.run(`
      UPDATE finance_mapping_rules
      SET ${fields.join(', ')}
      WHERE id = ?
    `, values);

    return await this.getMappingRule(ruleId);
  }

  /**
   * Get mapping rule by ID
   */
  async getMappingRule(ruleId) {
    return await this.db.get(`
      SELECT * FROM finance_mapping_rules WHERE id = ?
    `, [ruleId]);
  }

  /**
   * Search mapping rules with filters
   */
  async searchMappingRules(filters = {}) {
    const {
      match_type,
      finance_code,
      source,
      active = 1,
      limit = 100,
      offset = 0
    } = filters;

    let query = 'SELECT * FROM finance_mapping_rules WHERE 1=1';
    const params = [];

    if (match_type) {
      query += ` AND match_type = ?`;
      params.push(match_type);
    }

    if (finance_code) {
      query += ` AND finance_code = ?`;
      params.push(finance_code);
    }

    if (source) {
      query += ` AND source = ?`;
      params.push(source);
    }

    if (active !== undefined) {
      query += ` AND active = ?`;
      params.push(active);
    }

    query += ` ORDER BY confidence DESC, created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rules = await this.db.all(query, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM finance_mapping_rules WHERE 1=1';
    const countParams = [];

    if (match_type) {
      countQuery += ` AND match_type = ?`;
      countParams.push(match_type);
    }

    if (finance_code) {
      countQuery += ` AND finance_code = ?`;
      countParams.push(finance_code);
    }

    if (source) {
      countQuery += ` AND source = ?`;
      countParams.push(source);
    }

    if (active !== undefined) {
      countQuery += ` AND active = ?`;
      countParams.push(active);
    }

    const { total } = await this.db.get(countQuery, countParams);

    return {
      rules,
      total,
      limit,
      offset,
      has_more: offset + limit < total
    };
  }

  /**
   * Deactivate a mapping rule (soft delete)
   */
  async deactivateMappingRule(ruleId) {
    await this.updateMappingRule(ruleId, { active: 0 });
    return await this.getMappingRule(ruleId);
  }

  /**
   * Activate a mapping rule
   */
  async activateMappingRule(ruleId) {
    await this.updateMappingRule(ruleId, { active: 1 });
    return await this.getMappingRule(ruleId);
  }

  /**
   * Get needs mapping queue (low confidence mappings)
   */
  async getNeedsMappingQueue(limit = 100, offset = 0) {
    const items = await this.db.all(`
      SELECT * FROM v_needs_mapping
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const { total } = await this.db.get(`
      SELECT COUNT(*) as total FROM v_needs_mapping
    `);

    return {
      items,
      total,
      limit,
      offset,
      has_more: offset + limit < total
    };
  }

  /**
   * Batch map multiple invoice lines
   */
  async batchMapLines(lines, actor = 'system') {
    const results = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const result = await this.mapInvoiceLine({
          ...lines[i],
          actor
        });
        results.push({
          line_index: i,
          ...result
        });
      } catch (error) {
        errors.push({
          line_index: i,
          error: error.message
        });
      }
    }

    return {
      success_count: results.length,
      error_count: errors.length,
      results,
      errors
    };
  }

  /**
   * Manually assign finance code to a line (highest confidence)
   */
  async manualAssign(lineData, finance_code, actor) {
    const {
      invoice_id,
      line_id,
      gfs_item_no,
      description,
      old_code
    } = lineData;

    // Validate finance_code
    const validCodes = ['BAKE', 'BEV+ECO', 'MILK', 'GROC+MISC', 'MEAT', 'PROD', 'CLEAN', 'PAPER', 'FREIGHT', 'LINEN', 'PROPANE', 'OTHER'];
    if (!validCodes.includes(finance_code)) {
      throw new Error(`Invalid finance_code: ${finance_code}`);
    }

    const audit_id = await this._recordAudit({
      invoice_id,
      line_id,
      gfs_item_no,
      description,
      strategy: 'MANUAL',
      confidence: 1.00,
      old_code,
      new_code: finance_code,
      actor
    });

    return {
      finance_code,
      confidence: 1.00,
      strategy: 'MANUAL',
      audit_id
    };
  }

  /**
   * Get mapping statistics
   */
  async getMappingStatistics() {
    const byStrategy = await this.db.all(`
      SELECT
        strategy,
        COUNT(*) as count,
        AVG(confidence) as avg_confidence,
        MIN(confidence) as min_confidence,
        MAX(confidence) as max_confidence
      FROM mapping_audit
      GROUP BY strategy
      ORDER BY count DESC
    `);

    const lowConfidenceCount = await this.db.get(`
      SELECT COUNT(*) as count FROM mapping_audit
      WHERE confidence < 0.80
    `);

    const byFinanceCode = await this.db.all(`
      SELECT
        new_code as finance_code,
        COUNT(*) as count
      FROM mapping_audit
      GROUP BY new_code
      ORDER BY count DESC
    `);

    const activeRuleCount = await this.db.get(`
      SELECT COUNT(*) as count FROM finance_mapping_rules WHERE active = 1
    `);

    return {
      by_strategy: byStrategy,
      low_confidence_count: lowConfidenceCount.count,
      by_finance_code: byFinanceCode,
      active_rule_count: activeRuleCount.count
    };
  }

  /**
   * Get mapping audit history for an invoice
   */
  async getInvoiceAuditHistory(invoice_id) {
    return await this.db.all(`
      SELECT * FROM mapping_audit
      WHERE invoice_id = ?
      ORDER BY timestamp DESC
    `, [invoice_id]);
  }

  /**
   * Remap invoice lines (update existing mappings)
   */
  async remapInvoiceLines(invoice_id, actor = 'system') {
    const auditHistory = await this.getInvoiceAuditHistory(invoice_id);

    const results = [];
    const errors = [];

    for (const audit of auditHistory) {
      try {
        const newMapping = await this.mapInvoiceLine({
          invoice_id: audit.invoice_id,
          line_id: audit.line_id,
          gfs_item_no: audit.gfs_item_no,
          description: audit.description,
          actor
        });

        // Only record if finance code changed
        if (newMapping.finance_code !== audit.new_code) {
          await this._recordAudit({
            invoice_id: audit.invoice_id,
            line_id: audit.line_id,
            gfs_item_no: audit.gfs_item_no,
            description: audit.description,
            strategy: newMapping.strategy,
            confidence: newMapping.confidence,
            old_code: audit.new_code,
            new_code: newMapping.finance_code,
            actor
          });

          results.push({
            line_id: audit.line_id,
            old_code: audit.new_code,
            new_code: newMapping.finance_code,
            confidence: newMapping.confidence
          });
        }
      } catch (error) {
        errors.push({
          line_id: audit.line_id,
          error: error.message
        });
      }
    }

    return {
      remapped_count: results.length,
      error_count: errors.length,
      results,
      errors
    };
  }
}

module.exports = FinanceMappingService;
