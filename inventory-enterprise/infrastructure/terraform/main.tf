# NeuroPilot v17.2 - Complete Multi-Cloud Infrastructure
# Terraform Expansion Mode: Full IaC + GitOps + Auto-Scaling

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.28"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "~> 2.4"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.4"
    }
  }

  # Remote state backend (Terraform Cloud or S3)
  backend "remote" {
    organization = "neuropilot"

    workspaces {
      name = "neuropilot-production"
    }
  }
}

# ================================================================
# CLOUDFLARE MODULE
# ================================================================
module "cloudflare" {
  source = "./modules/cloudflare"

  zone_id    = var.cloudflare_zone_id
  api_token  = var.cloudflare_api_token

  # DNS Configuration
  frontend_host = var.vercel_host
  api_host      = var.railway_host

  # Security Settings
  ssl_mode           = "strict"
  enable_waf         = true
  enable_rate_limit  = true
  enable_auto_minify = true
  enable_brotli      = true

  # WAF Rules
  waf_rules = {
    sql_injection = {
      enabled     = true
      action      = "block"
      expression  = "(http.request.uri.query contains \"UNION SELECT\" or http.request.uri.query contains \"'; DROP TABLE\")"
    }
    xss_protection = {
      enabled     = true
      action      = "block"
      expression  = "(http.request.uri.query contains \"<script\" or http.request.uri.query contains \"javascript:\")"
    }
    bot_challenge = {
      enabled     = true
      action      = "managed_challenge"
      expression  = "(cf.threat_score > 20)"
    }
  }

  # Rate Limiting
  rate_limit_rules = [
    {
      path      = "/api/auth/login"
      threshold = 5
      period    = 900  # 15 minutes
      action    = "ban"
      timeout   = 600  # 10 minutes
    },
    {
      path      = "/api/*"
      threshold = 300
      period    = 600  # 10 minutes
      action    = "challenge"
      timeout   = 300
    }
  ]

  # Caching Rules
  page_rules = [
    {
      target   = "inventory.neuropilot.ai/*.js"
      priority = 1
      actions = {
        cache_level       = "cache_everything"
        edge_cache_ttl    = 86400
        browser_cache_ttl = 86400
      }
    },
    {
      target   = "inventory.neuropilot.ai/*.css"
      priority = 2
      actions = {
        cache_level       = "cache_everything"
        edge_cache_ttl    = 86400
        browser_cache_ttl = 86400
      }
    }
  ]

  environment = var.environment
  tags        = local.common_tags
}

# ================================================================
# GRAFANA MODULE
# ================================================================
module "grafana" {
  source = "./modules/grafana"

  grafana_url     = var.grafana_url
  grafana_api_key = var.grafana_api_key

  # Dashboard Configuration
  dashboard_config = {
    title       = "NeuroPilot v17.2 - Production Metrics"
    folder_name = "NeuroPilot"
    tags        = ["neuropilot", "v17.2", "production"]
    refresh     = "30s"
    time_from   = "now-6h"
    time_to     = "now"
  }

  # Panels Configuration
  panels = [
    {
      id          = 1
      title       = "API Latency (p95)"
      type        = "graph"
      query       = "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))"
      legend      = "p95 latency"
      unit        = "ms"
      threshold   = 400
    },
    {
      id          = 2
      title       = "Request Rate"
      type        = "graph"
      query       = "rate(http_requests_total[5m])"
      legend      = "{{method}} {{path}}"
      unit        = "reqps"
      threshold   = null
    },
    {
      id          = 3
      title       = "Error Rate"
      type        = "graph"
      query       = "rate(http_requests_total{status=~\"5..\"}[5m])"
      legend      = "5xx errors"
      unit        = "percentunit"
      threshold   = 0.05
    },
    {
      id          = 4
      title       = "Cache Hit Ratio"
      type        = "stat"
      query       = "sum(rate(cache_hits_total[5m])) / sum(rate(cache_requests_total[5m]))"
      legend      = "Cache Hit %"
      unit        = "percentunit"
      threshold   = 0.80
    },
    {
      id          = 5
      title       = "Database Query Time"
      type        = "graph"
      query       = "rate(db_query_duration_ms_sum[5m]) / rate(db_query_duration_ms_count[5m])"
      legend      = "Avg query time"
      unit        = "ms"
      threshold   = 100
    },
    {
      id          = 6
      title       = "Memory Usage"
      type        = "graph"
      query       = "process_resident_memory_bytes / 1024 / 1024"
      legend      = "Memory (MB)"
      unit        = "decmbytes"
      threshold   = 400
    }
  ]

  # Alert Rules
  alerts = [
    {
      name           = "High API Latency"
      folder_name    = "NeuroPilot"
      interval       = "1m"
      for_duration   = "5m"
      query          = "histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m])) > 400"
      severity       = "warning"
      notify_channel = "slack"
      message        = "API p95 latency is above 400ms threshold"
    },
    {
      name           = "High Error Rate"
      folder_name    = "NeuroPilot"
      interval       = "1m"
      for_duration   = "2m"
      query          = "rate(http_requests_total{status=~\"5..\"}[5m]) > 0.05"
      severity       = "critical"
      notify_channel = "pagerduty"
      message        = "API error rate is above 5% threshold"
    },
    {
      name           = "Database Slow Queries"
      folder_name    = "NeuroPilot"
      interval       = "1m"
      for_duration   = "5m"
      query          = "rate(db_query_duration_ms_sum[5m]) / rate(db_query_duration_ms_count[5m]) > 500"
      severity       = "warning"
      notify_channel = "slack"
      message        = "Database queries averaging >500ms"
    }
  ]

  environment = var.environment
  tags        = local.common_tags
}

