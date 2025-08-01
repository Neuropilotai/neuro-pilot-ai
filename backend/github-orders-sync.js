/**
 * GitHub Orders Sync - Simple Cloud Storage for GFS Orders
 * Uses GitHub as a free, versioned storage for order files
 */

const https = require('https');
const fs = require('fs').promises;
const path = require('path');

class GitHubOrdersSync {
  constructor(config = {}) {
    this.owner = config.owner || process.env.GITHUB_OWNER || 'Neuropilotai';
    this.repo = config.repo || process.env.GITHUB_ORDERS_REPO || 'gfs-orders-data';
    this.token = config.token || process.env.GITHUB_TOKEN;
    this.branch = config.branch || 'main';
    this.ordersPath = config.ordersPath || 'orders';
  }

  /**
   * Fetch all orders from GitHub repository
   */
  async fetchOrders() {
    try {
      const files = await this.listFiles();
      const orders = [];
      
      console.log(`📥 Fetching ${files.length} orders from GitHub...`);
      
      for (const file of files) {
        if (file.name.endsWith('.json')) {
          const content = await this.fetchFile(file.path);
          try {
            const order = JSON.parse(content);
            orders.push(order);
            console.log(`✅ Loaded order: ${file.name}`);
          } catch (error) {
            console.error(`⚠️ Invalid JSON in ${file.name}`);
          }
        }
      }
      
      return orders;
    } catch (error) {
      console.error('❌ Error fetching orders from GitHub:', error);
      throw error;
    }
  }

  /**
   * List all files in the orders directory
   */
  async listFiles() {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repo}/contents/${this.ordersPath}`,
        method: 'GET',
        headers: {
          'User-Agent': 'GFS-Orders-Sync',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      if (this.token) {
        options.headers['Authorization'] = `token ${this.token}`;
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const files = JSON.parse(data);
            if (Array.isArray(files)) {
              resolve(files);
            } else {
              resolve([]);
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Fetch a single file content
   */
  async fetchFile(filePath) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${this.owner}/${this.repo}/contents/${filePath}`,
        method: 'GET',
        headers: {
          'User-Agent': 'GFS-Orders-Sync',
          'Accept': 'application/vnd.github.v3.raw'
        }
      };

      if (this.token) {
        options.headers['Authorization'] = `token ${this.token}`;
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });

      req.on('error', reject);
      req.end();
    });
  }

  /**
   * Sync orders to local storage
   */
  async syncToLocal(localPath = './data/gfs_orders') {
    try {
      // Ensure directory exists
      await fs.mkdir(localPath, { recursive: true });
      
      // Fetch and save orders
      const files = await this.listFiles();
      let syncedCount = 0;
      
      for (const file of files) {
        if (file.name.endsWith('.json')) {
          const content = await this.fetchFile(file.path);
          const localFile = path.join(localPath, file.name);
          await fs.writeFile(localFile, content);
          syncedCount++;
        }
      }
      
      console.log(`✅ Synced ${syncedCount} orders from GitHub`);
      return syncedCount;
    } catch (error) {
      console.error('❌ Error syncing orders:', error);
      throw error;
    }
  }

  /**
   * Create a sample repository structure
   */
  static getSampleRepoStructure() {
    return `
# GFS Orders Data Repository Structure

Create a GitHub repository with this structure:

gfs-orders-data/
├── README.md
├── orders/
│   ├── gfs_order_2025_01_20_001.json
│   ├── gfs_order_2025_01_21_001.json
│   └── ...
└── templates/
    └── order_template.json

## Sample Order Format:
\`\`\`json
{
  "orderNumber": "GFS_20250120_001",
  "orderDate": "2025-01-20",
  "supplier": "GFS",
  "items": [
    {
      "name": "Ground Beef",
      "quantity": 50,
      "unit": "lb",
      "price": 4.99
    }
  ]
}
\`\`\`
`;
  }
}

/**
 * Express routes for GitHub sync
 */
function setupGitHubSyncRoutes(app) {
  const sync = new GitHubOrdersSync();

  // Manual sync endpoint
  app.post('/api/sync/github-orders', async (req, res) => {
    try {
      const count = await sync.syncToLocal();
      res.json({ 
        success: true, 
        message: `Synced ${count} orders from GitHub`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Get sync status
  app.get('/api/sync/status', async (req, res) => {
    try {
      const files = await sync.listFiles();
      res.json({
        success: true,
        repository: `${sync.owner}/${sync.repo}`,
        ordersCount: files.filter(f => f.name.endsWith('.json')).length,
        lastChecked: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Auto-sync every 10 minutes
  setInterval(async () => {
    try {
      console.log('🔄 Auto-syncing orders from GitHub...');
      await sync.syncToLocal();
    } catch (error) {
      console.error('❌ Auto-sync failed:', error.message);
    }
  }, 10 * 60 * 1000); // 10 minutes

  console.log('✅ GitHub sync routes configured');
}

module.exports = { GitHubOrdersSync, setupGitHubSyncRoutes };

// Test if run directly
if (require.main === module) {
  const sync = new GitHubOrdersSync();
  sync.syncToLocal()
    .then(count => console.log(`✅ Test sync completed: ${count} orders`))
    .catch(error => console.error('❌ Test sync failed:', error));
}