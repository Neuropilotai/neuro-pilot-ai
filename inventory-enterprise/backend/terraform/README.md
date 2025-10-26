# NeuroPilot v17.1 Terraform IaC

Infrastructure as Code for NeuroPilot multi-region deployment with Cloudflare, Railway, Neon, and Grafana Cloud.

## 📋 Prerequisites

### 1. Install Terraform

```bash
# macOS
brew install terraform

# Linux
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Verify
terraform version
```

### 2. Get API Credentials

**Cloudflare**:
- Zone ID: Cloudflare Dashboard → neuropilot.ai → Overview → Zone ID
- API Token: https://dash.cloudflare.com/profile/api-tokens (Edit zone DNS + Zone Settings + Firewall Services)

**Grafana Cloud** (optional):
- URL: https://grafana.com → Your instance URL
- API Key: Settings → API Keys → Add API key (Editor role)

### 3. Get Deployment Hosts

**Vercel**:
```bash
cd ../../frontend
vercel ls
# Copy the production URL (e.g., neuropilot-inventory-abc123.vercel.app)
```

**Railway**:
```bash
railway status
# Copy the domain (e.g., neuropilot-api-production-xyz.up.railway.app)
```

---

## 🚀 Quick Start

### Step 1: Configure Variables

```bash
cd backend/terraform

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit with your credentials
nano terraform.tfvars
```

Fill in:
- `cloudflare_api_token`
- `cloudflare_zone_id`
- `vercel_host`
- `railway_host`
- `neon_database_url`
- `grafana_url` (optional)
- `grafana_api_key` (optional)

### Step 2: Initialize Terraform

```bash
terraform init
```

**Expected output**:
```
Initializing provider plugins...
- Finding cloudflare/cloudflare versions matching "~> 4.0"...
- Finding grafana/grafana versions matching "~> 1.40"...
✅ Terraform has been successfully initialized!
```

### Step 3: Plan Infrastructure

```bash
terraform plan
```

**Review the plan**:
- DNS records (2): inventory.neuropilot.ai, api.neuropilot.ai
- SSL/TLS settings
- WAF rules (3): SQL injection, XSS, bot challenge
- Rate limiting (1): Login protection
- Page rules (2): Cache static assets
- Grafana dashboard (optional)

### Step 4: Apply Infrastructure

```bash
terraform apply
```

Type `yes` when prompted.

**Expected output**:
```
Apply complete! Resources: 12 added, 0 changed, 0 destroyed.

Outputs:

frontend_url = "https://inventory.neuropilot.ai"
api_url = "https://api.neuropilot.ai"
cloudflare_zone_id = "abc123..."
dashboard_url = "https://your-org.grafana.net/d/xyz..."
```

---

## 🔍 Verification

### DNS Records

```bash
dig +short inventory.neuropilot.ai
dig +short api.neuropilot.ai
```

### SSL/TLS

```bash
curl -I https://inventory.neuropilot.ai
curl -I https://api.neuropilot.ai/health
```

### WAF Rules

```bash
# Should return 403
curl -I "https://api.neuropilot.ai/?q=UNION%20SELECT%201"
```

---

## 📊 Terraform State

### View Current State

```bash
terraform show
```

### List Resources

```bash
terraform state list
```

### Show Specific Resource

```bash
terraform state show cloudflare_record.frontend
```

---

## 🔄 Making Changes

### Update Variables

1. Edit `terraform.tfvars`
2. Run `terraform plan` to see changes
3. Run `terraform apply` to apply

### Update Infrastructure

1. Edit `main.tf`
2. Run `terraform plan`
3. Run `terraform apply`

### Example: Add New DNS Record

```hcl
resource "cloudflare_record" "staging_api" {
  zone_id = var.cloudflare_zone_id
  name    = "staging-api"
  value   = var.staging_railway_host
  type    = "CNAME"
  ttl     = 1
  proxied = true
}
```

---

## 🗑️ Destroying Infrastructure

**⚠️ WARNING**: This will delete ALL managed resources!

```bash
# Dry run (see what would be deleted)
terraform plan -destroy

# Destroy all resources
terraform destroy
```

---

## 🔐 Security Best Practices

### 1. Protect tfvars File

```bash
# Never commit terraform.tfvars
echo "terraform.tfvars" >> .gitignore
```

### 2. Use Environment Variables

```bash
export TF_VAR_cloudflare_api_token="your_token"
export TF_VAR_grafana_api_key="your_key"

terraform apply
```

### 3. Use Remote State (Production)

```hcl
# In main.tf
terraform {
  backend "s3" {
    bucket = "neuropilot-terraform-state"
    key    = "v17.1/terraform.tfstate"
    region = "us-east-1"
    encrypt = true
  }
}
```

Or use Terraform Cloud:

```bash
terraform login
terraform init
```

---

## 📚 Resources Managed

| Resource Type | Count | Description |
|---------------|-------|-------------|
| DNS Records | 2 | inventory, api subdomains |
| Zone Settings | 1 | SSL, performance, security |
| Firewall Rules | 3 | WAF protection |
| Rate Limits | 1 | Login brute-force protection |
| Page Rules | 2 | Static asset caching |
| Grafana Dashboard | 1 | Production metrics (optional) |
| Grafana Alerts | 1 | High latency alert (optional) |

**Total**: 11 resources (9 required + 2 optional)

---

## 🧪 Testing

### Validate Configuration

```bash
terraform validate
```

### Format Code

```bash
terraform fmt
```

### Check for Drift

```bash
terraform plan -detailed-exitcode
```

Exit codes:
- 0 = No changes
- 1 = Error
- 2 = Changes detected

---

## 🐛 Troubleshooting

### Issue: Provider Authentication Failed

**Error**: `Error: Invalid Cloudflare API token`

**Fix**:
1. Verify token in Cloudflare dashboard
2. Check token permissions (DNS Edit, Zone Settings Edit, Firewall Services Edit)
3. Regenerate token if necessary

### Issue: Resource Already Exists

**Error**: `already_exists: DNS record already exists`

**Fix**:
```bash
# Import existing resource
terraform import cloudflare_record.frontend <record_id>
```

### Issue: Grafana Provider Error

**Error**: `Error initializing Grafana provider`

**Fix**:
```bash
# Disable Grafana resources by setting empty URL
export TF_VAR_grafana_url=""
terraform apply
```

---

## 📈 Cost Breakdown

| Service | Resources | Monthly Cost |
|---------|-----------|--------------|
| Cloudflare | DNS, SSL, WAF, Rate Limiting | $0 (Free) |
| Terraform | State management | $0 (Local state) |
| Grafana | Dashboard, Alerts | $0 (Free 10k metrics) |
| **Total** | | **$0** |

**Note**: Railway ($7-12) and Neon ($0) costs are managed separately.

---

## 🔄 CI/CD Integration

### GitHub Actions

```yaml
name: Terraform
on:
  push:
    branches: [main]

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: hashicorp/setup-terraform@v2

      - name: Terraform Init
        run: terraform init
        working-directory: backend/terraform

      - name: Terraform Plan
        run: terraform plan
        working-directory: backend/terraform
        env:
          TF_VAR_cloudflare_api_token: ${{ secrets.CLOUDFLARE_API_TOKEN }}

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main'
        run: terraform apply -auto-approve
        working-directory: backend/terraform
```

---

## 📞 Support

**Issues**: https://github.com/neuropilot/inventory-enterprise/issues
**Docs**: https://docs.neuropilot.ai
**Terraform Registry**: https://registry.terraform.io/

---

**Version**: v17.1
**Last Updated**: 2025-01-23
**Managed By**: Terraform
