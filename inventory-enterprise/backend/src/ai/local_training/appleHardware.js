/**
 * Apple Hardware Detection for M-series Silicon
 * Detects Apple Silicon chips and reports performance/efficiency cores
 */

const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');

/**
 * Get Apple hardware profile with real detected values
 * @returns {Object} Hardware profile
 */
function getAppleHardwareProfile() {
  const profile = {
    platform: os.platform(),
    arch: os.arch(),
    isAppleSilicon: false,
    chipModel: null,
    cpuBrand: null,
    totalCores: os.cpus().length,
    performanceCores: 0,
    efficiencyCores: 0,
    totalMemoryGB: Math.round(os.totalmem() / (1024 ** 3) * 100) / 100,
    freeMemoryGB: Math.round(os.freemem() / (1024 ** 3) * 100) / 100,
    nodeVersion: process.version,
    detectedAt: new Date().toISOString()
  };

  // Check if macOS + ARM64 (Apple Silicon)
  if (profile.platform === 'darwin' && profile.arch === 'arm64') {
    profile.isAppleSilicon = true;

    try {
      // Get CPU brand string
      const brandString = execSync('sysctl -n machdep.cpu.brand_string', {
        encoding: 'utf8',
        timeout: 2000
      }).trim();

      profile.cpuBrand = brandString;

      // Parse chip model (M1, M2, M3, etc.)
      if (brandString.includes('Apple M1')) {
        profile.chipModel = brandString.includes('Max') ? 'M1 Max' :
                           brandString.includes('Pro') ? 'M1 Pro' : 'M1';
      } else if (brandString.includes('Apple M2')) {
        profile.chipModel = brandString.includes('Max') ? 'M2 Max' :
                           brandString.includes('Pro') ? 'M2 Pro' :
                           brandString.includes('Ultra') ? 'M2 Ultra' : 'M2';
      } else if (brandString.includes('Apple M3')) {
        profile.chipModel = brandString.includes('Max') ? 'M3 Max' :
                           brandString.includes('Pro') ? 'M3 Pro' :
                           brandString.includes('Ultra') ? 'M3 Ultra' : 'M3';
      } else {
        profile.chipModel = 'Apple Silicon (Unknown)';
      }

      // Get actual P/E core counts from sysctl
      try {
        const pCoresStr = execSync('sysctl -n hw.perflevel0.logicalcpu', {
          encoding: 'utf8',
          timeout: 1000
        }).trim();

        const eCoresStr = execSync('sysctl -n hw.perflevel1.logicalcpu', {
          encoding: 'utf8',
          timeout: 1000
        }).trim();

        profile.performanceCores = parseInt(pCoresStr, 10) || 0;
        profile.efficiencyCores = parseInt(eCoresStr, 10) || 0;
      } catch (e) {
        // Fallback: estimate based on chip model
        if (profile.chipModel.includes('M3 Pro')) {
          profile.performanceCores = 6;
          profile.efficiencyCores = 6;
        } else if (profile.chipModel.includes('M3 Max')) {
          profile.performanceCores = 12;
          profile.efficiencyCores = 4;
        } else if (profile.chipModel.includes('M3')) {
          profile.performanceCores = 4;
          profile.efficiencyCores = 4;
        } else {
          profile.performanceCores = Math.floor(profile.totalCores / 2);
          profile.efficiencyCores = profile.totalCores - profile.performanceCores;
        }
      }

      // Get physical memory
      try {
        const memBytes = execSync('sysctl -n hw.memsize', {
          encoding: 'utf8',
          timeout: 1000
        }).trim();
        profile.totalMemoryGB = Math.round(parseInt(memBytes, 10) / (1024 ** 3) * 100) / 100;
      } catch (e) {
        // Already set from os.totalmem()
      }

    } catch (error) {
      // If sysctl fails, use generic detection
      profile.cpuBrand = os.cpus()[0]?.model || 'Apple Silicon';
      profile.chipModel = 'Apple Silicon (Generic)';
      profile.performanceCores = Math.floor(profile.totalCores / 2);
      profile.efficiencyCores = profile.totalCores - profile.performanceCores;
    }
  } else {
    // Non-Apple Silicon
    profile.cpuBrand = os.cpus()[0]?.model || 'Unknown CPU';
    profile.chipModel = null;
    profile.performanceCores = profile.totalCores;
    profile.efficiencyCores = 0;
  }

  return profile;
}

/**
 * Get hardware fingerprint (SHA256 hash of canonical profile)
 * Used for release manifests to track training hardware
 * @returns {string} SHA256 hex string
 */
function getHardwareFingerprint() {
  const profile = getAppleHardwareProfile();

  // Create canonical representation (exclude timestamps and free memory)
  const canonical = {
    platform: profile.platform,
    arch: profile.arch,
    chipModel: profile.chipModel,
    totalCores: profile.totalCores,
    performanceCores: profile.performanceCores,
    efficiencyCores: profile.efficiencyCores,
    totalMemoryGB: profile.totalMemoryGB
  };

  const canonicalJson = JSON.stringify(canonical, Object.keys(canonical).sort());
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Check if NumPy is using Apple Accelerate framework
 * @returns {Promise<Object>} BLAS backend info
 */
async function checkAccelerateFramework() {
  return new Promise((resolve) => {
    const { exec } = require('child_process');

    const cmd = `python3 -c "import numpy as np; print(np.__config__.show())" 2>&1`;

    exec(cmd, { timeout: 5000 }, (error, stdout, stderr) => {
      const result = {
        available: false,
        backend: 'unknown',
        numpyInstalled: false,
        details: null
      };

      if (error) {
        result.details = 'NumPy not installed or Python not available';
        resolve(result);
        return;
      }

      result.numpyInstalled = true;

      // Check for Accelerate/vecLib
      if (stdout.includes('Accelerate') || stdout.includes('vecLib')) {
        result.available = true;
        result.backend = 'Accelerate (Apple)';
        result.details = 'Using Apple Accelerate framework for BLAS/LAPACK';
      } else if (stdout.includes('openblas')) {
        result.backend = 'OpenBLAS';
        result.details = 'Using OpenBLAS (not optimized for Apple Silicon)';
      } else if (stdout.includes('mkl')) {
        result.backend = 'Intel MKL';
        result.details = 'Using Intel MKL (not optimized for Apple Silicon)';
      } else if (stdout.includes('blas')) {
        result.backend = 'BLAS (generic)';
        result.details = 'Using generic BLAS implementation';
      } else {
        result.backend = 'unknown';
        result.details = 'Could not determine BLAS backend';
      }

      resolve(result);
    });
  });
}

/**
 * Get current process memory usage in MB
 * @returns {Object} Memory usage breakdown
 */
function getMemoryUsageMB() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / (1024 * 1024) * 100) / 100,
    heapTotal: Math.round(usage.heapTotal / (1024 * 1024) * 100) / 100,
    heapUsed: Math.round(usage.heapUsed / (1024 * 1024) * 100) / 100,
    external: Math.round(usage.external / (1024 * 1024) * 100) / 100
  };
}

module.exports = {
  getAppleHardwareProfile,
  getHardwareFingerprint,
  checkAccelerateFramework,
  getMemoryUsageMB
};
