# ☁️ Cloud PDF Handling - Isolation Architecture

**NeuroInnovate Inventory Enterprise v3.2.0**
**Date:** 2025-10-09
**Status:** Current Implementation + Recommended Future Architecture

---

## 🎯 OBJECTIVE

Document isolation boundaries for PDF handling to prevent data leaks while enabling optional cloud features.

---

## 1. CURRENT ARCHITECTURE (Local-Only Storage)

### 1.1 System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                             │
│                        (LOCAL ONLY)                                  │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Browser    │
│  (Frontend)  │
└──────┬───────┘
       │ HTTPS POST /api/inventory/upload-pdf
       │ (multipart/form-data)
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Express Server (localhost:8083)                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  middleware/auth.js                                            │  │
│  │  ├─ authenticateToken() → Verify JWT                          │  │
│  │  └─ Check user permissions                                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  routes/inventory.js                                           │  │
│  │  POST /upload-pdf                                              │  │
│  │  ├─ Validate file type (PDF only)                             │  │
│  │  ├─ Validate file size (<50MB)                                │  │
│  │  ├─ Extract multipart data                                    │  │
│  │  └─ Call pdfStore.saveTenantPdf()                             │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  utils/pdfStore.js                                             │  │
│  │                                                                 │  │
│  │  saveTenantPdf({ tenantId, fileBuffer, ... })                 │  │
│  │  ├─ Compute SHA-256 hash                                      │  │
│  │  ├─ Generate local path: data/docs/{tenant}/{year}/{month}/   │  │
│  │  ├─ fs.writeFile(localPath, fileBuffer)  ← LOCAL WRITE ONLY   │  │
│  │  └─ Return metadata { id, path, sha256, ... }                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                ▼                                      │
└──────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    LOCAL FILESYSTEM (ENCRYPTED)                        │
│                                                                        │
│  ~/neuro-pilot-ai/inventory-enterprise/backend/data/docs/             │
│    ├── tenant_1/                                                      │
│    │   ├── 2025/                                                      │
│    │   │   ├── 10/                                                    │
│    │   │   │   ├── 8f3a...2b1c.pdf  (SHA-256 filename)              │
│    │   │   │   └── a4d7...6e9f.pdf                                   │
│    │   │   └── 09/                                                    │
│    │   └── 2024/                                                      │
│    └── tenant_2/                                                      │
│        └── ...                                                         │
│                                                                        │
│  Permissions: 600 (owner read/write only)                             │
│  Encryption: Optional (macOS FileVault or SQLCipher encryption)       │
└────────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────┐
│                        SECURITY BOUNDARIES                     │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  🔒 Boundary 1: Authentication (JWT required)                │
│  🔒 Boundary 2: Authorization (tenant isolation)             │
│  🔒 Boundary 3: File validation (PDF only, size limits)      │
│  🔒 Boundary 4: Local filesystem (no cloud upload)           │
│  🔒 Boundary 5: File permissions (600 owner-only)            │
│                                                               │
│  ✅ ISOLATION GUARANTEE:                                     │
│     PDFs NEVER leave local machine                           │
│     No AWS SDK, Azure SDK, or Google Cloud SDK imported      │
│     All writes to local filesystem only                      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Analysis

**Input**:
```javascript
// Client uploads PDF
POST /api/inventory/upload-pdf
Content-Type: multipart/form-data
Authorization: Bearer <JWT>

{
  file: <PDF binary>,
  tenantId: "tenant_abc123",
  originalName: "invoice_2025_10_09.pdf"
}
```

**Processing**:
```javascript
// backend/utils/pdfStore.js
const STORAGE_BASE = path.join(__dirname, '../../data/docs');  // LOCAL PATH

async function saveTenantPdf({ tenantId, fileBuffer, originalName, createdBy }) {
  // 1. Compute hash (local CPU operation)
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 2. Generate local path (NO network calls)
  const { absolute, relative } = generatePath(tenantId, sha256);
  // absolute = ~/neuro-pilot-ai/inventory-enterprise/backend/data/docs/tenant_abc123/2025/10/8f3a...pdf

  // 3. Write to LOCAL filesystem (NO cloud upload)
  await fs.writeFile(absolute, fileBuffer);  // ← LOCAL ONLY

  // 4. Return metadata (stored in local database)
  return {
    id: `DOC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    path: relative,  // Relative path for database
    filename: originalName,
    mimeType: 'application/pdf',
    sizeBytes: fileBuffer.length,
    sha256,
    createdBy,
    createdAt: new Date().toISOString()
  };
}
```

**Output**:
```javascript
// Metadata stored in SQLite database (local)
{
  "id": "DOC-1696857600000-8f3a2b1c",
  "path": "tenant_abc123/2025/10/8f3a...2b1c.pdf",
  "filename": "invoice_2025_10_09.pdf",
  "sizeBytes": 245678,
  "sha256": "8f3a2b1c...",
  "createdBy": "user@example.com",
  "createdAt": "2025-10-09T10:30:00.000Z"
}

