/**
 * Encrypted File I/O Utilities for Enterprise Inventory System
 */

const fs = require('fs').promises;
const path = require('path');
const { getEncryption } = require('../config/encryption');

class EncryptedFileIO {
  constructor() {
    this.encryption = getEncryption();
    this.dataDir = path.join(__dirname, '../data');
  }

  /**
   * Save data with encryption
   * @param {String} filePath - Path to save file
   * @param {Object} data - Data to encrypt and save
   */
  async saveEncrypted(filePath, data) {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      const encryptedFile = this.encryption.encryptFile(data);
      await fs.writeFile(filePath, JSON.stringify(encryptedFile, null, 2));
      
      console.log(`🔐 Encrypted data saved: ${filePath}`);
    } catch (error) {
      console.error('❌ Failed to save encrypted data:', error);
      throw error;
    }
  }

  /**
   * Load and decrypt data
   * @param {String} filePath - Path to encrypted file
   * @returns {Object} Decrypted data
   */
  async loadEncrypted(filePath) {
    try {
      const encryptedData = await fs.readFile(filePath, 'utf8');
      const encryptedFile = JSON.parse(encryptedData);
      
      // Check if file is encrypted
      if (encryptedFile.format === 'enterprise-encrypted') {
        return this.encryption.decryptFile(encryptedFile);
      }
      
      // Handle legacy unencrypted files
      console.log(`⚠️ Loading legacy unencrypted file: ${filePath}`);
      return encryptedFile;
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`📁 File not found: ${filePath}`);
        return null;
      }
      console.error('❌ Failed to load encrypted data:', error);
      throw error;
    }
  }

  /**
   * Create encrypted backup
   * @param {String} backupName - Name for backup file
   * @param {Object} data - Data to backup
   * @returns {String} Backup file path
   */
  async createBackup(backupName, data) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.dataDir, 'backups', `${backupName}_${timestamp}.json`);
      
      const backupData = {
        created: new Date().toISOString(),
        type: 'enterprise-backup',
        name: backupName,
        data: data
      };
      
      await this.saveEncrypted(backupPath, backupData);
      console.log(`🔐 Encrypted backup created: ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error('❌ Backup creation failed:', error);
      throw error;
    }
  }

  /**
   * List available encrypted files
   * @param {String} directory - Directory to scan
   * @returns {Array} List of encrypted files
   */
  async listEncryptedFiles(directory) {
    try {
      const fullPath = path.join(this.dataDir, directory);
      const files = await fs.readdir(fullPath);
      
      return files.filter(file => file.endsWith('.json'));
    } catch (error) {
      console.log(`📁 Directory not found: ${directory}`);
      return [];
    }
  }

  /**
   * Migrate unencrypted file to encrypted format
   * @param {String} filePath - Path to unencrypted file
   */
  async migrateToEncrypted(filePath) {
    try {
      // Read unencrypted file
      const data = await fs.readFile(filePath, 'utf8');
      const parsedData = JSON.parse(data);
      
      // Create backup of original
      const backupPath = `${filePath}.backup`;
      await fs.copyFile(filePath, backupPath);
      
      // Save as encrypted
      await this.saveEncrypted(filePath, parsedData);
      
      console.log(`🔄 Migrated to encrypted: ${filePath}`);
      return true;
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return false;
    }
  }

  /**
   * Secure delete (overwrite before deletion)
   * @param {String} filePath - Path to file to delete
   */
  async secureDelete(filePath) {
    try {
      const stats = await fs.stat(filePath);
      const size = stats.size;
      
      // Overwrite with random data
      const randomData = Buffer.alloc(size);
      require('crypto').randomFillSync(randomData);
      await fs.writeFile(filePath, randomData);
      
      // Delete file
      await fs.unlink(filePath);
      
      console.log(`🗑️ Securely deleted: ${filePath}`);
    } catch (error) {
      console.error('❌ Secure deletion failed:', error);
      throw error;
    }
  }
}

// Singleton instance
let instance = null;

function getFileIO() {
  if (!instance) {
    instance = new EncryptedFileIO();
  }
  return instance;
}

module.exports = {
  EncryptedFileIO,
  getFileIO
};