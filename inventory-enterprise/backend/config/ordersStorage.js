/**
 * Orders Storage Configuration
 * NeuroPilot AI Enterprise V22.3
 *
 * Handles Google Drive PDF integration for vendor orders.
 * All vendor order PDFs are stored in Google Drive and referenced by file ID.
 *
 * Environment Variables:
 * - GDRIVE_ORDERS_ROOT_ID: Root folder ID for order PDFs (REQUIRED in production)
 * - GDRIVE_ORDERS_INCOMING_ID: Subfolder for incoming/unprocessed PDFs (optional)
 * - GDRIVE_ORDERS_PROCESSED_ID: Subfolder for processed PDFs (optional)
 * - GDRIVE_ORDERS_ERRORS_ID: Subfolder for error PDFs (optional)
 * - GDRIVE_ORDERS_ARCHIVE_ID: Subfolder for archived PDFs (optional)
 * - GDRIVE_STRICT_MODE: Set to 'true' to require GDRIVE_ORDERS_ROOT_ID in production
 *
 * @version 22.3
 * @author NeuroPilot AI Team
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  // Root folder ID - THE OFFICIAL ORDERS FOLDER
  // https://drive.google.com/drive/folders/1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ
  rootFolderId: process.env.GDRIVE_ORDERS_ROOT_ID || '1KxNg_d4xMNkkiVA5zQ4iw-an2KxZQmuZ',

  // Optional subfolders for organization
  incomingFolderId: process.env.GDRIVE_ORDERS_INCOMING_ID || null,
  processedFolderId: process.env.GDRIVE_ORDERS_PROCESSED_ID || null,
  errorsFolderId: process.env.GDRIVE_ORDERS_ERRORS_ID || null,
  archiveFolderId: process.env.GDRIVE_ORDERS_ARCHIVE_ID || null,

  // Google Drive URL patterns
  urlPatterns: {
    preview: 'https://drive.google.com/file/d/{fileId}/preview',
    view: 'https://drive.google.com/file/d/{fileId}/view',
    download: 'https://drive.google.com/uc?export=download&id={fileId}',
    embed: 'https://drive.google.com/file/d/{fileId}/preview?embedded=true',
    folderView: 'https://drive.google.com/drive/folders/{folderId}'
  },

  // Supported file types
  supportedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff'
  ],

  // Vendor source systems
  sourceSystems: ['sysco', 'gfs', 'usfoods', 'pfg', 'local', 'manual', 'other']
};

// ============================================
// VALIDATION - V22.3 PRODUCTION HARDENED
// ============================================

/**
 * Validate that required configuration is present
 * V22.3: Enhanced validation with strict production mode
 * @returns {Object} Validation result with warnings/errors
 */
function validateConfig() {
  const result = {
    valid: true,
    warnings: [],
    errors: []
  };

  const isProduction = process.env.NODE_ENV === 'production';
  const strictMode = process.env.GDRIVE_STRICT_MODE === 'true';

  // In production, root folder ID should be explicitly set
  if (isProduction) {
    if (!process.env.GDRIVE_ORDERS_ROOT_ID) {
      if (strictMode) {
        result.errors.push(
          'FATAL: GDRIVE_ORDERS_ROOT_ID is REQUIRED in production with strict mode. ' +
          'Set this environment variable to your organization\'s Google Drive folder ID.'
        );
        result.valid = false;
      } else {
        result.warnings.push(
          'WARNING: GDRIVE_ORDERS_ROOT_ID not set in production - using default folder ID. ' +
          'Set GDRIVE_STRICT_MODE=true to enforce this requirement.'
        );
      }
    }
  }

  // Validate folder ID format (should be alphanumeric + underscores/hyphens)
  const folderIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (CONFIG.rootFolderId && !folderIdPattern.test(CONFIG.rootFolderId)) {
    result.errors.push(`Invalid GDRIVE_ORDERS_ROOT_ID format: ${CONFIG.rootFolderId}`);
    result.valid = false;
  }

  // Validate folder ID length (Google Drive IDs are typically 28-44 chars)
  if (CONFIG.rootFolderId && (CONFIG.rootFolderId.length < 20 || CONFIG.rootFolderId.length > 50)) {
    result.warnings.push(
      `GDRIVE_ORDERS_ROOT_ID length (${CONFIG.rootFolderId.length}) is unusual. ` +
      'Google Drive folder IDs are typically 28-44 characters.'
    );
  }

  return result;
}

// ============================================
// URL BUILDERS
// ============================================

/**
 * Build Google Drive preview URL for a file
 * @param {string} fileId - Google Drive file ID
 * @returns {string} Preview URL
 */
function buildPreviewUrl(fileId) {
  if (!fileId) return null;
  return CONFIG.urlPatterns.preview.replace('{fileId}', fileId);
}

/**
 * Build Google Drive view URL for a file
 * @param {string} fileId - Google Drive file ID
 * @returns {string} View URL
 */
