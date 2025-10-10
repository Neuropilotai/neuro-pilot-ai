/**
 * PDF Storage Utility for Owner Console
 * Handles PDF file storage, retrieval, and streaming
 *
 * @version 3.0.0
 * @author NeuroInnovate AI Team
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

// Base storage directory
const STORAGE_BASE = path.join(__dirname, '../../data/docs');

/**
 * Ensure directory exists, create if not
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Calculate SHA256 hash of buffer
 */
function calculateHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate unique file path based on tenant, date, and hash
 */
function generatePath(tenantId, hash, ext = 'pdf') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const relativePath = path.join(
    tenantId || 'default',
    String(year),
    month,
    `${hash}.${ext}`
  );

  return {
    absolute: path.join(STORAGE_BASE, relativePath),
    relative: relativePath
  };
}

/**
 * Save PDF file to storage
 * @param {Object} options
 * @param {string} options.tenantId - Tenant ID
 * @param {Buffer} options.fileBuffer - PDF file buffer
 * @param {string} options.originalName - Original filename
 * @param {string} options.createdBy - User ID who uploaded
 * @returns {Promise<Object>} Document metadata
 */
async function saveTenantPdf({ tenantId, fileBuffer, originalName, createdBy }) {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new Error('Invalid file buffer');
  }

  if (!originalName) {
    throw new Error('Original filename is required');
  }

  // Calculate hash
  const sha256 = calculateHash(fileBuffer);
  const size = fileBuffer.length;

  // Generate path
  const { absolute, relative } = generatePath(tenantId, sha256);

  // Ensure directory exists
  const dir = path.dirname(absolute);
  await ensureDir(dir);

  // Write file
  await fs.writeFile(absolute, fileBuffer);

  // Return metadata
  return {
    id: `DOC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    path: relative,
    filename: originalName,
    mimeType: 'application/pdf',
    sizeBytes: size,
    sha256,
    createdBy,
    createdAt: new Date().toISOString()
  };
}

/**
 * Read PDF file as stream
 * @param {string} relativePath - Relative path to PDF
 * @returns {ReadStream} File read stream
 */
function readPdfStream(relativePath) {
  const absolutePath = path.join(STORAGE_BASE, relativePath);

  if (!fsSync.existsSync(absolutePath)) {
    throw new Error('File not found');
  }

  return fsSync.createReadStream(absolutePath);
}

/**
 * Check if file exists
 * @param {string} relativePath - Relative path to PDF
 * @returns {Promise<boolean>}
 */
async function fileExists(relativePath) {
  try {
    const absolutePath = path.join(STORAGE_BASE, relativePath);
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file stats
 * @param {string} relativePath - Relative path to PDF
 * @returns {Promise<Object>} File stats
 */
async function getFileStats(relativePath) {
  const absolutePath = path.join(STORAGE_BASE, relativePath);
  const stats = await fs.stat(absolutePath);

  return {
    size: stats.size,
    created: stats.birthtime,
    modified: stats.mtime
  };
}

/**
 * Delete file (soft delete - just rename)
 * @param {string} relativePath - Relative path to PDF
 * @returns {Promise<void>}
 */
async function deleteFile(relativePath) {
  const absolutePath = path.join(STORAGE_BASE, relativePath);
  const deletedPath = `${absolutePath}.deleted`;

  try {
    await fs.rename(absolutePath, deletedPath);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}

module.exports = {
  saveTenantPdf,
  readPdfStream,
  fileExists,
  getFileStats,
  deleteFile,
  STORAGE_BASE
};
