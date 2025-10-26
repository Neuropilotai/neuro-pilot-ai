# NeuroPilot v17.1 Terraform Infrastructure as Code
# Manages: Cloudflare, Railway, Neon, Grafana Cloud

terraform {
  required_version = ">= 1.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.2"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "~> 1.40"
    }
  }

  # Remote state (optional - use Terraform Cloud or S3)
  # backend "s3" {
  #   bucket = "neuropilot-terraform-state"
  #   key    = "v17.1/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

# ================================================================
# VARIABLES
# ================================================================
variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for neuropilot.ai"
  type        = string
}

variable "vercel_host" {
  description = "Vercel frontend hostname"
  type        = string
  default     = "neuropilot-inventory.vercel.app"
}

variable "railway_host" {
  description = "Railway backend hostname"
  type        = string
  default     = "neuropilot-api.up.railway.app"
}

variable "neon_database_url" {
  description = "Neon PostgreSQL connection string"
  type        = string
  sensitive   = true
}

variable "grafana_url" {
  description = "Grafana Cloud instance URL"
  type        = string
  default     = ""
}

variable "grafana_api_key" {
  description = "Grafana Cloud API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "environment" {
  description = "Environment: production, staging, development"
  type        = string
  default     = "production"
}

# ================================================================
# PROVIDERS
# ================================================================
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

provider "grafana" {
  url  = var.grafana_url
  auth = var.grafana_api_key
}

# ================================================================
# CLOUDFLARE DNS RECORDS
# ================================================================
resource "cloudflare_record" "frontend" {
  zone_id = var.cloudflare_zone_id
  name    = "inventory"
  value   = var.vercel_host
  type    = "CNAME"
  ttl     = 1
  proxied = true

  comment = "NeuroPilot v17.1 frontend (Vercel)"
}

resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  value   = var.railway_host
  type    = "CNAME"
  ttl     = 1
  proxied = true

  comment = "NeuroPilot v17.1 backend API (Railway)"
}

# ================================================================
# CLOUDFLARE SSL/TLS SETTINGS
# ================================================================
resource "cloudflare_zone_settings_override" "neuropilot_settings" {
  zone_id = var.cloudflare_zone_id

  settings {
    # SSL
    ssl                      = "strict"
    always_use_https         = "on"
    min_tls_version          = "1.3"
    opportunistic_encryption = "on"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"

    # Performance
    brotli                   = "on"
    early_hints              = "on"
    http2                    = "on"
    http3                    = "on"

    # Security
    security_level           = "medium"
    challenge_ttl            = 1800
    browser_check            = "on"

    # Caching
    cache_level              = "aggressive"

    # Other
    development_mode         = "off"
    ipv6                     = "on"
  }
}

# ================================================================
# CLOUDFLARE FIREWALL RULES (WAF)
# ================================================================
resource "cloudflare_filter" "block_sql_injection" {
  zone_id     = var.cloudflare_zone_id
  description = "Block SQL injection attempts"
  expression  = "(http.request.uri.query contains \"UNION SELECT\" or http.request.uri.query contains \"'; DROP TABLE\")"
}

resource "cloudflare_firewall_rule" "block_sql_injection" {
  zone_id     = var.cloudflare_zone_id
  description = "Block SQL injection attacks"
  filter_id   = cloudflare_filter.block_sql_injection.id
  action      = "block"
}

resource "cloudflare_filter" "block_xss" {
  zone_id     = var.cloudflare_zone_id
  description = "Block XSS attempts"
  expression  = "(http.request.uri.query contains \"<script\" or http.request.uri.query contains \"javascript:\")"
}

resource "cloudflare_firewall_rule" "block_xss" {
  zone_id     = var.cloudflare_zone_id
  description = "Block XSS attacks"
  filter_id   = cloudflare_filter.block_xss.id
  action      = "block"
}

resource "cloudflare_filter" "challenge_high_threat" {
  zone_id     = var.cloudflare_zone_id
  description = "Challenge high threat score requests"
  expression  = "(cf.threat_score > 20)"
}

resource "cloudflare_firewall_rule" "challenge_high_threat" {
  zone_id     = var.cloudflare_zone_id
  description = "Challenge suspicious traffic"
  filter_id   = cloudflare_filter.challenge_high_threat.id
  action      = "managed_challenge"
}

