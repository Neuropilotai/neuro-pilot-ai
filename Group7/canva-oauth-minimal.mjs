#!/usr/bin/env node
/**
 * Canva OAuth Helper - Minimal Scopes Version
 * Try this if the full scope version fails
 */

import 'dotenv/config';
import http from 'http';
import { URL } from 'url';

const CANVA_APP_ID = process.env.CANVA_APP_ID;
const CANVA_APP_SECRET = process.env.CANVA_APP_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:3001/oauth/callback';

if (!CANVA_APP_ID || !CANVA_APP_SECRET) {
  console.error('\n❌ Error: Missing Canva credentials in .env');
  console.error('Required: CANVA_APP_ID and CANVA_APP_SECRET\n');
  process.exit(1);
}

// Simple HTTP server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:3001`);

  // Step 1: Authorization endpoint with MINIMAL scopes
  if (url.pathname === '/auth') {
    // Try with just asset:read first
    const authUrl =
      `https://www.canva.com/api/oauth/authorize?` +
      `client_id=${CANVA_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=asset:read`;

    console.log('\n🔐 Canva OAuth Authorization (Minimal Scopes)');
    console.log('================================');
    console.log('Using minimal scope: asset:read');
    console.log('URL:', authUrl);
    console.log('\nRedirecting to Canva...\n');

    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  // Step 2: OAuth callback
  if (url.pathname === '/oauth/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error) {
      console.error('\n❌ OAuth Error:', error);
      console.error('Description:', errorDescription);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ OAuth Error</h1><p>${error}: ${errorDescription}</p>`);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Error: No authorization code received</h1>');
      return;
    }

    try {
      console.log('\n✓ Authorization code received');
      console.log('Exchanging for access token...\n');

      // Exchange code for token
      const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          client_id: CANVA_APP_ID,
          client_secret: CANVA_APP_SECRET
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      const { access_token, refresh_token, expires_in } = tokenData;

      console.log('\n✅ SUCCESS! Access token received\n');
      console.log('================================');
      console.log('Access Token:', access_token);
      if (refresh_token) {
        console.log('Refresh Token:', refresh_token);
      }
      console.log('Expires in:', expires_in, 'seconds');
      console.log('================================\n');
      console.log('Add to your .env file:');
      console.log(`CANVA_ACCESS_TOKEN=${access_token}`);
      if (refresh_token) {
        console.log(`CANVA_REFRESH_TOKEN=${refresh_token}`);
      }
      console.log('\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
        <head><title>Canva OAuth Success</title></head>
        <body style="font-family: system-ui; padding: 40px; background: #0B1220; color: #F8FAFC;">
          <h1 style="color: #0EA5E9;">✅ Canva OAuth Successful!</h1>
          <p>Access token received. Add to .env:</p>
          <pre style="background: #1a2332; padding: 20px; border-radius: 8px; overflow-x: auto; font-size: 12px;">CANVA_ACCESS_TOKEN=${access_token}${refresh_token ? '\nCANVA_REFRESH_TOKEN=' + refresh_token : ''}</pre>
          <p style="color: #94A3B8;">Expires in: ${expires_in} seconds</p>
          <p style="margin-top: 20px;">You can close this window now.</p>
        </body>
        </html>
      `);

      setTimeout(() => {
        console.log('Shutting down OAuth server...');
        server.close();
        process.exit(0);
      }, 10000);

    } catch (error) {
      console.error('\n❌ Error exchanging code for token:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
        <body style="font-family: system-ui; padding: 40px;">
          <h1>❌ OAuth Error</h1>
          <p>${error.message}</p>
        </body>
        </html>
      `);
    }
    return;
  }

  // Default: Instructions
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
    <body style="font-family: system-ui; padding: 40px; background: #0B1220; color: #F8FAFC;">
      <h1 style="color: #0EA5E9;">🎨 Canva OAuth (Minimal Scopes)</h1>
      <p>Testing with minimal scope: asset:read</p>
      <a href="/auth" style="display: inline-block; background: #0EA5E9; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px;">
        Start Authorization →
      </a>
    </body>
    </html>
  `);
});

const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log('\n🎨 Canva OAuth Helper (Minimal Scopes)');
  console.log('================================');
  console.log(`Server: http://127.0.0.1:${PORT}`);
  console.log('\nTrying with minimal scope: asset:read');
  console.log('Open: http://127.0.0.1:3001/auth\n');
});
