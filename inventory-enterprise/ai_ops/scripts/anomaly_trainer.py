#!/usr/bin/env python3
"""
NeuroPilot v17.3 - Anomaly Detection Trainer
Incremental learning system that trains on historical metrics
to improve anomaly detection accuracy over time.
"""

import os
import sys
import json
import pickle
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Tuple

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.mixture import GaussianMixture
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics import silhouette_score

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('anomaly_trainer')


class AnomalyTrainer:
    """
    Incremental learning system for anomaly detection
    Uses Gaussian Mixture Models + Online Clustering
    """

    def __init__(self, lookback_hours: int = 24):
        self.lookback_hours = lookback_hours
        self.model_path = Path('ai_ops/models/anomaly_model.pkl')
        self.scaler_path = Path('ai_ops/models/scaler.pkl')
        self.history_path = Path('ai_ops/models/metrics_history.json')
        self.training_log_path = Path('ai_ops/models/training_log.json')

        # Load existing models or initialize
        self.model = self._load_or_init_model()
        self.scaler = self._load_or_init_scaler()
        self.training_log = self._load_training_log()

    def _load_or_init_model(self) -> GaussianMixture:
        """Load existing model or initialize"""
        if self.model_path.exists():
            try:
                with open(self.model_path, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                logger.warning(f"Failed to load model: {e}")

        return GaussianMixture(
            n_components=3,
            covariance_type='full',
            max_iter=100,
            random_state=42,
            warm_start=True  # Enable incremental learning
        )

    def _load_or_init_scaler(self) -> StandardScaler:
        """Load existing scaler or initialize"""
        if self.scaler_path.exists():
            try:
                with open(self.scaler_path, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                logger.warning(f"Failed to load scaler: {e}")

        return StandardScaler()

    def _load_training_log(self) -> List[Dict]:
        """Load training history"""
        if self.training_log_path.exists():
            try:
                with open(self.training_log_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"Failed to load training log: {e}")

        return []

    def load_historical_data(self) -> pd.DataFrame:
        """Load historical metrics from last 24 hours"""
        logger.info(f"Loading last {self.lookback_hours} hours of metrics...")

        if not self.history_path.exists():
            logger.warning("No metrics history found")
            return pd.DataFrame()

        with open(self.history_path, 'r') as f:
            history = json.load(f)

        df = pd.DataFrame(history)
        df['timestamp'] = pd.to_datetime(df['timestamp'])

        # Filter to lookback period
        cutoff = datetime.utcnow() - timedelta(hours=self.lookback_hours)
        df = df[df['timestamp'] >= cutoff]

        logger.info(f"✓ Loaded {len(df)} data points")
        return df

    def prepare_features(self, df: pd.DataFrame) -> np.ndarray:
        """Extract and normalize features for training"""
        feature_cols = [
            'cpu_usage',
            'memory_usage',
            'p95_latency',
            'p99_latency',
            'error_rate',
            'request_rate',
            'database_query_time'
        ]

        # Select features
        X = df[feature_cols].values

        # Handle NaN/inf
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

        # Normalize
        if not hasattr(self.scaler, 'n_samples_seen_'):
            # First time - fit scaler
            X_scaled = self.scaler.fit_transform(X)
        else:
            # Incremental update
            X_scaled = self.scaler.transform(X)
            # Partial fit to update scaler
            self.scaler.partial_fit(X)

        return X_scaled

    def train(self, X: np.ndarray) -> Tuple[float, Dict]:
        """
        Train/update anomaly detection model
        Returns: (loss, metrics)
        """
        logger.info(f"Training on {len(X)} samples...")

        if len(X) < 10:
            logger.warning("Insufficient samples for training")
            return float('inf'), {}

        try:
            # Fit Gaussian Mixture Model
            self.model.fit(X)

            # Calculate training metrics
            log_likelihood = self.model.score(X)
            predictions = self.model.predict(X)

            # Calculate silhouette score if possible
            try:
                silhouette = silhouette_score(X, predictions)
            except:
                silhouette = 0.0

            # BIC and AIC for model quality
            bic = self.model.bic(X)
            aic = self.model.aic(X)

            # Training loss (negative log-likelihood)
            loss = -log_likelihood

            metrics = {
                'loss': loss,
                'log_likelihood': log_likelihood,
                'silhouette_score': silhouette,
                'bic': bic,
                'aic': aic,
                'n_components': self.model.n_components,
                'n_samples': len(X)
            }

            logger.info(f"✓ Training complete - Loss: {loss:.4f}, Silhouette: {silhouette:.4f}")

            return loss, metrics

        except Exception as e:
            logger.error(f"Training failed: {e}")
            return float('inf'), {}

    def evaluate_model(self, X: np.ndarray) -> Dict:
        """Evaluate model performance"""
        logger.info("Evaluating model...")

        try:
            # Predict cluster labels
            labels = self.model.predict(X)

            # Calculate probability scores
            probabilities = self.model.predict_proba(X)

            # Identify anomalies (low probability samples)
            max_probs = probabilities.max(axis=1)
            anomaly_threshold = 0.1  # Samples with max prob < 0.1 are anomalies
            anomalies = max_probs < anomaly_threshold

            anomaly_rate = anomalies.sum() / len(X)

            metrics = {
                'anomaly_rate': anomaly_rate,
                'mean_probability': max_probs.mean(),
                'min_probability': max_probs.min(),
                'max_probability': max_probs.max(),
                'n_clusters_found': len(np.unique(labels))
            }

            logger.info(f"✓ Evaluation complete - Anomaly rate: {anomaly_rate:.2%}")

            return metrics

        except Exception as e:
            logger.error(f"Evaluation failed: {e}")
            return {}

    def save_models(self):
        """Save trained models"""
        self.model_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.model_path, 'wb') as f:
            pickle.dump(self.model, f)

        with open(self.scaler_path, 'wb') as f:
            pickle.dump(self.scaler, f)

        logger.info("✓ Models saved")

    def log_training_run(self, loss: float, train_metrics: Dict, eval_metrics: Dict):
        """Log training run to history"""
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'loss': loss,
            'train_metrics': train_metrics,
            'eval_metrics': eval_metrics
        }

        self.training_log.append(log_entry)

        # Keep last 30 days
        if len(self.training_log) > 720:  # 24 runs/day * 30 days
            self.training_log = self.training_log[-720:]

        self.training_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.training_log_path, 'w') as f:
            json.dump(self.training_log, f, indent=2)

        logger.info("✓ Training run logged")

    def run(self) -> bool:
        """Execute complete training cycle"""
        logger.info("=" * 60)
        logger.info("🎓 Starting Anomaly Trainer")
        logger.info("=" * 60)

        try:
            # 1. Load historical data
            df = self.load_historical_data()

            if df.empty or len(df) < 10:
                logger.warning("Insufficient data for training")
                return False

            # 2. Prepare features
            X = self.prepare_features(df)

            # 3. Train model
            loss, train_metrics = self.train(X)

            if loss == float('inf'):
                logger.error("Training failed")
                return False

            # 4. Evaluate model
            eval_metrics = self.evaluate_model(X)

            # 5. Save models
            self.save_models()

            # 6. Log training run
            self.log_training_run(loss, train_metrics, eval_metrics)

            logger.info("=" * 60)
            logger.info("✅ Anomaly Trainer completed successfully")
            logger.info(f"   Loss: {loss:.4f}")
            logger.info(f"   Anomaly Rate: {eval_metrics.get('anomaly_rate', 0):.2%}")
            logger.info("=" * 60)

            return True

        except Exception as e:
            logger.error(f"❌ Anomaly Trainer failed: {e}", exc_info=True)
            return False


def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Train anomaly detection model')
    parser.add_argument('--lookback-hours', type=int, default=24,
                       help='Hours of historical data to train on')
    args = parser.parse_args()

    trainer = AnomalyTrainer(lookback_hours=args.lookback_hours)
    success = trainer.run()

    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
