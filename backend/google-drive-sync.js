/**
 * Google Drive Sync for GFS Orders
 * Automatically syncs GFS orders from Google Drive
 */

const { google } = require("googleapis");
const fs = require("fs").promises;
const path = require("path");

class GoogleDriveSync {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];
    this.GFS_FOLDER_NAME = "GFS_Orders_Inventory";
  }

  /**
   * Initialize Google Drive API
   * Uses service account or OAuth2
   */
  async initialize() {
    try {
      // Option 1: Service Account (for automated sync)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
        const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
        this.auth = new google.auth.GoogleAuth({
          credentials: key,
          scopes: this.SCOPES,
        });
      }
      // Option 2: OAuth2 (for manual setup)
      else if (
        process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET
      ) {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI ||
            "http://localhost:8083/auth/google/callback",
        );

        // You'll need to implement OAuth flow here
        this.auth = oauth2Client;
      }

      this.drive = google.drive({ version: "v3", auth: this.auth });
      console.log("✅ Google Drive initialized");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize Google Drive:", error.message);
      return false;
    }
  }

  /**
   * Find or create GFS Orders folder
   */
  async getGFSFolderId() {
    try {
      // Search for folder
      const response = await this.drive.files.list({
        q: `name='${this.GFS_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id, name)",
        spaces: "drive",
      });

      if (response.data.files.length > 0) {
        return response.data.files[0].id;
      }

      // Create folder if it doesn't exist
      const folderMetadata = {
        name: this.GFS_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      };

      const folder = await this.drive.files.create({
        resource: folderMetadata,
        fields: "id",
      });

      console.log(`✅ Created GFS Orders folder: ${folder.data.id}`);
      return folder.data.id;
    } catch (error) {
      console.error("❌ Error accessing Google Drive folder:", error);
      throw error;
    }
  }

  /**
   * Download all GFS orders from Google Drive
   */
  async syncGFSOrders(localPath = "./data/gfs_orders") {
    try {
      const folderId = await this.getGFSFolderId();

      // List all files in the folder
      const response = await this.drive.files.list({
        q: `'${folderId}' in parents and trashed=false`,
        fields: "files(id, name, mimeType, modifiedTime)",
        orderBy: "modifiedTime desc",
      });

      const files = response.data.files;
      console.log(`📥 Found ${files.length} GFS order files in Google Drive`);

      // Ensure local directory exists
      await fs.mkdir(localPath, { recursive: true });

      // Download each file
      for (const file of files) {
        if (file.name.endsWith(".json") || file.name.endsWith(".csv")) {
          await this.downloadFile(file.id, path.join(localPath, file.name));
        }
      }

      return files.length;
    } catch (error) {
      console.error("❌ Error syncing GFS orders:", error);
      throw error;
    }
  }

  /**
   * Download a single file from Google Drive
   */
  async downloadFile(fileId, destPath) {
    try {
      const response = await this.drive.files.get(
        { fileId, alt: "media" },
        { responseType: "stream" },
      );

      const dest = fs.createWriteStream(destPath);

      return new Promise((resolve, reject) => {
        response.data
          .on("end", () => {
            console.log(`✅ Downloaded: ${path.basename(destPath)}`);
            resolve();
          })
          .on("error", reject)
          .pipe(dest);
      });
    } catch (error) {
      console.error(`❌ Error downloading file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Watch for changes in Google Drive (using webhooks or polling)
   */
  async watchForChanges(callback, intervalMinutes = 5) {
    console.log(
      `👀 Watching Google Drive for changes every ${intervalMinutes} minutes`,
    );

    // Initial sync
    await this.syncGFSOrders();

    // Set up polling
    setInterval(
      async () => {
        try {
          const count = await this.syncGFSOrders();
          if (callback) callback(count);
        } catch (error) {
          console.error("❌ Error during sync:", error);
        }
      },
      intervalMinutes * 60 * 1000,
    );
  }
}

/**
 * AI Agent Data Collector
 * Automatically processes new GFS orders
 */
class AIDataCollector {
  constructor(googleDriveSync) {
    this.googleSync = googleDriveSync;
    this.processedOrders = new Set();
  }

  /**
   * Start the AI agent
   */
  async start() {
    console.log("🤖 AI Data Collector started");

    // Initialize Google Drive
    const initialized = await this.googleSync.initialize();
    if (!initialized) {
      console.error(
        "❌ Failed to start AI Data Collector - Google Drive not initialized",
      );
      return;
    }

    // Watch for changes
    await this.googleSync.watchForChanges(async (fileCount) => {
      console.log(`🔄 Synced ${fileCount} files from Google Drive`);
      await this.processNewOrders();
    });
  }

  /**
   * Process new orders and update inventory
   */
  async processNewOrders() {
    try {
      const ordersPath = "./data/gfs_orders";
      const files = await fs.readdir(ordersPath);

      for (const file of files) {
        if (!this.processedOrders.has(file) && file.endsWith(".json")) {
          const orderPath = path.join(ordersPath, file);
          const orderData = JSON.parse(await fs.readFile(orderPath, "utf8"));

          // Process the order
          console.log(`📦 Processing new order: ${file}`);
          // Add your inventory update logic here

          this.processedOrders.add(file);
        }
      }
    } catch (error) {
      console.error("❌ Error processing orders:", error);
    }
  }
}

// Export for use in inventory system
module.exports = { GoogleDriveSync, AIDataCollector };

// Standalone execution
if (require.main === module) {
  const sync = new GoogleDriveSync();
  const collector = new AIDataCollector(sync);

  collector.start().catch(console.error);
}
