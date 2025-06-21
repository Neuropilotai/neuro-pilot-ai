const fs = require('fs').promises;
const path = require('path');

class URLUpdater {
    constructor() {
        this.currentUrlFile = './current_ngrok_url.txt';
    }

    async updateAllURLs() {
        try {
            // Get current URL
            const currentUrl = await this.getCurrentURL();
            if (!currentUrl) {
                console.log('❌ No current URL found');
                return;
            }

            console.log('🔄 Updating all URLs to:', currentUrl);

            // Files that might contain URLs
            const filesToCheck = [
                './send_all_systems_online.js',
                './test_all_systems.js', 
                './send_working_order_link.js',
                './email_order_system.js',
                '../frontend/public/simple-order.html'
            ];

            let updatedCount = 0;

            for (const file of filesToCheck) {
                try {
                    const updated = await this.updateFileURL(file, currentUrl);
                    if (updated) {
                        updatedCount++;
                        console.log(`✅ Updated: ${file}`);
                    }
                } catch (error) {
                    console.log(`⚠️ Skipped ${file}: ${error.message}`);
                }
            }

            console.log(`\n🎯 Updated ${updatedCount} files with current URL`);
            
            // Update email system with new URL
            await this.updateEmailOrderSystem(currentUrl);

        } catch (error) {
            console.error('❌ URL update failed:', error);
        }
    }

    async getCurrentURL() {
        try {
            const url = await fs.readFile(this.currentUrlFile, 'utf8');
            return url.trim();
        } catch (error) {
            console.log('⚠️ No URL file found, checking ngrok API...');
            return await this.getURLFromNgrok();
        }
    }

    async getURLFromNgrok() {
        const { exec } = require('child_process');
        
        return new Promise((resolve) => {
            exec('curl -s http://localhost:4040/api/tunnels', (error, stdout) => {
                if (error) {
                    resolve(null);
                    return;
                }
                
                try {
                    const data = JSON.parse(stdout);
                    const tunnel = data.tunnels?.find(t => t.public_url.startsWith('https://'));
                    resolve(tunnel?.public_url || null);
                } catch (e) {
                    resolve(null);
                }
            });
        });
    }

    async updateFileURL(filePath, newUrl) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            
            // Look for old ngrok URLs (pattern: https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app)
            const oldUrlPattern = /https:\/\/[a-f0-9]+-[0-9]+-[0-9]+-[0-9]+-[0-9]+\.ngrok-free\.app/g;
            const matches = content.match(oldUrlPattern);
            
            if (matches && matches.length > 0) {
                const updatedContent = content.replace(oldUrlPattern, newUrl);
                await fs.writeFile(filePath, updatedContent);
                return true;
            }
            
            return false;
        } catch (error) {
            throw error;
        }
    }

    async updateEmailOrderSystem(newUrl) {
        try {
            const emailSystemPath = './email_order_system.js';
            const content = await fs.readFile(emailSystemPath, 'utf8');
            
            // Update orderFormUrl if it exists
            const urlPattern = /(orderFormUrl\s*=\s*['"`])https:\/\/[^'"`]+(['"`])/;
            if (content.match(urlPattern)) {
                const updated = content.replace(urlPattern, `$1${newUrl}/simple-order.html$2`);
                await fs.writeFile(emailSystemPath, updated);
                console.log('✅ Updated email order system URL');
            }
        } catch (error) {
            console.log('⚠️ Could not update email system URL:', error.message);
        }
    }

    async saveCurrentURL(url) {
        try {
            await fs.writeFile(this.currentUrlFile, url);
            console.log('💾 Saved current URL:', url);
        } catch (error) {
            console.error('❌ Failed to save URL:', error);
        }
    }
}

// Command line usage
if (require.main === module) {
    const updater = new URLUpdater();
    updater.updateAllURLs();
}

module.exports = URLUpdater;