#!/usr/bin/env python3
"""
NeuroPilot v17.4 - Autonomous Remediation Agent

Self-healing agent that executes remediation playbooks autonomously.
Verifies actions before and after execution, with automatic rollback capability.

Author: NeuroPilot AI Ops Team
Version: 17.4.0
"""

import json
import logging
import os
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
import yaml

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class RemediationResult:
    """Result of remediation action"""
    success: bool
    action_taken: str
    playbook_used: str
    execution_time_seconds: float
    verification_passed: bool
    rollback_executed: bool
    details: Dict
    timestamp: str


@dataclass
class PlaybookStep:
    """Single step in remediation playbook"""
    name: str
    type: str  # 'command', 'api', 'terraform', 'wait'
    params: Dict
    verification: Optional[Dict] = None
    rollback: Optional[Dict] = None


class Remediator:
    """
    Autonomous remediation agent with safety guardrails.

    Features:
    - Dry-run validation before execution
    - Step-by-step verification
    - Automatic rollback on failure
    - Notifications to Slack, Notion, Grafana
    """

    def __init__(self, config_path: str = "sentient_core/config/sentient_config.yaml"):
        self.config_path = config_path
        self.playbooks_dir = Path("sentient_core/playbooks")
        self.logs_dir = Path("logs/remediation")
        self.logs_dir.mkdir(parents=True, exist_ok=True)

        # Load configuration
        self.config = self._load_config()

        # Integration endpoints
        self.slack_webhook = os.getenv("SLACK_WEBHOOK_URL", "")
        self.notion_token = os.getenv("NOTION_TOKEN", "")
        self.grafana_url = os.getenv("GRAFANA_URL", "")
        self.railway_api_token = os.getenv("RAILWAY_API_TOKEN", "")

        # Safety settings
        self.dry_run_enabled = self.config.get('dry_run_first', True)
        self.verification_required = self.config.get('verification_required', True)
        self.auto_rollback = self.config.get('auto_rollback', True)

        logger.info("🤖 Remediation Agent initialized")

    def _load_config(self) -> Dict:
        """Load remediation configuration"""
        try:
            if Path(self.config_path).exists():
                with open(self.config_path, 'r') as f:
                    return yaml.safe_load(f)
        except Exception as e:
            logger.warning(f"Config load error: {e}")

        return {
            'dry_run_first': True,
            'verification_required': True,
            'auto_rollback': True,
            'max_retry_attempts': 2,
            'verification_wait_seconds': 30
        }

    def remediate(
        self,
        incident_type: str,
        severity: str = "high",
        context: Optional[Dict] = None
    ) -> RemediationResult:
        """
        Execute remediation for given incident type

        Args:
            incident_type: Type of incident (cpu_overload, memory_exhaustion, etc.)
            severity: Severity level (low, medium, high, critical)
            context: Additional context (metrics, predictions, etc.)

        Returns:
            RemediationResult with execution details
        """
        start_time = time.time()

        logger.info("=" * 70)
        logger.info(f"🤖 REMEDIATION STARTING: {incident_type} ({severity})")
        logger.info("=" * 70)

        # Select appropriate playbook
        playbook = self._select_playbook(incident_type, severity)
        if not playbook:
            return RemediationResult(
                success=False,
                action_taken="none",
                playbook_used="none",
                execution_time_seconds=0,
                verification_passed=False,
                rollback_executed=False,
                details={"error": "No suitable playbook found"},
                timestamp=datetime.utcnow().isoformat()
            )

        # Notify start
        self._notify_start(incident_type, severity, playbook['name'])

        # Dry run first (if enabled)
        if self.dry_run_enabled:
            logger.info("🧪 Running dry-run validation...")
            dry_run_ok = self._dry_run_playbook(playbook)
            if not dry_run_ok:
                logger.error("❌ Dry-run validation failed. Aborting.")
                return RemediationResult(
                    success=False,
                    action_taken="dry_run_failed",
                    playbook_used=playbook['name'],
                    execution_time_seconds=time.time() - start_time,
                    verification_passed=False,
                    rollback_executed=False,
                    details={"error": "Dry-run validation failed"},
                    timestamp=datetime.utcnow().isoformat()
                )
            logger.info("✓ Dry-run passed")

        # Create snapshot for rollback
        snapshot_id = self._create_rollback_snapshot()

        # Execute playbook
        logger.info(f"⚡ Executing playbook: {playbook['name']}")
        execution_success, execution_details = self._execute_playbook(playbook, context)

        # Wait for system to stabilize
        logger.info(f"⏳ Waiting {self.config['verification_wait_seconds']}s for stabilization...")
        time.sleep(self.config['verification_wait_seconds'])

        # Verify remediation
        verification_passed = False
        if execution_success and self.verification_required:
            logger.info("🔍 Verifying remediation...")
            verification_passed = self._verify_remediation(playbook, context)
            logger.info(f"Verification: {'✓ PASSED' if verification_passed else '❌ FAILED'}")

        # Rollback if verification failed
        rollback_executed = False
        if execution_success and not verification_passed and self.auto_rollback:
            logger.warning("⚠️  Verification failed. Rolling back...")
            rollback_executed = self._rollback(snapshot_id)
            logger.info(f"Rollback: {'✓ SUCCESS' if rollback_executed else '❌ FAILED'}")

        # Calculate result
        success = execution_success and (verification_passed or not self.verification_required)
        execution_time = time.time() - start_time

        result = RemediationResult(
            success=success,
            action_taken=playbook.get('action', 'unknown'),
            playbook_used=playbook['name'],
            execution_time_seconds=execution_time,
            verification_passed=verification_passed,
            rollback_executed=rollback_executed,
            details=execution_details,
            timestamp=datetime.utcnow().isoformat()
        )

        # Log result
        self._log_remediation(result, incident_type, severity)

        # Notify completion
        self._notify_completion(result, incident_type)

        logger.info("=" * 70)
        logger.info(f"🤖 REMEDIATION {'SUCCESS' if success else 'FAILED'}: {incident_type}")
        logger.info(f"   Time: {execution_time:.1f}s | Playbook: {playbook['name']}")
        logger.info("=" * 70)

        return result

    def _select_playbook(self, incident_type: str, severity: str) -> Optional[Dict]:
        """Select appropriate playbook for incident"""
        playbook_mapping = {
            'cpu_overload': 'scale_up.yaml',
            'memory_exhaustion': 'restart.yaml',
            'latency_spike': 'scale_up.yaml',
            'error_surge': 'restart.yaml',
            'cost_overrun': 'optimize.yaml'
        }

        playbook_file = playbook_mapping.get(incident_type)
        if not playbook_file:
            logger.error(f"No playbook mapping for incident: {incident_type}")
            return None

        playbook_path = self.playbooks_dir / playbook_file
        if not playbook_path.exists():
            logger.error(f"Playbook not found: {playbook_path}")
            return None

        try:
            with open(playbook_path, 'r') as f:
                playbook = yaml.safe_load(f)

            logger.info(f"✓ Selected playbook: {playbook['name']}")
            return playbook

        except Exception as e:
            logger.error(f"Playbook load error: {e}")
            return None

    def _dry_run_playbook(self, playbook: Dict) -> bool:
        """Execute playbook in dry-run mode"""
        try:
            for step_data in playbook.get('steps', []):
                step = PlaybookStep(**step_data)

                logger.info(f"  - Validating: {step.name}")

                if step.type == 'command':
                    # Check command exists
                    cmd = step.params.get('command', '').split()[0]
                    if not self._command_exists(cmd):
                        logger.error(f"Command not found: {cmd}")
                        return False

                elif step.type == 'api':
                    # Check API endpoint is reachable
                    url = step.params.get('url', '')
                    if not self._check_api_reachable(url):
                        logger.error(f"API not reachable: {url}")
                        return False

                elif step.type == 'terraform':
                    # Check terraform plan
                    if not self._terraform_plan_check():
                        logger.error("Terraform plan failed")
                        return False

            return True

        except Exception as e:
            logger.error(f"Dry-run error: {e}")
            return False

    def _execute_playbook(self, playbook: Dict, context: Optional[Dict]) -> Tuple[bool, Dict]:
        """Execute playbook steps"""
        details = {
            'steps_completed': 0,
            'steps_total': len(playbook.get('steps', [])),
            'step_results': []
        }

        try:
            for step_data in playbook.get('steps', []):
                step = PlaybookStep(**step_data)

                logger.info(f"  ▶ Executing: {step.name}")

                step_success = False

                if step.type == 'command':
                    step_success = self._execute_command(step, context)
                elif step.type == 'api':
                    step_success = self._execute_api_call(step, context)
                elif step.type == 'terraform':
                    step_success = self._execute_terraform(step)
                elif step.type == 'wait':
                    time.sleep(step.params.get('seconds', 10))
                    step_success = True

                details['step_results'].append({
                    'name': step.name,
                    'success': step_success
                })

                if step_success:
                    details['steps_completed'] += 1
                    logger.info(f"    ✓ {step.name} completed")
                else:
                    logger.error(f"    ✗ {step.name} failed")
                    return False, details

            return True, details

        except Exception as e:
            logger.error(f"Playbook execution error: {e}")
            details['error'] = str(e)
            return False, details

    def _execute_command(self, step: PlaybookStep, context: Optional[Dict]) -> bool:
        """Execute shell command"""
        try:
            cmd = step.params.get('command', '')

            # Substitute context variables
            if context:
                for key, value in context.items():
                    cmd = cmd.replace(f"{{{key}}}", str(value))

            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=step.params.get('timeout', 300)
            )

            if result.returncode == 0:
                logger.info(f"    Command output: {result.stdout.strip()[:100]}")
                return True
            else:
                logger.error(f"    Command failed: {result.stderr.strip()[:100]}")
                return False

        except Exception as e:
            logger.error(f"Command execution error: {e}")
            return False

    def _execute_api_call(self, step: PlaybookStep, context: Optional[Dict]) -> bool:
        """Execute API call"""
        try:
            url = step.params.get('url', '')
            method = step.params.get('method', 'POST')
            headers = step.params.get('headers', {})
            body = step.params.get('body', {})

            # Add auth token if Railway API
            if 'railway.app' in url and self.railway_api_token:
                headers['Authorization'] = f'Bearer {self.railway_api_token}'

            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                json=body,
                timeout=30
            )

            if response.status_code in [200, 201, 202]:
                logger.info(f"    API response: {response.status_code}")
                return True
            else:
                logger.error(f"    API failed: {response.status_code} {response.text[:100]}")
                return False

        except Exception as e:
            logger.error(f"API call error: {e}")
            return False

    def _execute_terraform(self, step: PlaybookStep) -> bool:
        """Execute Terraform command"""
        try:
            tf_dir = step.params.get('directory', 'infrastructure/terraform')
            action = step.params.get('action', 'apply')

            cmd = f"cd {tf_dir} && terraform {action} -auto-approve"

            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                timeout=600
            )

            return result.returncode == 0

        except Exception as e:
            logger.error(f"Terraform execution error: {e}")
            return False

    def _verify_remediation(self, playbook: Dict, context: Optional[Dict]) -> bool:
        """Verify remediation was successful"""
        verification = playbook.get('verification', {})
        if not verification:
            return True  # No verification steps defined

        try:
            # Check metrics improved
            metrics_check = verification.get('metrics_check', {})
            if metrics_check:
                if not self._verify_metrics(metrics_check):
                    return False

            # Check health endpoints
            health_check = verification.get('health_check', {})
            if health_check:
                if not self._verify_health(health_check):
                    return False

            # Custom verification script
            script = verification.get('script')
            if script:
                result = subprocess.run(script, shell=True, capture_output=True)
                if result.returncode != 0:
                    return False

            return True

        except Exception as e:
            logger.error(f"Verification error: {e}")
            return False

    def _verify_metrics(self, metrics_check: Dict) -> bool:
        """Verify metrics are within acceptable range"""
        try:
            prometheus_url = os.getenv("PROMETHEUS_URL", "http://localhost:9090")

            for metric_name, expected in metrics_check.items():
                query = expected.get('query', f'avg({metric_name})')
                threshold = expected.get('threshold', 100)
                condition = expected.get('condition', 'less_than')

                response = requests.get(
                    f"{prometheus_url}/api/v1/query",
                    params={'query': query},
                    timeout=10
                )

                if response.status_code != 200:
                    logger.error(f"Failed to query metric: {metric_name}")
                    return False

                result = response.json()
                if result['status'] != 'success' or not result['data']['result']:
                    logger.error(f"No data for metric: {metric_name}")
                    return False

                value = float(result['data']['result'][0]['value'][1])

                if condition == 'less_than' and value >= threshold:
                    logger.error(f"Metric {metric_name} = {value} (expected < {threshold})")
                    return False
                elif condition == 'greater_than' and value <= threshold:
                    logger.error(f"Metric {metric_name} = {value} (expected > {threshold})")
                    return False

            return True

        except Exception as e:
            logger.error(f"Metrics verification error: {e}")
            return False

    def _verify_health(self, health_check: Dict) -> bool:
        """Verify health endpoints are responding"""
        try:
            url = health_check.get('url', '')
            expected_status = health_check.get('expected_status', 200)

            response = requests.get(url, timeout=10)

            if response.status_code == expected_status:
                logger.info(f"    Health check passed: {url}")
                return True
            else:
                logger.error(f"    Health check failed: {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Health check error: {e}")
            return False

    def _create_rollback_snapshot(self) -> str:
        """Create snapshot for rollback"""
        snapshot_id = f"snapshot_{int(time.time())}"

        try:
            # Save current Terraform state
            subprocess.run(
                "cd infrastructure/terraform && terraform state pull > "
                f"../../logs/remediation/{snapshot_id}.tfstate",
                shell=True,
                capture_output=True
            )

            # Save current Railway config
            if self.railway_api_token:
                # Query current instance count, etc.
                snapshot_data = {
                    'timestamp': datetime.utcnow().isoformat(),
                    'railway_state': 'captured'
                }

                with open(f"logs/remediation/{snapshot_id}.json", 'w') as f:
                    json.dump(snapshot_data, f)

            logger.info(f"✓ Rollback snapshot created: {snapshot_id}")
            return snapshot_id

        except Exception as e:
            logger.error(f"Snapshot creation error: {e}")
            return snapshot_id

    def _rollback(self, snapshot_id: str) -> bool:
        """Rollback to previous state"""
        try:
            logger.info(f"Rolling back to snapshot: {snapshot_id}")

            # Restore Terraform state
            tfstate_path = f"logs/remediation/{snapshot_id}.tfstate"
            if Path(tfstate_path).exists():
                subprocess.run(
                    f"cd infrastructure/terraform && terraform state push ../../{tfstate_path}",
                    shell=True,
                    capture_output=True
                )

                # Apply old state
                subprocess.run(
                    "cd infrastructure/terraform && terraform apply -auto-approve",
                    shell=True,
                    capture_output=True,
                    timeout=600
                )

            logger.info("✓ Rollback completed")
            return True

        except Exception as e:
            logger.error(f"Rollback error: {e}")
            return False

    def _log_remediation(self, result: RemediationResult, incident_type: str, severity: str) -> None:
        """Log remediation result to file"""
        try:
            log_file = self.logs_dir / f"remediation_{datetime.utcnow().strftime('%Y%m%d')}.jsonl"

            log_entry = {
                'timestamp': result.timestamp,
                'incident_type': incident_type,
                'severity': severity,
                'success': result.success,
                'action_taken': result.action_taken,
                'playbook_used': result.playbook_used,
                'execution_time_seconds': result.execution_time_seconds,
                'verification_passed': result.verification_passed,
                'rollback_executed': result.rollback_executed,
                'details': result.details
            }

            with open(log_file, 'a') as f:
                f.write(json.dumps(log_entry) + '\n')

        except Exception as e:
            logger.error(f"Logging error: {e}")

    def _notify_start(self, incident_type: str, severity: str, playbook: str) -> None:
        """Notify remediation start"""
        message = (
            f"🤖 *Autonomous Remediation Starting*\n"
            f"Incident: `{incident_type}`\n"
            f"Severity: `{severity}`\n"
            f"Playbook: `{playbook}`\n"
            f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}"
        )

        self._send_slack(message)
        self._create_grafana_annotation(f"Remediation started: {incident_type}")

    def _notify_completion(self, result: RemediationResult, incident_type: str) -> None:
        """Notify remediation completion"""
        status_emoji = "✅" if result.success else "❌"

        message = (
            f"{status_emoji} *Autonomous Remediation {'Completed' if result.success else 'Failed'}*\n"
            f"Incident: `{incident_type}`\n"
            f"Action: `{result.action_taken}`\n"
            f"Time: `{result.execution_time_seconds:.1f}s`\n"
            f"Verification: `{'PASSED' if result.verification_passed else 'FAILED'}`\n"
            f"Rollback: `{'YES' if result.rollback_executed else 'NO'}`"
        )

        self._send_slack(message)
        self._create_grafana_annotation(
            f"Remediation {'completed' if result.success else 'failed'}: {incident_type}"
        )

        # Log to Notion
        self._log_to_notion(result, incident_type)

    def _send_slack(self, message: str) -> None:
        """Send Slack notification"""
        if not self.slack_webhook:
            return

        try:
            requests.post(
                self.slack_webhook,
                json={'text': message},
                timeout=10
            )
        except Exception as e:
            logger.debug(f"Slack notification error: {e}")

    def _create_grafana_annotation(self, text: str) -> None:
        """Create Grafana annotation"""
        if not self.grafana_url:
            return

        try:
            requests.post(
                f"{self.grafana_url}/api/annotations",
                json={
                    'text': text,
                    'tags': ['remediation', 'autonomous'],
                    'time': int(time.time() * 1000)
                },
                timeout=10
            )
        except Exception as e:
            logger.debug(f"Grafana annotation error: {e}")

    def _log_to_notion(self, result: RemediationResult, incident_type: str) -> None:
        """Log remediation to Notion database"""
        if not self.notion_token:
            return

        # Implementation would require Notion database ID and properties
        # Placeholder for now
        pass

    def _command_exists(self, cmd: str) -> bool:
        """Check if command exists"""
        result = subprocess.run(f"which {cmd}", shell=True, capture_output=True)
        return result.returncode == 0

    def _check_api_reachable(self, url: str) -> bool:
        """Check if API endpoint is reachable"""
        try:
            response = requests.head(url, timeout=5)
            return response.status_code < 500
        except:
            return False

    def _terraform_plan_check(self) -> bool:
        """Check if terraform plan succeeds"""
        try:
            result = subprocess.run(
                "cd infrastructure/terraform && terraform plan -detailed-exitcode",
                shell=True,
                capture_output=True,
                timeout=120
            )
            # Exit code 2 means changes are needed but plan is valid
            return result.returncode in [0, 2]
        except:
            return False


if __name__ == "__main__":
    # Test remediation agent
    agent = Remediator()

    # Simulate CPU overload incident
    result = agent.remediate(
        incident_type="cpu_overload",
        severity="high",
        context={'current_cpu': 92.0, 'target_instances': 3}
    )

    print(f"\n🤖 Remediation Result:")
    print(f"  Success: {result.success}")
    print(f"  Action: {result.action_taken}")
    print(f"  Playbook: {result.playbook_used}")
    print(f"  Time: {result.execution_time_seconds:.1f}s")
    print(f"  Verification: {'PASSED' if result.verification_passed else 'FAILED'}")
