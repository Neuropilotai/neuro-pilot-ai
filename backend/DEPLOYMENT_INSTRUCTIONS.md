# Production Deployment Instructions

## Overview

This is a production-ready, single-file inventory management system with minimal dependencies, optimized for cloud deployment.

## Features

- ✅ Single file deployment (inventory-production.js)
- ✅ Minimal dependencies (only Express.js)
- ✅ Built-in security (rate limiting, JWT, CORS protection)
- ✅ File-based storage (JSON/CSV)
- ✅ Bilingual support (English/French)
- ✅ AI inventory assistant
- ✅ Auto-backup functionality
- ✅ Environment variable configuration

## Environment Variables

```bash
PORT=3000                    # Server port (auto-set by hosting platforms)
JWT_SECRET=your-secret-key   # JWT signing secret (auto-generated if not set)
ADMIN_EMAIL=admin@your-domain.com
ADMIN_PASSWORD_HASH=$2b$12$...  # BCrypt hash of password
DATA_PATH=./data            # Data storage directory
RATE_LIMIT_WINDOW=900000    # Rate limit window in ms (15 min)
RATE_LIMIT_MAX=100          # Max requests per window
SESSION_TIMEOUT=86400000    # Session timeout in ms (24 hours)
NODE_ENV=production
```

## Default Credentials

- Email: `admin@inventory.local`
- Password: `inventory2025`

⚠️ **IMPORTANT**: Change these in production!

---

## Deployment on Render

### 1. Prepare Files

```bash
# Create deployment directory
mkdir inventory-deploy
cd inventory-deploy

# Copy files
cp inventory-production.js index.js
cp package-production.json package.json

# Initialize git
git init
git add .
git commit -m "Initial commit"
```

### 2. Deploy to Render

1. Push to GitHub:

```bash
git remote add origin https://github.com/YOUR_USERNAME/inventory-system.git
git push -u origin main
```

2. Create Render Web Service:

- Go to [render.com](https://render.com)
- Click "New +" → "Web Service"
- Connect your GitHub repo
- Configure:
  - **Name**: `inventory-system`
  - **Environment**: `Node`
  - **Build Command**: `npm install`
  - **Start Command**: `npm start`
  - **Plan**: Free or Starter

3. Add Environment Variables in Render Dashboard:

```
JWT_SECRET=<generate-random-64-char-string>
ADMIN_EMAIL=your-email@domain.com
ADMIN_PASSWORD_HASH=<bcrypt-hash-of-your-password>
NODE_ENV=production
```

4. Deploy! Render will automatically build and deploy.

---

## Deployment on Fly.io

### 1. Install Fly CLI

```bash
# macOS
brew install flyctl

# or download from https://fly.io/docs/hands-on/install-flyctl/
```

### 2. Prepare Deployment

```bash
# Login to Fly
fly auth login

# Create fly.toml
cat > fly.toml << EOF
app = "inventory-system"
primary_region = "ord"

[build]
  builder = "heroku/buildpacks:20"

[env]
  PORT = "3000"
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
EOF
```

### 3. Create Dockerfile (optional, for better control)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY inventory-production.js ./index.js
RUN mkdir -p data/backups
USER node
EXPOSE 3000
CMD ["node", "index.js"]
```

### 4. Deploy to Fly

```bash
# Create app
fly apps create inventory-system

# Set secrets
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly secrets set ADMIN_EMAIL="your-email@domain.com"
fly secrets set ADMIN_PASSWORD_HASH='$2b$12$...'

# Deploy
fly deploy

# Open app
fly open
```

---

## Post-Deployment Setup

### 1. Generate Password Hash

To create a bcrypt hash for your password:

```javascript
// Use this Node.js script
const bcrypt = require("bcrypt");
const password = "your-secure-password";
bcrypt.hash(password, 12).then((hash) => console.log(hash));
```

### 2. Set Up Persistent Storage (Fly.io)

```bash
# Create volume for data persistence
fly volumes create inventory_data --size 1 --region ord

# Update fly.toml to mount volume
# Add under [[vm]]:
# [mounts]
#   source = "inventory_data"
#   destination = "/data"

# Update environment
fly secrets set DATA_PATH=/data
```

### 3. Set Up Backups

The system automatically creates backups in the `data/backups` directory. For cloud backups:

**Render**: Use their backup service or integrate with S3
**Fly.io**: Use volumes backup or sync to external storage

### 4. Enable HTTPS

- **Render**: HTTPS is automatic
- **Fly.io**: HTTPS is automatic with `force_https = true`

### 5. Custom Domain

- **Render**: Add custom domain in dashboard
- **Fly.io**: `fly certs add your-domain.com`

---

## Security Checklist

- [ ] Change default admin credentials
- [ ] Set strong JWT_SECRET (64+ characters)
- [ ] Enable HTTPS (automatic on both platforms)
- [ ] Review rate limiting settings
- [ ] Set up regular backups
- [ ] Monitor logs for suspicious activity
- [ ] Keep Node.js updated
- [ ] Review and update CORS settings if needed

---

## Monitoring

### Health Check

Both platforms will automatically monitor:

```
GET /health
```

### Logs

- **Render**: View in dashboard or `render logs`
- **Fly.io**: `fly logs`

### Metrics

- **Render**: Built-in metrics dashboard
- **Fly.io**: `fly status` and metrics dashboard

---

## Scaling

### Render

- Upgrade plan in dashboard
- Enable auto-scaling

### Fly.io

```bash
# Scale horizontally
fly scale count 2

# Scale vertically
fly scale vm shared-cpu-2x

# Auto-scaling
fly autoscale set min=1 max=3
```

---

## Troubleshooting

### Data Not Persisting

- Ensure DATA_PATH is set correctly
- Check volume mounts (Fly.io)
- Verify write permissions

### Authentication Issues

- Verify JWT_SECRET is set
- Check ADMIN_PASSWORD_HASH format
- Ensure cookies are enabled

### Performance Issues

- Increase rate limits if needed
- Scale up instances
- Enable caching headers

---

## Maintenance

### Update Deployment

```bash
# Make changes
git add .
git commit -m "Update"
git push

# Render: Auto-deploys
# Fly.io: fly deploy
```

### Backup Data

```bash
# Download backups
fly ssh console -C "tar -czf - /data/backups" > backups.tar.gz
```

### Monitor Usage

- Check memory/CPU usage regularly
- Review logs for errors
- Monitor response times

---

## Cost Estimates

### Render

- **Free**: 750 hours/month, 512MB RAM, shared CPU
- **Starter**: $7/month, always on, 512MB RAM
- **Standard**: $25/month, 2GB RAM, better performance

### Fly.io

- **Free**: 3 shared VMs, 3GB total RAM
- **Pay-as-you-go**: ~$5-10/month for small app
- **Dedicated**: $30+/month for dedicated resources

---

## Support

For deployment issues:

- **Render**: support@render.com
- **Fly.io**: community.fly.io

For application issues:

- Check logs first
- Verify environment variables
- Test locally with same config
- Review this documentation
