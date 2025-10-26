#!/usr/bin/env python3
"""
NeuroPilot Validation Summary Generator

Aggregates validation data from daily reports and generates:
1. validation_summary.md (markdown summary)
2. validation_summary.pdf (formatted PDF report)
3. telemetry_results.json (structured data for v17.7 blueprint refinement)

Usage:
    python3 generate_validation_summary.py --days 30
    python3 generate_validation_summary.py --start 2025-01-01 --end 2025-01-31
    python3 generate_validation_summary.py --output validation_60day_summary.pdf

Requirements:
    pip install matplotlib pandas reportlab jinja2
"""

import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import statistics

# Optional PDF generation (requires reportlab)
try:
    from reportlab.lib.pagesizes import letter, A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib import colors
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    print("⚠️  reportlab not installed - PDF generation disabled")
    print("   Install with: pip install reportlab")


class ValidationSummaryGenerator:
    """Generate comprehensive validation summary from daily reports"""

    def __init__(self, reports_dir: str = "validation_reports"):
        self.reports_dir = Path(reports_dir)

        if not self.reports_dir.exists():
            raise FileNotFoundError(f"Reports directory not found: {self.reports_dir}")

    def load_reports(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        days: Optional[int] = None
    ) -> List[Dict]:
        """Load validation reports from specified date range"""

        # Calculate date range
        if days:
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=days)
        elif not start_date or not end_date:
            # Default to last 30 days
            end_date = datetime.utcnow()
            start_date = end_date - timedelta(days=30)

        print(f"📅 Loading reports from {start_date.date()} to {end_date.date()}")

        # Find all report files
        report_files = sorted(self.reports_dir.glob("sentient_validation_report_*.json"))

        if not report_files:
            raise FileNotFoundError(f"No validation reports found in {self.reports_dir}")

        # Filter by date range
        reports = []

        for report_file in report_files:
            try:
                data = json.loads(report_file.read_text())
                timestamp_str = data.get('validation_timestamp', '').replace('Z', '')
                report_date = datetime.fromisoformat(timestamp_str)

                # Make timezone-naive for comparison
                if report_date.tzinfo is not None:
                    report_date = report_date.replace(tzinfo=None)

                if start_date <= report_date <= end_date:
                    reports.append(data)

            except Exception as e:
                print(f"⚠️  Error loading {report_file.name}: {e}")

        print(f"✅ Loaded {len(reports)} validation reports")

        return reports

    def calculate_statistics(self, reports: List[Dict]) -> Dict:
        """Calculate aggregate statistics from reports"""

        if not reports:
            return {}

        # Forecast metrics
        forecast_accuracies = [
            r['forecast']['accuracy'] * 100
            for r in reports
            if 'forecast' in r and 'accuracy' in r['forecast']
        ]

        # Remediation metrics
        remediation_success_rates = [
            r['remediation']['success_rate'] * 100
            for r in reports
            if 'remediation' in r and 'success_rate' in r['remediation']
        ]

        # Compliance metrics
        compliance_scores = [
            r['compliance']['overall_score']
            for r in reports
            if 'compliance' in r and 'overall_score' in r['compliance']
        ]

        # System health
        uptimes = [
            r['system_health']['uptime']
            for r in reports
            if 'system_health' in r and 'uptime' in r['system_health']
        ]

        # Genesis metrics (may not exist in all reports)
        agents_created = [
            r['genesis']['agents_created']
            for r in reports
            if 'genesis' in r and 'agents_created' in r['genesis']
        ]

        evolution_generations = [
            r['genesis']['evolution_generations']
            for r in reports
            if 'genesis' in r and 'evolution_generations' in r['genesis']
        ]

        # Calculate statistics
        stats = {
            'period': {
                'start': reports[0]['validation_timestamp'],
                'end': reports[-1]['validation_timestamp'],
                'days': len(reports)
            },

            'forecast': {
                'avg_accuracy': statistics.mean(forecast_accuracies) if forecast_accuracies else 0,
                'min_accuracy': min(forecast_accuracies) if forecast_accuracies else 0,
                'max_accuracy': max(forecast_accuracies) if forecast_accuracies else 0,
                'stdev_accuracy': statistics.stdev(forecast_accuracies) if len(forecast_accuracies) > 1 else 0,
                'trend': self._calculate_trend(forecast_accuracies)
            },

            'remediation': {
                'avg_success_rate': statistics.mean(remediation_success_rates) if remediation_success_rates else 0,
                'min_success_rate': min(remediation_success_rates) if remediation_success_rates else 0,
                'max_success_rate': max(remediation_success_rates) if remediation_success_rates else 0,
                'total_remediations': sum(
                    r['remediation']['total_remediations']
                    for r in reports
                    if 'remediation' in r and 'total_remediations' in r['remediation']
                ),
                'trend': self._calculate_trend(remediation_success_rates)
            },

            'compliance': {
                'avg_score': statistics.mean(compliance_scores) if compliance_scores else 0,
                'min_score': min(compliance_scores) if compliance_scores else 0,
                'max_score': max(compliance_scores) if compliance_scores else 0,
                'critical_findings': sum(
                    r['compliance']['critical_findings']
                    for r in reports
                    if 'compliance' in r and 'critical_findings' in r['compliance']
                ),
                'trend': self._calculate_trend(compliance_scores)
            },

            'system_health': {
                'avg_uptime': statistics.mean(uptimes) if uptimes else 0,
                'min_uptime': min(uptimes) if uptimes else 0,
                'downtime_incidents': sum(
                    1 for u in uptimes if u < 99.9
                ),
                'sla_compliance': sum(1 for u in uptimes if u >= 99.9) / len(uptimes) * 100 if uptimes else 0
            },

            'genesis': {
                'total_agents_created': sum(agents_created) if agents_created else 0,
                'total_evolution_generations': sum(evolution_generations) if evolution_generations else 0,
                'avg_agents_per_day': statistics.mean(agents_created) if agents_created else 0,
                'avg_generations_per_day': statistics.mean(evolution_generations) if evolution_generations else 0
            },

            'overall': {
                'healthy_days': sum(
                    1 for r in reports
                    if r.get('overall_status') == 'healthy'
                ),
                'degraded_days': sum(
                    1 for r in reports
                    if r.get('overall_status') == 'degraded'
                ),
                'critical_days': sum(
                    1 for r in reports
                    if r.get('overall_status') == 'critical'
                )
            }
        }

        return stats

    def _calculate_trend(self, values: List[float]) -> str:
        """Calculate trend direction (improving, stable, degrading)"""

        if len(values) < 2:
            return "insufficient_data"

        # Simple linear regression slope
        n = len(values)
        x = list(range(n))
        y = values

        x_mean = statistics.mean(x)
        y_mean = statistics.mean(y)

        slope = sum((x[i] - x_mean) * (y[i] - y_mean) for i in range(n)) / \
                sum((x[i] - x_mean) ** 2 for i in range(n))

        # Classify trend
        if slope > 0.5:
            return "improving"
        elif slope < -0.5:
            return "degrading"
        else:
            return "stable"

    def generate_markdown(self, stats: Dict, output_file: str = "validation_summary.md"):
        """Generate markdown summary"""

        md = f"""# NeuroPilot Validation Summary

**Period**: {stats['period']['start']} to {stats['period']['end']}
**Duration**: {stats['period']['days']} days
**Generated**: {datetime.utcnow().isoformat()}

---

## Executive Summary

### Overall Health

- **Healthy Days**: {stats['overall']['healthy_days']} / {stats['period']['days']} ({stats['overall']['healthy_days'] / stats['period']['days'] * 100:.1f}%)
- **Degraded Days**: {stats['overall']['degraded_days']}
- **Critical Days**: {stats['overall']['critical_days']}

### Key Metrics

| Metric | Average | Min | Max | Target | Status |
|--------|---------|-----|-----|--------|--------|
| **Forecast Accuracy** | {stats['forecast']['avg_accuracy']:.1f}% | {stats['forecast']['min_accuracy']:.1f}% | {stats['forecast']['max_accuracy']:.1f}% | ≥85% | {'✅ PASS' if stats['forecast']['avg_accuracy'] >= 85 else '❌ FAIL'} |
| **Remediation Success** | {stats['remediation']['avg_success_rate']:.1f}% | {stats['remediation']['min_success_rate']:.1f}% | {stats['remediation']['max_success_rate']:.1f}% | ≥95% | {'✅ PASS' if stats['remediation']['avg_success_rate'] >= 95 else '❌ FAIL'} |
| **Compliance Score** | {stats['compliance']['avg_score']:.1f}/100 | {stats['compliance']['min_score']:.0f}/100 | {stats['compliance']['max_score']:.0f}/100 | ≥90 | {'✅ PASS' if stats['compliance']['avg_score'] >= 90 else '❌ FAIL'} |
| **System Uptime** | {stats['system_health']['avg_uptime']:.3f}% | {stats['system_health']['min_uptime']:.3f}% | - | ≥99.9% | {'✅ PASS' if stats['system_health']['avg_uptime'] >= 99.9 else '❌ FAIL'} |

---

## Detailed Analysis

### Forecast Validation (v17.4)

- **Average Accuracy**: {stats['forecast']['avg_accuracy']:.1f}%
- **Standard Deviation**: {stats['forecast']['stdev_accuracy']:.2f}%
- **Trend**: {stats['forecast']['trend'].upper()}
- **Assessment**: {'Exceeding target ✅' if stats['forecast']['avg_accuracy'] >= 85 else 'Below target ❌'}

**Observations**:
- Forecast accuracy is {stats['forecast']['trend']}
- {f"Accuracy variance is {stats['forecast']['stdev_accuracy']:.1f}% - {'stable' if stats['forecast']['stdev_accuracy'] < 5 else 'variable'}" if stats['forecast']['stdev_accuracy'] > 0 else 'Insufficient data for variance analysis'}

### Remediation Validation (v17.4)

- **Average Success Rate**: {stats['remediation']['avg_success_rate']:.1f}%
- **Total Remediations**: {stats['remediation']['total_remediations']}
- **Trend**: {stats['remediation']['trend'].upper()}
- **Assessment**: {'Exceeding target ✅' if stats['remediation']['avg_success_rate'] >= 95 else 'Below target ❌'}

**Observations**:
- {stats['remediation']['total_remediations']} remediations executed over {stats['period']['days']} days
- Average of {stats['remediation']['total_remediations'] / stats['period']['days']:.1f} remediations per day

### Compliance Validation (v17.4-17.6)

- **Average Score**: {stats['compliance']['avg_score']:.1f}/100
- **Critical Findings**: {stats['compliance']['critical_findings']} total
- **Trend**: {stats['compliance']['trend'].upper()}
- **Assessment**: {'Meeting standards ✅' if stats['compliance']['avg_score'] >= 90 and stats['compliance']['critical_findings'] == 0 else 'Action required ❌'}

### System Health

- **Average Uptime**: {stats['system_health']['avg_uptime']:.3f}%
- **SLA Compliance**: {stats['system_health']['sla_compliance']:.1f}% of days met 99.9% target
- **Downtime Incidents**: {stats['system_health']['downtime_incidents']}

### Genesis Mode (v17.6)

- **Agents Created**: {stats['genesis']['total_agents_created']} total
- **Evolution Generations**: {stats['genesis']['total_evolution_generations']} total
- **Average Agents/Day**: {stats['genesis']['avg_agents_per_day']:.2f}
- **Average Generations/Day**: {stats['genesis']['avg_generations_per_day']:.2f}

**Observations**:
- {f"Genesis created {stats['genesis']['total_agents_created']} agents - {'within expected range ✅' if stats['genesis']['total_agents_created'] <= 2 * (stats['period']['days'] / 30) else 'higher than expected ⚠️'}" if stats['genesis']['total_agents_created'] > 0 else 'No agents created - system operating within normal parameters ✅'}

---

## Trends & Insights

### What's Working Well

"""

        # Add positive observations
        if stats['forecast']['trend'] == 'improving':
            md += "- 📈 Forecast accuracy is improving over time\n"
        if stats['remediation']['avg_success_rate'] >= 95:
            md += "- ✅ Remediation success rate consistently meets target\n"
        if stats['compliance']['critical_findings'] == 0:
            md += "- 🔒 Zero critical compliance findings throughout period\n"
        if stats['system_health']['downtime_incidents'] == 0:
            md += "- ⏱️  Perfect uptime - no incidents below 99.9% threshold\n"

        md += "\n### Areas for Improvement\n\n"

        # Add areas for improvement
        if stats['forecast']['avg_accuracy'] < 85:
            md += f"- ⚠️  Forecast accuracy below target ({stats['forecast']['avg_accuracy']:.1f}% vs 85% target)\n"
        if stats['remediation']['avg_success_rate'] < 95:
            md += f"- ⚠️  Remediation success rate below target ({stats['remediation']['avg_success_rate']:.1f}% vs 95% target)\n"
        if stats['compliance']['avg_score'] < 90:
            md += f"- ⚠️  Compliance score below target ({stats['compliance']['avg_score']:.1f}/100 vs 90/100 target)\n"
        if stats['system_health']['downtime_incidents'] > 0:
            md += f"- ⚠️  {stats['system_health']['downtime_incidents']} uptime incidents during period\n"

        md += """
---

## Recommendations for v17.7

Based on {days} days of production data:

""".format(days=stats['period']['days'])

        # Add data-driven recommendations
        if stats['forecast']['avg_accuracy'] >= 90:
            md += "- ✅ **Forecast System**: Performing excellently - can serve as baseline for distributed forecasting in v17.7\n"
        else:
            md += "- ⚠️  **Forecast System**: Address accuracy before scaling to multi-region\n"

        if stats['remediation']['total_remediations'] / stats['period']['days'] > 5:
            md += f"- 📊 **High Remediation Volume**: {stats['remediation']['total_remediations'] / stats['period']['days']:.1f} actions/day - justify multi-region deployment for resilience\n"
        else:
            md += "- 💰 **Low Remediation Volume**: Consider starting with 2 regions instead of 3 to optimize costs\n"

        if stats['genesis']['total_agents_created'] == 0:
            md += "- 🌌 **Genesis Mode**: No agents created - defer multi-agent orchestration complexity\n"
        elif stats['genesis']['total_agents_created'] > 2:
            md += f"- 🌌 **Genesis Mode**: {stats['genesis']['total_agents_created']} agents created - validate need for Stellar Forge orchestration\n"

        md += """
---

## Next Steps

1. **Review this summary** with stakeholders
2. **Address critical issues** identified in Areas for Improvement
3. **Refine v17.7 Blueprint** based on production data
4. **Plan v17.7 implementation** with data-driven scope

---

**End of Validation Summary**
"""

        # Write markdown file
        output_path = Path(output_file)
        output_path.write_text(md)

        print(f"✅ Markdown summary saved to {output_file}")

        return md

    def generate_telemetry_json(self, stats: Dict, output_file: str = "telemetry_results.json"):
        """Generate structured JSON for v17.7 blueprint refinement"""

        telemetry = {
            'metadata': {
                'generated_at': datetime.utcnow().isoformat(),
                'period_start': stats['period']['start'],
                'period_end': stats['period']['end'],
                'duration_days': stats['period']['days'],
                'neuropilot_version': '17.6.0'
            },

            'forecast_telemetry': {
                'accuracy': {
                    'average': stats['forecast']['avg_accuracy'],
                    'min': stats['forecast']['min_accuracy'],
                    'max': stats['forecast']['max_accuracy'],
                    'stdev': stats['forecast']['stdev_accuracy'],
                    'trend': stats['forecast']['trend']
                },
                'meets_target': stats['forecast']['avg_accuracy'] >= 85,
                'target': 85.0
            },

            'remediation_telemetry': {
                'success_rate': {
                    'average': stats['remediation']['avg_success_rate'],
                    'min': stats['remediation']['min_success_rate'],
                    'max': stats['remediation']['max_success_rate'],
                    'trend': stats['remediation']['trend']
                },
                'volume': {
                    'total': stats['remediation']['total_remediations'],
                    'per_day': stats['remediation']['total_remediations'] / stats['period']['days']
                },
                'meets_target': stats['remediation']['avg_success_rate'] >= 95,
                'target': 95.0
            },

            'compliance_telemetry': {
                'score': {
                    'average': stats['compliance']['avg_score'],
                    'min': stats['compliance']['min_score'],
                    'max': stats['compliance']['max_score'],
                    'trend': stats['compliance']['trend']
                },
                'critical_findings': stats['compliance']['critical_findings'],
                'meets_target': stats['compliance']['avg_score'] >= 90 and stats['compliance']['critical_findings'] == 0,
                'target': 90
            },

            'system_health_telemetry': {
                'uptime': {
                    'average': stats['system_health']['avg_uptime'],
                    'min': stats['system_health']['min_uptime'],
                    'sla_compliance_percent': stats['system_health']['sla_compliance']
                },
                'incidents': stats['system_health']['downtime_incidents'],
                'meets_target': stats['system_health']['avg_uptime'] >= 99.9,
                'target': 99.9
            },

            'genesis_telemetry': {
                'agents_created': {
                    'total': stats['genesis']['total_agents_created'],
                    'per_day': stats['genesis']['avg_agents_per_day']
                },
                'evolution': {
                    'total_generations': stats['genesis']['total_evolution_generations'],
                    'per_day': stats['genesis']['avg_generations_per_day']
                },
                'assessment': 'active' if stats['genesis']['total_agents_created'] > 0 else 'dormant'
            },

            'recommendations_for_v17_7': {
                'multi_region_justified': stats['remediation']['total_remediations'] / stats['period']['days'] > 5,
                'multi_agent_justified': stats['genesis']['total_agents_created'] > 2,
                'suggested_regions': 2 if stats['remediation']['total_remediations'] / stats['period']['days'] <= 5 else 3,
                'cost_optimization_priority': 'high' if stats['remediation']['total_remediations'] / stats['period']['days'] < 5 else 'medium',
                'forecast_accuracy_sufficient': stats['forecast']['avg_accuracy'] >= 90
            }
        }

        # Write JSON file
        output_path = Path(output_file)
        output_path.write_text(json.dumps(telemetry, indent=2))

        print(f"✅ Telemetry JSON saved to {output_file}")

        return telemetry

    def generate_pdf(self, markdown_content: str, output_file: str = "validation_summary.pdf"):
        """Generate PDF from markdown summary"""

        if not PDF_AVAILABLE:
            print("❌ PDF generation not available (reportlab not installed)")
            return

        # Create PDF
        doc = SimpleDocTemplate(output_file, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []

        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=30
        )

        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#333333'),
            spaceAfter=12
        )

        # Parse markdown and convert to PDF elements
        # (Simplified - full implementation would use a markdown parser)

        lines = markdown_content.split('\n')

        for line in lines:
            if line.startswith('# '):
                # Title
                story.append(Paragraph(line[2:], title_style))
                story.append(Spacer(1, 0.2 * inch))

            elif line.startswith('## '):
                # Heading
                story.append(Spacer(1, 0.3 * inch))
                story.append(Paragraph(line[3:], heading_style))
                story.append(Spacer(1, 0.1 * inch))

            elif line.startswith('**') and line.endswith('**'):
                # Bold text
                story.append(Paragraph(f"<b>{line[2:-2]}</b>", styles['Normal']))

            elif line.startswith('- '):
                # Bullet point
                story.append(Paragraph(f"• {line[2:]}", styles['Normal']))

            elif line.strip():
                # Normal paragraph
                story.append(Paragraph(line, styles['Normal']))
                story.append(Spacer(1, 0.1 * inch))

        # Build PDF
        doc.build(story)

        print(f"✅ PDF summary saved to {output_file}")