// PDF binary stored at:
// ~/neuro-pilot-ai/inventory-enterprise/backend/data/docs/tenant_abc123/2025/10/8f3a...2b1c.pdf
```

### 1.3 Verification

**Proof of Local-Only Storage**:

```bash
# 1. Check for cloud SDK imports
cd ~/neuro-pilot-ai/inventory-enterprise/backend
grep -r "aws-sdk\|@aws-sdk\|azure-storage\|@google-cloud" utils/pdfStore.js routes/inventory.js
# Expected: No matches

# 2. Check for network calls in pdfStore
grep -r "axios\|fetch\|http\.request\|https\.request" utils/pdfStore.js
# Expected: No matches

# 3. Verify storage location
ls -la data/docs/
# Expected: Local directories only, no cloud references

# 4. Monitor file writes during upload
sudo fs_usage -f filesys | grep -E "data/docs" &
# Upload a PDF via UI
# Expected: Only local write operations, no network activity
```

---

## 2. RECOMMENDED ARCHITECTURE (Secure Cloud Option)

### 2.1 Future-Proof Design (If Cloud Storage Needed)

```
┌─────────────────────────────────────────────────────────────────────┐
│            RECOMMENDED CLOUD ARCHITECTURE (FUTURE)                   │
│                 (Signed URLs + Serverless Proxy)                     │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│   Browser    │
│  (Frontend)  │
└──────┬───────┘
       │ 1. Request upload URL
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Express Server (localhost:8083)                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  POST /api/inventory/request-upload-url                        │  │
│  │  ├─ Authenticate user                                          │  │
│  │  ├─ Verify tenant permissions                                  │  │
│  │  ├─ Generate signed URL (short-lived: 15 minutes)             │  │
│  │  └─ Return { signedUrl, uploadId, expiresAt }                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
       │
       │ 2. Return signed URL (NO credentials in URL)
       ▼
┌──────────────┐
│   Browser    │  3. Upload PDF DIRECTLY to serverless proxy
└──────┬───────┘
       │ PUT {signedUrl}
       │ Body: <PDF binary>
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│            SERVERLESS PROXY (AWS Lambda / Cloudflare Worker)         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Validates:                                                     │  │
│  │  ├─ Signed URL signature (HMAC-SHA256)                        │  │
│  │  ├─ Expiration timestamp (<15 min old)                        │  │
│  │  ├─ File type (PDF only)                                      │  │
│  │  ├─ File size (<50MB)                                         │  │
│  │  ├─ Content sanitization (remove macros, scripts)            │  │
│  │  └─ SHA-256 hash computation                                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                ▼                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  If valid:                                                      │  │
│  │  ├─ Store PDF in S3 with server-side encryption (SSE-KMS)    │  │
│  │  ├─ Generate time-limited download URL (24h expiry)           │  │
│  │  └─ Return { uploadId, downloadUrl, sha256 }                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
       │
       │ 4. Return upload confirmation
       ▼
┌──────────────┐
│   Browser    │  5. Notify backend of successful upload
└──────┬───────┘
       │ POST /api/inventory/confirm-upload
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Express Server (localhost:8083)                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  POST /api/inventory/confirm-upload                            │  │
│  │  ├─ Verify uploadId matches original request                  │  │
│  │  ├─ Store metadata in database (downloadUrl, sha256, ...)     │  │
│  │  └─ Link PDF to inventory item                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘


┌───────────────────────────────────────────────────────────────┐
│                    ISOLATION BOUNDARIES (CLOUD)                │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  🔒 Boundary 1: Signed URL (HMAC-SHA256, 15min TTL)         │
│  🔒 Boundary 2: Serverless proxy (sanitization)             │
│  🔒 Boundary 3: S3 encryption (SSE-KMS)                      │
│  🔒 Boundary 4: Time-limited download (24h expiry)           │
│  🔒 Boundary 5: No credentials in backend (signed URLs only) │
│                                                               │
│  ✅ SECURITY GUARANTEES:                                     │
│     ✓ Backend NEVER holds AWS/cloud credentials             │
│     ✓ PDFs sanitized before storage                         │
│     ✓ Time-limited access (auto-expire)                     │
│     ✓ No database/config data sent to cloud                 │
│     ✓ Audit trail for all uploads                           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 Signed URL Generation (Backend)

