/**
 * Enterprise 256-bit AES-GCM Encryption Module
 * Professional-grade encryption for sensitive inventory data
 */

const crypto = require('crypto');

class EnterpriseEncryption {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyBuffer = Buffer.from(process.env.DATA_ENCRYPTION_KEY || '', 'hex');
    
    if (this.keyBuffer.length !== 32) {
      throw new Error('DATA_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (256 bits)');
    }
    
    console.log('🔐 Enterprise 256-bit AES-GCM encryption initialized');
  }

  /**
   * Encrypt data with AES-256-GCM
   * @param {Object|String} data - Data to encrypt
   * @returns {Object} Encrypted data with metadata
   */
  encrypt(data) {
    try {
      const iv = crypto.randomBytes(16); // 128-bit IV
      const cipher = crypto.createCipher(this.algorithm, this.keyBuffer);
      
      // Additional authenticated data for integrity
      const aad = Buffer.from('enterprise-inventory-system', 'utf8');
      cipher.setAAD(aad);
      
      const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm,
        timestamp: Date.now(),
        version: '1.0'
      };
    } catch (error) {
      console.error('❌ Enterprise encryption failed:', error);
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt data with AES-256-GCM
   * @param {Object} encryptedData - Encrypted data object
   * @returns {Object|String} Decrypted data
   */
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, authTag, algorithm } = encryptedData;
      
      if (algorithm !== this.algorithm) {
        throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
      }
      
      const decipher = crypto.createDecipher(this.algorithm, this.keyBuffer);
      
      // Set additional authenticated data
      const aad = Buffer.from('enterprise-inventory-system', 'utf8');
      decipher.setAAD(aad);
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      // Try to parse as JSON, return string if parsing fails
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      console.error('❌ Enterprise decryption failed:', error);
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Encrypt file data with metadata wrapper
   * @param {Object} data - Data to encrypt and store
   * @returns {Object} File structure with encrypted data
   */
  encryptFile(data) {
    const encrypted = this.encrypt(data);
    return {
      format: 'enterprise-encrypted',
      version: '1.0',
      encryption: this.algorithm,
      created: new Date().toISOString(),
      data: encrypted,
      checksum: this.generateChecksum(encrypted)
    };
  }

  /**
   * Decrypt file data with validation
   * @param {Object} encryptedFile - Encrypted file structure
   * @returns {Object} Decrypted data
   */
  decryptFile(encryptedFile) {
    if (!encryptedFile.data || encryptedFile.encryption !== this.algorithm) {
      throw new Error('Invalid encrypted file format');
    }
    
    // Verify checksum
    const expectedChecksum = this.generateChecksum(encryptedFile.data);
    if (encryptedFile.checksum !== expectedChecksum) {
      throw new Error('File integrity check failed');
    }
    
    return this.decrypt(encryptedFile.data);
  }

  /**
   * Generate SHA-256 checksum for integrity verification
   * @param {Object} data - Data to checksum
   * @returns {String} Hex checksum
   */
  generateChecksum(data) {
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(data));
    return hash.digest('hex');
  }

  /**
   * Secure key derivation for additional keys
   * @param {String} context - Context for key derivation
   * @returns {Buffer} Derived key
   */
  deriveKey(context) {
    return crypto.pbkdf2Sync(this.keyBuffer, context, 100000, 32, 'sha256');
  }

  /**
   * Generate secure random token
   * @param {Number} length - Token length in bytes
   * @returns {String} Hex token
   */
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

// Singleton instance
let instance = null;

function getEncryption() {
  if (!instance) {
    instance = new EnterpriseEncryption();
  }
  return instance;
}

module.exports = {
  EnterpriseEncryption,
  getEncryption
};