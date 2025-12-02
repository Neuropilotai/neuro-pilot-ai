/**
 * Google Drive Service
 * NeuroPilot AI Enterprise v22.3
 *
 * Wrapper for Google Drive API operations.
 * Uses service account authentication for automated access.
 *
 * @version 22.3
 * @author NeuroPilot AI Team
 */

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

/**
 * GoogleDriveService Class
 * Manages Google Drive API operations
 */
class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.auth = null;
    this.initialized = false;
  }

  /**
   * Initialize the Google Drive service
   * Parses service account key from environment and creates auth client
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      console.warn('[GoogleDriveService] No GOOGLE_SERVICE_ACCOUNT_KEY found in environment');
      return;
    }

    try {
      // Parse service account key (can be raw JSON or base64 encoded)
      let keyData;
      try {
        keyData = JSON.parse(serviceAccountKey);
      } catch (e) {
        // Try base64 decode
        const decoded = Buffer.from(serviceAccountKey, 'base64').toString('utf8');
        keyData = JSON.parse(decoded);
      }

      // Create auth client
      // Note: We need full drive scope for accessing shared folders
      // The service account email must be granted Editor access to the folder
      this.auth = new google.auth.GoogleAuth({
        credentials: keyData,
        scopes: [
          'https://www.googleapis.com/auth/drive'  // Full access needed for shared folders
        ]
      });

      // Create Drive API client
      this.drive = google.drive({ version: 'v3', auth: this.auth });

      this.initialized = true;
      console.log('[GoogleDriveService] Initialized successfully');

    } catch (error) {
      console.error('[GoogleDriveService] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.drive) {
      throw new Error('Google Drive service not initialized. Check GOOGLE_SERVICE_ACCOUNT_KEY.');
    }
  }

  /**
   * List files in a Google Drive folder
   *
   * @param {string} folderId - Google Drive folder ID
   * @param {string} mimeType - Filter by MIME type (default: PDF)
   * @returns {Promise<Array>} Array of file metadata objects
   */
  async listFiles(folderId, mimeType = 'application/pdf') {
    await this.ensureInitialized();

    try {
      let query = `'${folderId}' in parents and trashed = false`;
      if (mimeType) {
        query += ` and mimeType = '${mimeType}'`;
      }

      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, createdTime, modifiedTime, size, parents)',
        orderBy: 'createdTime desc',
        pageSize: 100,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      const files = response.data.files || [];

      console.log(`[GoogleDriveService] Found ${files.length} files in folder ${folderId}`);

      return files.map(f => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        size: f.size ? parseInt(f.size) : 0,
        parents: f.parents
      }));

    } catch (error) {
      console.error('[GoogleDriveService] listFiles error:', error.message);
      throw error;
    }
  }

  /**
   * Download a file from Google Drive to local path
   *
   * @param {string} fileId - Google Drive file ID
   * @param {string} destPath - Local destination path
   * @returns {Promise<void>}
   */
  async downloadFile(fileId, destPath) {
    await this.ensureInitialized();

    try {
      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });

      // Get file stream
      const response = await this.drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );

      // Write to file
      const writeStream = require('fs').createWriteStream(destPath);

      await new Promise((resolve, reject) => {
        response.data
          .on('error', reject)
          .pipe(writeStream)
          .on('error', reject)
          .on('finish', resolve);
      });

      console.log(`[GoogleDriveService] Downloaded ${fileId} to ${destPath}`);

    } catch (error) {
      console.error('[GoogleDriveService] downloadFile error:', error.message);
      throw error;
    }
  }

  /**
   * Move a file to a different folder in Google Drive
   *
   * @param {string} fileId - Google Drive file ID
   * @param {string} destFolderId - Destination folder ID
   * @returns {Promise<void>}
   */
  async moveFile(fileId, destFolderId) {
    await this.ensureInitialized();

    try {
      // Get current parents
      const file = await this.drive.files.get({
        fileId,
        fields: 'parents',
        supportsAllDrives: true
      });

      const previousParents = file.data.parents?.join(',') || '';

      // Move file by removing from current parents and adding to new parent
      await this.drive.files.update({
        fileId,
        addParents: destFolderId,
        removeParents: previousParents,
        fields: 'id, parents',
        supportsAllDrives: true
      });

      console.log(`[GoogleDriveService] Moved ${fileId} to folder ${destFolderId}`);

    } catch (error) {
      console.error('[GoogleDriveService] moveFile error:', error.message);
      throw error;
    }
  }

  /**
   * Get file metadata from Google Drive
   *
   * @param {string} fileId - Google Drive file ID
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileId) {
    await this.ensureInitialized();

    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, createdTime, modifiedTime, size, parents, webViewLink, webContentLink',
        supportsAllDrives: true
      });

      const file = response.data;

      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        size: file.size ? parseInt(file.size) : 0,
        parents: file.parents,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink
      };

    } catch (error) {
      console.error('[GoogleDriveService] getFileMetadata error:', error.message);
      throw error;
    }
  }

  /**
   * Check if a file exists in a folder
   *
   * @param {string} folderId - Folder ID to search in
   * @param {string} fileName - File name to search for
   * @returns {Promise<Object|null>} File metadata if found, null otherwise
   */
  async findFileByName(folderId, fileName) {
    await this.ensureInitialized();

    try {
      const query = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;

      const response = await this.drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, createdTime, size)',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      const files = response.data.files || [];

      if (files.length > 0) {
        return {
          id: files[0].id,
          name: files[0].name,
          mimeType: files[0].mimeType,
          createdTime: files[0].createdTime,
          size: files[0].size ? parseInt(files[0].size) : 0
        };
      }

      return null;

    } catch (error) {
      console.error('[GoogleDriveService] findFileByName error:', error.message);
      throw error;
    }
  }

  /**
   * Create a folder in Google Drive
   *
   * @param {string} folderName - Name of the folder to create
   * @param {string} parentFolderId - Parent folder ID (optional)
   * @returns {Promise<string>} Created folder ID
   */
  async createFolder(folderName, parentFolderId = null) {
    await this.ensureInitialized();

    try {
      const fileMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder'
      };

      if (parentFolderId) {
        fileMetadata.parents = [parentFolderId];
      }

      const response = await this.drive.files.create({
        resource: fileMetadata,
        fields: 'id',
        supportsAllDrives: true
      });

      console.log(`[GoogleDriveService] Created folder ${folderName} with ID ${response.data.id}`);

      return response.data.id;

    } catch (error) {
      console.error('[GoogleDriveService] createFolder error:', error.message);
      throw error;
    }
  }

  /**
   * Test connection to Google Drive
   *
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      await this.ensureInitialized();

      // Try to get About info
      const response = await this.drive.about.get({
        fields: 'user'
      });

      console.log(`[GoogleDriveService] Connected as: ${response.data.user?.emailAddress}`);
      return true;

    } catch (error) {
      console.error('[GoogleDriveService] testConnection failed:', error.message);
      return false;
    }
  }
}

// Export singleton instance
module.exports = new GoogleDriveService();
module.exports.GoogleDriveService = GoogleDriveService;
