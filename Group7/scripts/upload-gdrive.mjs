#!/usr/bin/env node
// GROUP7 - Google Drive Upload Script
import 'dotenv/config';
import { createHash } from 'crypto';
import { httpWithRetry, downloadFile, maskSecret } from './poll-utils.mjs';
import { mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

const SERVICE_EMAIL = process.env.GDRIVE_SERVICE_EMAIL;
const PRIVATE_KEY_B64 = process.env.GDRIVE_PRIVATE_KEY_BASE64;
const FOLDER_ID = process.env.GDRIVE_OUTPUT_FOLDER_ID;
const TEMP_DIR = process.env.TEMP_DIR || '.tmp';

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
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
  
  const crypto = await import('crypto');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = base64url(sign.sign(privateKey));
  
  return `${signInput}.${signature}`;
}

async function getAccessToken() {
  const jwt = await generateJWT();
  const response = await httpWithRetry('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await response.json();
  return data.access_token;
}

async function uploadToDrive(args) {
  const { fileUrl, outName, agent, slug } = args;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('☁️  GOOGLE DRIVE UPLOAD');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`File: ${outName}`);
  console.log();

  // Download file to temp
  mkdirSync(TEMP_DIR, { recursive: true });
  const tempPath = join(TEMP_DIR, outName);
  console.log(`📥 Downloading from ${fileUrl.substring(0, 60)}...`);
  await downloadFile(fileUrl, tempPath);

  // Get access token
  console.log('🔑 Getting access token...');
  const accessToken = await getAccessToken();
  console.log(`✅ Token: ${maskSecret(accessToken, 6)}`);

  // Upload to Drive
  const fileData = readFileSync(tempPath);
  const boundary = '-------314159265358979323846';
  const metadata = { name: outName, mimeType: 'video/mp4', parents: [FOLDER_ID] };
  
  const body = Buffer.concat([
    Buffer.from(`--${boundary}
Content-Type: application/json; charset=UTF-8

${JSON.stringify(metadata)}
--${boundary}
Content-Type: video/mp4

`),
    fileData,
    Buffer.from(`
--${boundary}--`)
  ]);

  const uploadResponse = await httpWithRetry(
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

  const uploadData = await uploadResponse.json();
  
  // Cleanup
  rmSync(tempPath);
  
  console.log(`✅ Uploaded: ${uploadData.webViewLink}`);
  
  return {
    status: 'success',
    driveFileId: uploadData.id,
    webViewLink: uploadData.webViewLink
  };
}

/**
 * Upload a local file to Google Drive (for programmatic use)
 * @param {string} localFilePath - Path to local file
 * @param {string} fileName - Name to use in Drive
 * @param {string} folderId - Drive folder ID (optional, uses GDRIVE_OUTPUT_FOLDER_ID if not provided)
 * @returns {Promise<{id: string, name: string, webViewLink: string}>}
 */
export async function uploadToGDrive(localFilePath, fileName, folderId) {
  const targetFolderId = folderId || FOLDER_ID;

  if (!SERVICE_EMAIL || !PRIVATE_KEY_B64) {
    throw new Error('Missing Google Drive credentials: GDRIVE_SERVICE_EMAIL and GDRIVE_PRIVATE_KEY_BASE64 required');
  }

  console.log(`☁️  Uploading ${fileName} to Google Drive...`);

  // Get access token
  const accessToken = await getAccessToken();

  // Upload to Drive
  const fileData = readFileSync(localFilePath);
  const boundary = '-------314159265358979323846';
  const metadata = { name: fileName, mimeType: 'video/mp4', parents: [targetFolderId] };

  const body = Buffer.concat([
    Buffer.from(`--${boundary}
Content-Type: application/json; charset=UTF-8

${JSON.stringify(metadata)}
--${boundary}
Content-Type: video/mp4

`),
    fileData,
    Buffer.from(`
--${boundary}--`)
  ]);

  const uploadResponse = await httpWithRetry(
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

  const uploadData = await uploadResponse.json();

  console.log(`✅ Uploaded to Drive: ${uploadData.name} (ID: ${uploadData.id})`);

  return {
    id: uploadData.id,
    name: uploadData.name,
    webViewLink: uploadData.webViewLink || `https://drive.google.com/file/d/${uploadData.id}/view`
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2).reduce((acc, arg, i, arr) => {
    if (arg.startsWith('--')) acc[arg.slice(2)] = arr[i + 1];
    return acc;
  }, {});

  if (!args.fileUrl || !args.outName || !args.agent || !args.slug) {
    console.error('Usage: node upload-gdrive.mjs --fileUrl URL --outName FILE --agent NAME --slug ID');
    process.exit(1);
  }

  uploadToDrive(args)
    .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(0); })
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}
