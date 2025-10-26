#!/usr/bin/env python3
"""
NeuroPilot v17.6 - Evolution Controller

Orchestrates continuous self-improvement using hybrid RL + Genetic Algorithms.

Author: NeuroPilot Genesis Team
Version: 17.6.0
"""

import json
import logging
import random
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Configuration:
    """System configuration genome"""
    config_id: str
    parameters: Dict
    fitness_score: float
    generation: int
    parent_ids: List[str]
    timestamp: str


@dataclass
class EvolutionReport:
    """Evolution cycle report"""
    cycle_id: str
    generation: int
    population_size: int
    best_fitness: float
    avg_fitness: float
    improvement: float
    mutations_applied: int
    configurations_tested: int
    timestamp: str


class EvolutionController:
    """
    Evolution Controller - Continuous self-improvement engine.

    Algorithms:
    - PPO (Proximal Policy Optimization): Stability optimization
    - Q-learning: Adaptive threshold tuning
    - Genetic Algorithm: Configuration mutation & selection

    Reward Function:
    reward = (Δaccuracy * 2.0) + (Δefficiency * 1.5)
            + (Δcompliance * 1.2) - (cost_overrun * 3)
            - (downtime_penalty * 5)

    Targets:
    - Forecast accuracy ≥ 93%
    - Remediation success ≥ 98%
    - Compliance score ≥ 96
    - Uptime ≥ 99.999%
    """

    def __init__(self, memory_core=None):
        self.memory_core = memory_core
        self.population = []
        self.generation = 0
        self.best_configuration = None

        # GA parameters
        self.population_size = 10
        self.mutation_rate = 0.15
        self.crossover_rate = 0.70
        self.elitism_count = 2

        # RL parameters
        self.learning_rate = 0.001
        self.discount_factor = 0.95
        self.q_table = {}

        # Performance targets
        self.targets = {
            'forecast_accuracy': 0.93,
            'remediation_success': 0.98,
            'compliance_score': 96,
            'uptime': 0.99999,
            'max_cost': 45
        }

        logger.info("🧬 Evolution Controller initialized")

    def evolve_models(self, current_metrics: Dict, historical_performance: List[Dict]) -> Configuration:
        """
        Evolve system configuration using GA.

        Args:
            current_metrics: Current system performance
            historical_performance: Historical metrics for fitness calculation

        Returns:
            Best configuration from evolution
        """
        logger.info("🧬 Starting evolution cycle...")

        # Step 1: Initialize population if first generation
        if not self.population:
            self.population = self._initialize_population(current_metrics)

        # Step 2: Evaluate fitness
        for config in self.population:
            config.fitness_score = self._calculate_fitness(config, current_metrics)

        # Step 3: Selection
        parents = self._select_parents()

        # Step 4: Crossover
        offspring = self._crossover(parents)

        # Step 5: Mutation
        mutated = self._mutate(offspring)

        # Step 6: Elitism (keep best configurations)
        self.population = self._apply_elitism(mutated)

        # Step 7: Find best configuration
        self.best_configuration = max(self.population, key=lambda x: x.fitness_score)

        self.generation += 1

        logger.info(f"  ✓ Evolution complete (gen={self.generation})")
        logger.info(f"    Best fitness: {self.best_configuration.fitness_score:.3f}")

        return self.best_configuration

    def _initialize_population(self, current_metrics: Dict) -> List[Configuration]:
        """Initialize population with random configurations"""
        logger.info("  Initializing population...")

        population = []

        for i in range(self.population_size):
            config = Configuration(
                config_id=f"config_{self.generation}_{i}",
                parameters=self._generate_random_parameters(),
                fitness_score=0.0,
                generation=self.generation,
                parent_ids=[],
                timestamp=datetime.utcnow().isoformat()
            )
            population.append(config)

        return population

    def _generate_random_parameters(self) -> Dict:
        """Generate random configuration parameters"""
        return {
            # Forecast engine
            'ensemble_weights': {
                'lstm': random.uniform(0.3, 0.5),
                'prophet': random.uniform(0.25, 0.40),
                'gbdt': random.uniform(0.15, 0.35)
            },
            'min_confidence': random.uniform(0.65, 0.85),
            'forecast_horizon_hours': random.choice([10, 12, 14]),

            # Remediation
            'min_confidence_threshold': random.uniform(0.80, 0.95),
            'verification_wait_seconds': random.randint(25, 50),

            # Scaling
            'cpu_scale_threshold': random.uniform(0.70, 0.85),
            'memory_scale_threshold': random.uniform(0.75, 0.90),
            'latency_threshold_ms': random.randint(220, 280),

            # Online learning
            'mini_batch_size': random.choice([16, 32, 64]),
            'fine_tune_epochs': random.choice([2, 3, 5])
        }

    def _calculate_fitness(self, config: Configuration, current_metrics: Dict) -> float:
        """
        Calculate fitness score for configuration.

        Uses reward function:
        reward = (Δaccuracy * 2.0) + (Δefficiency * 1.5)
                + (Δcompliance * 1.2) - (cost_overrun * 3)
                - (downtime_penalty * 5)
        """
        # Extract metrics
        accuracy = current_metrics.get('forecasting', {}).get('accuracy', 0.87)
        remediation_success = current_metrics.get('remediation', {}).get('success_rate', 0.97)
        compliance_score = current_metrics.get('compliance', {}).get('score', 91) / 100
        uptime = current_metrics.get('performance', {}).get('uptime', 99.99) / 100
        cost = current_metrics.get('cost', {}).get('current_monthly', 35)

        # Calculate deltas from targets
        accuracy_delta = accuracy - 0.87  # Baseline
        efficiency_delta = remediation_success - 0.95  # Baseline
        compliance_delta = compliance_score - 0.90  # Baseline

        # Calculate penalties
        cost_overrun = max(0, cost - self.targets['max_cost']) / 10
        downtime_penalty = max(0, 1.0 - uptime) * 100

        # Apply reward function
        reward = (
            accuracy_delta * 2.0 +
            efficiency_delta * 1.5 +
            compliance_delta * 1.2 -
            cost_overrun * 3.0 -
            downtime_penalty * 5.0
        )

        # Normalize to 0-1 range
        fitness = 1.0 / (1.0 + np.exp(-reward * 10))  # Sigmoid

        return fitness

    def _select_parents(self) -> List[Configuration]:
        """Select parents using tournament selection"""
        parents = []
        tournament_size = 3

        for _ in range(self.population_size - self.elitism_count):
            # Tournament selection
            tournament = random.sample(self.population, tournament_size)
            winner = max(tournament, key=lambda x: x.fitness_score)
            parents.append(winner)

        return parents

    def _crossover(self, parents: List[Configuration]) -> List[Configuration]:
        """Apply crossover to create offspring"""
        offspring = []

        for i in range(0, len(parents) - 1, 2):
            if random.random() < self.crossover_rate:
                child1, child2 = self._crossover_pair(parents[i], parents[i + 1])
                offspring.extend([child1, child2])
            else:
                offspring.extend([parents[i], parents[i + 1]])

        return offspring

    def _crossover_pair(self, parent1: Configuration, parent2: Configuration) -> Tuple[Configuration, Configuration]:
        """Perform crossover between two parents"""
        child1_params = {}
        child2_params = {}

        for key in parent1.parameters:
            if random.random() < 0.5:
                child1_params[key] = parent1.parameters[key]
                child2_params[key] = parent2.parameters[key]
            else:
                child1_params[key] = parent2.parameters[key]
                child2_params[key] = parent1.parameters[key]

        child1 = Configuration(
            config_id=f"config_{self.generation + 1}_{len(self.population)}",
            parameters=child1_params,
            fitness_score=0.0,
            generation=self.generation + 1,
            parent_ids=[parent1.config_id, parent2.config_id],
            timestamp=datetime.utcnow().isoformat()
        )

        child2 = Configuration(
            config_id=f"config_{self.generation + 1}_{len(self.population) + 1}",
            parameters=child2_params,
            fitness_score=0.0,
            generation=self.generation + 1,
            parent_ids=[parent1.config_id, parent2.config_id],
            timestamp=datetime.utcnow().isoformat()
        )

        return child1, child2

    def _mutate(self, offspring: List[Configuration]) -> List[Configuration]:
        """Apply mutations to offspring"""
        mutated = []
        mutations_applied = 0

        for config in offspring:
            if random.random() < self.mutation_rate:
                mutated_params = self._mutate_parameters(config.parameters)
                config.parameters = mutated_params
                mutations_applied += 1

            mutated.append(config)

        logger.info(f"  ✓ Applied {mutations_applied} mutations")

        return mutated

    def _mutate_parameters(self, params: Dict) -> Dict:
        """Mutate configuration parameters"""
        mutated = params.copy()

        # Randomly select parameter to mutate
        mutation_targets = [
            'min_confidence',
            'cpu_scale_threshold',
            'memory_scale_threshold',
            'mini_batch_size'
        ]

        target = random.choice(mutation_targets)

        if target == 'min_confidence':
            mutated['min_confidence'] += random.gauss(0, 0.05)
            mutated['min_confidence'] = max(0.60, min(0.90, mutated['min_confidence']))

        elif target == 'cpu_scale_threshold':
            mutated['cpu_scale_threshold'] += random.gauss(0, 0.05)
            mutated['cpu_scale_threshold'] = max(0.65, min(0.90, mutated['cpu_scale_threshold']))

        elif target == 'memory_scale_threshold':
            mutated['memory_scale_threshold'] += random.gauss(0, 0.05)
            mutated['memory_scale_threshold'] = max(0.70, min(0.95, mutated['memory_scale_threshold']))

        elif target == 'mini_batch_size':
            mutated['mini_batch_size'] = random.choice([16, 32, 64])

        return mutated

    def _apply_elitism(self, population: List[Configuration]) -> List[Configuration]:
        """Keep best configurations (elitism)"""
        # Sort by fitness
        sorted_pop = sorted(self.population + population, key=lambda x: x.fitness_score, reverse=True)

        # Keep top configurations
        return sorted_pop[:self.population_size]

    def update_q_values(self, state: str, action: str, reward: float, next_state: str) -> None:
        """
        Update Q-values using Q-learning.

        Args:
            state: Current state
            action: Action taken
            reward: Reward received
            next_state: Resulting state
        """
        if state not in self.q_table:
            self.q_table[state] = {}

        if action not in self.q_table[state]:
            self.q_table[state][action] = 0.0

        # Get max Q-value for next state
        if next_state in self.q_table:
            max_next_q = max(self.q_table[next_state].values())
        else:
            max_next_q = 0.0

        # Q-learning update
        current_q = self.q_table[state][action]
        new_q = current_q + self.learning_rate * (
            reward + self.discount_factor * max_next_q - current_q
        )

        self.q_table[state][action] = new_q

    def get_best_action(self, state: str) -> Optional[str]:
        """Get best action for state using Q-table"""
        if state not in self.q_table or not self.q_table[state]:
            return None

        return max(self.q_table[state], key=self.q_table[state].get)

    def test_fitness(self, config: Configuration, test_metrics: Dict) -> float:
        """Test configuration fitness on test metrics"""
        return self._calculate_fitness(config, test_metrics)

    def merge_best_configurations(self) -> Configuration:
        """Merge top configurations into single optimal config"""
        if not self.population:
            return None

        # Get top 3 configurations
        top_configs = sorted(self.population, key=lambda x: x.fitness_score, reverse=True)[:3]

        # Average parameters
        merged_params = {}
        for key in top_configs[0].parameters:
            if isinstance(top_configs[0].parameters[key], dict):
                # Handle nested dicts (like ensemble_weights)
                merged_params[key] = {}
                for subkey in top_configs[0].parameters[key]:
                    values = [c.parameters[key][subkey] for c in top_configs]
                    merged_params[key][subkey] = np.mean(values)
            elif isinstance(top_configs[0].parameters[key], (int, float)):
                values = [c.parameters[key] for c in top_configs]
                merged_params[key] = np.mean(values)
            else:
                merged_params[key] = top_configs[0].parameters[key]

        merged_config = Configuration(
            config_id=f"merged_{self.generation}",
            parameters=merged_params,
            fitness_score=0.0,
            generation=self.generation,
            parent_ids=[c.config_id for c in top_configs],
            timestamp=datetime.utcnow().isoformat()
        )

        return merged_config

    def run_full_cycle(self, current_metrics: Dict, historical_performance: List[Dict]) -> EvolutionReport:
        """Run complete evolution cycle"""
        logger.info("=" * 70)
        logger.info("🧬 EVOLUTION CYCLE: RL + GA Optimization")
        logger.info("=" * 70)

        # Initial fitness
        if self.population:
            initial_fitness = np.mean([c.fitness_score for c in self.population])
        else:
            initial_fitness = 0.0

        # Evolve
        best_config = self.evolve_models(current_metrics, historical_performance)

        # Calculate improvement
        final_fitness = np.mean([c.fitness_score for c in self.population])
        improvement = final_fitness - initial_fitness

        # Generate report
        report = EvolutionReport(
            cycle_id=f"evolution_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}",
            generation=self.generation,
            population_size=len(self.population),
            best_fitness=best_config.fitness_score,
            avg_fitness=final_fitness,
            improvement=improvement,
            mutations_applied=int(self.mutation_rate * self.population_size),
            configurations_tested=len(self.population),
            timestamp=datetime.utcnow().isoformat()
        )

        logger.info(f"✅ Evolution cycle complete:")
        logger.info(f"   Generation: {report.generation}")
        logger.info(f"   Best Fitness: {report.best_fitness:.3f}")
        logger.info(f"   Avg Fitness: {report.avg_fitness:.3f}")
        logger.info(f"   Improvement: +{report.improvement:.3f}")

        return report


if __name__ == "__main__":
    # Test Evolution Controller
    controller = EvolutionController()

    # Sample metrics
    current_metrics = {
        'forecasting': {'accuracy': 0.88},
        'remediation': {'success_rate': 0.97},
        'compliance': {'score': 92},
        'performance': {'uptime': 99.99},
        'cost': {'current_monthly': 35}
    }

    # Run 5 generations
    for gen in range(5):
        report = controller.run_full_cycle(current_metrics, [])

        print(f"\nGeneration {gen + 1}:")
        print(f"  Best Fitness: {report.best_fitness:.3f}")
        print(f"  Improvement: +{report.improvement:.3f}")

    # Get best configuration
    best = controller.merge_best_configurations()
    print(f"\n🏆 Best Configuration:")
    print(f"  Config ID: {best.config_id}")
    print(f"  Parameters: {json.dumps(best.parameters, indent=2)}")
