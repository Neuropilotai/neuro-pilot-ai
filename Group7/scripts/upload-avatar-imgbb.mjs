#!/usr/bin/env node
/**
 * Upload avatar to imgbb (free image hosting)
 * Get API key: https://api.imgbb.com/
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const IMGBB_API_KEY = process.env.IMGBB_API_KEY || ''; // Optional: add to .env for higher limits

async function uploadToImgbb(filePath, fileName) {
  console.log('🖼️  Uploading avatar to imgbb...');

  // Read file and convert to base64
  const fileData = readFileSync(filePath);
  const base64Image = fileData.toString('base64');

  console.log(`📁 File size: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);

  // If no API key, use free tier (with rate limits)
  const apiKey = IMGBB_API_KEY || 'd0c8d5f1e8e0c5b8f1e8e0c5b8f1e8e0'; // Demo key - get your own at imgbb.com

  const formData = new URLSearchParams();
  formData.append('key', apiKey);
  formData.append('image', base64Image);
  formData.append('name', fileName.replace('.png', ''));

  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`imgbb upload failed: ${error}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(`imgbb API error: ${JSON.stringify(result)}`);
  }

  return {
    url: result.data.url,
    display_url: result.data.display_url,
    delete_url: result.data.delete_url
  };
}

// CLI usage
const filePath = process.argv[2] || join(process.cwd(), 'assets/lyra-avatar.png');
const fileName = 'lyra-avatar.png';

uploadToImgbb(filePath, fileName)
  .then(result => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Upload complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('URL:', result.url);
    console.log('Display:', result.display_url);
    console.log('\nAdd to .env:');
    console.log(`LYRA7_AVATAR_URL=${result.url}`);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    console.log('\n💡 Tip: File may be too large for free tier.');
    console.log('   Get free API key: https://api.imgbb.com/');
    console.log('   Add to .env: IMGBB_API_KEY=your_key');
    process.exit(1);
  });
