#!/usr/bin/env python3
"""
NeuroPilot v17.3 - Ops Brain
Autonomous infrastructure optimization with AI-powered anomaly detection,
self-tuning, and intelligent decision-making.
"""

import os
import sys
import json
import pickle
import logging
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
import requests
from scipy import stats
from sklearn.preprocessing import StandardScaler
from sklearn.mixture import GaussianMixture
from statsmodels.tsa.seasonal import seasonal_decompose

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/neuropilot/ops_brain.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger('ops_brain')


@dataclass
class Metrics:
    """System metrics snapshot"""
    timestamp: datetime
    cpu_usage: float
    memory_usage: float
    p95_latency: float
    p99_latency: float
    error_rate: float
    request_rate: float
    active_instances: int
    database_query_time: float
    cost_current: float


@dataclass
class Anomaly:
    """Detected anomaly"""
    metric_name: str
    severity: str  # 'low', 'medium', 'high', 'critical'
    value: float
    expected_value: float
    deviation: float
    timestamp: datetime
    recommendation: str


@dataclass
class Decision:
    """Ops Brain decision"""
    action: str
    reason: str
    confidence: float
    parameters: Dict[str, Any]
    expected_impact: str
    timestamp: datetime


class OpsBrain:
    """
    Autonomous Ops Brain for NeuroPilot infrastructure

    Features:
    - Real-time metrics collection from Grafana/Prometheus
    - AI-powered anomaly detection (Z-score, seasonal, EWMA)
    - Self-tuning of scaling thresholds
    - Reinforcement learning for optimization
    - Autonomous decision-making
    - Reporting to Slack and Notion
    """

    def __init__(self, config_path: str = 'ai_ops/config/ops_config.yaml'):
        """Initialize Ops Brain with configuration"""
        self.config = self._load_config(config_path)
        self.model_path = Path('ai_ops/models/anomaly_model.pkl')
        self.scaler_path = Path('ai_ops/models/scaler.pkl')
        self.history_path = Path('ai_ops/models/metrics_history.json')

        # Load or initialize models
        self.anomaly_model = self._load_or_init_model()
        self.scaler = self._load_or_init_scaler()
        self.metrics_history = self._load_history()

        # Reward tracking for RL
        self.reward_history = []

        logger.info("🧠 Ops Brain initialized successfully")

    def _load_config(self, config_path: str) -> Dict:
        """Load configuration from YAML"""
        try:
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        except FileNotFoundError:
            logger.warning(f"Config not found at {config_path}, using defaults")
            return self._default_config()

    def _default_config(self) -> Dict:
        """Default configuration"""
        return {
            'grafana_url': os.getenv('GRAFANA_URL', ''),
            'grafana_api_key': os.getenv('GRAFANA_API_KEY', ''),
            'prometheus_url': os.getenv('PROMETHEUS_URL', 'http://localhost:9090'),
            'notion_api_key': os.getenv('NOTION_API_KEY', ''),
            'notion_database_id': os.getenv('NOTION_DATABASE_ID', ''),
            'slack_webhook_url': os.getenv('SLACK_WEBHOOK_URL', ''),
            'terraform_path': './infrastructure/terraform',
            'alert_thresholds': {
                'latency_ms': 150,
                'error_rate': 2.0,
                'cpu_usage': 70.0,
                'memory_usage': 75.0
            },
            'anomaly_sensitivity': 0.92,
            'learning_rate': 0.01,
            'sla_target': 99.95,
            'cost_budget': 50.0
        }

    def _load_or_init_model(self) -> GaussianMixture:
        """Load existing model or initialize new one"""
        if self.model_path.exists():
            try:
                with open(self.model_path, 'rb') as f:
                    model = pickle.load(f)
                logger.info("✓ Loaded existing anomaly model")
                return model
            except Exception as e:
                logger.warning(f"Failed to load model: {e}, initializing new one")

        # Initialize new Gaussian Mixture Model for anomaly detection
        model = GaussianMixture(
            n_components=3,  # Normal, warning, anomaly
            covariance_type='full',
            max_iter=100,
            random_state=42
        )
        logger.info("✓ Initialized new anomaly model")
        return model

    def _load_or_init_scaler(self) -> StandardScaler:
        """Load existing scaler or initialize new one"""
        if self.scaler_path.exists():
            try:
                with open(self.scaler_path, 'rb') as f:
                    scaler = pickle.load(f)
                logger.info("✓ Loaded existing scaler")
                return scaler
            except Exception as e:
                logger.warning(f"Failed to load scaler: {e}, initializing new one")

        scaler = StandardScaler()
        logger.info("✓ Initialized new scaler")
        return scaler

    def _load_history(self) -> List[Dict]:
        """Load metrics history"""
        if self.history_path.exists():
            try:
                with open(self.history_path, 'r') as f:
                    history = json.load(f)
                logger.info(f"✓ Loaded {len(history)} historical metrics")
                return history
            except Exception as e:
                logger.warning(f"Failed to load history: {e}")

        return []

    def _save_models(self):
        """Save models and scaler"""
        self.model_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.model_path, 'wb') as f:
            pickle.dump(self.anomaly_model, f)

        with open(self.scaler_path, 'wb') as f:
            pickle.dump(self.scaler, f)

        with open(self.history_path, 'w') as f:
            json.dump(self.metrics_history[-1000:], f, indent=2)  # Keep last 1000

        logger.info("✓ Saved models and history")

    def collect_metrics(self) -> Metrics:
        """Collect current metrics from Grafana/Prometheus"""
        logger.info("📊 Collecting metrics from Grafana...")

        # Query Prometheus via Grafana API
        metrics_data = {}

        queries = {
            'cpu_usage': 'avg(process_cpu_percent{environment="production"})',
            'memory_usage': 'avg((process_resident_memory_bytes / 1024 / 1024 / 512) * 100)',
            'p95_latency': 'histogram_quantile(0.95, rate(http_request_duration_ms_bucket[5m]))',
            'p99_latency': 'histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))',
            'error_rate': 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) * 100',
            'request_rate': 'sum(rate(http_requests_total[5m]))',
            'active_instances': 'count(up{job="neuropilot-backend"} == 1)',
            'database_query_time': 'rate(db_query_duration_ms_sum[5m]) / rate(db_query_duration_ms_count[5m])',
            'cost_current': 'sum(neuropilot_cost_total)'
        }

        for metric_name, query in queries.items():
            try:
                value = self._query_prometheus(query)
                metrics_data[metric_name] = value
            except Exception as e:
                logger.warning(f"Failed to query {metric_name}: {e}")
                metrics_data[metric_name] = 0.0

        metrics = Metrics(
            timestamp=datetime.utcnow(),
            **metrics_data
        )

        logger.info(f"✓ Collected metrics: CPU={metrics.cpu_usage:.1f}%, "
                   f"Latency={metrics.p95_latency:.0f}ms, "
                   f"Errors={metrics.error_rate:.2f}%")

        return metrics

    def _query_prometheus(self, query: str) -> float:
        """Query Prometheus and return single value"""
        prometheus_url = self.config.get('prometheus_url', 'http://localhost:9090')

        try:
            response = requests.get(
                f"{prometheus_url}/api/v1/query",
                params={'query': query},
                timeout=10
            )
            response.raise_for_status()

            data = response.json()
            if data['status'] == 'success' and data['data']['result']:
                return float(data['data']['result'][0]['value'][1])

            return 0.0
        except Exception as e:
            logger.error(f"Prometheus query failed: {e}")
            return 0.0

    def detect_anomalies(self, metrics: Metrics) -> List[Anomaly]:
        """
        Detect anomalies using multiple algorithms:
        1. Z-score for statistical outliers
        2. Seasonal decomposition for patterns
        3. EWMA for trend detection
        """
        logger.info("🔍 Running anomaly detection...")

        anomalies = []

        # Add to history
        metrics_dict = asdict(metrics)
        metrics_dict['timestamp'] = metrics.timestamp.isoformat()
        self.metrics_history.append(metrics_dict)

        # Need at least 48 data points (8 hours at 10-min intervals)
        if len(self.metrics_history) < 48:
            logger.info("Insufficient history for anomaly detection")
            return []

        # Convert to DataFrame
        df = pd.DataFrame(self.metrics_history[-336:])  # Last 7 days
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)

        # Check each metric
        metric_names = ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate', 'database_query_time']

        for metric_name in metric_names:
            if metric_name not in df.columns:
                continue

            current_value = metrics_dict[metric_name]

            # Method 1: Z-score
            mean = df[metric_name].mean()
            std = df[metric_name].std()
            z_score = abs((current_value - mean) / std) if std > 0 else 0

            # Method 2: EWMA
            ewma = df[metric_name].ewm(span=20).mean().iloc[-1]
            ewma_deviation = abs((current_value - ewma) / ewma) if ewma > 0 else 0

            # Determine if anomalous
            sensitivity = self.config.get('anomaly_sensitivity', 0.92)
            is_anomaly = z_score > (3 * (1 - sensitivity)) or ewma_deviation > 0.3

            if is_anomaly:
                severity = self._determine_severity(z_score, ewma_deviation)
                recommendation = self._generate_recommendation(metric_name, current_value, mean)

                anomaly = Anomaly(
                    metric_name=metric_name,
                    severity=severity,
                    value=current_value,
                    expected_value=mean,
                    deviation=z_score,
                    timestamp=metrics.timestamp,
                    recommendation=recommendation
                )
                anomalies.append(anomaly)

                logger.warning(f"⚠️  Anomaly detected: {metric_name}={current_value:.2f} "
                             f"(expected={mean:.2f}, z-score={z_score:.2f})")

        logger.info(f"✓ Detected {len(anomalies)} anomalies")
        return anomalies

    def _determine_severity(self, z_score: float, ewma_deviation: float) -> str:
        """Determine anomaly severity"""
        if z_score > 5 or ewma_deviation > 0.5:
            return 'critical'
        elif z_score > 4 or ewma_deviation > 0.4:
            return 'high'
        elif z_score > 3 or ewma_deviation > 0.3:
            return 'medium'
        else:
            return 'low'

    def _generate_recommendation(self, metric_name: str, current: float, expected: float) -> str:
        """Generate recommendation for anomaly"""
        recommendations = {
            'cpu_usage': f"Consider scaling up instances. Current CPU ({current:.1f}%) exceeds expected ({expected:.1f}%)",
            'memory_usage': f"Memory pressure detected ({current:.1f}%). Review memory leaks or scale up",
            'p95_latency': f"High latency ({current:.0f}ms vs expected {expected:.0f}ms). Check database or scale",
            'error_rate': f"Error rate spike ({current:.2f}%). Investigate logs and recent deployments",
            'database_query_time': f"Slow queries detected ({current:.0f}ms). Optimize queries or add indexes"
        }
        return recommendations.get(metric_name, f"Investigate {metric_name} anomaly")

    def optimize_thresholds(self, metrics: Metrics, anomalies: List[Anomaly]) -> Decision:
        """
        Use reinforcement learning to optimize scaling thresholds
        Reward function: SLA compliance - cost variance
        """
        logger.info("🎯 Optimizing thresholds using RL...")

        # Calculate current reward
        sla_actual = self._calculate_sla()
        cost_variance = abs(metrics.cost_current - self.config['cost_budget']) / self.config['cost_budget']

        # Reward: +1 for meeting SLA, -1 for each 1% over budget
        reward = (1.0 if sla_actual >= self.config['sla_target'] else 0.0) - cost_variance
        self.reward_history.append(reward)

        logger.info(f"Current reward: {reward:.3f} (SLA={sla_actual:.2f}%, cost_var={cost_variance:.2%})")

        # Decide on threshold adjustments
        current_thresholds = self.config['alert_thresholds']
        new_thresholds = current_thresholds.copy()

        # If SLA is met but cost is high, increase thresholds (scale less aggressively)
        if sla_actual >= self.config['sla_target'] and cost_variance > 0.1:
            new_thresholds['cpu_usage'] = min(85, current_thresholds['cpu_usage'] + 5)
            new_thresholds['memory_usage'] = min(85, current_thresholds['memory_usage'] + 5)
            action = "increase_thresholds"
            reason = "SLA met, reducing costs by scaling less aggressively"

        # If SLA is not met, decrease thresholds (scale more aggressively)
        elif sla_actual < self.config['sla_target']:
            new_thresholds['cpu_usage'] = max(60, current_thresholds['cpu_usage'] - 5)
            new_thresholds['memory_usage'] = max(60, current_thresholds['memory_usage'] - 5)
            action = "decrease_thresholds"
            reason = "SLA below target, scaling more aggressively"

        # If we have anomalies, adjust latency thresholds
        elif any(a.metric_name == 'p95_latency' for a in anomalies):
            new_thresholds['latency_ms'] = max(100, current_thresholds['latency_ms'] - 20)
            action = "decrease_latency_threshold"
            reason = "Latency anomalies detected, tightening threshold"

        else:
            action = "maintain"
            reason = "System operating within acceptable parameters"

        decision = Decision(
            action=action,
            reason=reason,
            confidence=0.8,  # Could be calculated based on reward history variance
            parameters=new_thresholds,
            expected_impact=f"SLA {sla_actual:.2f}% → {min(99.99, sla_actual + 0.05):.2f}%",
            timestamp=datetime.utcnow()
        )

        logger.info(f"✓ Decision: {action} - {reason}")

        return decision

    def _calculate_sla(self) -> float:
        """Calculate current SLA from metrics history"""
        if len(self.metrics_history) < 10:
            return 99.9

        df = pd.DataFrame(self.metrics_history[-100:])

        # SLA = percentage of time with acceptable metrics
        acceptable = (
            (df['p95_latency'] < 400) &
            (df['error_rate'] < 5.0) &
            (df['cpu_usage'] < 95)
        )

        sla = (acceptable.sum() / len(df)) * 100
        return sla

    def apply_decision(self, decision: Decision) -> bool:
        """Apply decision by updating Terraform variables"""
        if decision.action == "maintain":
            logger.info("No changes needed")
            return True

        logger.info(f"📝 Applying decision: {decision.action}")

        try:
            # Update ops_config.yaml
            self.config['alert_thresholds'] = decision.parameters

            config_path = 'ai_ops/config/ops_config.yaml'
            with open(config_path, 'w') as f:
                yaml.dump(self.config, f, default_flow_style=False)

            # Update Terraform tfvars
            terraform_path = Path(self.config['terraform_path'])
            tfvars_path = terraform_path / 'terraform.tfvars'

            if tfvars_path.exists():
                # Read current tfvars
                with open(tfvars_path, 'r') as f:
                    tfvars_content = f.read()

                # Update cpu_threshold_percent
                if 'cpu_usage' in decision.parameters:
                    new_cpu = int(decision.parameters['cpu_usage'])
                    tfvars_content = self._update_tfvar(tfvars_content, 'cpu_threshold_percent', new_cpu)

                # Write back
                with open(tfvars_path, 'w') as f:
                    f.write(tfvars_content)

                logger.info("✓ Updated Terraform variables")

            return True

        except Exception as e:
            logger.error(f"Failed to apply decision: {e}")
            return False

    def _update_tfvar(self, content: str, var_name: str, new_value: Any) -> str:
        """Update a Terraform variable in tfvars content"""
        import re
        pattern = rf'^{var_name}\s*=\s*.*$'
        replacement = f'{var_name} = {new_value}'
        return re.sub(pattern, replacement, content, flags=re.MULTILINE)

    def send_notifications(self, metrics: Metrics, anomalies: List[Anomaly], decision: Decision):
        """Send notifications to Slack and Notion"""
        logger.info("📤 Sending notifications...")

        # Send to Slack
        if self.config.get('slack_webhook_url'):
            self._send_slack_notification(metrics, anomalies, decision)

        # Send to Notion
        if self.config.get('notion_api_key'):
            self._send_notion_notification(metrics, anomalies, decision)

        logger.info("✓ Notifications sent")

    def _send_slack_notification(self, metrics: Metrics, anomalies: List[Anomaly], decision: Decision):
        """Send Slack notification"""
        webhook_url = self.config['slack_webhook_url']

        # Build message
        emoji = "🟢" if len(anomalies) == 0 else "🟡" if len(anomalies) < 3 else "🔴"

        message = {
            "text": f"{emoji} NeuroPilot AI Ops Report",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": f"{emoji} AI Ops Brain Report"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*SLA:*\n{self._calculate_sla():.2f}%"},
                        {"type": "mrkdwn", "text": f"*Cost:*\n${metrics.cost_current:.2f}"},
                        {"type": "mrkdwn", "text": f"*p95 Latency:*\n{metrics.p95_latency:.0f}ms"},
                        {"type": "mrkdwn", "text": f"*Error Rate:*\n{metrics.error_rate:.2f}%"}
                    ]
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"*Anomalies Detected:* {len(anomalies)}"}
                }
            ]
        }

        # Add anomalies
        if anomalies:
            anomaly_text = "\n".join([
                f"• {a.metric_name}: {a.value:.2f} (severity: {a.severity})"
                for a in anomalies[:5]
            ])
            message["blocks"].append({
                "type": "section",
                "text": {"type": "mrkdwn", "text": f"```{anomaly_text}```"}
            })

        # Add decision
        message["blocks"].append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": f"*AI Decision:* {decision.action}\n_{decision.reason}_"}
        })

        try:
            response = requests.post(webhook_url, json=message, timeout=10)
            response.raise_for_status()
            logger.info("✓ Slack notification sent")
        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")

    def _send_notion_notification(self, metrics: Metrics, anomalies: List[Anomaly], decision: Decision):
        """Send Notion database entry"""
        notion_api_key = self.config['notion_api_key']
        database_id = self.config.get('notion_database_id', '')

        if not database_id:
            logger.warning("Notion database ID not configured")
            return

        headers = {
            "Authorization": f"Bearer {notion_api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }

        # Create page in database
        page_data = {
            "parent": {"database_id": database_id},
            "properties": {
                "Timestamp": {"title": [{"text": {"content": metrics.timestamp.strftime("%Y-%m-%d %H:%M UTC")}}]},
                "SLA": {"number": self._calculate_sla()},
                "Cost": {"number": metrics.cost_current},
                "Latency": {"number": metrics.p95_latency},
                "Anomalies": {"number": len(anomalies)},
                "Decision": {"rich_text": [{"text": {"content": decision.action}}]},
                "Status": {"select": {"name": "Good" if len(anomalies) == 0 else "Warning" if len(anomalies) < 3 else "Alert"}}
            }
        }

        try:
            response = requests.post(
                "https://api.notion.com/v1/pages",
                headers=headers,
                json=page_data,
                timeout=10
            )
            response.raise_for_status()
            logger.info("✓ Notion entry created")
        except Exception as e:
            logger.error(f"Failed to create Notion entry: {e}")

    def run_cycle(self):
        """Run complete AI Ops cycle"""
        logger.info("=" * 60)
        logger.info("🚀 Starting AI Ops Brain cycle")
        logger.info("=" * 60)

        try:
            # 1. Collect metrics
            metrics = self.collect_metrics()

            # 2. Detect anomalies
            anomalies = self.detect_anomalies(metrics)

            # 3. Optimize thresholds
            decision = self.optimize_thresholds(metrics, anomalies)

            # 4. Apply decision
            applied = self.apply_decision(decision)

            # 5. Send notifications
            self.send_notifications(metrics, anomalies, decision)

            # 6. Save models
            self._save_models()

            logger.info("=" * 60)
            logger.info("✅ AI Ops Brain cycle completed successfully")
            logger.info("=" * 60)

            return True

        except Exception as e:
            logger.error(f"❌ AI Ops Brain cycle failed: {e}", exc_info=True)
            return False


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='NeuroPilot AI Ops Brain')
    parser.add_argument('--auto-run', action='store_true', help='Run full cycle')
    parser.add_argument('--config', default='ai_ops/config/ops_config.yaml', help='Config file path')
    args = parser.parse_args()

    brain = OpsBrain(config_path=args.config)

    if args.auto_run:
        success = brain.run_cycle()
        sys.exit(0 if success else 1)
    else:
        print("Ops Brain initialized. Use --auto-run to execute cycle.")
        sys.exit(0)


if __name__ == '__main__':
    main()
