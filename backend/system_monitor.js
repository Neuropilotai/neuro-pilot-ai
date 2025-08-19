const { spawn } = require("child_process");
const os = require("os");

class SystemMonitor {
  constructor() {
    this.metrics = {
      cpu: 0,
      memory: { used: 0, total: 0, free: 0 },
      processes: [],
      uptime: 0,
      loadAverage: [0, 0, 0],
    };
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      this.updateMetrics();
    }, 2000);
  }

  updateMetrics() {
    const cpuUsage = process.cpuUsage();
    const memUsage = process.memoryUsage();

    this.metrics.cpu = this.calculateCPUPercentage(cpuUsage);
    this.metrics.memory = {
      used: Math.round(memUsage.heapUsed / 1024 / 1024),
      total: Math.round(memUsage.heapTotal / 1024 / 1024),
      free: Math.round(os.freemem() / 1024 / 1024 / 1024),
      systemTotal: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    };

    this.metrics.uptime = process.uptime();
    this.metrics.loadAverage = os.loadavg();
  }

  calculateCPUPercentage(cpuUsage) {
    const totalCPU = cpuUsage.user + cpuUsage.system;
    return Math.min(100, totalCPU / 1000000 / os.cpus().length);
  }

  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      hostname: os.hostname(),
      nodeVersion: process.version,
      pid: process.pid,
      ...this.metrics,
    };
  }

  getHealthStatus() {
    const health = {
      status: "healthy",
      issues: [],
      score: 100,
    };

    if (this.metrics.cpu > 80) {
      health.issues.push("High CPU usage");
      health.score -= 20;
    }

    const memPercent =
      (this.metrics.memory.used / this.metrics.memory.total) * 100;
    if (memPercent > 85) {
      health.issues.push("High memory usage");
      health.score -= 20;
    }

    if (this.metrics.loadAverage[0] > os.cpus().length) {
      health.issues.push("High system load");
      health.score -= 15;
    }

    if (health.score < 70) {
      health.status = "critical";
    } else if (health.score < 85) {
      health.status = "warning";
    }

    return health;
  }
}

module.exports = SystemMonitor;
