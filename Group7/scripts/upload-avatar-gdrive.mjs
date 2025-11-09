#!/usr/bin/env node
/**
 * Upload avatar image to Google Drive and get public URL
 */
import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE_EMAIL = process.env.GDRIVE_SERVICE_EMAIL;
const PRIVATE_KEY_B64 = process.env.GDRIVE_PRIVATE_KEY_BASE64;
const FOLDER_ID = process.env.GDRIVE_OUTPUT_FOLDER_ID;

if (!SERVICE_EMAIL || !PRIVATE_KEY_B64 || !FOLDER_ID) {
  console.error('❌ Missing Google Drive credentials in .env');
  process.exit(1);
}

function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateJWT() {
  const privateKey = Buffer.from(PRIVATE_KEY_B64, 'base64').toString('utf-8');
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));
  const signInput = `${encodedHeader}.${encodedPayload}`;

  const { createSign } = await import('crypto');
  const sign = createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = base64url(sign.sign(privateKey));

  return `${signInput}.${signature}`;
}

async function getAccessToken() {
  const jwt = await generateJWT();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await response.json();
  return data.access_token;
}

async function uploadAvatar(filePath, fileName) {
  console.log('🖼️  Uploading avatar to Google Drive...');

  // Get access token
  const accessToken = await getAccessToken();
  console.log('✅ Authenticated');

  // Read file
  const fileData = readFileSync(filePath);
  console.log(`📁 File size: ${(fileData.length / 1024 / 1024).toFixed(2)} MB`);

  // Upload to Drive
  const boundary = '-------314159265358979323846';
  const metadata = {
    name: fileName,
    mimeType: 'image/png',
    parents: [FOLDER_ID]
  };

  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
    fileData,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const uploadResponse = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length.toString()
      },
      body
    }
  );

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Upload failed: ${error}`);
  }

  const uploadData = await uploadResponse.json();
  console.log(`✅ Uploaded: ${uploadData.id}`);

  // Make file publicly readable
  await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone'
    })
  });

  console.log('✅ Made public');

  // Get direct download URL
  const directUrl = `https://drive.google.com/uc?export=download&id=${uploadData.id}`;

  return {
    fileId: uploadData.id,
    webViewLink: uploadData.webViewLink,
    directUrl: directUrl
  };
}

// CLI usage
const filePath = process.argv[2] || join(process.cwd(), 'assets/lyra-avatar.png');
const fileName = process.argv[3] || 'lyra-avatar.png';

uploadAvatar(filePath, fileName)
  .then(result => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Upload complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('File ID:', result.fileId);
    console.log('Web View:', result.webViewLink);
    console.log('Direct URL:', result.directUrl);
    console.log('\nAdd to .env:');
    console.log(`LYRA7_AVATAR_URL=${result.directUrl}`);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