def main():
    parser = argparse.ArgumentParser(
        description='Generate NeuroPilot validation summary from daily reports'
    )

    parser.add_argument(
        '--days',
        type=int,
        help='Number of days to include (from today backwards)'
    )

    parser.add_argument(
        '--start',
        type=str,
        help='Start date (YYYY-MM-DD)'
    )

    parser.add_argument(
        '--end',
        type=str,
        help='End date (YYYY-MM-DD)'
    )

    parser.add_argument(
        '--reports-dir',
        type=str,
        default='validation_reports',
        help='Directory containing validation reports'
    )

    parser.add_argument(
        '--output',
        type=str,
        default='validation_summary',
        help='Output filename (without extension)'
    )

    parser.add_argument(
        '--no-pdf',
        action='store_true',
        help='Skip PDF generation'
    )

    args = parser.parse_args()

    # Parse dates
    start_date = datetime.fromisoformat(args.start) if args.start else None
    end_date = datetime.fromisoformat(args.end) if args.end else None

    # Generate summary
    generator = ValidationSummaryGenerator(args.reports_dir)

    print("🔍 NeuroPilot Validation Summary Generator")
    print("=" * 60)

    # Load reports
    reports = generator.load_reports(
        start_date=start_date,
        end_date=end_date,
        days=args.days
    )

    if not reports:
        print("❌ No reports found for specified date range")
        return

    # Calculate statistics
    print("\n📊 Calculating statistics...")
    stats = generator.calculate_statistics(reports)

    # Generate markdown
    print("\n📝 Generating markdown summary...")
    md_file = f"{args.output}.md"
    markdown_content = generator.generate_markdown(stats, md_file)

    # Generate telemetry JSON
    print("\n📊 Generating telemetry JSON...")
    json_file = "telemetry_results.json"
    generator.generate_telemetry_json(stats, json_file)

    # Generate PDF
    if not args.no_pdf and PDF_AVAILABLE:
        print("\n📄 Generating PDF summary...")
        pdf_file = f"{args.output}.pdf"
        generator.generate_pdf(markdown_content, pdf_file)

    print("\n" + "=" * 60)
    print("✅ Validation summary generation complete!")
    print(f"\nGenerated files:")
    print(f"  - {md_file}")
    print(f"  - {json_file}")
    if not args.no_pdf and PDF_AVAILABLE:
        print(f"  - {pdf_file}")

    print(f"\n📊 Summary:")
    print(f"  - Period: {stats['period']['days']} days")
    print(f"  - Forecast Accuracy: {stats['forecast']['avg_accuracy']:.1f}% (target: ≥85%)")
    print(f"  - Remediation Success: {stats['remediation']['avg_success_rate']:.1f}% (target: ≥95%)")
    print(f"  - Compliance Score: {stats['compliance']['avg_score']:.1f}/100 (target: ≥90)")
    print(f"  - System Uptime: {stats['system_health']['avg_uptime']:.3f}% (target: ≥99.9%)")


if __name__ == '__main__':
    main()
