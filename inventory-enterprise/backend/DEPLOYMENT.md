# 🚀 Deployment Guide

## Production Deployment Checklist

### Pre-Deployment

- [ ] Complete all items in `SECURITY_CHECKLIST.md`
- [ ] Generate and set secure environment variables
- [ ] Backup existing database and data
- [ ] Test migrations in staging environment
- [ ] Run full test suite (`npm test`)
- [ ] Build Docker image (`docker build -t inventory-enterprise:2.0.0 .`)
- [ ] Configure SSL/TLS certificates
- [ ] Set up monitoring and alerting
- [ ] Document rollback procedure

### Deployment Options

## Option 1: Docker Compose (Recommended for Single Server)

```bash
# 1. Copy files to server
scp -r ./* user@server:/opt/inventory-enterprise/

# 2. SSH into server
ssh user@server
cd /opt/inventory-enterprise

# 3. Create production environment file
cp .env.example .env.production
# Edit .env.production with production values

# 4. Start services
docker-compose -f docker-compose.production.yml up -d

# 5. Run migrations
docker-compose exec inventory-api npm run migrate

# 6. Verify deployment
curl http://localhost:8083/health
docker-compose logs -f inventory-api
```

## Option 2: Kubernetes (For Scale)

```bash
# 1. Create namespace
kubectl create namespace inventory-enterprise

# 2. Create secrets
kubectl create secret generic inventory-secrets \
  --from-literal=JWT_SECRET=$(openssl rand -hex 64) \
  --from-literal=ENCRYPTION_KEY=$(openssl rand -hex 32) \
  --namespace=inventory-enterprise

# 3. Apply configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# 4. Verify deployment
kubectl get pods -n inventory-enterprise
kubectl logs -f deployment/inventory-api -n inventory-enterprise
```

