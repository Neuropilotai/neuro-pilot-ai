# Google Drive Path Configuration
## Group 7 Content Production

---

## 📁 Your Local Google Drive Mount

**Base Path:**
```
/Users/davidmikulis/Library/CloudStorage/GoogleDrive-neuro.pilot.ai@gmail.com/My Drive/
```

**Google Account:** `neuro.pilot.ai@gmail.com`

---

## 🗂️ Folder Structure

### Production Folders

```
My Drive/
└── Group7/
    └── Production/
        ├── CSV_Inputs/
        │   └── GROUP7_CANVA_BATCH_2025-10-30.csv  ← Upload here
        ├── Voice/
        │   └── 2025-10-30/
        │       ├── GRP7_LYRA_001_VO.mp3
        │       ├── GRP7_ATLAS_002_VO.mp3
        │       ├── GRP7_NOVA_003_VO.mp3
        │       ├── GRP7_CIPHER_004_VO.mp3
        │       ├── GRP7_ECHO_005_VO.mp3
        │       ├── GRP7_QUANTUM_006_VO.mp3
        │       └── GRP7_NEXUS_007_VO.mp3
        ├── Videos/
        │   └── 2025-10-30/
        │       ├── GRP7_LYRA_001_FINAL.mp4
        │       ├── GRP7_ATLAS_002_FINAL.mp4
        │       ├── GRP7_NOVA_003_FINAL.mp4
        │       ├── GRP7_CIPHER_004_FINAL.mp4
        │       ├── GRP7_ECHO_005_FINAL.mp4
        │       ├── GRP7_QUANTUM_006_FINAL.mp4
        │       └── GRP7_NEXUS_007_FINAL.mp4
        ├── Captions/
        │   └── 2025-10-30/
        │       ├── GRP7_LYRA_001_CAPTIONS.srt
        │       ├── GRP7_ATLAS_002_CAPTIONS.srt
        │       ├── GRP7_NOVA_003_CAPTIONS.srt
        │       ├── GRP7_CIPHER_004_CAPTIONS.srt
        │       ├── GRP7_ECHO_005_CAPTIONS.srt
        │       ├── GRP7_QUANTUM_006_CAPTIONS.srt
        │       └── GRP7_NEXUS_007_CAPTIONS.srt
        └── Thumbnails/
            └── 2025-10-30/
                ├── GRP7_LYRA_001_THUMB.jpg
                ├── GRP7_ATLAS_002_THUMB.jpg
                ├── GRP7_NOVA_003_THUMB.jpg
                ├── GRP7_CIPHER_004_THUMB.jpg
                ├── GRP7_ECHO_005_THUMB.jpg
                ├── GRP7_QUANTUM_006_THUMB.jpg
                └── GRP7_NEXUS_007_THUMB.jpg
```

### Config Folders

```
My Drive/
└── Group7/
    └── Config/
        ├── POLICY_JSON_V1.0.json
        ├── POLICY_JSON_V1.1.json
        ├── POLICY_JSON_V1.2.json
        └── POLICY_JSON_CURRENT.json  ← Active policy
```

### Analytics Folders

```
My Drive/
└── Group7/
    └── Analytics/
        ├── Daily_Reports/
        │   ├── 2025-10-30_analytics.json
        │   └── 2025-10-31_analytics.json
        └── Weekly_Reviews/
            └── 2025-W44_policy_review.md
```

---

## 🔗 Make.com Google Drive Module Configuration

### Module: Upload File to Google Drive

**Settings:**
- **Drive:** My Drive (connected to neuro.pilot.ai@gmail.com)
- **Folder Path:** `/Group7/Production/Videos/{{formatDate(now; "YYYY-MM-DD")}}/`
- **File Name:** `{{video_id}}_FINAL.mp4`
- **Convert:** No
- **Create Folders:** Yes (auto-create date folders)

### Module: Download File from Google Drive

**Settings:**
- **Drive:** My Drive
- **File Path:** `/Group7/Production/CSV_Inputs/GROUP7_CANVA_BATCH_{{formatDate(now; "YYYY-MM-DD")}}.csv`
- **Parse:** Yes (if CSV)

---

## 📤 Upload CSV to Google Drive Now

### Option 1: Manual Upload (Quick Start)

1. **Open Google Drive** in browser (drive.google.com)
2. **Navigate to:** My Drive → Group7 → Production → CSV_Inputs
3. **Upload** the file: `GROUP7_CANVA_BATCH_2025-10-30.csv`
4. **Verify** it appears in the folder

### Option 2: Local Sync (Automatic)

1. **Copy** the CSV file to your local Google Drive folder:
   ```bash
   cp /Users/davidmikulis/neuro-pilot-ai/GROUP7_CANVA_BATCH_2025-10-30.csv \
      "/Users/davidmikulis/Library/CloudStorage/GoogleDrive-neuro.pilot.ai@gmail.com/My Drive/Group7/Production/CSV_Inputs/"
   ```

2. **Wait** for Google Drive to sync (usually ~10-30 seconds)

3. **Verify** in browser: drive.google.com

---

## 🔐 Sharing & Permissions

### Make.com Access

1. **Go to:** drive.google.com
2. **Right-click** on `Group7` folder
3. **Share** → Add `make.com` service account email
4. **Permission:** Editor

### Metricool Access (for file uploads)

If Metricool uploads directly from Drive:
1. **Share** `/Group7/Production/Videos/` folder
2. **Permission:** Viewer
3. **Link sharing:** Anyone with link can view

---

## 🧪 Test Connection

Run this command to verify local sync:

```bash
ls -la "/Users/davidmikulis/Library/CloudStorage/GoogleDrive-neuro.pilot.ai@gmail.com/My Drive/Group7/Production/"
```

**Expected output:**
```
CSV_Inputs/
Voice/
Videos/
Captions/
Thumbnails/
```

---

## 🎯 Next Steps

1. ✅ CSV file created: `GROUP7_CANVA_BATCH_2025-10-30.csv`
2. ⏳ **Upload CSV** to Google Drive (use Option 1 or 2 above)
3. ⏳ **Create folder structure** in Google Drive
4. ⏳ **Test Make.com** connection to Google Drive

---

**Ready to upload the CSV?** Let me know when it's done and I'll help with the next step!
