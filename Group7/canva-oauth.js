/**
 * Canva OAuth Helper
 * Run this to get your access token
 */

const express = require('express');
const axios = require('axios');

const app = express();

// Load from .env
require('dotenv').config();

const CANVA_APP_ID = process.env.CANVA_APP_ID || 'AAG3cyS3k2Q';
const CANVA_APP_SECRET = process.env.CANVA_APP_SECRET;
const REDIRECT_URI = 'http://localhost:3001/oauth/callback';

// Step 1: Authorization URL
app.get('/auth', (req, res) => {
    const authUrl = `https://www.canva.com/api/oauth/authorize?` +
        `client_id=${CANVA_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=design:content:read design:content:write asset:read asset:write`;

    console.log('\n🔐 Canva OAuth Authorization');
    console.log('================================');
    console.log('Opening browser to authorize...\n');
    console.log('If browser doesn\'t open, visit:');
    console.log(authUrl);
    console.log('\n');

    res.redirect(authUrl);
});

// Step 2: Handle callback and exchange code for token
app.get('/oauth/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.send('❌ Error: No authorization code received');
    }

    try {
        console.log('\n✓ Authorization code received');
        console.log('Exchanging for access token...\n');

        // Exchange code for token
        const response = await axios.post('https://api.canva.com/rest/v1/oauth/token', {
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: REDIRECT_URI,
            client_id: CANVA_APP_ID,
            client_secret: CANVA_APP_SECRET
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;

        console.log('\n✅ SUCCESS! Access token received\n');
        console.log('================================');
        console.log('Access Token:', access_token);
        console.log('Refresh Token:', refresh_token);
        console.log('Expires in:', expires_in, 'seconds');
        console.log('================================\n');
        console.log('Add to your .env file:');
        console.log(`CANVA_ACCESS_TOKEN=${access_token}`);
        console.log(`CANVA_REFRESH_TOKEN=${refresh_token}`);
        console.log('\n');

        res.send(`
            <html>
            <head><title>Canva OAuth Success</title></head>
            <body style="font-family: monospace; padding: 40px; background: #0B1220; color: #F8FAFC;">
                <h1 style="color: #0EA5E9;">✅ Canva OAuth Successful!</h1>
                <p>Access token received. Add these to your .env file:</p>
                <pre style="background: #1a2332; padding: 20px; border-radius: 8px; overflow-x: auto;">
CANVA_ACCESS_TOKEN=${access_token}
CANVA_REFRESH_TOKEN=${refresh_token}
                </pre>
                <p>Expires in: ${expires_in} seconds (${Math.floor(expires_in / 3600)} hours)</p>
                <p style="margin-top: 40px;">You can close this window now.</p>
            </body>
            </html>
        `);

        // Auto-shutdown after 10 seconds
        setTimeout(() => {
            console.log('Shutting down OAuth server...');
            process.exit(0);
        }, 10000);

    } catch (error) {
        console.error('\n❌ Error exchanging code for token:', error.response?.data || error.message);
        res.send(`
            <html>
            <body style="font-family: monospace; padding: 40px;">
                <h1>❌ OAuth Error</h1>
                <p>${error.response?.data?.error_description || error.message}</p>
                <p>Check console for details.</p>
            </body>
            </html>
        `);
    }
});

// Start server
const PORT = 3001;
app.listen(PORT, () => {
    console.log('\n🎨 Canva OAuth Helper Running');
    console.log('================================');
    console.log(`Server: http://localhost:${PORT}`);
    console.log('\nTo authorize Canva:');
    console.log('1. Open: http://localhost:3001/auth');
    console.log('2. Sign in to Canva');
    console.log('3. Approve access');
    console.log('4. Copy token to .env\n');
});
