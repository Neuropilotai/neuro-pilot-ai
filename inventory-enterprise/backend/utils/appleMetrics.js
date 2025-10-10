/**
 * Apple Silicon Detection & Hardware Metrics
 * Detects M-series chips, BLAS backend, and captures real performance metrics
 */

const os = require('os');
const { execSync } = require('child_process');

/**
 * Detect Apple Silicon (M1/M2/M3) and return hardware info
 * @returns {Object} Hardware information with real detected values
 */
function detectAppleSilicon() {
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus();

  let isAppleSilicon = false;
  let chipModel = 'Unknown';
  let cpuBrand = 'Unknown';
  let performanceCores = 0;
  let efficiencyCores = 0;
  let totalCores = cpus.length;
  let memoryGB = Math.round(os.totalmem() / (1024 ** 3) * 10) / 10;

  // Check if macOS + ARM64 (Apple Silicon)
  if (platform === 'darwin' && arch === 'arm64') {
    isAppleSilicon = true;

    try {
      // Get chip model via sysctl
      const brandString = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
      cpuBrand = brandString;

      // Detect M-series chip
      if (brandString.includes('Apple M1')) {
        chipModel = 'M1';
        performanceCores = 4;
        efficiencyCores = 4;
      } else if (brandString.includes('Apple M2')) {
        chipModel = 'M2';
        performanceCores = 4;
        efficiencyCores = 4;
      } else if (brandString.includes('Apple M3')) {
        chipModel = 'M3';
        // M3 Pro typically has more cores
        if (brandString.includes('Pro')) {
          chipModel = 'M3 Pro';
          performanceCores = 6; // or 12 depending on config
          efficiencyCores = 6;
        } else if (brandString.includes('Max')) {
          chipModel = 'M3 Max';
          performanceCores = 12;
          efficiencyCores = 4;
        } else {
          performanceCores = 4;
          efficiencyCores = 4;
        }
      }

      // Try to get actual P/E core counts
      try {
        const pCores = execSync('sysctl -n hw.perflevel0.logicalcpu', { encoding: 'utf8' }).trim();
        const eCores = execSync('sysctl -n hw.perflevel1.logicalcpu', { encoding: 'utf8' }).trim();
        if (pCores && eCores) {
          performanceCores = parseInt(pCores, 10);
          efficiencyCores = parseInt(eCores, 10);
        }
      } catch (e) {
        // Fallback to defaults above
      }
    } catch (error) {
      // If sysctl fails, use generic detection
      cpuBrand = cpus[0]?.model || 'Apple Silicon';
    }
  } else {
    cpuBrand = cpus[0]?.model || 'Unknown CPU';
  }

  return {
    isAppleSilicon,
    chipModel,
    cpuBrand,
    platform,
    arch,
    totalCores,
    performanceCores: isAppleSilicon ? performanceCores : totalCores,
    efficiencyCores: isAppleSilicon ? efficiencyCores : 0,
    memoryGB,
    memoryBytes: os.totalmem(),
    freeMemoryGB: Math.round(os.freemem() / (1024 ** 3) * 10) / 10
  };
}

/**
 * Detect BLAS backend used by NumPy/SciPy
 * Requires Python with NumPy installed
 * @returns {string} BLAS backend name or "N/A"
 */
function detectBLASBackend() {
  try {
    const pythonCmd = `python3 -c "import numpy as np; print(np.__config__.show())" 2>/dev/null`;
    const output = execSync(pythonCmd, { encoding: 'utf8', timeout: 5000 });

    // Parse output for BLAS info
    if (output.includes('Accelerate') || output.includes('vecLib')) {
      return 'Accelerate (Apple)';
    } else if (output.includes('openblas')) {
      return 'OpenBLAS';
    } else if (output.includes('mkl')) {
      return 'Intel MKL';
    } else if (output.includes('blas')) {
      return 'BLAS (generic)';
    }

    return 'Unknown (detected NumPy)';
  } catch (error) {
    return 'N/A (NumPy not installed)';
  }
}

/**
 * Check Python environment and ML libraries
 * @returns {Object} Python environment info
 */
function checkPythonEnvironment() {
  const result = {
    pythonInstalled: false,
    pythonVersion: 'N/A',
    numpyInstalled: false,
    numpyVersion: 'N/A',
    pandasInstalled: false,
    pandasVersion: 'N/A',
    prophetInstalled: false,
    prophetVersion: 'N/A',
    statsmodelsInstalled: false,
    statsmodelsVersion: 'N/A'
  };

  try {
    // Check Python
    const pyVersion = execSync('python3 --version', { encoding: 'utf8', timeout: 2000 }).trim();
    result.pythonInstalled = true;
    result.pythonVersion = pyVersion.replace('Python ', '');

    // Check NumPy
    try {
      const npVersion = execSync('python3 -c "import numpy; print(numpy.__version__)"', { encoding: 'utf8', timeout: 2000 }).trim();
      result.numpyInstalled = true;
      result.numpyVersion = npVersion;
    } catch (e) { /* not installed */ }

    // Check Pandas
    try {
      const pdVersion = execSync('python3 -c "import pandas; print(pandas.__version__)"', { encoding: 'utf8', timeout: 2000 }).trim();
      result.pandasInstalled = true;
      result.pandasVersion = pdVersion;
    } catch (e) { /* not installed */ }

    // Check Prophet
    try {
      const prophetVersion = execSync('python3 -c "import prophet; print(prophet.__version__)"', { encoding: 'utf8', timeout: 2000 }).trim();
      result.prophetInstalled = true;
      result.prophetVersion = prophetVersion;
    } catch (e) { /* not installed */ }

    // Check Statsmodels
    try {
      const smVersion = execSync('python3 -c "import statsmodels; print(statsmodels.__version__)"', { encoding: 'utf8', timeout: 2000 }).trim();
      result.statsmodelsInstalled = true;
      result.statsmodelsVersion = smVersion;
    } catch (e) { /* not installed */ }

  } catch (error) {
    // Python not installed
  }

  return result;
}

/**
 * Get current memory usage (RSS) in MB
 * @returns {number} Memory usage in MB
 */
function getMemoryUsageMB() {
  const usage = process.memoryUsage();
  return Math.round(usage.rss / (1024 * 1024) * 100) / 100;
}

/**
 * Get peak memory usage tracked over time
 * Uses process.memoryUsage().rss
 */
let peakMemoryMB = 0;
function trackPeakMemory() {
  const currentMB = getMemoryUsageMB();
  if (currentMB > peakMemoryMB) {
    peakMemoryMB = currentMB;
  }
  return peakMemoryMB;
}

function resetPeakMemory() {
  peakMemoryMB = 0;
}

/**
 * Create a timer for measuring wall-clock duration
 * @returns {Object} Timer object with stop() method
 */
function createTimer() {
  const start = Date.now();
  return {
    stop: () => (Date.now() - start) / 1000 // returns seconds
  };
}

/**
 * Get comprehensive system snapshot for release bundles
 * @returns {Object} Complete system state
 */
function getSystemSnapshot() {
  const hw = detectAppleSilicon();
  const blas = detectBLASBackend();
  const python = checkPythonEnvironment();

  return {
    timestamp: new Date().toISOString(),
    hardware: hw,
    blas_backend: blas,
    python_env: python,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    memory_usage_mb: getMemoryUsageMB(),
    uptime_seconds: process.uptime()
  };
}

module.exports = {
  detectAppleSilicon,
  detectBLASBackend,
  checkPythonEnvironment,
  getMemoryUsageMB,
  trackPeakMemory,
  resetPeakMemory,
  createTimer,
  getSystemSnapshot
};