**Implementation** (if cloud storage enabled):

```javascript
// backend/routes/inventory.js

const crypto = require('crypto');

// POST /api/inventory/request-upload-url
router.post('/request-upload-url', authenticateToken, async (req, res) => {
  const { filename, mimeType, sizeBytes } = req.body;

  // Validate
  if (mimeType !== 'application/pdf') {
    return res.status(400).json({ error: 'Only PDF files allowed' });
  }

  if (sizeBytes > 50 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large (max 50MB)' });
  }

  // Generate upload ID
  const uploadId = `upload_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

  // Generate signed URL (15 minute expiry)
  const expiresAt = Date.now() + (15 * 60 * 1000);
  const payload = {
    uploadId,
    tenantId: req.user.tenantId,
    filename,
    sizeBytes,
    expiresAt
  };

  // Sign with HMAC-SHA256
  const secret = process.env.UPLOAD_SIGNING_SECRET;  // From Keychain
  const signature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  // Construct signed URL (serverless proxy endpoint)
  const signedUrl = `https://upload-proxy.yourcompany.com/upload?` +
    `uploadId=${uploadId}&` +
    `tenantId=${req.user.tenantId}&` +
    `expires=${expiresAt}&` +
    `signature=${signature}`;

  // Store pending upload in database
  await db.run(
    `INSERT INTO pending_uploads (upload_id, user_id, filename, expires_at)
     VALUES (?, ?, ?, ?)`,
    [uploadId, req.user.id, filename, new Date(expiresAt).toISOString()]
  );

  res.json({
    uploadId,
    signedUrl,
    expiresAt: new Date(expiresAt).toISOString()
  });
});
```

### 2.3 Serverless Proxy (AWS Lambda / Cloudflare Worker)

```javascript
// serverless-proxy/handler.js

