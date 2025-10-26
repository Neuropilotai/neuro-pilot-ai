# NeuroPilot Inventory - Backup & Restore System

Complete automated backup solution for PostgreSQL database with GPG encryption and OneDrive storage.

## Features

- **Automated PostgreSQL backups** using `pg_dump`
- **GPG encryption** for data at rest and in transit
- **OneDrive integration** via `rclone` for cloud storage
- **Retention policy** (default: 30 days)
- **Verification checks** to ensure backup integrity
- **Slack/Email notifications** for backup status
- **One-command restore** with rollback safety
- **Cron automation** for daily/weekly schedules

---

## Architecture

```
┌─────────────────┐
│  Neon Postgres  │
│  (Production)   │
└────────┬────────┘
         │
         │ pg_dump
         ▼
┌─────────────────┐
│   Local Temp    │
│  .sql.gz.gpg    │
└────────┬────────┘
         │
         │ rclone
         ▼
┌─────────────────┐
│   OneDrive      │
│  (30-day roll)  │
└─────────────────┘
```

**Security Flow:**
1. `pg_dump` → Plain SQL
2. `gzip -9` → Compressed
3. `gpg --encrypt` → Encrypted with public key
4. `rclone copy` → Uploaded to OneDrive
5. Local unencrypted files deleted

---

## Quick Start

### 1. Install Dependencies

**macOS:**
```bash
brew install postgresql gnupg rclone
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-client gnupg rclone gzip
```

**Verify Installation:**
```bash
pg_dump --version
gpg --version
rclone --version
```

---

### 2. Generate GPG Key

Create a new GPG key for encrypting backups:

```bash
gpg --full-generate-key
```

**Recommended Settings:**
- Key type: `RSA and RSA`
- Key size: `4096`
- Expiration: `0` (does not expire) or `2y` (2 years)
- Name: `NeuroPilot Backup`
- Email: `backup@yourcompany.com`
- Passphrase: **Strong passphrase** (store in password manager)

**Export Public Key** (for team members to encrypt backups):
```bash
gpg --export --armor backup@yourcompany.com > neuropilot-backup-public.key
```

**Backup Private Key** (store securely - needed for restore):
```bash
gpg --export-secret-keys --armor backup@yourcompany.com > neuropilot-backup-private.key
chmod 600 neuropilot-backup-private.key
```

**Store private key in:**
- Password manager (1Password, Bitwarden)
- Encrypted USB drive (offline backup)
- Company secrets vault (HashiCorp Vault, AWS Secrets Manager)

---

### 3. Configure rclone for OneDrive

```bash
rclone config
```

**Configuration Steps:**
1. Choose: `n` (New remote)
2. Name: `onedrive`
3. Storage: `onedrive`
4. Client ID: _(leave blank for default)_
5. Client Secret: _(leave blank for default)_
6. Region: `1` (Microsoft Cloud Global)
7. Edit advanced config? `n`
8. Use web browser to authorize? `y`
9. **Follow browser authentication flow**
10. Choose OneDrive account type: `1` (OneDrive Personal/Business)
11. Drive: `0` (default drive)
12. Confirm: `y`

**Test rclone:**
```bash
rclone ls onedrive:
```

---

### 4. Configure Backup Settings

Edit `.backup-config` file:

```bash
cd /path/to/inventory-enterprise/backend/backup
nano .backup-config
```

**Required Settings:**
```bash
# PostgreSQL Connection (Neon.tech)
export PGHOST="ep-cool-moon-12345678.us-east-2.aws.neon.tech"
export PGDATABASE="neuropilot_inventory"
export PGUSER="app_user"
export PGPASSWORD="your_neon_password_here"
export PGSSLMODE="require"

# Backup Settings
BACKUP_DIR="/tmp/neuropilot-backups"
RETENTION_DAYS=30
GPG_RECIPIENT="backup@yourcompany.com"

# OneDrive Settings
ONEDRIVE_REMOTE="onedrive"
ONEDRIVE_PATH="NeuroPilot/Backups"

# Notifications (optional)
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
NOTIFY_EMAIL="ops@yourcompany.com"

# Verification
VERIFY_BACKUPS=true
```

