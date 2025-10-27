#!/usr/bin/env python3
"""
========================================
PHASE IV: VALIDATION ENGINE v17.7
========================================
NeuroPilot - Daily Validation & Telemetry Aggregator
Runs daily at 02:00 UTC via cron or GitHub Actions
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any
import statistics

# Configuration
TELEMETRY_DIR = Path(__file__).parent.parent / "telemetry"
EVENTS_FILE = TELEMETRY_DIR / "events" / "validation.ndjson"
DAILY_DIR = TELEMETRY_DIR / "daily"
WEEKLY_DIR = TELEMETRY_DIR / "weekly"

# Thresholds for v17.7 validation (aligned with schema)
THRESHOLDS = {
    "forecast_accuracy": {
        "ok": 0.88,      # GO
        "warn": 0.85,    # ADJUST
        "critical": 0.80 # REBUILD
    },
    "remediation_success_rate": {
        "ok": 0.96,      # GO
        "warn": 0.95,    # ADJUST
        "critical": 0.90 # REBUILD
    },
    "compliance_score": {
        "ok": 92,        # GO
        "warn": 90,      # ADJUST
        "critical": 85   # REBUILD
    },
    "uptime_pct": {
        "ok": 99.9,      # GO
        "warn": 99.5,    # ADJUST
        "critical": 99.0 # REBUILD
    },
    "daily_cost_usd": {
        "ok": 1.40,      # GO (below threshold)
        "warn": 1.50,    # ADJUST
        "critical": 2.00 # REBUILD
    }
}


class ValidationEngine:
    """Daily validation aggregator and threshold evaluator"""

    def __init__(self):
        self.today = datetime.utcnow().date()
        self.events = []
        self.metrics = {}

        # Ensure directories exist
        DAILY_DIR.mkdir(parents=True, exist_ok=True)
        WEEKLY_DIR.mkdir(parents=True, exist_ok=True)
        (TELEMETRY_DIR / "events").mkdir(parents=True, exist_ok=True)

    def load_events(self, date: datetime.date) -> List[Dict]:
        """Load all events for a specific date from NDJSON file"""
        if not EVENTS_FILE.exists():
            print(f"⚠️  No events file found: {EVENTS_FILE}")
            return []

        events = []
        with open(EVENTS_FILE, 'r') as f:
            for line in f:
                try:
                    event = json.loads(line.strip())
                    event_date = datetime.fromisoformat(
                        event['timestamp'].replace('Z', '+00:00')
                    ).date()

                    if event_date == date:
                        events.append(event)
                except (json.JSONDecodeError, KeyError, ValueError) as e:
                    print(f"⚠️  Skipping malformed event: {e}")
                    continue

        return events

    def aggregate_metrics(self, events: List[Dict]) -> Dict[str, Any]:
        """Aggregate events into daily KPIs"""
        metrics = {
            "forecast_accuracy": [],
            "remediation_success_rate": [],
            "compliance_score": [],
            "uptime_pct": [],
            "daily_cost_usd": [],
            "agent_creations": 0,
            "evolution_generations": 0
        }

        for event in events:
            payload = event.get('payload', {})
            metric_name = payload.get('metric')
            value = payload.get('value')

            if metric_name in metrics and value is not None:
                if isinstance(metrics[metric_name], list):
                    metrics[metric_name].append(float(value))
                elif metric_name == "agent_creations":
                    metrics["agent_creations"] += int(value)
                elif metric_name == "evolution_generations":
                    metrics["evolution_generations"] += int(value)

        # Calculate aggregates
        aggregated = {}

        for key, values in metrics.items():
            if isinstance(values, list) and values:
                aggregated[key] = {
                    "mean": statistics.mean(values),
                    "min": min(values),
                    "max": max(values),
                    "count": len(values)
                }
            elif isinstance(values, int):
                aggregated[key] = values

        return aggregated

    def evaluate_thresholds(self, metrics: Dict[str, Any]) -> Dict[str, str]:
        """Evaluate metrics against thresholds and return status"""
        evaluations = {}

        for metric_name, thresholds in THRESHOLDS.items():
            if metric_name not in metrics:
                evaluations[metric_name] = "UNKNOWN"
                continue

            # Get mean value for comparison
            value = metrics[metric_name].get('mean') if isinstance(
                metrics[metric_name], dict
            ) else metrics[metric_name]

            if value is None:
                evaluations[metric_name] = "UNKNOWN"
                continue

            # For cost, lower is better
            if metric_name == "daily_cost_usd":
                if value <= thresholds["ok"]:
                    evaluations[metric_name] = "OK"
                elif value <= thresholds["warn"]:
                    evaluations[metric_name] = "WARN"
                else:
                    evaluations[metric_name] = "CRITICAL"
            else:
                # For other metrics, higher is better
                if value >= thresholds["ok"]:
                    evaluations[metric_name] = "OK"
                elif value >= thresholds["warn"]:
                    evaluations[metric_name] = "WARN"
                else:
                    evaluations[metric_name] = "CRITICAL"

        return evaluations

    def determine_overall_status(self, evaluations: Dict[str, str]) -> str:
        """Determine overall system status based on evaluations"""
        if any(status == "CRITICAL" for status in evaluations.values()):
            return "REBUILD"
        elif any(status == "WARN" for status in evaluations.values()):
            return "ADJUST"
        elif all(status in ["OK", "UNKNOWN"] for status in evaluations.values()):
            return "GO"
        else:
            return "UNKNOWN"

    def generate_daily_rollup(self, date: datetime.date) -> Dict:
        """Generate daily rollup report"""
        events = self.load_events(date)
        metrics = self.aggregate_metrics(events)
        evaluations = self.evaluate_thresholds(metrics)
        overall_status = self.determine_overall_status(evaluations)

        # Simplify metrics for KPIs (use mean values)
        kpis = {}
        for key, value in metrics.items():
            if isinstance(value, dict) and 'mean' in value:
                kpis[key] = round(value['mean'], 4)
            else:
                kpis[key] = value

        rollup = {
            "schema_version": "v17.7.1",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "env": "prod",
            "service": "validation_engine",
            "kind": "daily_rollup",
            "payload": {
                "date": date.isoformat(),
                "kpis": kpis,
                "threshold_eval": evaluations,
                "overall_status": overall_status,
                "event_count": len(events)
            }
        }

        return rollup

    def save_daily_rollup(self, rollup: Dict, date: datetime.date):
        """Save daily rollup to file"""
        filename = DAILY_DIR / f"{date.isoformat()}.json"

        with open(filename, 'w') as f:
            json.dump(rollup, f, indent=2)

        print(f"✅ Daily rollup saved: {filename}")

    def generate_slack_summary(self, rollup: Dict) -> str:
        """Generate Slack notification message"""
        payload = rollup['payload']
        status = payload['overall_status']
        kpis = payload['kpis']
        evals = payload['threshold_eval']

        # Status emoji
        status_emoji = {
            "GO": "✅",
            "ADJUST": "⚠️",
            "REBUILD": "🚨",
            "UNKNOWN": "❓"
        }

        message = f"""