function buildViewUrl(fileId) {
  if (!fileId) return null;
  return CONFIG.urlPatterns.view.replace('{fileId}', fileId);
}

/**
 * Build Google Drive download URL for a file
 * @param {string} fileId - Google Drive file ID
 * @returns {string} Download URL
 */
function buildDownloadUrl(fileId) {
  if (!fileId) return null;
  return CONFIG.urlPatterns.download.replace('{fileId}', fileId);
}

/**
 * Build Google Drive embed URL for a file
 * @param {string} fileId - Google Drive file ID
 * @returns {string} Embed URL
 */
function buildEmbedUrl(fileId) {
  if (!fileId) return null;
  return CONFIG.urlPatterns.embed.replace('{fileId}', fileId);
}

/**
 * Build Google Drive folder view URL
 * @param {string} folderId - Google Drive folder ID
 * @returns {string} Folder URL
 */
function buildFolderUrl(folderId) {
  if (!folderId) return null;
  return CONFIG.urlPatterns.folderView.replace('{folderId}', folderId);
}

// ============================================
// FILE ID EXTRACTION
// ============================================

/**
 * Extract file ID from various Google Drive URL formats
 * Supports:
 * - https://drive.google.com/file/d/FILE_ID/view
 * - https://drive.google.com/file/d/FILE_ID/preview
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID
 * - Just the FILE_ID itself
 *
 * @param {string} input - URL or file ID
 * @returns {string|null} Extracted file ID or null
 */
function extractFileId(input) {
  if (!input) return null;

  input = input.trim();

  // Already a clean file ID?
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }

  // Pattern 1: /file/d/FILE_ID/
  const match1 = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];

  // Pattern 2: ?id=FILE_ID or &id=FILE_ID
  const match2 = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];

  // Pattern 3: /folders/FILE_ID
  const match3 = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match3) return match3[1];

  return null;
}

/**
 * Validate a Google Drive file ID format
 * @param {string} fileId - File ID to validate
 * @returns {boolean} True if valid format
 */
function isValidFileId(fileId) {
  if (!fileId) return false;
  // Google Drive file IDs are typically 28-44 characters, alphanumeric with underscores/hyphens
  return /^[a-zA-Z0-9_-]{20,50}$/.test(fileId);
}

// ============================================
// GETTERS
// ============================================

/**
 * Get the root folder ID for order PDFs
 * @returns {string} Root folder ID
 */
function getOrdersRootFolderId() {
  return CONFIG.rootFolderId;
}

/**
 * Get folder ID for incoming/unprocessed PDFs
 * @returns {string|null} Folder ID or null if not configured
 */
function getIncomingFolderId() {
  return CONFIG.incomingFolderId;
}

/**
 * Get folder ID for processed PDFs
 * @returns {string|null} Folder ID or null if not configured
 */
function getProcessedFolderId() {
  return CONFIG.processedFolderId;
}

/**
 * Get folder ID for error PDFs
 * @returns {string|null} Folder ID or null if not configured
 */
function getErrorsFolderId() {
  return CONFIG.errorsFolderId;
}

/**
 * Get folder ID for archived PDFs
 * @returns {string|null} Folder ID or null if not configured
 */
function getArchiveFolderId() {
  return CONFIG.archiveFolderId;
}

/**
 * Get list of supported source systems
 * @returns {string[]} List of source system identifiers
 */
function getSupportedSourceSystems() {
  return [...CONFIG.sourceSystems];
}

/**
 * Check if a source system is supported
 * @param {string} sourceSystem - Source system identifier
 * @returns {boolean} True if supported
 */
function isValidSourceSystem(sourceSystem) {
  if (!sourceSystem) return false;
  return CONFIG.sourceSystems.includes(sourceSystem.toLowerCase());
}

// ============================================
// INITIALIZATION LOGGING
// ============================================

// Log configuration on module load (non-sensitive info only)
const validation = validateConfig();
if (validation.warnings.length > 0) {
  validation.warnings.forEach(w => console.warn('[OrdersStorage]', w));
}
if (validation.errors.length > 0) {
  validation.errors.forEach(e => console.error('[OrdersStorage] ERROR:', e));
}
if (validation.valid) {
  console.log('[OrdersStorage] Configuration loaded successfully');
  console.log('[OrdersStorage] Root folder:', CONFIG.rootFolderId ? `...${CONFIG.rootFolderId.slice(-8)}` : 'NOT SET');
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // URL builders
  buildPreviewUrl,
  buildViewUrl,
  buildDownloadUrl,
  buildEmbedUrl,
  buildFolderUrl,

  // File ID utilities
  extractFileId,
  isValidFileId,

  // Configuration getters
  getOrdersRootFolderId,
  getIncomingFolderId,
  getProcessedFolderId,
  getErrorsFolderId,
  getArchiveFolderId,
  getSupportedSourceSystems,
  isValidSourceSystem,

  // Validation
  validateConfig,

  // Raw config (for testing)
  _CONFIG: CONFIG
};