**Security Note:**
- Store `.backup-config` securely
- Add to `.gitignore`
- Restrict permissions: `chmod 600 .backup-config`

---

### 5. Test Backup

Run manual backup:

```bash
./backup-database.sh
```

**Expected Output:**
```
[2025-01-20 12:00:00] ==========================================
[2025-01-20 12:00:00] NeuroPilot PostgreSQL Backup
[2025-01-20 12:00:00] ==========================================
[2025-01-20 12:00:00] ✅ GPG key verified for backup@yourcompany.com
[2025-01-20 12:00:00] ✅ rclone remote verified
[2025-01-20 12:00:00] Starting PostgreSQL backup...
[2025-01-20 12:00:05] ✅ Database dump completed
[2025-01-20 12:00:05] Dump size: 125M
[2025-01-20 12:00:10] ✅ Compressed: 18M
[2025-01-20 12:00:12] ✅ Encrypted: 18M
[2025-01-20 12:00:12] ✅ Checksum: a3b5c7d9...
[2025-01-20 12:00:15] Uploading to OneDrive...
[2025-01-20 12:00:30] ✅ Backup uploaded
[2025-01-20 12:00:30] ✅ Backup verification passed
[2025-01-20 12:00:30] ✅ Local backups retained: 5
[2025-01-20 12:00:30] ✅ Backup completed successfully!
```

**Verify OneDrive:**
```bash
rclone ls onedrive:NeuroPilot/Backups/
```

---

## Automated Backups with Cron

### Daily Backup at 2 AM

```bash
# Edit crontab
crontab -e

# Add this line:
0 2 * * * /path/to/backup-database.sh >> /var/log/neuropilot-backup.log 2>&1
```

### Weekly Backup (Sunday 3 AM)

```bash
0 3 * * 0 /path/to/backup-database.sh >> /var/log/neuropilot-backup.log 2>&1
```

### Multiple Schedules (Daily + Weekly long-term)

```bash
# Daily backup (30-day retention)
0 2 * * * /path/to/backup-database.sh

# Weekly backup to separate folder (90-day retention)
0 3 * * 0 ONEDRIVE_PATH="NeuroPilot/Backups/Weekly" RETENTION_DAYS=90 /path/to/backup-database.sh
```

**Verify Cron Jobs:**
```bash
crontab -l
```

---

## Restore Database

### Restore Latest Backup from OneDrive

```bash
./restore-database.sh --from-onedrive --latest
```

### Restore Specific Backup

```bash
# List available backups
./restore-database.sh --list

# Restore specific file
./restore-database.sh --from-onedrive neuropilot_20250120_020000.sql.gz.gpg
```

### Restore from Local File

```bash
./restore-database.sh /tmp/neuropilot-backups/neuropilot_20250120_020000.sql.gz.gpg
```

**What Happens During Restore:**

1. ✅ **Pre-restore backup created** (rollback safety)
2. ✅ Download backup from OneDrive (if specified)
3. ✅ Verify checksum
4. ✅ Decrypt with GPG
5. ✅ Decompress
6. ⚠️  **DROP existing tables**
7. ✅ Restore schema and data
8. ✅ Verify restore success
9. ✅ Cleanup temporary files

**Rollback:**
If restore fails or data is incorrect, rollback using pre-restore backup:

```bash
gunzip -c /tmp/neuropilot-backups/pre_restore_20250120_*.sql.gz | psql
```

---

## Backup Verification

### Test Backup Integrity

```bash
./test-backup.sh
```

This script:
1. Downloads latest backup from OneDrive
2. Decrypts and decompresses
3. Attempts to restore to a temporary database
4. Validates schema and row counts
5. Generates verification report

### Manual Verification

```bash
# List local backups
ls -lh /tmp/neuropilot-backups/

# Verify checksum
cd /tmp/neuropilot-backups/
sha256sum -c neuropilot_20250120_020000.sql.gz.gpg.sha256

# Test decryption (without extracting)
gpg --decrypt neuropilot_20250120_020000.sql.gz.gpg | gzip -t
```

