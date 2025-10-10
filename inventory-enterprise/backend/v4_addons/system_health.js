/**
 * System Health Monitor - v4.0
 * Real-time monitoring for macOS M3 Pro (Apple Silicon)
 *
 * Features:
 * - CPU/RAM/GPU/NPU metrics
 * - Network isolation verification
 * - Firewall status
 * - Database integrity
 * - Apple Accelerate detection
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class SystemHealthMonitor {
  constructor(options = {}) {
    this.dbPath = options.dbPath || './db/inventory_enterprise.db';
    this.port = options.port || 8083;
    this.metricsHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Get complete system health snapshot
   */
  async getSystemHealth() {
    const startTime = Date.now();

    const health = {
      timestamp: new Date().toISOString(),
      system: this.getSystemInfo(),
      cpu: await this.getCPUMetrics(),
      memory: await this.getMemoryMetrics(),
      apple_silicon: await this.getAppleSiliconMetrics(),
      disk: await this.getDiskMetrics(),
      network: await this.getNetworkStatus(),
      firewall: await this.getFirewallStatus(),
      database: await this.getDatabaseHealth(),
      uptime: this.getUptime(),
      performance: {
        metrics_collection_ms: Date.now() - startTime
      }
    };

    // Store in history
    this.metricsHistory.push(health);
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    return health;
  }

  /**
   * Get macOS system information
   */
  getSystemInfo() {
    try {
      const osVersion = execSync('sw_vers -productVersion').toString().trim();
      const buildVersion = execSync('sw_vers -buildVersion').toString().trim();
      const hostname = execSync('hostname').toString().trim();

      return {
        os: 'macOS',
        version: osVersion,
        build: buildVersion,
        hostname: hostname,
        platform: 'darwin',
        arch: 'arm64'
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get CPU metrics via sysctl
   */
  async getCPUMetrics() {
    try {
      // Get CPU info
      const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string').toString().trim();
      const cpuCores = parseInt(execSync('sysctl -n hw.ncpu').toString().trim());
      const cpuFreq = parseInt(execSync('sysctl -n hw.cpufrequency').toString().trim()) / 1000000000; // Hz to GHz

      // Get CPU usage (via ps)
      const cpuUsage = parseFloat(
        execSync('ps -A -o %cpu | awk \'{s+=$1} END {print s}\'').toString().trim()
      );

      // Get load average
      const loadAvg = execSync('sysctl -n vm.loadavg').toString().trim()
        .match(/[\d.]+/g).slice(0, 3).map(parseFloat);

      return {
        brand: cpuBrand,
        cores: cpuCores,
        frequency_ghz: cpuFreq.toFixed(2),
        usage_percent: parseFloat(cpuUsage.toFixed(2)),
        load_average: {
          '1min': loadAvg[0],
          '5min': loadAvg[1],
          '15min': loadAvg[2]
        },
        type: cpuBrand.includes('M3') ? 'Apple M3 Pro' : cpuBrand
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get memory metrics
   */
  async getMemoryMetrics() {
    try {
      // Total physical memory
      const totalMem = parseInt(execSync('sysctl -n hw.memsize').toString().trim()) / (1024 * 1024); // bytes to MB

      // Free memory
      const vmStat = execSync('vm_stat').toString();
      const pageSize = parseInt(execSync('pagesize').toString().trim());

      const freePages = parseInt(vmStat.match(/Pages free:\s+(\d+)/)[1]);
      const inactivePages = parseInt(vmStat.match(/Pages inactive:\s+(\d+)/)[1]);
      const speculativePages = parseInt(vmStat.match(/Pages speculative:\s+(\d+)/)[1] || 0);

      const freeMem = ((freePages + inactivePages + speculativePages) * pageSize) / (1024 * 1024);
      const usedMem = totalMem - freeMem;

      return {
        total_mb: parseInt(totalMem),
        used_mb: parseInt(usedMem),
        free_mb: parseInt(freeMem),
        usage_percent: parseFloat((usedMem / totalMem * 100).toFixed(2)),
        page_size: pageSize
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get Apple Silicon specific metrics
   */
  async getAppleSiliconMetrics() {
    try {
      const cpuBrand = execSync('sysctl -n machdep.cpu.brand_string').toString().trim();

      if (!cpuBrand.includes('Apple')) {
        return {
          is_apple_silicon: false,
          message: 'Not running on Apple Silicon'
        };
      }

      // Detect GPU
      let gpuInfo = 'Unknown';
      try {
        const gpuOutput = execSync('system_profiler SPDisplaysDataType').toString();
        if (gpuOutput.includes('Apple M3')) {
          gpuInfo = 'Apple M3 Pro GPU (18-core)';
        } else if (gpuOutput.includes('Apple')) {
          gpuInfo = 'Apple GPU';
        }
      } catch (e) {
        gpuInfo = 'Apple Integrated GPU';
      }

      // Neural Engine detection
      const neuralEngine = cpuBrand.includes('M3') || cpuBrand.includes('M2') || cpuBrand.includes('M1')
        ? { active: true, type: 'Apple Neural Engine 16-core' }
        : { active: false };

      // Check for Apple Accelerate framework
      const accelerateAvailable = this.checkAccelerateFramework();

      return {
        is_apple_silicon: true,
        cpu: cpuBrand,
        gpu: {
          active: true,
          type: gpuInfo,
          utilization: null  // Requires additional tools like powermetrics
        },
        neural_engine: neuralEngine,
        accelerate_framework: accelerateAvailable,
        unified_memory: true,
        metal_support: true
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Check if Apple Accelerate framework is available
   */
  checkAccelerateFramework() {
    try {
      // Check for Accelerate.framework
      const frameworkPath = '/System/Library/Frameworks/Accelerate.framework';
      return {
        available: fs.existsSync(frameworkPath),
        path: frameworkPath,
        vDSP: true,  // Vector DSP library
        BLAS: true,  // Basic Linear Algebra Subprograms
        LAPACK: true // Linear Algebra PACKage
      };
    } catch (error) {
      return { available: false, error: error.message };
    }
  }

  /**
   * Get disk metrics
   */
  async getDiskMetrics() {
    try {
      const dfOutput = execSync('df -h /').toString().split('\n')[1];
      const parts = dfOutput.split(/\s+/);

      const total = parts[1];
      const used = parts[2];
      const avail = parts[3];
      const percent = parseInt(parts[4].replace('%', ''));

      return {
        total: total,
        used: used,
        available: avail,
        usage_percent: percent,
        filesystem: parts[0],
        mounted_on: parts[8] || '/'
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Verify network is localhost-only
   */
  async getNetworkStatus() {
    try {
      const lsofOutput = execSync(`lsof -i :${this.port} -P -n 2>/dev/null || echo "not_running"`).toString();

      if (lsofOutput.includes('not_running')) {
        return {
          port: this.port,
          status: 'not_running',
          localhost_only: null
        };
      }

      const isLocalhostOnly = lsofOutput.includes('127.0.0.1') || lsofOutput.includes('localhost');
      const hasWildcard = lsofOutput.includes('*:' + this.port) || lsofOutput.includes('0.0.0.0');

      return {
        port: this.port,
        status: 'running',
        localhost_only: isLocalhostOnly && !hasWildcard,
        binding: isLocalhostOnly ? '127.0.0.1' : 'UNKNOWN',
        warning: hasWildcard ? 'Server bound to wildcard address - SECURITY RISK' : null
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Check macOS firewall status
   */
  async getFirewallStatus() {
    try {
      // Check Application Firewall
      let appFirewall = false;
      try {
        const fwOutput = execSync('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null').toString();
        appFirewall = fwOutput.includes('enabled');
      } catch (e) {
        appFirewall = false;
      }

      // Check Packet Filter (pf)
      let packetFilter = false;
      try {
        const pfOutput = execSync('sudo pfctl -s info 2>/dev/null || echo "disabled"').toString();
        packetFilter = pfOutput.includes('Status: Enabled');
      } catch (e) {
        packetFilter = false;
      }

      return {
        application_firewall: appFirewall,
        packet_filter: packetFilter,
        overall_status: appFirewall || packetFilter ? 'protected' : 'unprotected',
        recommendation: appFirewall || packetFilter ? null : 'Enable firewall for production'
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Check database health and integrity
   */
  async getDatabaseHealth() {
    try {
      if (!fs.existsSync(this.dbPath)) {
        return {
          exists: false,
          error: 'Database file not found'
        };
      }

      const stats = fs.statSync(this.dbPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      // Calculate SHA-256 checksum
      const fileBuffer = fs.readFileSync(this.dbPath);
      const hashSum = crypto.createHash('sha256');
      hashSum.update(fileBuffer);
      const checksum = hashSum.digest('hex');

      // Check file permissions
      const permissions = (stats.mode & parseInt('777', 8)).toString(8);

      return {
        exists: true,
        path: this.dbPath,
        size_mb: parseFloat(sizeMB),
        size_bytes: stats.size,
        checksum_sha256: checksum,
        checksum_truncated: checksum.substring(0, 16),
        permissions: permissions,
        last_modified: stats.mtime.toISOString(),
        recommended_permissions: '600',
        secure: permissions === '600'
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get system uptime
   */
  getUptime() {
    try {
      const uptimeOutput = execSync('uptime').toString().trim();
      const match = uptimeOutput.match(/up\s+(.+?),\s+\d+\s+user/);
      const uptimeStr = match ? match[1] : 'unknown';

      // Parse uptime to seconds
      const bootTime = parseInt(execSync('sysctl -n kern.boottime').toString().match(/sec = (\d+)/)[1]);
      const currentTime = Math.floor(Date.now() / 1000);
      const uptimeSeconds = currentTime - bootTime;

      return {
        uptime_string: uptimeStr,
        uptime_seconds: uptimeSeconds,
        uptime_hours: parseFloat((uptimeSeconds / 3600).toFixed(2)),
        uptime_days: parseFloat((uptimeSeconds / 86400).toFixed(2)),
        boot_time: new Date(bootTime * 1000).toISOString()
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit = 10) {
    return this.metricsHistory.slice(-limit);
  }

  /**
   * Get health score (0-100)
   */
  async getHealthScore() {
    const health = await this.getSystemHealth();
    let score = 100;

    // Deduct points for issues
    if (!health.network.localhost_only) score -= 30;
    if (health.firewall.overall_status !== 'protected') score -= 10;
    if (!health.database.secure) score -= 10;
    if (health.cpu.usage_percent > 80) score -= 10;
    if (health.memory.usage_percent > 90) score -= 10;
    if (health.disk.usage_percent > 90) score -= 10;

    return {
      score: Math.max(0, score),
      grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
      issues: this.identifyIssues(health),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Identify health issues
   */
  identifyIssues(health) {
    const issues = [];

    if (!health.network.localhost_only) {
      issues.push({
        severity: 'critical',
        component: 'network',
        message: 'Server not bound to localhost-only'
      });
    }

    if (health.firewall.overall_status !== 'protected') {
      issues.push({
        severity: 'warning',
        component: 'firewall',
        message: 'Firewall disabled - recommended for production'
      });
    }

    if (!health.database.secure) {
      issues.push({
        severity: 'warning',
        component: 'database',
        message: 'Database permissions should be 600'
      });
    }

    if (health.cpu.usage_percent > 80) {
      issues.push({
        severity: 'warning',
        component: 'cpu',
        message: `CPU usage high: ${health.cpu.usage_percent}%`
      });
    }

    if (health.memory.usage_percent > 90) {
      issues.push({
        severity: 'critical',
        component: 'memory',
        message: `Memory usage critical: ${health.memory.usage_percent}%`
      });
    }

    if (health.disk.usage_percent > 90) {
      issues.push({
        severity: 'warning',
        component: 'disk',
        message: `Disk usage high: ${health.disk.usage_percent}%`
      });
    }

    return issues;
  }
}

module.exports = SystemHealthMonitor;
