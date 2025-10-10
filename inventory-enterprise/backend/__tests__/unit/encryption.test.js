/**
 * Unit Tests - Encryption Module
 */

const crypto = require('crypto');

// Mock config before requiring encryption
jest.mock('../../config', () => ({
  encryptionKey: Buffer.from('a'.repeat(64), 'hex'),
  isDevelopment: false,
  isProduction: false
}));

const encryption = require('../../config/encryption');

describe('Encryption Module', () => {
  describe('encrypt/decrypt', () => {
    test('should encrypt and decrypt text correctly', () => {
      const plaintext = 'sensitive data';
      const encrypted = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
      expect(encrypted).not.toBe(plaintext);
    });

    test('should return null for null input', () => {
      expect(encryption.encrypt(null)).toBeNull();
      expect(encryption.decrypt(null)).toBeNull();
    });

    test('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'test data';
      const encrypted1 = encryption.encrypt(plaintext);
      const encrypted2 = encryption.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
      expect(encryption.decrypt(encrypted1)).toBe(plaintext);
      expect(encryption.decrypt(encrypted2)).toBe(plaintext);
    });

    test('should handle unicode characters', () => {
      const plaintext = '你好世界 🔐 Héllo Wörld';
      const encrypted = encryption.encrypt(plaintext);
      const decrypted = encryption.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    test('should fail decryption with tampered data', () => {
      const plaintext = 'sensitive data';
      const encrypted = encryption.encrypt(plaintext);

      // Tamper with encrypted data
      const tampered = encrypted.replace(/a/g, 'b');

      expect(() => encryption.decrypt(tampered)).toThrow();
    });

    test('should use authenticated encryption (AEAD)', () => {
      const plaintext = 'secret message';
      const associatedData = 'user123';

      const encrypted = encryption.encrypt(plaintext, associatedData);
      const decrypted = encryption.decrypt(encrypted, associatedData);

      expect(decrypted).toBe(plaintext);

      // Should fail with wrong associated data
      expect(() => encryption.decrypt(encrypted, 'wrongUser')).toThrow();
    });
  });

  describe('hash', () => {
    test('should generate SHA-256 hash', () => {
      const data = 'test data';
      const hash = encryption.hash(data);

      expect(hash).toHaveLength(64); // SHA-256 = 64 hex chars
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should be deterministic', () => {
      const data = 'consistent data';
      const hash1 = encryption.hash(data);
      const hash2 = encryption.hash(data);

      expect(hash1).toBe(hash2);
    });

    test('should return null for null input', () => {
      expect(encryption.hash(null)).toBeNull();
    });
  });

  describe('checksum', () => {
    test('should generate checksum for object', () => {
      const obj = { id: 1, name: 'test', value: 100 };
      const checksum = encryption.checksum(obj);

      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should be order-independent for object keys', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, b: 2, a: 1 };

      const checksum1 = encryption.checksum(obj1);
      const checksum2 = encryption.checksum(obj2);

      expect(checksum1).toBe(checksum2);
    });

    test('should detect changes in object', () => {
      const obj1 = { id: 1, value: 100 };
      const obj2 = { id: 1, value: 101 };

      const checksum1 = encryption.checksum(obj1);
      const checksum2 = encryption.checksum(obj2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('verifyChecksum', () => {
    test('should verify valid checksum', () => {
      const obj = { id: 1, data: 'test' };
      const checksum = encryption.checksum(obj);

      expect(encryption.verifyChecksum(obj, checksum)).toBe(true);
    });

    test('should reject invalid checksum', () => {
      const obj = { id: 1, data: 'test' };
      const wrongChecksum = 'a'.repeat(64);

      expect(encryption.verifyChecksum(obj, wrongChecksum)).toBe(false);
    });

    test('should detect tampering', () => {
      const obj = { id: 1, data: 'test' };
      const checksum = encryption.checksum(obj);

      // Modify object
      obj.data = 'modified';

      expect(encryption.verifyChecksum(obj, checksum)).toBe(false);
    });
  });

  describe('encryptFields/decryptFields', () => {
    test('should encrypt specific fields', () => {
      const obj = {
        id: 1,
        name: 'John',
        ssn: '123-45-6789',
        email: 'john@example.com'
      };

      const encrypted = encryption.encryptFields(obj, ['ssn', 'email']);

      expect(encrypted.id).toBe(1);
      expect(encrypted.name).toBe('John');
      expect(encrypted.ssn).not.toBe('123-45-6789');
      expect(encrypted.email).not.toBe('john@example.com');
      expect(encrypted.ssn.split(':').length).toBe(3); // iv:tag:ciphertext
    });

    test('should decrypt specific fields', () => {
      const obj = {
        id: 1,
        ssn: '123-45-6789',
        email: 'john@example.com'
      };

      const encrypted = encryption.encryptFields(obj, ['ssn', 'email']);
      const decrypted = encryption.decryptFields(encrypted, ['ssn', 'email']);

      expect(decrypted.ssn).toBe('123-45-6789');
      expect(decrypted.email).toBe('john@example.com');
    });

    test('should handle missing fields gracefully', () => {
      const obj = { id: 1, name: 'test' };

      const encrypted = encryption.encryptFields(obj, ['missingField']);

      expect(encrypted.id).toBe(1);
      expect(encrypted.name).toBe('test');
      expect(encrypted.missingField).toBeUndefined();
    });
  });

  describe('generateToken', () => {
    test('should generate random token', () => {
      const token = encryption.generateToken();

      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    test('should generate unique tokens', () => {
      const token1 = encryption.generateToken();
      const token2 = encryption.generateToken();

      expect(token1).not.toBe(token2);
    });

    test('should generate token of specified length', () => {
      const token = encryption.generateToken(16);

      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });
  });

  describe('generatePassword', () => {
    test('should generate secure password', () => {
      const password = encryption.generatePassword();

      expect(password).toHaveLength(16);
      expect(password).toMatch(/[A-Z]/); // Has uppercase
      expect(password).toMatch(/[a-z]/); // Has lowercase
      expect(password).toMatch(/[0-9]/); // Has number
      expect(password).toMatch(/[!@#$%^&*]/); // Has special char
    });

    test('should generate password of specified length', () => {
      const password = encryption.generatePassword(20);

      expect(password).toHaveLength(20);
    });

    test('should generate unique passwords', () => {
      const password1 = encryption.generatePassword();
      const password2 = encryption.generatePassword();

      expect(password1).not.toBe(password2);
    });
  });
});