---

## Disaster Recovery Scenarios

### Scenario 1: Database Corruption

```bash
# Restore latest backup
./restore-database.sh --from-onedrive --latest

# Verify application
curl https://api.yourdomain.com/api/health
```

**RTO (Recovery Time Objective):** 5-10 minutes
**RPO (Recovery Point Objective):** 24 hours (daily backups)

### Scenario 2: Accidental Data Deletion

```bash
# Restore from backup before deletion
./restore-database.sh --list  # Find backup from before deletion
./restore-database.sh --from-onedrive neuropilot_YYYYMMDD_HHMMSS.sql.gz.gpg
```

### Scenario 3: Complete Infrastructure Loss

**Prerequisites:**
- OneDrive account credentials
- GPG private key (from password manager)
- `.backup-config` file (from secure storage)

**Recovery Steps:**

1. **Provision new infrastructure:**
   ```bash
   # Deploy to Railway (new instance)
   # Deploy to Neon Postgres (new database)
   ```

2. **Install dependencies:**
   ```bash
   brew install postgresql gnupg rclone  # macOS
   ```

3. **Import GPG private key:**
   ```bash
   gpg --import neuropilot-backup-private.key
   ```

4. **Configure rclone:**
   ```bash
   rclone config  # Re-authenticate OneDrive
   ```

5. **Restore database:**
   ```bash
   ./restore-database.sh --from-onedrive --latest
   ```

6. **Update application config:**
   ```bash
   # Point to new database
   export DATABASE_URL="postgresql://..."
   ```

7. **Verify application:**
   ```bash
   npm run start
   curl http://localhost:8083/api/health
   ```

**Total Recovery Time:** 30-60 minutes

---

## Monitoring & Alerts

### Slack Notifications

Configure Slack webhook in `.backup-config`:

```bash
SLACK_WEBHOOK_URL="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX"
```

**Create Slack Webhook:**
1. Go to https://api.slack.com/apps
2. Create new app
3. Enable "Incoming Webhooks"
4. Add webhook to channel (e.g., `#ops-alerts`)
5. Copy webhook URL

**Notification Types:**
- ✅ Backup success (daily)
- ❌ Backup failure (immediate)
- ⚠️ Upload failure (immediate)
- ⚠️ Verification failure (immediate)

### Email Notifications

Requires `mail` command (postfix/sendmail):

```bash
# Install on Ubuntu
sudo apt install mailutils

# Configure in .backup-config
NOTIFY_EMAIL="ops@yourcompany.com"
```

### Grafana Dashboard (Advanced)

Monitor backup metrics:

```bash
# Export metrics to Prometheus
cat > /var/log/neuropilot-backup-metrics.prom << EOF
# HELP backup_success_timestamp Last successful backup timestamp
# TYPE backup_success_timestamp gauge
backup_success_timestamp $(date +%s)

# HELP backup_size_bytes Backup file size in bytes
# TYPE backup_size_bytes gauge
backup_size_bytes $(stat -f%z /tmp/neuropilot-backups/neuropilot_*.sql.gz.gpg | tail -n1)
EOF
```

---

## Troubleshooting

### Error: "GPG key not found"

**Solution:**
```bash
# List available keys
gpg --list-keys

# Import key if missing
gpg --import neuropilot-backup-private.key

# Update .backup-config with correct email
GPG_RECIPIENT="backup@yourcompany.com"
```

### Error: "rclone remote not configured"

**Solution:**
```bash
# Reconfigure rclone
rclone config

# Test connection
rclone ls onedrive:

# Update .backup-config
ONEDRIVE_REMOTE="onedrive"
```

### Error: "pg_dump: connection failed"

**Solution:**
```bash
# Test PostgreSQL connection
psql "host=$PGHOST dbname=$PGDATABASE user=$PGUSER sslmode=require"

# Verify credentials in .backup-config
export PGPASSWORD="correct_password"
```

### Error: "Permission denied: /tmp/neuropilot-backups"

**Solution:**
```bash
# Create directory with correct permissions
mkdir -p /tmp/neuropilot-backups
chmod 700 /tmp/neuropilot-backups
```

