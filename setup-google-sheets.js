require('dotenv').config();
const { google } = require('googleapis');
const fs = require('fs').promises;

class GoogleSheetsSetup {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
        this.setupAuth();
    }
    
    async setupAuth() {
        try {
            this.auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            console.log('✅ Google Sheets authentication successful');
        } catch (error) {
            console.error('❌ Google Sheets authentication failed:', error.message);
            console.log('\n📝 To set up Google Sheets integration:');
            console.log('1. Go to Google Cloud Console');
            console.log('2. Create a service account');
            console.log('3. Download the JSON key file');
            console.log('4. Set GOOGLE_SERVICE_ACCOUNT_KEY in .env');
            console.log('5. Create a Google Sheet and set GOOGLE_SHEETS_ID in .env');
        }
    }
    
    async createResumeValidationSheet() {
        try {
            if (!this.spreadsheetId) {
                // Create a new spreadsheet
                const response = await this.sheets.spreadsheets.create({
                    resource: {
                        properties: {
                            title: 'Resume Validation Database'
                        },
                        sheets: [{
                            properties: {
                                title: 'Resume_Validation'
                            }
                        }]
                    }
                });
                
                this.spreadsheetId = response.data.spreadsheetId;
                console.log(`📊 Created new spreadsheet: ${this.spreadsheetId}`);
                console.log(`🔗 URL: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
                
                // Update .env file
                await this.updateEnvFile();
            }
            
            // Set up headers
            const headers = [
                'Resume ID',
                'Upload Date',
                'Original Filename',
                'Full Name',
                'Email',
                'Phone',
                'Location',
                'LinkedIn',
                'GitHub',
                'Status',
                'Completion Score',
                'Missing Required',
                'Missing Recommended',
                'Has Work Experience',
                'Has Education',
                'Has Skills',
                'Has Summary'
            ];
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Resume_Validation!A1:Q1',
                valueInputOption: 'RAW',
                resource: {
                    values: [headers]
                }
            });
            
            // Format headers
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId: 0,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: 17
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 0.2, green: 0.6, blue: 1.0 },
                                    textFormat: { 
                                        foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
                                        bold: true 
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat)'
                        }
                    }]
                }
            });
            
            console.log('✅ Resume validation sheet setup complete');
            console.log(`🔗 Access your sheet: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);
            
        } catch (error) {
            console.error('❌ Failed to setup sheet:', error.message);
        }
    }
    
    async updateEnvFile() {
        try {
            let envContent = '';
            try {
                envContent = await fs.readFile('.env', 'utf8');
            } catch (error) {
                // .env doesn't exist, create new
            }
            
            // Add or update the spreadsheet ID
            if (envContent.includes('GOOGLE_SHEETS_ID=')) {
                envContent = envContent.replace(
                    /GOOGLE_SHEETS_ID=.*/,
                    `GOOGLE_SHEETS_ID=${this.spreadsheetId}`
                );
            } else {
                envContent += `\nGOOGLE_SHEETS_ID=${this.spreadsheetId}\n`;
            }
            
            await fs.writeFile('.env', envContent);
            console.log('✅ Updated .env file with spreadsheet ID');
            
        } catch (error) {
            console.error('❌ Failed to update .env file:', error.message);
        }
    }
    
    async testConnection() {
        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            console.log('✅ Google Sheets connection test successful');
            console.log(`📊 Sheet title: ${response.data.properties.title}`);
            return true;
            
        } catch (error) {
            console.error('❌ Google Sheets connection test failed:', error.message);
            return false;
        }
    }
    
    async createSampleData() {
        try {
            const sampleData = [
                [
                    'RESUME_SAMPLE_001',
                    new Date().toISOString(),
                    'john_doe_resume.pdf',
                    'John Doe',
                    'john.doe@example.com',
                    '(555) 123-4567',
                    'San Francisco, CA',
                    'https://linkedin.com/in/johndoe',
                    'https://github.com/johndoe',
                    'READY',
                    95,
                    '',
                    'portfolio, certifications',
                    'YES',
                    'YES',
                    'YES',
                    'YES'
                ],
                [
                    'RESUME_SAMPLE_002',
                    new Date().toISOString(),
                    'jane_smith_resume.pdf',
                    'Jane Smith',
                    'jane.smith@example.com',
                    '',
                    'New York, NY',
                    '',
                    '',
                    'INCOMPLETE',
                    60,
                    'phone',
                    'linkedin, github, portfolio',
                    'YES',
                    'YES',
                    'YES',
                    'NO'
                ]
            ];
            
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Resume_Validation!A:Q',
                valueInputOption: 'RAW',
                resource: {
                    values: sampleData
                }
            });
            
            console.log('✅ Sample data added to sheet');
            
        } catch (error) {
            console.error('❌ Failed to add sample data:', error.message);
        }
    }
}

// Run setup if called directly
if (require.main === module) {
    const setup = new GoogleSheetsSetup();
    
    async function runSetup() {
        console.log('🚀 Setting up Google Sheets integration...\n');
        
        await setup.createResumeValidationSheet();
        
        const connected = await setup.testConnection();
        if (connected) {
            await setup.createSampleData();
            console.log('\n✅ Google Sheets setup complete!');
            console.log('📄 Ready to accept resume uploads');
        }
    }
    
    runSetup();
}

module.exports = GoogleSheetsSetup;