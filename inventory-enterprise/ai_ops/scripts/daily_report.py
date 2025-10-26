#!/usr/bin/env python3
"""
NeuroPilot v17.3 - Daily Intelligence Report
Generates comprehensive daily reports with insights, trends, and recommendations
Sends to Slack and Notion
"""

import os
import sys
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any

import pandas as pd
import numpy as np
import yaml
import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('daily_report')


class DailyReportGenerator:
    """Generate and send daily intelligence reports"""

    def __init__(self, config_path: str = 'ai_ops/config/ops_config.yaml'):
        self.config = self._load_config(config_path)
        self.history_path = Path('ai_ops/models/metrics_history.json')
        self.training_log_path = Path('ai_ops/models/training_log.json')

    def _load_config(self, config_path: str) -> Dict:
        """Load configuration"""
        try:
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        except:
            return {}

    def calculate_health_score(self, df: pd.DataFrame) -> float:
        """
        Calculate system health score (0-100)
        Based on: latency, error rate, CPU, memory, availability
        """
        if df.empty:
            return 50.0

        # Component scores (0-100 each)
        latency_score = max(0, 100 - (df['p95_latency'].mean() / 4))  # 400ms = 0 points
        error_score = max(0, 100 - (df['error_rate'].mean() * 20))  # 5% = 0 points
        cpu_score = max(0, 100 - df['cpu_usage'].mean())
        memory_score = max(0, 100 - df['memory_usage'].mean())

        # Weighted average
        health_score = (
            latency_score * 0.3 +
            error_score * 0.3 +
            cpu_score * 0.2 +
            memory_score * 0.2
        )

        return min(100, max(0, health_score))

    def analyze_trends(self, df: pd.DataFrame) -> Dict[str, str]:
        """Analyze metric trends over time"""
        trends = {}

        metrics = ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate']

        for metric in metrics:
            if metric not in df.columns:
                continue

            # Calculate trend (last 24h vs previous 24h)
            midpoint = len(df) // 2
            recent_avg = df[metric].iloc[midpoint:].mean()
            previous_avg = df[metric].iloc[:midpoint].mean()

            if previous_avg == 0:
                trend = "stable"
            else:
                change_pct = ((recent_avg - previous_avg) / previous_avg) * 100

                if change_pct > 10:
                    trend = f"📈 increasing (+{change_pct:.1f}%)"
                elif change_pct < -10:
                    trend = f"📉 decreasing ({change_pct:.1f}%)"
                else:
                    trend = "➡️ stable"

            trends[metric] = trend

        return trends

    def get_scaling_actions(self, df: pd.DataFrame) -> List[str]:
        """Extract scaling actions from history"""
        # This would ideally come from a scaling events log
        # For now, infer from instance count changes
        actions = []

        if 'active_instances' in df.columns:
            instance_changes = df['active_instances'].diff()
            scale_ups = (instance_changes > 0).sum()
            scale_downs = (instance_changes < 0).sum()

            if scale_ups > 0:
                actions.append(f"Scaled up {scale_ups} times")
            if scale_downs > 0:
                actions.append(f"Scaled down {scale_downs} times")

        return actions if actions else ["No scaling actions"]

    def get_cost_projection(self, df: pd.DataFrame) -> Dict[str, float]:
        """Calculate cost projection"""
        if df.empty or 'cost_current' not in df.columns:
            return {'current': 0, 'projected': 0, 'budget': 50}

        current_cost = df['cost_current'].iloc[-1] if len(df) > 0 else 0

        # Project end-of-month cost
        days_elapsed = datetime.utcnow().day
        daily_avg = current_cost / days_elapsed if days_elapsed > 0 else current_cost
        projected_monthly = daily_avg * 30

        budget = self.config.get('cost_budget', 50.0)

        return {
            'current': current_cost,
            'projected': projected_monthly,
            'budget': budget,
            'variance_pct': ((projected_monthly - budget) / budget * 100) if budget > 0 else 0
        }

    def get_ai_learning_status(self) -> Dict[str, Any]:
        """Get AI learning status from training log"""
        if not self.training_log_path.exists():
            return {'status': 'Not trained yet', 'loss': None}

        try:
            with open(self.training_log_path, 'r') as f:
                log = json.load(f)

            if not log:
                return {'status': 'Not trained yet', 'loss': None}

            latest = log[-1]
            loss = latest.get('loss', None)

            # Determine status
            if loss is None:
                status = 'Training failed'
            elif loss < 0.02:
                status = '✅ Converged'
            elif loss < 0.05:
                status = '🟡 Converging'
            else:
                status = '🔴 Training'

            return {
                'status': status,
                'loss': loss,
                'last_trained': latest.get('timestamp', 'Unknown'),
                'anomaly_rate': latest.get('eval_metrics', {}).get('anomaly_rate', 0)
            }

        except Exception as e:
            logger.error(f"Failed to load training log: {e}")
            return {'status': 'Error', 'loss': None}

    def generate_report(self) -> Dict[str, Any]:
        """Generate complete daily report"""
        logger.info("📊 Generating daily report...")

        # Load last 48 hours of data
        if not self.history_path.exists():
            logger.warning("No metrics history found")
            return {}

        with open(self.history_path, 'r') as f:
            history = json.load(f)

        df = pd.DataFrame(history)
        df['timestamp'] = pd.to_datetime(df['timestamp'])

        # Filter to last 48 hours
        cutoff = datetime.utcnow() - timedelta(hours=48)
        df = df[df['timestamp'] >= cutoff]

        if df.empty:
            logger.warning("No data in last 48 hours")
            return {}

        # Calculate components
        health_score = self.calculate_health_score(df)
        trends = self.analyze_trends(df)
        scaling_actions = self.get_scaling_actions(df)
        cost_projection = self.get_cost_projection(df)
        ai_status = self.get_ai_learning_status()

        # Get 7-day baseline for comparison
        df_7day = df[df['timestamp'] >= (datetime.utcnow() - timedelta(days=7))]

        report = {
            'generated_at': datetime.utcnow().isoformat(),
            'period': 'Last 24 hours',
            'health_score': health_score,
            'metrics': {
                'p95_latency': {
                    'current': df['p95_latency'].iloc[-1] if len(df) > 0 else 0,
                    'avg_24h': df['p95_latency'].mean(),
                    'avg_7d_baseline': df_7day['p95_latency'].mean() if len(df_7day) > 0 else 0
                },
                'error_rate': {
                    'current': df['error_rate'].iloc[-1] if len(df) > 0 else 0,
                    'avg_24h': df['error_rate'].mean(),
                    'max_24h': df['error_rate'].max()
                },
                'cpu_usage': {
                    'current': df['cpu_usage'].iloc[-1] if len(df) > 0 else 0,
                    'avg_24h': df['cpu_usage'].mean(),
                    'max_24h': df['cpu_usage'].max()
                },
                'memory_usage': {
                    'current': df['memory_usage'].iloc[-1] if len(df) > 0 else 0,
                    'avg_24h': df['memory_usage'].mean(),
                    'max_24h': df['memory_usage'].max()
                }
            },
            'trends': trends,
            'scaling_actions': scaling_actions,
            'cost_projection': cost_projection,
            'ai_learning': ai_status,
            'sla': self._calculate_sla(df),
            'recommendations': self._generate_recommendations(df, health_score, cost_projection)
        }

        logger.info(f"✓ Report generated - Health Score: {health_score:.1f}/100")

        return report

    def _calculate_sla(self, df: pd.DataFrame) -> float:
        """Calculate SLA from dataframe"""
        if df.empty:
            return 99.9

        acceptable = (
            (df['p95_latency'] < 400) &
            (df['error_rate'] < 5.0) &
            (df['cpu_usage'] < 95)
        )

        return (acceptable.sum() / len(df)) * 100

    def _generate_recommendations(self, df: pd.DataFrame, health_score: float,
                                  cost_projection: Dict) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []

        # Health-based recommendations
        if health_score < 70:
            recommendations.append("⚠️ System health is degraded. Review error logs and consider scaling up.")

        # Latency recommendations
        if df['p95_latency'].mean() > 200:
            recommendations.append("🐌 Latency is elevated. Consider adding database indexes or scaling.")

        # Error rate recommendations
        if df['error_rate'].mean() > 2:
            recommendations.append("🔴 Error rate above target. Investigate recent deployments.")

        # Cost recommendations
        if cost_projection['variance_pct'] > 20:
            recommendations.append(f"💰 Projected to exceed budget by {cost_projection['variance_pct']:.0f}%. Review auto-scaling thresholds.")
        elif cost_projection['variance_pct'] < -20:
            recommendations.append("💡 Running under budget. Consider enabling multi-region HA for better SLA.")

        # CPU recommendations
        if df['cpu_usage'].mean() > 80:
            recommendations.append("📈 High CPU usage. Scale up or optimize application code.")
        elif df['cpu_usage'].mean() < 30:
            recommendations.append("📉 Low CPU usage. Consider scaling down to reduce costs.")

        if not recommendations:
            recommendations.append("✅ All systems operating optimally. No action needed.")

        return recommendations

    def send_slack_report(self, report: Dict):
        """Send report to Slack"""
        webhook_url = self.config.get('slack_webhook_url')
        if not webhook_url:
            logger.warning("Slack webhook not configured")
            return

        logger.info("📤 Sending report to Slack...")

        # Determine emoji based on health score
        health_score = report['health_score']
        if health_score >= 90:
            emoji = "🟢"
            status = "Excellent"
        elif health_score >= 75:
            emoji = "🟡"
            status = "Good"
        elif health_score >= 60:
            emoji = "🟠"
            status = "Degraded"
        else:
            emoji = "🔴"
            status = "Critical"

        message = {
            "text": f"{emoji} NeuroPilot Daily Intelligence Report",
            "blocks": [
                {
                    "type": "header",
                    "text": {"type": "plain_text", "text": f"{emoji} Daily Intelligence Report"}
                },
                {
                    "type": "section",
                    "fields": [
                        {"type": "mrkdwn", "text": f"*Health Score:*\n{health_score:.1f}/100 ({status})"},
                        {"type": "mrkdwn", "text": f"*SLA:*\n{report['sla']:.2f}%"},
                        {"type": "mrkdwn", "text": f"*p95 Latency:*\n{report['metrics']['p95_latency']['current']:.0f}ms"},
                        {"type": "mrkdwn", "text": f"*Cost:*\n${report['cost_projection']['current']:.2f}"}
                    ]
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*📈 Trends (24h):*"}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "\n".join([f"• {k}: {v}" for k, v in report['trends'].items()])}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*🤖 AI Learning Status:*"}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": f"{report['ai_learning']['status']} (Loss: {report['ai_learning']['loss']:.4f if report['ai_learning']['loss'] else 'N/A'})"}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "*💡 Recommendations:*"}
                },
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": "\n".join([f"• {r}" for r in report['recommendations']])}
                }
            ]
        }

        try:
            response = requests.post(webhook_url, json=message, timeout=10)
            response.raise_for_status()
            logger.info("✓ Slack report sent")
        except Exception as e:
            logger.error(f"Failed to send Slack report: {e}")

    def send_notion_report(self, report: Dict):
        """Send report to Notion database"""
        notion_api_key = self.config.get('notion_api_key')
        database_id = self.config.get('notion_database_id')

        if not notion_api_key or not database_id:
            logger.warning("Notion credentials not configured")
            return

        logger.info("📤 Sending report to Notion...")

        headers = {
            "Authorization": f"Bearer {notion_api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28"
        }

        # Create page
        page_data = {
            "parent": {"database_id": database_id},
            "properties": {
                "Date": {"title": [{"text": {"content": datetime.utcnow().strftime("%Y-%m-%d")}}]},
                "Health Score": {"number": report['health_score']},
                "SLA": {"number": report['sla']},
                "Latency (p95)": {"number": report['metrics']['p95_latency']['current']},
                "Error Rate": {"number": report['metrics']['error_rate']['current']},
                "Cost": {"number": report['cost_projection']['current']},
                "Status": {"select": {"name": "Good" if report['health_score'] >= 75 else "Warning" if report['health_score'] >= 60 else "Critical"}},
                "AI Status": {"rich_text": [{"text": {"content": report['ai_learning']['status']}}]}
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
            logger.info("✓ Notion report sent")
        except Exception as e:
            logger.error(f"Failed to send Notion report: {e}")

    def run(self) -> bool:
        """Generate and send daily report"""
        logger.info("=" * 60)
        logger.info("📊 Starting Daily Report Generation")
        logger.info("=" * 60)

        try:
            # Generate report
            report = self.generate_report()

            if not report:
                logger.error("Failed to generate report")
                return False

            # Send to channels
            self.send_slack_report(report)
            self.send_notion_report(report)

            # Save report locally
            report_path = Path('ai_ops/reports')
            report_path.mkdir(parents=True, exist_ok=True)

            filename = f"daily_report_{datetime.utcnow().strftime('%Y%m%d')}.json"
            with open(report_path / filename, 'w') as f:
                json.dump(report, f, indent=2)

            logger.info(f"✓ Report saved to {report_path / filename}")

            logger.info("=" * 60)
            logger.info("✅ Daily Report completed successfully")
            logger.info("=" * 60)

            return True

        except Exception as e:
            logger.error(f"❌ Daily Report failed: {e}", exc_info=True)
            return False


def main():
    """Main entry point"""
    generator = DailyReportGenerator()
    success = generator.run()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