export async function handleUpload(request) {
  // 1. Parse query parameters
  const { uploadId, tenantId, expires, signature } = request.query;

  // 2. Verify signature
  const payload = JSON.stringify({ uploadId, tenantId, expires });
  const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

  if (signature !== expectedSig) {
    return new Response('Invalid signature', { status: 403 });
  }

  // 3. Check expiration
  if (Date.now() > parseInt(expires)) {
    return new Response('Upload URL expired', { status: 410 });
  }

  // 4. Get PDF from request body
  const pdfBuffer = await request.arrayBuffer();

  // 5. Sanitize (remove macros, JavaScript)
  const sanitized = await sanitizePDF(pdfBuffer);

  // 6. Upload to S3 with encryption
  const s3Key = `${tenantId}/${uploadId}.pdf`;
  await s3.putObject({
    Bucket: 'inventory-pdfs-encrypted',
    Key: s3Key,
    Body: sanitized,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: KMS_KEY_ID,
    ContentType: 'application/pdf'
  });

  // 7. Generate time-limited download URL (24h)
  const downloadUrl = await s3.getSignedUrl('getObject', {
    Bucket: 'inventory-pdfs-encrypted',
    Key: s3Key,
    Expires: 86400  // 24 hours
  });

  // 8. Compute hash
  const sha256 = crypto.createHash('sha256').update(sanitized).digest('hex');

  return new Response(JSON.stringify({
    uploadId,
    downloadUrl,
    sha256,
    expiresAt: new Date(Date.now() + 86400000).toISOString()
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

---

## 3. SECURITY COMPARISON

| Feature | Current (Local) | Recommended (Cloud) |
|---------|----------------|---------------------|
| **Data Location** | Local filesystem | S3 with SSE-KMS encryption |
| **Credentials** | None (no cloud) | None in backend (signed URLs) |
| **Access Control** | File permissions (600) | IAM roles + KMS keys |
| **Time-Limited** | N/A (local files) | 24h auto-expiring URLs |
| **Sanitization** | Basic (file type check) | Advanced (macro/script removal) |
| **Backup** | Manual (Time Machine) | Automatic (S3 versioning) |
| **Cost** | Free (local storage) | ~$0.023/GB/month + transfer |
| **Scalability** | Limited (disk space) | Unlimited |
| **Audit Trail** | Database only | CloudTrail + database |
| **Leak Risk** | ✅ **ZERO** (local only) | ⚠️ **LOW** (with proper config) |

---

## 4. IMPLEMENTATION RECOMMENDATION

### 4.1 Current System (DO NOT CHANGE)

**Status**: ✅ **SECURE** - Keep current local-only architecture

**Reasons**:
1. Zero cloud leak risk (no network calls)
2. No ongoing costs
3. Complete data sovereignty
4. Compliant with data residency requirements
5. No third-party dependencies

**Only change if**:
- Multi-device access required
- Offsite backup needed
- Collaborative PDF editing required

### 4.2 If Cloud Storage Required (Future)

**Implementation Plan**:

1. **Phase 1**: Serverless proxy setup (1 week)
   - Deploy AWS Lambda or Cloudflare Worker
   - Implement signature verification
   - Add PDF sanitization

2. **Phase 2**: Backend integration (3 days)
   - Add signed URL generation
   - Implement upload confirmation endpoint
   - Update pdfStore.js to support dual mode

3. **Phase 3**: Frontend updates (2 days)
   - Modify upload flow for signed URLs
   - Add progress indicators
   - Handle errors gracefully

4. **Phase 4**: Security audit (1 week)
   - Penetration testing
   - Signed URL brute-force testing
   - Expiration validation
   - Sanitization verification

**Total Effort**: ~2.5 weeks

---

## 5. VERIFICATION COMMANDS

### 5.1 Current System (Local-Only)

```bash
# Verify no cloud SDKs installed
cd ~/neuro-pilot-ai/inventory-enterprise/backend
grep -E "aws-sdk|@aws-sdk|azure-storage|@google-cloud" package.json
# Expected: No matches

# Verify pdfStore.js is local-only
grep -E "axios|fetch|http\.request" utils/pdfStore.js
# Expected: No matches

# Check PDF storage location
ls -la data/docs/
# Expected: Local directories only

# Verify file permissions
find data/docs -type f -name "*.pdf" -exec ls -l {} \;
# Expected: -rw------- (600)

# Monitor network during PDF upload (requires active upload)
sudo tcpdump -i any -n 'not host 127.0.0.1' &
# Upload PDF via UI
# Expected: No outbound traffic
```

### 5.2 Future Cloud System (If Implemented)

```bash
# Verify signed URL generation
curl -X POST http://localhost:8083/api/inventory/request-upload-url \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.pdf","mimeType":"application/pdf","sizeBytes":1024}'

# Expected response:
# {
#   "uploadId": "upload_...",
#   "signedUrl": "https://upload-proxy.yourcompany.com/upload?...",
#   "expiresAt": "2025-10-09T11:00:00.000Z"
# }

# Verify signature (should fail with wrong signature)
curl "https://upload-proxy.yourcompany.com/upload?uploadId=test&tenantId=abc&expires=9999999999&signature=invalid" \
  -X PUT --data-binary "@test.pdf"
# Expected: 403 Forbidden

# Verify expiration (use expired timestamp)
curl "https://upload-proxy.yourcompany.com/upload?uploadId=test&tenantId=abc&expires=1000000000&signature=..." \
  -X PUT --data-binary "@test.pdf"
# Expected: 410 Gone
```

---

## 6. DECISION MATRIX

**Should You Enable Cloud Storage?**

| Requirement | Local Only | Cloud (Recommended) |
|-------------|-----------|---------------------|
| Single-device usage | ✅ YES | ⚠️ Overkill |
| Multi-device access | ❌ NO | ✅ YES |
| Offsite backup | ⚠️ Manual | ✅ Automatic |
| Cost sensitivity | ✅ Free | ⚠️ ~$5-20/month |
| Data residency laws | ✅ Full control | ⚠️ Depends on region |
| Collaborative editing | ❌ NO | ✅ YES |
| Audit trail | ⚠️ Local only | ✅ CloudTrail |

**Recommendation**: **Stay with local-only** unless you need multi-device access or offsite backup.

---

## 📊 SUMMARY

### Current Architecture (v3.2.0)

✅ **SECURE** - Local-only storage with zero cloud leak risk

**Key Points**:
- PDFs stored in `data/docs/` (local filesystem)
- No cloud SDKs imported
- No network calls in pdfStore.js
- File permissions: 600 (owner-only)
- SHA-256 checksums for integrity

### Recommended Cloud Architecture (Future)

⚠️ **OPTIONAL** - Only if multi-device access needed

**Key Points**:
- Signed URLs with HMAC-SHA256
- Serverless proxy for sanitization
- S3 with SSE-KMS encryption
- Time-limited access (24h expiry)
- No credentials in backend

---

**Document Status**: 🟢 **COMPLETE**
**Last Updated**: 2025-10-09
**Next Review**: When cloud storage requirements change