# ================================================================
# CLOUDFLARE RATE LIMITING
# ================================================================
resource "cloudflare_rate_limit" "login_protection" {
  zone_id = var.cloudflare_zone_id

  threshold = 5
  period    = 900  # 15 minutes

  match {
    request {
      url_pattern = "api.neuropilot.ai/api/auth/login"
      schemes     = ["HTTP", "HTTPS"]
      methods     = ["POST"]
    }
  }

  action {
    mode    = "ban"
    timeout = 600  # 10 minutes

    response {
      content_type = "text/plain"
      body         = "Too many login attempts. Please try again later."
    }
  }

  description = "Login brute-force protection"
  disabled    = false
}

# ================================================================
# CLOUDFLARE PAGE RULES
# ================================================================
resource "cloudflare_page_rule" "cache_static_assets" {
  zone_id  = var.cloudflare_zone_id
  target   = "inventory.neuropilot.ai/*.js"
  priority = 1

  actions {
    cache_level = "cache_everything"
    edge_cache_ttl = 86400  # 24 hours
    browser_cache_ttl = 86400
  }
}

resource "cloudflare_page_rule" "cache_css" {
  zone_id  = var.cloudflare_zone_id
  target   = "inventory.neuropilot.ai/*.css"
  priority = 2

  actions {
    cache_level = "cache_everything"
    edge_cache_ttl = 86400
    browser_cache_ttl = 86400
  }
}

# ================================================================
# GRAFANA CLOUD DASHBOARD
# ================================================================
resource "grafana_dashboard" "neuropilot_production" {
  count = var.grafana_url != "" ? 1 : 0

  config_json = jsonencode({
    title = "NeuroPilot v17.1 - Production Metrics"
    tags  = ["neuropilot", "v17.1", "production"]
    timezone = "utc"

    panels = [
      {
        id    = 1
        title = "API Latency (p95)"
        type  = "graph"
        targets = [
          {
            expr = "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))"
          }
        ]
      },
      {
        id    = 2
        title = "Request Rate"
        type  = "graph"
        targets = [
          {
            expr = "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        id    = 3
        title = "Error Rate"
        type  = "graph"
        targets = [
          {
            expr = "rate(http_requests_total{status=~\"5..\"}[5m])"
          }
        ]
      }
    ]
  })
}

# ================================================================
# GRAFANA ALERT RULES
# ================================================================
resource "grafana_alert_rule" "high_latency" {
  count = var.grafana_url != "" ? 1 : 0

  name           = "High API Latency"
  folder_uid     = "neuropilot"
  no_data_state  = "NoData"
  exec_err_state = "Alerting"

  condition = "A"

  data {
    ref_id = "A"

    query_type = ""

    model = jsonencode({
      expr         = "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 400"
      intervalMs   = 1000
      maxDataPoints = 43200
    })
  }

  annotations = {
    description = "API p95 latency is above 400ms threshold"
  }

  labels = {
    severity  = "warning"
    component = "api"
  }
}

# ================================================================
# OUTPUTS
# ================================================================
output "frontend_url" {
  description = "Frontend URL"
  value       = "https://${cloudflare_record.frontend.hostname}"
}

output "api_url" {
  description = "API URL"
  value       = "https://${cloudflare_record.api.hostname}"
}

output "cloudflare_zone_id" {
  description = "Cloudflare Zone ID"
  value       = var.cloudflare_zone_id
}

output "dashboard_url" {
  description = "Grafana dashboard URL"
  value       = var.grafana_url != "" ? "${var.grafana_url}/d/${grafana_dashboard.neuropilot_production[0].uid}" : "Not configured"
}

# ================================================================
# DATA SOURCES
# ================================================================
data "cloudflare_zones" "neuropilot" {
  filter {
    name = "neuropilot.ai"
  }
}

# ================================================================
# LOCALS
# ================================================================
locals {
  environment_tag = var.environment
  version_tag     = "v17.1"

  common_tags = {
    Environment = local.environment_tag
    Version     = local.version_tag
    ManagedBy   = "Terraform"
    Project     = "NeuroPilot"
  }
}
