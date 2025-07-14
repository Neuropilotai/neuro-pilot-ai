const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = 'token.json';

/**
 * Upload CSV file to Google Drive
 */
async function uploadToGoogleDrive() {
  // Load client secrets from a local file.
  try {
    const credentials = JSON.parse(fs.readFileSync('credentials.json'));
    authorize(credentials, uploadFile);
  } catch (err) {
    console.error('Error loading client secret file:', err);
    console.log('\nTo use Google Drive upload, you need to:');
    console.log('1. Go to https://console.cloud.google.com/');
    console.log('2. Create a new project or select existing');
    console.log('3. Enable Google Drive API');
    console.log('4. Create credentials (OAuth 2.0 Client ID)');
    console.log('5. Download the credentials as credentials.json');
    console.log('6. Place credentials.json in this directory');
  }
}

/**
 * Create an OAuth2 client with the given credentials
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Upload the CSV file to Google Drive
 */
async function uploadFile(auth) {
  const drive = google.drive({version: 'v3', auth});
  const fileMetadata = {
    'name': 'GFS_Order_July4_2025.csv',
    'mimeType': 'text/csv'
  };
  const media = {
    mimeType: 'text/csv',
    body: fs.createReadStream('GFS_Order_July4_2025.csv')
  };
  
  try {
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    });
    console.log('\n✅ File uploaded successfully!');
    console.log('File ID:', file.data.id);
    console.log('View/Download link:', file.data.webViewLink);
  } catch (err) {
    console.error('Error uploading file:', err);
  }
}

// Alternative: Simple manual upload instructions
console.log('\n📁 Your CSV file is ready at:');
console.log(path.resolve('GFS_Order_July4_2025.csv'));
console.log('\n🌐 To upload to Google Drive manually:');
console.log('1. Go to https://drive.google.com');
console.log('2. Click "New" → "File upload"');
console.log('3. Select GFS_Order_July4_2025.csv');
console.log('\n💻 Or to use automated upload:');
console.log('Run: npm install googleapis');
console.log('Then follow the Google Drive API setup instructions above');

// Run the upload if credentials exist
uploadToGoogleDrive();