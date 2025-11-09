#!/usr/bin/env node
/**
 * Canva OAuth Helper (ESM version)
 * Run this to get your CANVA_ACCESS_TOKEN
 *
 * Usage:
 *   node canva-oauth.mjs
 *   Then open http://localhost:3001/auth in your browser
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

  // Step 1: Authorization endpoint
  if (url.pathname === '/auth') {
    const authUrl =
      `https://www.canva.com/api/oauth/authorize?` +
      `client_id=${CANVA_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('design:content:read design:content:write asset:read asset:write')}`;

    console.log('\n🔐 Canva OAuth Authorization');
    console.log('================================');
    console.log('Redirecting to Canva authorization...\n');

    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  // Step 2: OAuth callback
  if (url.pathname === '/oauth/callback') {
    const code = url.searchParams.get('code');

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
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      const { access_token, refresh_token, expires_in } = tokenData;

      console.log('\n✅ SUCCESS! Access token received\n');
      console.log('================================');
      console.log('Access Token:', access_token);
      if (refresh_token) {
        console.log('Refresh Token:', refresh_token);
      }
      console.log('Expires in:', expires_in, 'seconds (', Math.floor(expires_in / 3600), 'hours)');
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
        <body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #0B1220; color: #F8FAFC; max-width: 800px; margin: 0 auto;">
          <h1 style="color: #0EA5E9;">✅ Canva OAuth Successful!</h1>
          <p>Access token received. Add this to your <code>.env</code> file:</p>
          <pre style="background: #1a2332; padding: 20px; border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 1.6;">CANVA_ACCESS_TOKEN=${access_token}${refresh_token ? '\nCANVA_REFRESH_TOKEN=' + refresh_token : ''}</pre>
          <p style="color: #94A3B8;">Expires in: ${expires_in} seconds (${Math.floor(expires_in / 3600)} hours)</p>
          <p style="margin-top: 40px; padding: 15px; background: #1E293B; border-radius: 8px; border-left: 3px solid #0EA5E9;">
            <strong>Next steps:</strong><br>
            1. Copy the token above to your .env file<br>
            2. Run <code>npm run selftest</code> to validate<br>
            3. Close this window
          </p>
        </body>
        </html>
      `);

      // Auto-shutdown after 10 seconds
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
        <body style="font-family: system-ui; padding: 40px; background: #FEF2F2; color: #991B1B;">
          <h1>❌ OAuth Error</h1>
          <p>${error.message}</p>
          <p>Check the terminal console for details.</p>
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
    <head><title>Canva OAuth Helper</title></head>
    <body style="font-family: system-ui, -apple-system, sans-serif; padding: 40px; background: #0B1220; color: #F8FAFC; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #0EA5E9;">🎨 Canva OAuth Helper</h1>
      <p>This tool helps you get your Canva access token for Group7.</p>

      <div style="background: #1a2332; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin-top: 0; color: #38BDF8;">How to use:</h2>
        <ol style="line-height: 1.8;">
          <li>Click the button below to start OAuth flow</li>
          <li>Sign in to your Canva account</li>
          <li>Approve the access request</li>
          <li>Copy the token to your .env file</li>
        </ol>
      </div>

      <a href="/auth" style="display: inline-block; background: #0EA5E9; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">
        Start Canva Authorization →
      </a>

      <div style="margin-top: 40px; padding: 15px; background: #1E293B; border-radius: 8px; color: #94A3B8; font-size: 14px;">
        <strong>Required in .env:</strong><br>
        CANVA_APP_ID=${CANVA_APP_ID ? '✅ Set' : '❌ Missing'}<br>
        CANVA_APP_SECRET=${CANVA_APP_SECRET ? '✅ Set' : '❌ Missing'}
      </div>
    </body>
    </html>
  `);
});

const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log('\n🎨 Canva OAuth Helper Running');
  console.log('================================');
  console.log(`Server: http://127.0.0.1:${PORT}`);
  console.log('\nTo authorize Canva:');
  console.log('1. Open: http://127.0.0.1:3001/auth');
  console.log('   OR click the link above');
  console.log('2. Sign in to Canva');
  console.log('3. Approve access');
  console.log('4. Copy token to .env\n');
  console.log('Waiting for authorization...\n');
});
