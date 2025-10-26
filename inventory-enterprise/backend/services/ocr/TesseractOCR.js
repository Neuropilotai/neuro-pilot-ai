/**
 * Tesseract OCR Service
 *
 * Pure Node.js wrapper for Tesseract OCR with timeout and error handling
 * Supports both local tesseract binary and tesseract.js fallback
 *
 * @version 15.5.0
 * @author NeuroPilot AI Team
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../config/logger');

// ============================================================================
// CONFIGURATION
// ============================================================================

const OCR_CONFIG = {
  enabled: process.env.OCR_ENABLED !== 'false', // Default enabled
  timeout: parseInt(process.env.OCR_TIMEOUT_MS) || 30000, // 30 seconds
  tesseractPath: process.env.TESSERACT_PATH || 'tesseract', // System tesseract
  language: process.env.OCR_LANGUAGE || 'eng',
  dpi: parseInt(process.env.OCR_DPI) || 300,
  psm: parseInt(process.env.OCR_PSM) || 3, // Page segmentation mode (3 = auto)
  tempDir: process.env.OCR_TEMP_DIR || '/tmp/neuropilot-ocr'
};

// ============================================================================
// OCR ENGINE
// ============================================================================

class TesseractOCR {
  constructor(config = {}) {
    this.config = { ...OCR_CONFIG, ...config };
    this.initialized = false;
  }

  /**
   * Initialize OCR engine (ensure temp dir exists, check tesseract binary)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create temp directory if it doesn't exist
      await fs.mkdir(this.config.tempDir, { recursive: true });

      // Check if tesseract is available
      if (this.config.enabled) {
        const available = await this.checkTesseractAvailable();
        if (!available) {
          logger.warn('TesseractOCR: Tesseract binary not found, OCR will be disabled', {
            path: this.config.tesseractPath
          });
          this.config.enabled = false;
        } else {
          logger.info('TesseractOCR: Initialized successfully', {
            language: this.config.language,
            timeout: this.config.timeout
          });
        }
      }

      this.initialized = true;
    } catch (error) {
      logger.error('TesseractOCR: Initialization failed', {
        error: error.message,
        stack: error.stack
      });
      this.config.enabled = false;
    }
  }

  /**
   * Check if tesseract binary is available
   */
  async checkTesseractAvailable() {
    return new Promise((resolve) => {
      const proc = spawn(this.config.tesseractPath, ['--version']);

      proc.on('error', () => resolve(false));
      proc.on('close', (code) => resolve(code === 0));

      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Extract text from image file using Tesseract OCR
   *
   * @param {string} imagePath - Path to image file
   * @param {Object} options - OCR options
   * @param {string} [options.language] - OCR language (default: 'eng')
   * @param {number} [options.psm] - Page segmentation mode
   * @param {number} [options.dpi] - DPI for image processing
   * @returns {Promise<Object>} { text, confidence, duration_ms }
   */
  async extractText(imagePath, options = {}) {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.config.enabled) {
      return {
        text: '',
        confidence: 0,
        duration_ms: Date.now() - startTime,
        engine: 'none',
        error: 'OCR is disabled or tesseract not available'
      };
    }

    try {
      // Verify file exists
      await fs.access(imagePath);

      const language = options.language || this.config.language;
      const psm = options.psm !== undefined ? options.psm : this.config.psm;
      const dpi = options.dpi || this.config.dpi;

      // Generate output path in temp directory
      const outputBase = path.join(
        this.config.tempDir,
        `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      );

      // Build tesseract command
      const args = [
        imagePath,
        outputBase,
        '-l', language,
        '--psm', psm.toString(),
        '--dpi', dpi.toString(),
        'txt' // Output format
      ];

      logger.debug('TesseractOCR: Starting OCR', {
        imagePath,
        language,
        psm,
        dpi
      });

      // Run tesseract with timeout
      const result = await this.runTesseract(args);

      // Read output text file
      const outputFile = `${outputBase}.txt`;
      let text = '';
      try {
        text = await fs.readFile(outputFile, 'utf8');
        // Clean up output file
        await fs.unlink(outputFile).catch(() => {});
      } catch (readError) {
        logger.error('TesseractOCR: Failed to read output', {
          error: readError.message,
          outputFile
        });
      }

      const duration_ms = Date.now() - startTime;

      // Calculate confidence (basic estimate from output)
      const confidence = this.estimateConfidence(text, result.stderr);

      logger.info('TesseractOCR: Text extracted', {
        imagePath,
        textLength: text.length,
        confidence,
        duration_ms
      });

      return {
        text: text.trim(),
        confidence,
        duration_ms,
        engine: 'tesseract',
        language,
        psm,
        raw_output: result.stdout
      };

    } catch (error) {
      const duration_ms = Date.now() - startTime;

      logger.error('TesseractOCR: Extraction failed', {
        error: error.message,
        imagePath,
        duration_ms
      });

      return {
        text: '',
        confidence: 0,
        duration_ms,
        engine: 'tesseract',
        error: error.message
      };
    }
  }

  /**
   * Run tesseract command with timeout
   */
  async runTesseract(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.tesseractPath, args);

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
        reject(new Error(`OCR timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        if (!timedOut) {
          reject(error);
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (timedOut) return; // Already rejected

        if (code !== 0) {
          reject(new Error(`Tesseract exited with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr, code });
        }
      });
    });
  }

  /**
   * Estimate confidence from OCR output
   * (Tesseract doesn't always provide confidence, so we estimate)
   */
  estimateConfidence(text, stderr) {
    // Basic heuristics for confidence estimation
    if (!text || text.length === 0) return 0;

    let confidence = 0.7; // Base confidence

    // Check for warnings in stderr
    if (stderr && stderr.includes('Warning')) {
      confidence -= 0.1;
    }

    // Check text quality indicators
    const alphanumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length;
    confidence *= alphanumericRatio;

    // Check for excessive special characters (usually indicates poor OCR)
    const specialCharRatio = (text.match(/[^a-zA-Z0-9\s.,!?$%-]/g) || []).length / text.length;
    if (specialCharRatio > 0.3) {
      confidence *= 0.5;
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Extract text from PDF (convert to images first, then OCR)
   *
   * @param {string} pdfPath - Path to PDF file
   * @param {Object} options - Options
   * @returns {Promise<Object>} { text, confidence, pages, duration_ms }
   */
  async extractTextFromPDF(pdfPath, options = {}) {
    const startTime = Date.now();

    try {
      // Check if PDF is text-based first
      const isTextPDF = await this.isTextBasedPDF(pdfPath);

      if (isTextPDF) {
        // Extract text directly without OCR
        const text = await this.extractTextFromTextPDF(pdfPath);
        return {
          text,
          confidence: 1.0,
          pages: 1,
          duration_ms: Date.now() - startTime,
          engine: 'pdftotext'
        };
      }

      // Image-based PDF - requires OCR
      logger.info('TesseractOCR: PDF appears to be image-based, OCR required', { pdfPath });

      // For now, return error - full PDF OCR requires additional tools (pdf2image)
      return {
        text: '',
        confidence: 0,
        pages: 0,
        duration_ms: Date.now() - startTime,
        engine: 'none',
        error: 'Image-based PDF OCR requires pdf2image tool (not yet implemented)'
      };

    } catch (error) {
      logger.error('TesseractOCR: PDF extraction failed', {
        error: error.message,
        pdfPath
      });

      return {
        text: '',
        confidence: 0,
        pages: 0,
        duration_ms: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Check if PDF is text-based (not scanned image)
   */
  async isTextBasedPDF(pdfPath) {
    // Quick heuristic: check file size and try text extraction
    try {
      const stats = await fs.stat(pdfPath);

      // Very large files are likely image-based
      if (stats.size > 50 * 1024 * 1024) { // 50MB
        return false;
      }

      // Try extracting text with pdftotext (if available)
      const text = await this.extractTextFromTextPDF(pdfPath);
      return text.length > 100; // If we got substantial text, it's text-based

    } catch (error) {
      return false;
    }
  }

  /**
   * Extract text from text-based PDF using pdftotext
   */
  async extractTextFromTextPDF(pdfPath) {
    return new Promise((resolve, reject) => {
      const proc = spawn('pdftotext', [pdfPath, '-']);

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('PDF text extraction timeout'));
      }, 10000);

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (code !== 0) {
          reject(new Error(`pdftotext failed: ${stderr}`));
        } else {
          resolve(stdout);
        }
      });
    });
  }

  /**
   * Cleanup temp files
   */
  async cleanup() {
    try {
      const files = await fs.readdir(this.config.tempDir);

      // Delete files older than 1 hour
      const now = Date.now();
      for (const file of files) {
        const filePath = path.join(this.config.tempDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > 3600000) { // 1 hour
          await fs.unlink(filePath).catch(() => {});
        }
      }
    } catch (error) {
      logger.error('TesseractOCR: Cleanup failed', { error: error.message });
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

const ocrEngine = new TesseractOCR();

// Cleanup temp files periodically
setInterval(() => {
  ocrEngine.cleanup().catch(() => {});
}, 3600000); // Every hour

module.exports = ocrEngine;
module.exports.TesseractOCR = TesseractOCR;