### Backup takes too long

**Solutions:**
1. **Compress less aggressively:**
   ```bash
   # In backup-database.sh, change:
   gzip -9 → gzip -6
   ```

2. **Use directory format for large databases:**
   ```bash
   # In backup-database.sh, change pg_dump:
   --format=plain → --format=directory
   ```

3. **Parallel dump:**
   ```bash
   pg_dump --jobs=4 --format=directory
   ```

---

## Security Best Practices

### 1. Protect Configuration File

```bash
chmod 600 .backup-config
chown $(whoami):$(whoami) .backup-config
```

### 2. Rotate GPG Keys

```bash
# Every 2 years
gpg --full-generate-key

# Re-encrypt existing backups with new key
for file in *.gpg; do
  gpg --decrypt "$file" | gpg --encrypt --recipient new@example.com > "${file}.new"
done
```

### 3. Test Restore Monthly

```bash
# Create calendar reminder
# Test restore to staging environment
./restore-database.sh --from-onedrive --latest
```

### 4. Store Private Key Offline

- USB drive in safe
- Paper backup (QR code)
- Hardware security module (Yubikey)

### 5. Audit Access

```bash
# OneDrive audit logs
# Check who accessed backups

# GPG key usage
gpg --list-secret-keys
```

---

## Cost Analysis

### OneDrive Storage

| Backup Frequency | Retention | Storage Needed | OneDrive Plan      | Cost/Month |
|------------------|-----------|----------------|---------------------|------------|
| Daily            | 30 days   | ~50 GB         | 100 GB (Personal)   | $1.99      |
| Daily            | 90 days   | ~150 GB        | 1 TB (Personal)     | $6.99      |
| Hourly           | 7 days    | ~150 GB        | 1 TB (Business)     | $10.00     |

**Calculation:**
- Average backup size: 1.5 GB (compressed + encrypted)
- Daily backups for 30 days: 1.5 GB × 30 = 45 GB
- Add 10% overhead: ~50 GB

---

## Migration Guide

### From SQLite to PostgreSQL

If migrating from SQLite:

```bash
# Export SQLite
sqlite3 inventory.db .dump > sqlite_dump.sql

# Convert to PostgreSQL format
pgloader sqlite_dump.sql postgresql://user:pass@host/db

# Create first PostgreSQL backup
./backup-database.sh
```

### From Other Backup Solution

If migrating from another backup tool:

```bash
# Decrypt existing backup
openssl enc -d -aes-256-cbc -in old_backup.enc -out backup.sql

# Import to PostgreSQL
psql < backup.sql

# Create new encrypted backup
./backup-database.sh
```

---

## Advanced Configuration

### Multi-Region Backup

Store backups in multiple cloud providers:

```bash
# Configure additional rclone remotes
rclone config  # Add "s3", "gdrive", etc.

# Modify backup-database.sh to upload to multiple destinations
upload_to_onedrive "$encrypted_file"
rclone copy "$encrypted_file" s3:neuropilot-backups/
rclone copy "$encrypted_file" gdrive:Backups/
```

### Point-in-Time Recovery (PITR)

Enable WAL archiving for minute-level recovery:

```sql
-- In Neon Postgres (may require Enterprise plan)
ALTER SYSTEM SET wal_level = replica;
ALTER SYSTEM SET archive_mode = on;
ALTER SYSTEM SET archive_command = 'rclone copy %p onedrive:NeuroPilot/WAL/%f';
```

### Incremental Backups

For large databases (>100 GB):

```bash
# Use pg_basebackup + WAL archiving
pg_basebackup -D /tmp/base_backup -Ft -z -P

# Or use third-party tools
pgBackRest
Barman
wal-g
```

---

## Support & Resources

- **Documentation:** `/docs/backup-restore.md`
- **Issues:** https://github.com/yourorg/inventory-enterprise/issues
- **Slack:** `#ops-support`

---

**Version:** 1.0.0
**Last Updated:** 2025-01
**Maintained By:** DevOps Team
**License:** Proprietary