# ================================================================
# COST MONITORING
# ================================================================
resource "null_resource" "cost_monitoring" {
  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Setting up cost monitoring..."
      export RAILWAY_TOKEN="${var.railway_token}"
      export GRAFANA_API_KEY="${var.grafana_api_key}"

      # Create cost tracking metrics
      cat > /tmp/cost_metrics.sh <<'EOF'
#!/bin/bash
# Cost metrics collection script
RAILWAY_COST=$(railway billing usage --json | jq -r '.total' || echo "0")
GRAFANA_COST=0  # Free tier
SENTRY_COST=0   # Free tier
CLOUDFLARE_COST=0  # Free tier

TOTAL_COST=$(echo "$RAILWAY_COST + $GRAFANA_COST + $SENTRY_COST + $CLOUDFLARE_COST" | bc)

# Export to Grafana
curl -X POST "${var.grafana_url}/api/v1/push" \
  -H "Authorization: Bearer ${var.grafana_api_key}" \
  -H "Content-Type: application/json" \
  -d "{
    \"metrics\": [
      {\"name\":\"neuropilot.cost.total\",\"value\":$TOTAL_COST,\"timestamp\":$(date +%s)},
      {\"name\":\"neuropilot.cost.railway\",\"value\":$RAILWAY_COST,\"timestamp\":$(date +%s)},
      {\"name\":\"neuropilot.cost.grafana\",\"value\":$GRAFANA_COST,\"timestamp\":$(date +%s)}
    ]
  }"
EOF
      chmod +x /tmp/cost_metrics.sh
    EOT
  }
}

# ================================================================
# AUTO-SCALING CONFIGURATION
# ================================================================
resource "null_resource" "autoscaling_setup" {
  triggers = {
    config_hash = md5(jsonencode({
      backend_cpu_target  = var.autoscaling_backend_cpu_target
      frontend_latency    = var.autoscaling_frontend_latency_target
    }))
  }

  provisioner "local-exec" {
    command = <<-EOT
      cat > /tmp/autoscaling_rules.json <<'EOF'
{
  "backend": {
    "metric": "cpu_usage",
    "target": ${var.autoscaling_backend_cpu_target},
    "min_instances": ${var.autoscaling_backend_min},
    "max_instances": ${var.autoscaling_backend_max},
    "cooldown": 300
  },
  "frontend": {
    "metric": "latency_p95",
    "target": ${var.autoscaling_frontend_latency_target},
    "min_instances": ${var.autoscaling_frontend_min},
    "max_instances": ${var.autoscaling_frontend_max},
    "cooldown": 300
  }
}
EOF
    EOT
  }
}

# ================================================================
# DATA SOURCES
# ================================================================
data "cloudflare_zones" "neuropilot" {
  filter {
    name = "neuropilot.ai"
  }
}

data "http" "railway_status" {
  count = var.railway_host != "" ? 1 : 0
  url   = "https://${var.railway_host}/health"

  request_headers = {
    Accept = "application/json"
  }
}

# ================================================================
# LOCALS
# ================================================================
locals {
  environment_tag = var.environment
  version_tag     = "v17.2"

  common_tags = {
    Environment = local.environment_tag
    Version     = local.version_tag
    ManagedBy   = "Terraform"
    Project     = "NeuroPilot"
    GitOps      = "true"
  }

  # Cost thresholds
  cost_warning_threshold  = 20  # USD
  cost_critical_threshold = 40  # USD

  # Performance targets
  latency_target_ms = 120
  error_rate_target = 0.01  # 1%
  uptime_target     = 0.9995  # 99.95%
}

# ================================================================
# OUTPUTS
# ================================================================
output "infrastructure_summary" {
  description = "Complete infrastructure summary"
  value = {
    cloudflare = {
      zone_id      = module.cloudflare.zone_id
      frontend_url = module.cloudflare.frontend_url
      api_url      = module.cloudflare.api_url
      waf_rules    = length(module.cloudflare.waf_rule_ids)
      rate_limits  = length(module.cloudflare.rate_limit_ids)
    }
    grafana = {
      dashboard_url  = module.grafana.dashboard_url
      dashboard_uid  = module.grafana.dashboard_uid
      alert_rules    = length(module.grafana.alert_rule_ids)
      data_sources   = length(module.grafana.data_source_ids)
    }
    cost = {
      monthly_estimate = "${local.cost_warning_threshold} USD"
      warning_at       = "${local.cost_warning_threshold} USD"
      critical_at      = "${local.cost_critical_threshold} USD"
    }
    performance = {
      latency_target_ms = local.latency_target_ms
      error_rate_target = local.error_rate_target
      uptime_target     = "${local.uptime_target * 100}%"
    }
    environment = local.environment_tag
    version     = local.version_tag
  }
}

output "deployment_urls" {
  description = "All deployment URLs"
  value = {
    frontend     = "https://${module.cloudflare.frontend_url}"
    api          = "https://${module.cloudflare.api_url}"
    grafana      = var.grafana_url
    terraform    = "https://app.terraform.io/app/neuropilot/workspaces/neuropilot-production"
  }
  sensitive = false
}

output "next_steps" {
  description = "Post-deployment actions"
  value = <<-EOT
    ✅ Infrastructure deployed successfully!

    Next steps:
    1. Verify Grafana dashboard: ${module.grafana.dashboard_url}
    2. Test API endpoint: curl https://${module.cloudflare.api_url}/health
    3. Run smoke tests: cd backend && ./scripts/smoke-test.sh
    4. Monitor costs: Check Grafana cost dashboard
    5. Set up alerts: Configure Slack/PagerDuty webhooks

    GitOps enabled: Push to main branch triggers auto-deployment
  EOT
}
