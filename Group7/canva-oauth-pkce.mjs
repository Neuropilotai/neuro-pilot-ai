#!/usr/bin/env node
/**
 * Canva OAuth Helper with PKCE Support
 * Uses Cloudflare Tunnel for public access
 */

import 'dotenv/config';
import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';

const CANVA_APP_ID = process.env.CANVA_APP_ID;
const CANVA_APP_SECRET = process.env.CANVA_APP_SECRET;
const TUNNEL_URL = 'https://request-cool-villages-models.trycloudflare.com';
const REDIRECT_URI = `${TUNNEL_URL}/oauth/callback`;

// PKCE: Generate code verifier and challenge
function generatePKCE() {
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}

// Store PKCE verifier and state temporarily
let pkceVerifier = null;
let oauthState = null;

if (!CANVA_APP_ID || !CANVA_APP_SECRET) {
  console.error('\n❌ Error: Missing Canva credentials in .env');
  process.exit(1);
}

console.log('\n🎨 Canva OAuth Helper (PKCE + Cloudflare Tunnel)');
console.log('================================');
console.log('Public URL:', TUNNEL_URL);
console.log('Redirect URI:', REDIRECT_URI);
console.log('Using PKCE for enhanced security');
console.log('================================\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:3001`);

  // Authorization endpoint
  if (url.pathname === '/auth') {
    const { codeVerifier, codeChallenge } = generatePKCE();
    const state = crypto.randomBytes(32).toString('base64url');

    pkceVerifier = codeVerifier; // Store for token exchange
    oauthState = state; // Store for validation

    const authUrl =
      `https://www.canva.com/api/oauth/authorize?` +
      `code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256` +
      `&scope=${encodeURIComponent('asset:read asset:write design:meta:read design:content:write folder:read folder:write profile:read')}` +
      `&response_type=code` +
      `&client_id=${CANVA_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}`;

    console.log('\n🔐 Starting OAuth with PKCE');
    console.log('Code Challenge:', codeChallenge);
    console.log('State:', state);
    console.log('\nRedirecting to Canva...\n');

    res.writeHead(302, { Location: authUrl });
    res.end();
    return;
  }

  // OAuth callback
  if (url.pathname === '/oauth/callback') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('\n❌ OAuth Error:', error);
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>❌ ${error}</h1><p>${url.searchParams.get('error_description')}</p>`);
      return;
    }

    // Validate state parameter
    if (state !== oauthState) {
      console.error('\n❌ State mismatch! Possible CSRF attack.');
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Invalid state parameter</h1>');
      return;
    }

    if (!code || !pkceVerifier) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end('<h1>❌ Missing code or verifier</h1>');
      return;
    }

    try {
      console.log('\n✓ Authorization code received');
      console.log('Exchanging for access token with PKCE...\n');

      const tokenResponse = await fetch('https://api.canva.com/rest/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI,
          client_id: CANVA_APP_ID,
          client_secret: CANVA_APP_SECRET,
          code_verifier: pkceVerifier
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error(`Token exchange failed (${tokenResponse.status}): ${errorText}`);
      }

      const { access_token, refresh_token, expires_in } = await tokenResponse.json();

      console.log('\n✅ SUCCESS! Access token received\n');
      console.log('================================');
      console.log('Access Token:', access_token);
      if (refresh_token) console.log('Refresh Token:', refresh_token);
      console.log('Expires in:', expires_in, 'seconds');
      console.log('================================\n');
      console.log('Add to .env:');
      console.log(`CANVA_ACCESS_TOKEN=${access_token}`);
      if (refresh_token) console.log(`CANVA_REFRESH_TOKEN=${refresh_token}`);
      console.log('\n');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
        <head><title>Canva OAuth Success</title></head>
        <body style="font-family: system-ui; padding: 40px; background: #0B1220; color: #F8FAFC; max-width: 800px; margin: 0 auto;">
          <h1 style="color: #0EA5E9;">✅ Canva OAuth Successful!</h1>
          <p>Access token received. Add to .env:</p>
          <pre style="background: #1a2332; padding: 20px; border-radius: 8px; overflow-x: auto; font-size: 12px;">CANVA_ACCESS_TOKEN=${access_token}${refresh_token ? '\nCANVA_REFRESH_TOKEN=' + refresh_token : ''}</pre>
          <p style="color: #94A3B8;">Expires in: ${expires_in} seconds (${Math.floor(expires_in / 3600)} hours)</p>
          <p style="margin-top: 20px; padding: 15px; background: #1E293B; border-radius: 8px;">
            <strong>Next:</strong><br>
            1. Copy token to .env<br>
            2. Run: npm run selftest<br>
            3. Stop tunnel: Ctrl+C in terminal
          </p>
        </body>
        </html>
      `);

      setTimeout(() => {
        console.log('\n✅ OAuth complete! Shutting down...\n');
        server.close();
        process.exit(0);
      }, 10000);

    } catch (error) {
      console.error('\n❌ Token exchange error:', error.message);
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end(`<html><body><h1>❌ Error</h1><p>${error.message}</p></body></html>`);
    }
    return;
  }

  // Default
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
    <body style="font-family: system-ui; padding: 40px; background: #0B1220; color: #F8FAFC; max-width: 800px; margin: 0 auto;">
      <h1 style="color: #0EA5E9;">🎨 Canva OAuth (PKCE)</h1>
      <p>Public URL: <strong>${TUNNEL_URL}</strong></p>
      <div style="background: #1a2332; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p>Redirect URI configured in Canva:</p>
        <code style="background: #0B1220; padding: 10px; display: block; border-radius: 4px;">${REDIRECT_URI}</code>
      </div>
      <a href="/auth" style="display: inline-block; background: #0EA5E9; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600;">
        Start Authorization →
      </a>
    </body>
    </html>
  `);
});

const PORT = 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log('Local server: http://127.0.0.1:3001');
  console.log('Public URL: ' + TUNNEL_URL);
  console.log('\nVisit: ' + TUNNEL_URL + '/auth');
  console.log('Waiting for authorization...\n');
});