🤖 *NeuroPilot Daily Validation Report*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 *Date:* {payload['date']}
{status_emoji.get(status, '❓')} *Status:* {status}

📊 *Key Performance Indicators:*

• Forecast Accuracy: {kpis.get('forecast_accuracy', 'N/A'):.2%} {self._status_icon(evals.get('forecast_accuracy'))}
• Remediation Success: {kpis.get('remediation_success_rate', 'N/A'):.2%} {self._status_icon(evals.get('remediation_success_rate'))}
• Compliance Score: {kpis.get('compliance_score', 'N/A')}/100 {self._status_icon(evals.get('compliance_score'))}
• System Uptime: {kpis.get('uptime_pct', 'N/A'):.2f}% {self._status_icon(evals.get('uptime_pct'))}
• Daily Cost: ${kpis.get('daily_cost_usd', 'N/A'):.2f} {self._status_icon(evals.get('daily_cost_usd'))}

🤖 *Genesis Activity:*
• Agents Created: {kpis.get('agent_creations', 0)}
• Evolution Generations: {kpis.get('evolution_generations', 0)}

📈 *Events Processed:* {payload['event_count']}

{self._get_recommendation(status)}
"""
        return message.strip()

    def _status_icon(self, status: str) -> str:
        """Get icon for threshold evaluation"""
        icons = {
            "OK": "✅",
            "WARN": "⚠️",
            "CRITICAL": "🚨",
            "UNKNOWN": "❓"
        }
        return icons.get(status, "")

    def _get_recommendation(self, status: str) -> str:
        """Get recommendation based on status"""
        recommendations = {
            "GO": "✅ *All systems optimal* - Proceed with confidence",
            "ADJUST": "⚠️ *Action Required* - Review warnings and optimize",
            "REBUILD": "🚨 *Critical Issues* - Immediate attention needed",
            "UNKNOWN": "❓ *Insufficient Data* - Continue monitoring"
        }
        return recommendations.get(status, "")

    def run(self, date: datetime.date = None):
        """Run validation engine for specified date (default: yesterday)"""
        if date is None:
            date = (datetime.utcnow() - timedelta(days=1)).date()

        print(f"🚀 Validation Engine v17.7 - Running for {date}")
        print("=" * 60)

        # Generate daily rollup
        rollup = self.generate_daily_rollup(date)

        # Save rollup
        self.save_daily_rollup(rollup, date)

        # Generate Slack summary
        slack_message = self.generate_slack_summary(rollup)

        print("\n" + "=" * 60)
        print("📊 DAILY SUMMARY")
        print("=" * 60)
        print(slack_message)
        print("=" * 60)

        # Output status for CI/CD
        status = rollup['payload']['overall_status']
        print(f"\n🎯 Overall Status: {status}")

        # Exit code based on status
        if status == "REBUILD":
            return 2
        elif status == "ADJUST":
            return 1
        else:
            return 0


def main():
    """Main entry point"""
    engine = ValidationEngine()

    # Check for date argument
    if len(sys.argv) > 1:
        try:
            date = datetime.fromisoformat(sys.argv[1]).date()
            exit_code = engine.run(date)
        except ValueError:
            print(f"❌ Invalid date format. Use YYYY-MM-DD")
            sys.exit(1)
    else:
        # Run for yesterday by default
        exit_code = engine.run()

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
