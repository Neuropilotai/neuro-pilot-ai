const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Get the encryption key from environment
require('dotenv').config();
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

// EncryptionManager class from the server
class EncryptionManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.key = Buffer.from(ENCRYPTION_KEY, 'hex');
  }

  decrypt(encryptedData) {
    try {
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAAD(Buffer.from('inventory-data'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption failed', error.message);
      throw new Error('Decryption failed');
    }
  }
}

// Read the encrypted file
const encryptedFile = path.join(__dirname, 'data', 'storage_locations', 'locations.json');
console.log('📁 Reading encrypted locations file...');

try {
  const encryptedContent = JSON.parse(fs.readFileSync(encryptedFile, 'utf8'));
  console.log('✅ File loaded successfully');

  const encryptionManager = new EncryptionManager();
  console.log('🔓 Attempting decryption...');

  const decryptedData = encryptionManager.decrypt(encryptedContent.data);
  console.log('✅ Decryption successful!');

  const locationsData = JSON.parse(decryptedData);
  console.log(`📊 Found ${Object.keys(locationsData).length} locations in encrypted file`);

  // List all location names
  console.log('\n📍 Location names found:');
  Object.values(locationsData).forEach((loc, index) => {
    console.log(`${index + 1}. ${loc.name} (${loc.type})`);
  });

  // Save the decrypted data to a new file
  const outputFile = path.join(__dirname, 'data', 'storage-locations-recovered.json');
  fs.writeFileSync(outputFile, JSON.stringify(locationsData, null, 2));
  console.log(`\n💾 Recovered locations saved to: ${outputFile}`);

} catch (error) {
  console.error('❌ Error:', error.message);
  console.log('\nThe encrypted file might use a different encryption key or method.');
}