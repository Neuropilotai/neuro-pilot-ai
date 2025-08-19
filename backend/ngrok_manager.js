const { exec } = require("child_process");
const fs = require("fs").promises;

class NgrokManager {
  constructor() {
    this.currentUrl = null;
    this.urlFile = "./current_ngrok_url.txt";
    this.logFile = "./ngrok_manager.log";
  }

  async start() {
    console.log("🌐 NgrokManager starting...");

    // Kill existing ngrok processes
    await this.killExistingNgrok();

    // Start new ngrok tunnel
    await this.startNgrokTunnel();

    // Monitor and maintain tunnel
    this.monitorTunnel();

    console.log("✅ NgrokManager active - maintaining tunnel stability");
  }

  async killExistingNgrok() {
    return new Promise((resolve) => {
      exec("pkill -f ngrok", (error) => {
        if (error) {
          console.log("No existing ngrok processes found");
        } else {
          console.log("🔄 Killed existing ngrok processes");
        }
        setTimeout(resolve, 2000); // Wait 2 seconds
      });
    });
  }

  async startNgrokTunnel() {
    console.log("🚀 Starting ngrok tunnel for port 3000...");

    return new Promise((resolve) => {
      // Start ngrok in background
      exec("nohup ngrok http 3000 > ngrok_tunnel.log 2>&1 &", (error) => {
        if (error) {
          console.error("❌ Failed to start ngrok:", error);
        } else {
          console.log("⏳ Ngrok tunnel starting...");
        }

        // Wait for tunnel to establish
        setTimeout(async () => {
          await this.getCurrentUrl();
          resolve();
        }, 5000);
      });
    });
  }

  async getCurrentUrl() {
    try {
      const response = await new Promise((resolve, reject) => {
        exec("curl -s http://localhost:4040/api/tunnels", (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });

      const tunnels = JSON.parse(response);
      if (tunnels.tunnels && tunnels.tunnels.length > 0) {
        const httpsTunnel = tunnels.tunnels.find((t) =>
          t.public_url.startsWith("https://"),
        );
        if (httpsTunnel) {
          this.currentUrl = httpsTunnel.public_url;

          // Save URL to file
          await fs.writeFile(this.urlFile, this.currentUrl);

          console.log("🔗 Current ngrok URL:", this.currentUrl);
          console.log("📋 Order form:", this.currentUrl + "/simple-order.html");

          await this.logUrlChange();
          return this.currentUrl;
        }
      }
    } catch (error) {
      console.error("❌ Failed to get ngrok URL:", error.message);
    }
    return null;
  }

  async logUrlChange() {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - URL: ${this.currentUrl}\\n`;

    try {
      await fs.appendFile(this.logFile, logEntry);
    } catch (error) {
      console.error("Failed to log URL change:", error);
    }
  }

  async monitorTunnel() {
    console.log("👀 Starting tunnel monitoring...");

    setInterval(async () => {
      try {
        // Check if ngrok is still running
        const isRunning = await this.checkNgrokStatus();

        if (!isRunning) {
          console.log("⚠️  Ngrok tunnel down - restarting...");
          await this.startNgrokTunnel();
        } else {
          // Get current URL and update if changed
          const url = await this.getCurrentUrl();
          if (url && url !== this.currentUrl) {
            console.log("🔄 URL changed:", url);
            this.currentUrl = url;
          }
        }

        console.log(
          `[${new Date().toLocaleTimeString()}] ✅ Tunnel monitoring - URL: ${this.currentUrl}`,
        );
      } catch (error) {
        console.error("Monitor error:", error.message);
      }
    }, 30000); // Check every 30 seconds
  }

  async checkNgrokStatus() {
    try {
      const response = await new Promise((resolve, reject) => {
        exec(
          "curl -s http://localhost:4040/api/tunnels",
          { timeout: 5000 },
          (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });

      const data = JSON.parse(response);
      return data.tunnels && data.tunnels.length > 0;
    } catch (error) {
      return false;
    }
  }

  async getStoredUrl() {
    try {
      const url = await fs.readFile(this.urlFile, "utf8");
      return url.trim();
    } catch (error) {
      return null;
    }
  }

  stop() {
    console.log("🛑 NgrokManager stopping...");
    exec("pkill -f ngrok");
  }
}

// Auto-start when run directly
if (require.main === module) {
  const manager = new NgrokManager();
  manager.start();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    manager.stop();
    process.exit(0);
  });
}

module.exports = NgrokManager;
