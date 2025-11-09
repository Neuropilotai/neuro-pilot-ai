#!/usr/bin/env node
/**
 * Canva OAuth Helper - Cloudflare Tunnel Version
 * Uses public URL for Canva redirect
 */

import 'dotenv/config';
import http from 'http';
import { URL } from 'url';

const CANVA_APP_ID = process.env.CANVA_APP_ID;
const CANVA_APP_SECRET = process.env.CANVA_APP_SECRET;

// IMPORTANT: Update this with your actual Cloudflare tunnel URL
const TUNNEL_URL = 'https://request-cool-villages-models.trycloudflare.com';
const REDIRECT_URI = `${TUNNEL_URL}/oauth/callback`;

if (!CANVA_APP_ID || !CANVA_APP_SECRET) {
  console.error('\n❌ Error: Missing Canva credentials in .env');
  console.error('Required: CANVA_APP_ID and CANVA_APP_SECRET\n');
  process.exit(1);
}

console.log('\n🎨 Canva OAuth Helper (Cloudflare Tunnel)');
console.log('================================');
console.log('Public URL:', TUNNEL_URL);
console.log('Redirect URI:', REDIRECT_URI);
console.log('\nMake sure this redirect URI is added in Canva!');
console.log('================================\n');

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
      `&scope=${encodeURIComponent('asset:read asset:write design:content:read design:content:write')}`;

    console.log('\n🔐 Canva OAuth Authorization');
    console.log('================================');
    console.log('Authorization URL:', authUrl);
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
      res.end(`<html><body><h1>❌ OAuth Error</h1><p>${error}: ${errorDescription}</p></body></html>`);
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>❌ Error: No authorization code received</h1></body></html>');
      return;
    }

    try {
      console.log('\n✓ Authorization code received:', code.substring(0, 20) + '...');
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
            3. Close this window and stop the tunnel (Ctrl+C in terminal)
          </p>
        </body>
        </html>
      `);

      // Auto-shutdown after 10 seconds
      setTimeout(() => {
        console.log('\n✅ OAuth complete! Shutting down server...');
        console.log('Remember to stop the Cloudflare tunnel (Ctrl+C)\n');
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
      <h1 style="color: #0EA5E9;">🎨 Canva OAuth Helper (Cloudflare Tunnel)</h1>
      <p>This server is accessible via: <strong>${TUNNEL_URL}</strong></p>

      <div style="background: #1a2332; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h2 style="margin-top: 0; color: #38BDF8;">Before you start:</h2>
        <p>Make sure you've added this redirect URI in Canva:</p>
        <code style="background: #0B1220; padding: 10px; display: block; border-radius: 4px;">${REDIRECT_URI}</code>
      </div>

      <a href="/auth" style="display: inline-block; background: #0EA5E9; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0;">
        Start Canva Authorization →
      </a>

      <div style="margin-top: 40px; padding: 15px; background: #1E293B; border-radius: 8px; color: #94A3B8; font-size: 14px;">
        <strong>Credentials loaded:</strong><br>
        Client ID: ${CANVA_APP_ID}<br>
        Client Secret: ${CANVA_APP_SECRET ? '✅ Set' : '❌ Missing'}<br>
        Tunnel URL: ${TUNNEL_URL}
      </div>
    </body>
    </html>
  `);
});

const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log('Server running on: http://127.0.0.1:${PORT}');
  console.log('Public URL: ${TUNNEL_URL}');
  console.log('\nTo authorize Canva:');
  console.log('1. Visit: ${TUNNEL_URL}/auth');
  console.log('2. Sign in to Canva');
  console.log('3. Approve access');
  console.log('4. Copy token to .env\n');
  console.log('Waiting for authorization...\n');
});
