/**
 * Storage Audit Logger - v5.1
 * Logs archive/restore events to immutable audit chain
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

class StorageAuditLogger {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, '../db/inventory_enterprise.db');
    this.db = null;
  }

  /**
   * Initialize database connection
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Storage Audit - Database connection failed:', err);
          return reject(err);
        }
        console.log('✓ Storage Audit Logger initialized');
        resolve();
      });
    });
  }

  /**
   * Append storage event to audit chain
   * @param {string} action - ARCHIVE, RESTORE, SCAN, APPROVE
   * @param {string} filePath - File path
   * @param {string} result - SUCCESS, FAIL, SKIPPED
   * @param {Object} metadata - Additional info
   */
  async appendStorageEvent(action, filePath, result, metadata = {}) {
    if (!this.db) {
      await this.initialize();
    }

    const timestamp = new Date().toISOString();
    const entry = {
      event_type: 'STORAGE_OPERATION',
      action,
      endpoint: filePath,
      user_id: 'SYSTEM',
      user_email: 'storage-guardian@neuroinnovate.local',
      tenant_id: null,
      ip_address: '127.0.0.1',
      user_agent: 'StorageGuardian/5.1',
      request_body: JSON.stringify({
        action,
        path: filePath,
        result,
        ...metadata
      }),
      response_status: result === 'SUCCESS' ? 200 : result === 'FAIL' ? 500 : 304,
      duration_ms: metadata.duration || 0,
      success: result === 'SUCCESS' ? 1 : 0,
      severity: result === 'FAIL' ? 'CRITICAL' : 'INFO',
      metadata: JSON.stringify({
        file_size: metadata.file_size,
        checksum: metadata.checksum,
        cloud_path: metadata.cloud_path,
        recall_count: metadata.recall_count,
        dependency_check: metadata.dependency_check
      })
    };

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO audit_logs (
          event_type, action, endpoint, user_id, user_email, tenant_id,
          ip_address, user_agent, request_body, response_status,
          duration_ms, success, severity, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `;

      this.db.run(sql, [
        entry.event_type,
        entry.action,
        entry.endpoint,
        entry.user_id,
        entry.user_email,
        entry.tenant_id,
        entry.ip_address,
        entry.user_agent,
        entry.request_body,
        entry.response_status,
        entry.duration_ms,
        entry.success,
        entry.severity,
        entry.metadata
      ], function(err) {
        if (err) {
          console.error('Failed to log storage event:', err);
          return reject(err);
        }

        console.log(`✓ Storage Event Logged: ${action} ${filePath} → ${result}`);
        resolve({ logId: this.lastID });
      });
    });
  }

  /**
   * Update file archive index
   * @param {Object} fileInfo - File information
   */
  async updateArchiveIndex(fileInfo) {
    if (!this.db) {
      await this.initialize();
    }

    const {
      path_local,
      path_cloud,
      file_size_bytes,
      last_access,
      checksum_sha256,
      file_type,
      dependency_check
    } = fileInfo;

    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO file_archive_index (
          path_local, path_cloud, file_size_bytes, last_access,
          checksum_sha256, file_type, dependency_check, recall_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'archived')
        ON CONFLICT(path_local) DO UPDATE SET
          path_cloud = excluded.path_cloud,
          archived_date = CURRENT_TIMESTAMP,
          recall_status = 'archived'
      `;

      this.db.run(sql, [
        path_local,
        path_cloud,
        file_size_bytes,
        last_access,
        checksum_sha256,
        file_type,
        dependency_check
      ], function(err) {
        if (err) {
          return reject(err);
        }

        resolve({ archiveId: this.lastID || 0 });
      });
    });
  }

  /**
   * Mark file as restored
   * @param {string} localPath - Local file path
   */
  async markRestored(localPath) {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE file_archive_index
        SET
          recall_count = recall_count + 1,
          last_recall = CURRENT_TIMESTAMP,
          recall_status = 'local',
          is_hot = CASE
            WHEN recall_count >= 2 THEN 1  -- 3+ recalls → hot
            ELSE is_hot
          END
        WHERE path_local = ?
      `, [localPath], function(err) {
        if (err) {
          return reject(err);
        }

        resolve({ updated: this.changes });
      });
    });
  }

  /**
   * Get archive statistics
   */
  async getArchiveStats() {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT
          COUNT(*) as total_archived,
          SUM(file_size_bytes) as total_size_archived,
          SUM(CASE WHEN recall_status = 'local' THEN 1 ELSE 0 END) as files_restored,
          SUM(CASE WHEN is_hot = 1 THEN 1 ELSE 0 END) as hot_files,
          AVG(recall_count) as avg_recalls
        FROM file_archive_index
      `, [], (err, rows) => {
        if (err) {
          return reject(err);
        }

        resolve(rows[0] || {});
      });
    });
  }

  /**
   * Get storage audit events
   * @param {number} limit - Max results
   */
  async getStorageEvents(limit = 50) {
    if (!this.db) {
      await this.initialize();
    }

    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT *
        FROM audit_logs
        WHERE event_type = 'STORAGE_OPERATION'
        ORDER BY created_at DESC
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          return reject(err);
        }

        resolve(rows.map(row => ({
          ...row,
          request_body: JSON.parse(row.request_body || '{}'),
          metadata: JSON.parse(row.metadata || '{}')
        })));
      });
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      console.log('✓ Storage Audit Logger closed');
    }
  }
}

module.exports = StorageAuditLogger;
