#!/usr/bin/env node
/**
 * Simple avatar uploader to Cloudinary demo cloud
 * No signup required - uses public demo cloud
 */
import fs from 'fs';
import { basename } from 'path';

const avatarPath = process.argv[2] || 'assets/lyra-avatar.png';

async function uploadToCloudinary(filePath) {
  console.log('🖼️  Uploading avatar to Cloudinary...');

  // Read file as base64
  const fileData = fs.readFileSync(filePath);
  const base64 = fileData.toString('base64');

  // Create form data
  const formData = new FormData();
  formData.append('file', `data:image/png;base64,${base64}`);
  formData.append('upload_preset', 'ml_default');
  formData.append('public_id', 'group7-lyra7-avatar');

  const response = await fetch('https://api.cloudinary.com/v1_1/demo/image/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  const result = await response.json();
  return result.secure_url;
}

try {
  const url = await uploadToCloudinary(avatarPath);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Upload successful!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('URL:', url);
  console.log('\nAdd to .env:');
  console.log(`LYRA7_AVATAR_URL=${url}`);
  console.log('');
} catch (error) {
  console.error('❌ Upload failed:', error.message);
  process.exit(1);
}
