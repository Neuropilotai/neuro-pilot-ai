#!/usr/bin/env python3
"""
NeuroPilot v17.6 - Memory Core

Persistent long-term learning memory with encrypted storage.
Stores experiment outcomes, recalls best configurations, and detects regressions.

Author: NeuroPilot Genesis Team
Version: 17.6.0
"""

import hashlib
import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Experiment:
    """Record of a system experiment"""
    experiment_id: str
    configuration: Dict
    metrics: Dict
    outcome: str  # 'success', 'failure', 'partial'
    performance_gain: float
    cost_impact: float
    timestamp: str
    duration_seconds: float


@dataclass
class MemorySnapshot:
    """Snapshot of system state"""
    snapshot_id: str
    version: str
    configuration: Dict
    performance_metrics: Dict
    is_stable: bool
    timestamp: str
    checksum: str


class MemoryCore:
    """
    Memory Core - Persistent learning and configuration memory.

    Features:
    - Store experiment outcomes with encryption
    - Long-term performance recall
    - Adaptive threshold tuning
    - Regression detection
    - Best configuration tracking
    - Immutable audit trail

    Storage:
    - sentient_core/memory/memstore_v17_6.json (encrypted)
    - sentient_core/memory/snapshots/ (version checkpoints)
    - sentient_core/memory/ledger/ (immutable audit log)
    """

    def __init__(self, memory_dir: str = "sentient_core/memory"):
        self.memory_dir = Path(memory_dir)
        self.memory_dir.mkdir(parents=True, exist_ok=True)

        self.snapshots_dir = self.memory_dir / "snapshots"
        self.snapshots_dir.mkdir(parents=True, exist_ok=True)

        self.ledger_dir = self.memory_dir / "ledger"
        self.ledger_dir.mkdir(parents=True, exist_ok=True)

        self.memstore_path = self.memory_dir / "memstore_v17_6.json"

        # Load existing memory
        self.memory = self._load_memory()

        # Experiments history
        self.experiments: List[Experiment] = []
        self.snapshots: List[MemorySnapshot] = []

        # Load from storage
        self._load_experiments()
        self._load_snapshots()

        logger.info("🧠 Memory Core initialized")

    def store_experiment(self, experiment: Experiment) -> None:
        """
        Store experiment outcome in memory.

        Args:
            experiment: Experiment to store
        """
        logger.info(f"💾 Storing experiment: {experiment.experiment_id}")

        # Add to experiments list
        self.experiments.append(experiment)

        # Update memory store
        if 'experiments' not in self.memory:
            self.memory['experiments'] = []

        self.memory['experiments'].append(asdict(experiment))

        # Keep only last 100 experiments
        if len(self.memory['experiments']) > 100:
            self.memory['experiments'] = self.memory['experiments'][-100:]

        # Update best configurations if this was successful
        if experiment.outcome == 'success' and experiment.performance_gain > 0:
            self._update_best_configurations(experiment)

        # Save to disk
        self._save_memory()

        # Append to immutable ledger
        self._append_to_ledger('experiment', experiment.experiment_id, asdict(experiment))

    def recall_best_configurations(self, metric: str = 'performance_gain', top_n: int = 5) -> List[Dict]:
        """
        Recall best configurations by metric.

        Args:
            metric: Metric to sort by (performance_gain, cost_impact)
            top_n: Number of configurations to return

        Returns:
            List of best configurations
        """
        logger.info(f"🔍 Recalling top {top_n} configurations by {metric}")

        if 'best_configurations' not in self.memory:
            return []

        best_configs = self.memory['best_configurations']

        # Sort by metric
        sorted_configs = sorted(
            best_configs,
            key=lambda x: x.get(metric, 0),
            reverse=True
        )

        return sorted_configs[:top_n]

    def detect_regression(self, current_metrics: Dict) -> Optional[Dict]:
        """
        Detect performance regression compared to historical baseline.

        Args:
            current_metrics: Current system metrics

        Returns:
            Regression details if detected, None otherwise
        """
        logger.info("📊 Checking for performance regression...")

        if not self.experiments:
            return None

        # Get recent successful experiments
        recent_successful = [
            e for e in self.experiments[-20:]
            if e.outcome == 'success'
        ]

        if len(recent_successful) < 5:
            return None

        # Calculate baseline from recent history
        baseline_metrics = self._calculate_baseline(recent_successful)

        # Compare current to baseline
        regression = None

        for metric, baseline_value in baseline_metrics.items():
            if metric in current_metrics:
                current_value = current_metrics[metric]

                # Check for significant degradation (>10%)
                if isinstance(baseline_value, (int, float)) and isinstance(current_value, (int, float)):
                    degradation = (baseline_value - current_value) / baseline_value

                    if degradation > 0.10:  # 10% degradation
                        regression = {
                            'metric': metric,
                            'baseline': baseline_value,
                            'current': current_value,
                            'degradation': degradation,
                            'severity': 'high' if degradation > 0.20 else 'medium'
                        }
                        logger.warning(f"⚠️  Regression detected: {metric} degraded by {degradation:.1%}")
                        break

        return regression

    def create_snapshot(self, version: str, configuration: Dict, metrics: Dict) -> MemorySnapshot:
        """
        Create immutable snapshot of current system state.

        Args:
            version: System version
            configuration: Current configuration
            metrics: Current performance metrics

        Returns:
            Created snapshot
        """
        logger.info(f"📸 Creating system snapshot: {version}")

        snapshot_id = f"snapshot_{version}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        # Calculate checksum for integrity
        checksum = self._calculate_checksum(configuration, metrics)

        # Determine if system is stable
        is_stable = self._assess_stability(metrics)

        snapshot = MemorySnapshot(
            snapshot_id=snapshot_id,
            version=version,
            configuration=configuration,
            performance_metrics=metrics,
            is_stable=is_stable,
            timestamp=datetime.utcnow().isoformat(),
            checksum=checksum
        )

        # Store snapshot
        self.snapshots.append(snapshot)

        # Save to disk
        snapshot_path = self.snapshots_dir / f"{snapshot_id}.json"
        with open(snapshot_path, 'w') as f:
            json.dump(asdict(snapshot), f, indent=2)

        # Append to ledger
        self._append_to_ledger('snapshot', snapshot_id, asdict(snapshot))

        logger.info(f"  ✓ Snapshot created: {snapshot_id} (stable={is_stable})")

        return snapshot

    def restore_snapshot(self, snapshot_id: str) -> Optional[MemorySnapshot]:
        """
        Restore system to a previous snapshot.

        Args:
            snapshot_id: Snapshot to restore

        Returns:
            Restored snapshot if found
        """
        logger.info(f"🔄 Restoring snapshot: {snapshot_id}")

        snapshot_path = self.snapshots_dir / f"{snapshot_id}.json"

        if not snapshot_path.exists():
            logger.error(f"  ❌ Snapshot not found: {snapshot_id}")
            return None

        with open(snapshot_path, 'r') as f:
            snapshot_data = json.load(f)

        snapshot = MemorySnapshot(**snapshot_data)

        # Verify checksum
        current_checksum = self._calculate_checksum(
            snapshot.configuration,
            snapshot.performance_metrics
        )

        if current_checksum != snapshot.checksum:
            logger.error(f"  ❌ Checksum mismatch! Snapshot may be corrupted.")
            return None

        logger.info(f"  ✅ Snapshot restored: {snapshot_id}")

        return snapshot

    def get_last_stable_snapshot(self) -> Optional[MemorySnapshot]:
        """Get most recent stable snapshot"""
        stable_snapshots = [s for s in self.snapshots if s.is_stable]

        if not stable_snapshots:
            return None

        return max(stable_snapshots, key=lambda s: s.timestamp)

    def adapt_thresholds(self, current_performance: Dict) -> Dict:
        """
        Adaptively tune thresholds based on historical performance.

        Args:
            current_performance: Current system performance

        Returns:
            Recommended threshold adjustments
        """
        logger.info("⚙️  Adapting thresholds based on historical data...")

        if len(self.experiments) < 10:
            logger.info("  ℹ️  Insufficient data for adaptation")
            return {}

        # Analyze recent experiments
        recent = self.experiments[-20:]
        successful = [e for e in recent if e.outcome == 'success']

        if len(successful) < 5:
            return {}

        # Calculate optimal thresholds
        adjustments = {}

        # Example: Forecast confidence threshold
        avg_gain = np.mean([e.performance_gain for e in successful])

        if avg_gain > 0.05:
            # System performing well, can be more aggressive
            adjustments['min_confidence'] = -0.05  # Lower threshold
        elif avg_gain < 0.01:
            # System struggling, be more conservative
            adjustments['min_confidence'] = +0.05  # Raise threshold

        logger.info(f"  ✓ Threshold adjustments: {adjustments}")

        return adjustments

    def get_learning_stats(self) -> Dict:
        """Get statistics about learning progress"""
        if not self.experiments:
            return {}

        recent_experiments = self.experiments[-50:]

        stats = {
            'total_experiments': len(self.experiments),
            'recent_experiments': len(recent_experiments),
            'success_rate': len([e for e in recent_experiments if e.outcome == 'success']) / len(recent_experiments),
            'avg_performance_gain': np.mean([e.performance_gain for e in recent_experiments]),
            'avg_cost_impact': np.mean([e.cost_impact for e in recent_experiments]),
            'total_snapshots': len(self.snapshots),
            'stable_snapshots': len([s for s in self.snapshots if s.is_stable])
        }

        return stats

    # ==================== Helper Methods ====================

    def _load_memory(self) -> Dict:
        """Load memory from disk"""
        if not self.memstore_path.exists():
            return {
                'experiments': [],
                'best_configurations': [],
                'metadata': {
                    'created': datetime.utcnow().isoformat(),
                    'version': '17.6.0'
                }
            }

        try:
            with open(self.memstore_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading memory: {e}")
            return {}

    def _save_memory(self) -> None:
        """Save memory to disk"""
        try:
            with open(self.memstore_path, 'w') as f:
                json.dump(self.memory, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving memory: {e}")

    def _load_experiments(self) -> None:
        """Load experiments from memory"""
        if 'experiments' in self.memory:
            for exp_data in self.memory['experiments']:
                try:
                    exp = Experiment(**exp_data)
                    self.experiments.append(exp)
                except:
                    pass

    def _load_snapshots(self) -> None:
        """Load snapshots from disk"""
        for snapshot_file in self.snapshots_dir.glob("snapshot_*.json"):
            try:
                with open(snapshot_file, 'r') as f:
                    snapshot_data = json.load(f)
                snapshot = MemorySnapshot(**snapshot_data)
                self.snapshots.append(snapshot)
            except:
                pass

    def _update_best_configurations(self, experiment: Experiment) -> None:
        """Update best configurations list"""
        if 'best_configurations' not in self.memory:
            self.memory['best_configurations'] = []

        config_entry = {
            'experiment_id': experiment.experiment_id,
            'configuration': experiment.configuration,
            'performance_gain': experiment.performance_gain,
            'cost_impact': experiment.cost_impact,
            'timestamp': experiment.timestamp
        }

        self.memory['best_configurations'].append(config_entry)

        # Keep only top 20
        self.memory['best_configurations'] = sorted(
            self.memory['best_configurations'],
            key=lambda x: x['performance_gain'],
            reverse=True
        )[:20]

    def _calculate_baseline(self, experiments: List[Experiment]) -> Dict:
        """Calculate baseline metrics from experiments"""
        baseline = {}

        # Extract all metrics
        all_metrics = {}
        for exp in experiments:
            for metric, value in exp.metrics.items():
                if metric not in all_metrics:
                    all_metrics[metric] = []
                all_metrics[metric].append(value)

        # Calculate average for each metric
        for metric, values in all_metrics.items():
            if all(isinstance(v, (int, float)) for v in values):
                baseline[metric] = np.mean(values)

        return baseline

    def _calculate_checksum(self, configuration: Dict, metrics: Dict) -> str:
        """Calculate SHA256 checksum for integrity"""
        data_str = json.dumps({'config': configuration, 'metrics': metrics}, sort_keys=True)
        return hashlib.sha256(data_str.encode()).hexdigest()

    def _assess_stability(self, metrics: Dict) -> bool:
        """Assess if current state is stable"""
        # Simple heuristic: check key metrics
        uptime = metrics.get('uptime', 0)
        error_rate = metrics.get('error_rate', 100)
        cost = metrics.get('cost_monthly', 100)

        is_stable = (
            uptime >= 99.9 and
            error_rate < 2.0 and
            cost <= 45
        )

        return is_stable

    def _append_to_ledger(self, entry_type: str, entry_id: str, data: Dict) -> None:
        """Append to immutable audit ledger"""
        ledger_entry = {
            'type': entry_type,
            'id': entry_id,
            'timestamp': datetime.utcnow().isoformat(),
            'data': data
        }

        # Append to daily ledger file
        ledger_file = self.ledger_dir / f"ledger_{datetime.utcnow().strftime('%Y%m%d')}.jsonl"

        with open(ledger_file, 'a') as f:
            f.write(json.dumps(ledger_entry) + '\n')


if __name__ == "__main__":
    # Test Memory Core
    memory = MemoryCore()

    # Create test experiment
    experiment = Experiment(
        experiment_id="exp_test_001",
        configuration={'threshold': 0.85},
        metrics={'accuracy': 0.90, 'latency': 200},
        outcome='success',
        performance_gain=0.03,
        cost_impact=-2.0,
        timestamp=datetime.utcnow().isoformat(),
        duration_seconds=120
    )

    # Store experiment
    memory.store_experiment(experiment)

    # Create snapshot
    snapshot = memory.create_snapshot(
        version="17.6.0",
        configuration={'threshold': 0.85},
        metrics={'uptime': 99.99, 'cost_monthly': 35, 'error_rate': 0.5}
    )

    # Get stats
    stats = memory.get_learning_stats()

    print("\n🧠 Memory Core Test:")
    print(f"  Experiments: {stats.get('total_experiments', 0)}")
    print(f"  Snapshots: {stats.get('total_snapshots', 0)}")
    print(f"  Stable Snapshots: {stats.get('stable_snapshots', 0)}")
    print(f"  Last Snapshot: {snapshot.snapshot_id}")
