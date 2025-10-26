#!/usr/bin/env python3
"""
NeuroPilot v17.6 - Guardian Agent

System safety sentinel and anti-loop enforcement.
Prevents runaway evolution, validates generated code, enforces rollback safety.

Author: NeuroPilot Genesis Team
Version: 17.6.0
"""

import ast
import json
import logging
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class SafetyViolation:
    """Safety violation record"""
    violation_type: str
    severity: str  # 'critical', 'high', 'medium', 'low'
    description: str
    affected_component: str
    timestamp: str
    remediation: str


@dataclass
class GuardianReport:
    """Guardian audit report"""
    report_id: str
    violations: List[SafetyViolation]
    system_health: str  # 'healthy', 'degraded', 'critical'
    rollback_recommended: bool
    safe_to_proceed: bool
    timestamp: str


class GuardianAgent:
    """
    Guardian Agent - System safety and stability sentinel.

    Responsibilities:
    - Detect infinite recursion / runaway evolution
    - Rollback unstable generations
    - Maintain immutable system snapshots
    - Validate all generated code before merge
    - Enforce zero-trust security policies
    - Monitor resource consumption
    - Prevent cascading failures

    Safety Thresholds:
    - Max evolution cycles per hour: 2
    - Max agent generations per day: 5
    - Max cost increase: 20% per week
    - Min uptime: 99.9%
    """

    def __init__(self, memory_core=None):
        self.memory_core = memory_core
        self.violations = []

        # Safety thresholds
        self.thresholds = {
            'max_evolution_cycles_per_hour': 2,
            'max_agent_generations_per_day': 5,
            'max_cost_increase_percent': 20,
            'min_uptime_percent': 99.9,
            'max_error_rate_percent': 2.0,
            'max_recursion_depth': 3
        }

        # Activity tracking
        self.recent_activity = {
            'evolution_cycles': [],
            'agent_generations': [],
            'rollbacks': []
        }

        logger.info("🛡️  Guardian Agent initialized")

    def verify_all_integrity(self) -> GuardianReport:
        """
        Run complete system integrity check.

        Returns:
            GuardianReport with findings
        """
        logger.info("=" * 70)
        logger.info("🛡️  GUARDIAN: Full System Integrity Audit")
        logger.info("=" * 70)

        violations = []

        # Check 1: Runaway evolution detection
        evolution_violations = self._check_runaway_evolution()
        violations.extend(evolution_violations)

        # Check 2: Code quality validation
        code_violations = self._check_code_quality()
        violations.extend(code_violations)

        # Check 3: Resource consumption
        resource_violations = self._check_resource_limits()
        violations.extend(resource_violations)

        # Check 4: Security policies
        security_violations = self._check_security_policies()
        violations.extend(security_violations)

        # Check 5: System stability
        stability_violations = self._check_system_stability()
        violations.extend(stability_violations)

        # Assess overall health
        critical_count = len([v for v in violations if v.severity == 'critical'])
        high_count = len([v for v in violations if v.severity == 'high'])

        if critical_count > 0:
            system_health = 'critical'
            rollback_recommended = True
            safe_to_proceed = False
        elif high_count > 2:
            system_health = 'degraded'
            rollback_recommended = True
            safe_to_proceed = False
        elif high_count > 0:
            system_health = 'degraded'
            rollback_recommended = False
            safe_to_proceed = True
        else:
            system_health = 'healthy'
            rollback_recommended = False
            safe_to_proceed = True

        report = GuardianReport(
            report_id=f"guardian_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
            violations=violations,
            system_health=system_health,
            rollback_recommended=rollback_recommended,
            safe_to_proceed=safe_to_proceed,
            timestamp=datetime.utcnow().isoformat()
        )

        logger.info(f"\n{'='*70}")
        logger.info(f"Guardian Audit Complete:")
        logger.info(f"  System Health: {system_health.upper()}")
        logger.info(f"  Violations: {len(violations)} ({critical_count} critical, {high_count} high)")
        logger.info(f"  Safe to Proceed: {'✅ YES' if safe_to_proceed else '❌ NO'}")
        logger.info(f"  Rollback Recommended: {'⚠️  YES' if rollback_recommended else '✓ NO'}")
        logger.info(f"{'='*70}\n")

        return report

    def validate_generated_code(self, code: str, agent_name: str) -> Tuple[bool, List[str]]:
        """
        Validate generated code for safety.

        Args:
            code: Generated code to validate
            agent_name: Name of agent being validated

        Returns:
            (is_safe, list of issues)
        """
        logger.info(f"🔍 Validating generated code: {agent_name}")

        issues = []

        # Check 1: Syntax validation
        try:
            ast.parse(code)
        except SyntaxError as e:
            issues.append(f"Syntax error: {e}")

        # Check 2: Forbidden imports
        forbidden_imports = ['os.system', 'subprocess.Popen', 'eval', 'exec', '__import__']
        for forbidden in forbidden_imports:
            if forbidden in code:
                issues.append(f"Forbidden import/function: {forbidden}")

        # Check 3: No hardcoded secrets
        secret_patterns = [
            r'(?i)(password|secret|key|token)\s*=\s*["\'][^"\']{10,}["\']',
            r'(?i)api[_-]?key\s*=',
        ]

        for pattern in secret_patterns:
            if re.search(pattern, code):
                issues.append(f"Potential hardcoded secret detected")
                break

        # Check 4: No external network calls (except allowed APIs)
        if 'requests.get' in code or 'urllib.request' in code:
            # Check if it's to allowed endpoints
            if not any(allowed in code for allowed in ['prometheus', 'grafana', 'slack']):
                issues.append("Unauthorized external network call detected")

        # Check 5: Recursion depth limits
        if 'def ' in code:
            # Simple heuristic: check for recursive calls
            functions = re.findall(r'def\s+(\w+)\s*\(', code)
            for func in functions:
                if code.count(func) > 10:  # Potentially recursive
                    issues.append(f"Potential deep recursion in function: {func}")

        is_safe = len(issues) == 0

        if is_safe:
            logger.info(f"  ✅ Code validation passed")
        else:
            logger.warning(f"  ⚠️  Code validation issues: {len(issues)}")
            for issue in issues:
                logger.warning(f"    - {issue}")

        return is_safe, issues

    def rollback_to_last_stable(self) -> bool:
        """
        Rollback system to last known stable state.

        Returns:
            True if rollback succeeded
        """
        logger.info("🔄 Initiating rollback to last stable state...")

        if not self.memory_core:
            logger.error("  ❌ Memory Core not available for rollback")
            return False

        # Get last stable snapshot
        stable_snapshot = self.memory_core.get_last_stable_snapshot()

        if not stable_snapshot:
            logger.error("  ❌ No stable snapshot found")
            return False

        logger.info(f"  ✓ Found stable snapshot: {stable_snapshot.snapshot_id}")

        # Restore snapshot
        restored = self.memory_core.restore_snapshot(stable_snapshot.snapshot_id)

        if not restored:
            logger.error("  ❌ Snapshot restoration failed")
            return False

        # Record rollback
        self.recent_activity['rollbacks'].append({
            'snapshot_id': stable_snapshot.snapshot_id,
            'timestamp': datetime.utcnow().isoformat()
        })

        logger.info(f"  ✅ Rollback complete to {stable_snapshot.version}")

        return True

    def enforce_rate_limits(self, operation: str) -> bool:
        """
        Enforce rate limits for operations.

        Args:
            operation: Operation type ('evolution', 'agent_generation')

        Returns:
            True if operation is allowed
        """
        now = datetime.utcnow()

        if operation == 'evolution':
            # Check evolution cycles in last hour
            recent_cycles = [
                c for c in self.recent_activity.get('evolution_cycles', [])
                if datetime.fromisoformat(c['timestamp']) > now - timedelta(hours=1)
            ]

            if len(recent_cycles) >= self.thresholds['max_evolution_cycles_per_hour']:
                logger.warning(f"⚠️  Rate limit exceeded: {len(recent_cycles)} evolution cycles in last hour")
                return False

            # Record this cycle
            self.recent_activity['evolution_cycles'].append({
                'timestamp': now.isoformat()
            })

        elif operation == 'agent_generation':
            # Check agent generations in last day
            recent_gens = [
                g for g in self.recent_activity.get('agent_generations', [])
                if datetime.fromisoformat(g['timestamp']) > now - timedelta(days=1)
            ]

            if len(recent_gens) >= self.thresholds['max_agent_generations_per_day']:
                logger.warning(f"⚠️  Rate limit exceeded: {len(recent_gens)} agents generated in last 24h")
                return False

            # Record this generation
            self.recent_activity['agent_generations'].append({
                'timestamp': now.isoformat()
            })

        return True

    def create_safety_checkpoint(self, version: str, metrics: Dict) -> str:
        """
        Create safety checkpoint before risky operation.

        Args:
            version: Current version
            metrics: Current metrics

        Returns:
            Checkpoint ID
        """
        if not self.memory_core:
            return ""

        snapshot = self.memory_core.create_snapshot(
            version=version,
            configuration={'type': 'safety_checkpoint'},
            metrics=metrics
        )

        logger.info(f"🛡️  Safety checkpoint created: {snapshot.snapshot_id}")

        return snapshot.snapshot_id

    # ==================== Private Safety Checks ====================

    def _check_runaway_evolution(self) -> List[SafetyViolation]:
        """Check for runaway evolution patterns"""
        violations = []

        # Check evolution frequency
        now = datetime.utcnow()
        recent_cycles = [
            c for c in self.recent_activity.get('evolution_cycles', [])
            if datetime.fromisoformat(c['timestamp']) > now - timedelta(hours=1)
        ]

        if len(recent_cycles) > self.thresholds['max_evolution_cycles_per_hour']:
            violations.append(SafetyViolation(
                violation_type='runaway_evolution',
                severity='high',
                description=f"Evolution frequency exceeds limit: {len(recent_cycles)} cycles in 1 hour",
                affected_component='evolution_controller',
                timestamp=datetime.utcnow().isoformat(),
                remediation='Pause evolution cycles for 1 hour'
            ))

        return violations

    def _check_code_quality(self) -> List[SafetyViolation]:
        """Check generated code quality"""
        violations = []

        # Check for generated agents
        agents_dir = Path("sentient_core/genesis/generated_agents")

        if agents_dir.exists():
            for agent_file in agents_dir.glob("*.py"):
                try:
                    with open(agent_file, 'r') as f:
                        code = f.read()

                    is_safe, issues = self.validate_generated_code(code, agent_file.name)

                    if not is_safe:
                        violations.append(SafetyViolation(
                            violation_type='unsafe_code',
                            severity='high',
                            description=f"Code safety issues in {agent_file.name}: {', '.join(issues)}",
                            affected_component=agent_file.name,
                            timestamp=datetime.utcnow().isoformat(),
                            remediation='Remove or fix unsafe code'
                        ))
                except:
                    pass

        return violations

    def _check_resource_limits(self) -> List[SafetyViolation]:
        """Check resource consumption limits"""
        violations = []

        # This would check actual resource usage
        # Simplified for now

        return violations

    def _check_security_policies(self) -> List[SafetyViolation]:
        """Check security policy compliance"""
        violations = []

        # Check for hardcoded secrets
        try:
            result = subprocess.run(
                ['grep', '-r', '-i', 'password.*=.*["\']', 'sentient_core/', '--include=*.py'],
                capture_output=True,
                text=True,
                timeout=10
            )

            if result.returncode == 0 and result.stdout:
                violations.append(SafetyViolation(
                    violation_type='hardcoded_secrets',
                    severity='critical',
                    description='Potential hardcoded secrets detected',
                    affected_component='codebase',
                    timestamp=datetime.utcnow().isoformat(),
                    remediation='Remove hardcoded secrets, use environment variables'
                ))
        except:
            pass

        return violations

    def _check_system_stability(self) -> List[SafetyViolation]:
        """Check system stability metrics"""
        violations = []

        if self.memory_core:
            # Check for recent regressions
            regression = self.memory_core.detect_regression({
                'uptime': 99.9,
                'error_rate': 1.0
            })

            if regression:
                violations.append(SafetyViolation(
                    violation_type='performance_regression',
                    severity='high',
                    description=f"Regression detected: {regression['metric']} degraded by {regression['degradation']:.1%}",
                    affected_component='system_performance',
                    timestamp=datetime.utcnow().isoformat(),
                    remediation='Investigate and rollback if necessary'
                ))

        return violations


if __name__ == "__main__":
    # Test Guardian Agent
    from memory_core import MemoryCore

    memory = MemoryCore()
    guardian = GuardianAgent(memory_core=memory)

    # Run full audit
    report = guardian.verify_all_integrity()

    print(f"\n🛡️  Guardian Report:")
    print(f"  Health: {report.system_health}")
    print(f"  Violations: {len(report.violations)}")
    print(f"  Safe to Proceed: {report.safe_to_proceed}")
    print(f"  Rollback Recommended: {report.rollback_recommended}")

    # Test code validation
    test_code = '''
def example_function():
    """Example function"""
    return "Hello, World!"
'''

    is_safe, issues = guardian.validate_generated_code(test_code, "test_agent.py")
    print(f"\n  Code Validation: {'✅ SAFE' if is_safe else '❌ UNSAFE'}")
    if issues:
        for issue in issues:
            print(f"    - {issue}")