## Option 3: Traditional Server

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Copy application
scp -r ./* user@server:/opt/inventory-enterprise/
ssh user@server
cd /opt/inventory-enterprise

# 3. Install dependencies
npm ci --only=production

# 4. Set environment variables
cp .env.example .env
# Edit .env with production values

# 5. Run migrations
npm run migrate

# 6. Install PM2 for process management
sudo npm install -g pm2

# 7. Start application
pm2 start server.js --name inventory-enterprise
pm2 save
pm2 startup
```

---

## Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/inventory-enterprise`:

```nginx
# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

upstream inventory_backend {
    least_conn;
    server localhost:8083 max_fails=3 fail_timeout=30s;
}

# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name inventory.your-company.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name inventory.your-company.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/inventory.your-company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inventory.your-company.com/privkey.pem;
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/inventory-access.log;
    error_log /var/log/nginx/inventory-error.log;

    # Client limits
    client_max_body_size 10M;
    client_body_timeout 30s;
    client_header_timeout 30s;

    # Proxy settings
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;

    # Health check endpoint (no rate limit)
    location /health {
        proxy_pass http://inventory_backend;
    }

    # Authentication endpoints (strict rate limit)
    location /api/auth/ {
        limit_req zone=auth_limit burst=3 nodelay;
        proxy_pass http://inventory_backend;
    }

    # API endpoints (moderate rate limit)
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        proxy_pass http://inventory_backend;
    }

    # Metrics endpoint (restricted)
    location /metrics {
        allow 10.0.0.0/8;  # Internal network
        deny all;
        proxy_pass http://inventory_backend;
    }

    # Static files with caching
    location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
        proxy_pass http://inventory_backend;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # All other requests
    location / {
        proxy_pass http://inventory_backend;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/inventory-enterprise /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Monitoring Setup

### Prometheus Configuration

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'inventory-api'
    static_configs:
      - targets: ['inventory-api:8083']
    metrics_path: '/metrics'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
```

### Grafana Dashboards

Import dashboard ID `11074` (Node.js Application Dashboard) and customize for inventory metrics.

---

## Backup Strategy

### Automated Backups

Backups run daily at 2 AM (configured via `BACKUP_SCHEDULE`).

Manual backup:
```bash
npm run backup
# Or via Docker:
docker-compose exec inventory-api npm run backup
```

### Offsite Backup (Google Drive)

1. Set up Google Drive API credentials
2. Enable in `.env`:
   ```
   GOOGLE_DRIVE_ENABLED=true
   GOOGLE_DRIVE_FOLDER_ID=your_folder_id
   ```

### Backup to External Drive

Mount 5TB drive and configure path:
```bash
# Mount drive
sudo mount /dev/sdb1 /mnt/5tb_drive

# Set in .env
BACKUP_LOCAL_PATH=/mnt/5tb_drive/inventory_backups
```

---

## Scaling Strategies

### Vertical Scaling (Single Server)
- Increase CPU/RAM resources
- Optimize database queries
- Enable Redis caching

### Horizontal Scaling (Multiple Servers)

1. **Load Balancer:** Use Nginx or HAProxy
2. **Shared Storage:** NFS or S3 for files
3. **Database:** PostgreSQL with replication
4. **Session Storage:** Redis cluster
5. **Container Orchestration:** Kubernetes

Example load balancer config:
```nginx
upstream inventory_cluster {
    least_conn;
    server 10.0.1.10:8083 weight=3;
    server 10.0.1.11:8083 weight=3;
    server 10.0.1.12:8083 weight=2 backup;
}
```

---

## Troubleshooting

### Application won't start

```bash
# Check logs
docker-compose logs -f inventory-api

# Common issues:
# 1. Missing environment variables
cat .env | grep -E "(JWT_SECRET|ENCRYPTION_KEY)"

# 2. Port conflict
sudo lsof -i :8083

# 3. Database locked
rm data/*.db-shm data/*.db-wal
```

### High memory usage

```bash
# Check process
docker stats inventory-api

# Restart with limit
docker-compose up -d --force-recreate
```

### Database corruption

```bash
# Restore from backup
docker-compose stop inventory-api
cp backups/latest/database.db data/enterprise_inventory.db
docker-compose start inventory-api
```

---

## Rollback Procedure

### Docker Deployment

```bash
# 1. Stop current version
docker-compose down

# 2. Restore database backup
cp backups/pre-deployment/database.db data/

# 3. Use previous image
docker-compose up -d your-org/inventory-enterprise:1.0.0

# 4. Verify
curl http://localhost:8083/health
```

### Kubernetes Deployment

```bash
# Rollback to previous revision
kubectl rollout undo deployment/inventory-api -n inventory-enterprise

# Check status
kubectl rollout status deployment/inventory-api -n inventory-enterprise
```

---

## Performance Optimization

### Database Optimization

```sql
-- Create indexes
CREATE INDEX idx_inventory_items_code ON inventory_count_items(item_code);
CREATE INDEX idx_inventory_items_date ON inventory_count_items(count_date);
CREATE INDEX idx_orders_date ON processed_invoices(invoice_date);

-- Enable WAL mode
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
```

### Redis Caching (Optional)

```javascript
// config/redis.js
const redis = require('ioredis');
const client = new redis({
  host: 'redis',
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

// Cache inventory for 5 minutes
app.get('/api/inventory', async (req, res) => {
  const cacheKey = 'inventory:all';
  const cached = await client.get(cacheKey);

  if (cached) {
    return res.json(JSON.parse(cached));
  }

  const inventory = await fetchInventory();
  await client.setex(cacheKey, 300, JSON.stringify(inventory));
  res.json(inventory);
});
```

---

## Security Hardening Post-Deployment

```bash
# 1. Firewall rules
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 2. Fail2ban for brute force protection
sudo apt-get install fail2ban
sudo systemctl enable fail2ban

# 3. Automatic security updates
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 4. Disable root SSH
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd
```

---

## Post-Deployment Checklist

- [ ] Verify health endpoint returns 200
- [ ] Test authentication flow
- [ ] Check database connections
- [ ] Verify backups are running
- [ ] Monitor logs for errors
- [ ] Test critical user workflows
- [ ] Verify metrics collection
- [ ] Check SSL certificate expiry
- [ ] Review security logs
- [ ] Document any issues

---

**For support:** operations@your-company.com
