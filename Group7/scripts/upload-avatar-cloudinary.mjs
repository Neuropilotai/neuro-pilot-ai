#!/usr/bin/env node
/**
 * Upload avatar to Cloudinary (free tier: 25 credits/month, generous limits)
 * Sign up free: https://cloudinary.com/users/register/free
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'demo';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || '';

async function uploadToCloudinary(filePath, fileName) {
  console.log('🖼️  Uploading avatar to Cloudinary...');

  // Read file
  const fileData = readFileSync(filePath);
  const base64Image = `data:image/png;base64,${fileData.toString('base64')}`;

  console.log(`📁 File size: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);

  // Use unsigned upload if preset is configured, otherwise signed
  const formData = new FormData();

  if (CLOUDINARY_UPLOAD_PRESET) {
    // Unsigned upload (no API key needed, requires upload preset)
    formData.append('file', base64Image);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('public_id', fileName.replace('.png', ''));

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      throw new Error(`Cloudinary upload failed: ${await response.text()}`);
    }

    const result = await response.json();
    return { url: result.secure_url };
  } else if (CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    // Signed upload
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = fileName.replace('.png', '');

    const signature = createHash('sha1')
      .update(`public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
      .digest('hex');

    formData.append('file', base64Image);
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('timestamp', timestamp.toString());
    formData.append('signature', signature);
    formData.append('public_id', publicId);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      throw new Error(`Cloudinary upload failed: ${await response.text()}`);
    }

    const result = await response.json();
    return { url: result.secure_url };
  } else {
    throw new Error(`
Cloudinary credentials missing. Please either:

Option 1 - Unsigned Upload (easier):
  1. Go to https://cloudinary.com/users/register/free
  2. Settings → Upload → Add upload preset
  3. Set as "unsigned"
  4. Add to .env:
     CLOUDINARY_CLOUD_NAME=your_cloud_name
     CLOUDINARY_UPLOAD_PRESET=your_preset_name

Option 2 - Signed Upload:
  1. Go to https://cloudinary.com/users/register/free
  2. Dashboard → Copy credentials
  3. Add to .env:
     CLOUDINARY_CLOUD_NAME=your_cloud_name
     CLOUDINARY_API_KEY=your_api_key
     CLOUDINARY_API_SECRET=your_api_secret
    `);
  }
}

// CLI usage
const filePath = process.argv[2] || join(process.cwd(), 'assets/lyra-avatar.png');
const fileName = 'lyra7-avatar.png';

uploadToCloudinary(filePath, fileName)
  .then(result => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Upload complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('URL:', result.url);
    console.log('\nAdd to .env:');
    console.log(`LYRA7_AVATAR_URL=${result.url}`);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
