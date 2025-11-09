#!/usr/bin/env node
/**
 * Canva Direct Token Request (Client Credentials Flow)
 * For apps that support server-to-server authentication
 */

import 'dotenv/config';

const CANVA_CLIENT_ID = process.env.CANVA_APP_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_APP_SECRET;

if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
  console.error('\n❌ Missing credentials in .env');
  console.error('Required: CANVA_APP_ID and CANVA_APP_SECRET\n');
  process.exit(1);
}

console.log('\n🎨 Attempting Canva Client Credentials Flow');
console.log('================================\n');

async function getClientCredentialsToken() {
  try {
    // Try Client Credentials flow (for server-to-server apps)
    const response = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: CANVA_CLIENT_ID,
        client_secret: CANVA_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Token request failed:', response.status, response.statusText);
      console.error('Response:', errorText);
      console.log('\n⚠️  This app may not support client_credentials flow.');
      console.log('You need to use the OAuth authorization flow instead.\n');
      console.log('Next steps:');
      console.log('1. Go to: https://www.canva.com/developers/apps');
      console.log('2. Add redirect URI: http://localhost:3001/oauth/callback');
      console.log('3. Run: node canva-oauth.mjs\n');
      process.exit(1);
    }

    const data = await response.json();
    const { access_token, expires_in, token_type } = data;

    console.log('✅ SUCCESS! Access token received\n');
    console.log('================================');
    console.log('Access Token:', access_token);
    console.log('Token Type:', token_type);
    console.log('Expires in:', expires_in, 'seconds');
    console.log('================================\n');
    console.log('Add to your .env file:');
    console.log(`CANVA_ACCESS_TOKEN=${access_token}\n`);

    return access_token;
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nThis app may require OAuth authorization flow instead.\n');
    process.exit(1);
  }
}

getClientCredentialsToken();
