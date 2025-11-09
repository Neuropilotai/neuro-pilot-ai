#!/usr/bin/env node
import 'dotenv/config';

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  GROUP7 VIDEO FACTORY - ENVIRONMENT CHECK (v2.0)');
console.log('═══════════════════════════════════════════════════════════════\n');

const required = {
  'OPENAI_API_KEY': process.env.OPENAI_API_KEY,
  'DID_API_KEY': process.env.DID_API_KEY,
  'SHOTSTACK_API_KEY': process.env.SHOTSTACK_API_KEY,
  'ELEVENLABS_API_KEY': process.env.ELEVENLABS_API_KEY,
  'GDRIVE_OUTPUT_FOLDER_ID': process.env.GDRIVE_OUTPUT_FOLDER_ID,
  'GDRIVE_SERVICE_EMAIL': process.env.GDRIVE_SERVICE_EMAIL,
  'GDRIVE_PRIVATE_KEY_BASE64': process.env.GDRIVE_PRIVATE_KEY_BASE64,
  'LYRA7_AVATAR_URL': process.env.LYRA7_AVATAR_URL
};

const optional = {
  'SHOTSTACK_REGION': process.env.SHOTSTACK_REGION || 'us-east-1',
  'NOTION_TOKEN': process.env.NOTION_TOKEN,
  'NOTION_VIDEO_DB_ID': process.env.NOTION_VIDEO_DB_ID,
  'METRICOOL_API_KEY': process.env.METRICOOL_API_KEY,
  'METRICOOL_PROFILE_ID': process.env.METRICOOL_PROFILE_ID
};

console.log('Required Variables:');
console.log('───────────────────────────────────────────────────────────────');

let missing = false;
for (const [key, value] of Object.entries(required)) {
  const status = value ? '✅' : '❌';
  const display = value ? `***${value.slice(-4)}` : 'NOT SET';
  console.log(`${status} ${key.padEnd(30)} ${display}`);
  if (!value) missing = true;
}

console.log('\nOptional Variables:');
console.log('───────────────────────────────────────────────────────────────');

for (const [key, value] of Object.entries(optional)) {
  const status = value ? '✅' : '○';
  const display = value ? (value.startsWith('http') ? value.substring(0, 40) + '...' : `***${value.slice(-4)}`) : 'not set';
  console.log(`${status} ${key.padEnd(30)} ${display}`);
}

console.log('\n═══════════════════════════════════════════════════════════════');

if (missing) {
  console.log('❌ Some required environment variables are missing.\n');
  console.log('Please add the missing keys to .env:');
  console.log('  nano .env\n');
  console.log('Refer to .env.production for the complete template.\n');
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set!\n');
  process.exit(0);
}
