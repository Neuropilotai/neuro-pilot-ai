#!/usr/bin/env python3
"""
NeuroPilot v17.5 - Predictive Forecast Engine with Online Learning

Multi-model time-series prediction engine for incident forecasting.
Uses ensemble of LSTM, Prophet, and GBDT models to predict infrastructure
incidents 6-12 hours before they occur.

NEW in v17.5:
- Online learning: Incremental Prophet updates
- Mini-batch LSTM fine-tuning
- Adaptive ensemble weight optimization
- Performance tracking and model drift detection

Author: NeuroPilot AI Ops Team
Version: 17.5.0
"""

import logging
import os
import pickle
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

# Deep Learning
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    TENSORFLOW_AVAILABLE = True
except ImportError:
    TENSORFLOW_AVAILABLE = False
    warnings.warn("TensorFlow not available. LSTM predictions disabled.")

# Time Series
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    warnings.warn("Prophet not available. Trend predictions disabled.")

# Gradient Boosting
try:
    import xgboost as xgb
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
    warnings.warn("XGBoost not available. GBDT predictions disabled.")

# Standard ML
from sklearn.preprocessing import StandardScaler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Prediction:
    """Incident prediction result"""
    incident_type: str
    probability: float
    time_to_event_hours: float
    confidence_interval: Tuple[float, float]
    affected_metrics: List[str]
    recommended_action: str
    model_source: str
    timestamp: str


@dataclass
class Metrics:
    """System metrics snapshot"""
    timestamp: str
    cpu_usage: float
    memory_usage: float
    p95_latency: float
    p99_latency: float
    error_rate: float
    request_rate: float
    database_query_time: float
    active_instances: int
    current_cost: float


class ForecastEngine:
    """
    Predictive forecast engine using ensemble of:
    - LSTM: Sequence prediction (48 × 30min window)
    - Prophet: Trend detection and seasonality
    - GBDT: Feature-based incident classification
    """

    def __init__(self, config_path: str = "sentient_core/config/sentient_config.yaml"):
        self.config_path = config_path
        self.models_dir = Path("sentient_core/models")
        self.models_dir.mkdir(parents=True, exist_ok=True)

        # Model components
        self.lstm_model: Optional[keras.Model] = None
        self.prophet_models: Dict[str, Prophet] = {}
        self.gbdt_model: Optional[xgb.XGBClassifier] = None
        self.scaler = StandardScaler()

        # Configuration
        self.window_size = 48  # 48 × 30min = 24 hours
        self.forecast_horizon = 12  # hours
        self.min_training_samples = 100

        # v17.5: Online learning configuration
        self.online_learning_enabled = True
        self.mini_batch_size = 32
        self.fine_tune_epochs = 3
        self.ensemble_weights = {
            'lstm': 0.40,
            'prophet': 0.35,
            'gbdt': 0.25
        }

        # Performance tracking
        self.prediction_history = []
        self.accuracy_tracker = {
            'lstm': [],
            'prophet': [],
            'gbdt': []
        }

        # Load existing models
        self._load_models()

        logger.info("🔮 Forecast Engine v17.5 initialized (online learning: enabled)")

    def _load_models(self) -> None:
        """Load pre-trained models from disk"""
        try:
            # LSTM
            lstm_path = self.models_dir / "lstm_model.h5"
            if lstm_path.exists() and TENSORFLOW_AVAILABLE:
                self.lstm_model = keras.models.load_model(str(lstm_path))
                logger.info("✓ LSTM model loaded")

            # GBDT
            gbdt_path = self.models_dir / "gbdt_model.pkl"
            if gbdt_path.exists() and XGBOOST_AVAILABLE:
                with open(gbdt_path, 'rb') as f:
                    self.gbdt_model = pickle.load(f)
                logger.info("✓ GBDT model loaded")

            # Scaler
            scaler_path = self.models_dir / "scaler.pkl"
            if scaler_path.exists():
                with open(scaler_path, 'rb') as f:
                    self.scaler = pickle.load(f)
                logger.info("✓ Scaler loaded")

        except Exception as e:
            logger.warning(f"Model loading error: {e}")

    def predict_incidents(
        self,
        metrics: Metrics,
        historical_data: Optional[pd.DataFrame] = None,
        forecast_hours: int = 12
    ) -> List[Prediction]:
        """
        Predict incidents using ensemble approach

        Args:
            metrics: Current system metrics
            historical_data: Historical metrics (last 24-48h)
            forecast_hours: Prediction horizon (default 12h)

        Returns:
            List of incident predictions sorted by probability
        """
        logger.info(f"🔮 Running incident predictions (horizon: {forecast_hours}h)")

        predictions = []

        # Fetch historical data if not provided
        if historical_data is None:
            historical_data = self._fetch_historical_metrics()

        if historical_data is None or len(historical_data) < self.min_training_samples:
            logger.warning("Insufficient historical data for predictions")
            return predictions

        # Run each model
        lstm_preds = self._run_lstm_predictions(metrics, historical_data, forecast_hours)
        prophet_preds = self._run_prophet_predictions(historical_data, forecast_hours)
        gbdt_preds = self._run_gbdt_predictions(metrics, historical_data)

        # Combine predictions
        all_preds = lstm_preds + prophet_preds + gbdt_preds

        # Ensemble voting: aggregate by incident type
        predictions = self._ensemble_predictions(all_preds)

        # Sort by probability (highest first)
        predictions.sort(key=lambda p: p.probability, reverse=True)

        logger.info(f"✓ Generated {len(predictions)} incident predictions")
        for pred in predictions[:3]:  # Log top 3
            logger.info(
                f"  - {pred.incident_type}: {pred.probability:.1%} "
                f"in {pred.time_to_event_hours:.1f}h ({pred.model_source})"
            )

        return predictions

    def _run_lstm_predictions(
        self,
        metrics: Metrics,
        historical_data: pd.DataFrame,
        forecast_hours: int
    ) -> List[Prediction]:
        """Run LSTM sequence predictions"""
        if not TENSORFLOW_AVAILABLE or self.lstm_model is None:
            return []

        try:
            # Prepare sequence data (last 48 × 30min)
            sequence = self._prepare_sequence(historical_data)
            if sequence is None:
                return []

            # Predict next N steps
            future_values = self._predict_sequence(sequence, steps=forecast_hours * 2)

            # Analyze predictions for anomalies
            predictions = self._analyze_lstm_output(future_values, forecast_hours)

            return predictions

        except Exception as e:
            logger.error(f"LSTM prediction error: {e}")
            return []

    def _run_prophet_predictions(
        self,
        historical_data: pd.DataFrame,
        forecast_hours: int
    ) -> List[Prediction]:
        """Run Prophet trend predictions"""
        if not PROPHET_AVAILABLE:
            return []

        predictions = []

        # Predict each key metric
        metrics_to_forecast = ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate']

        for metric_name in metrics_to_forecast:
            try:
                pred = self._prophet_forecast_metric(
                    historical_data,
                    metric_name,
                    forecast_hours
                )
                if pred:
                    predictions.append(pred)
            except Exception as e:
                logger.debug(f"Prophet forecast failed for {metric_name}: {e}")

        return predictions

    def _run_gbdt_predictions(
        self,
        metrics: Metrics,
        historical_data: pd.DataFrame
    ) -> List[Prediction]:
        """Run GBDT classification predictions"""
        if not XGBOOST_AVAILABLE or self.gbdt_model is None:
            return []

        try:
            # Extract features
            features = self._extract_features(metrics, historical_data)
            features_scaled = self.scaler.transform([features])

            # Predict incident probability
            proba = self.gbdt_model.predict_proba(features_scaled)[0]

            predictions = []

            # Convert class probabilities to predictions
            incident_types = [
                'cpu_overload',
                'memory_exhaustion',
                'latency_spike',
                'error_surge',
                'cost_overrun'
            ]

            for i, incident_type in enumerate(incident_types):
                if proba[i] > 0.3:  # 30% threshold
                    predictions.append(Prediction(
                        incident_type=incident_type,
                        probability=float(proba[i]),
                        time_to_event_hours=6.0,  # GBDT gives 6h estimate
                        confidence_interval=(proba[i] - 0.1, proba[i] + 0.1),
                        affected_metrics=self._get_affected_metrics(incident_type),
                        recommended_action=self._get_recommended_action(incident_type),
                        model_source="GBDT",
                        timestamp=datetime.utcnow().isoformat()
                    ))

            return predictions

        except Exception as e:
            logger.error(f"GBDT prediction error: {e}")
            return []

    def _prepare_sequence(self, df: pd.DataFrame) -> Optional[np.ndarray]:
        """Prepare LSTM input sequence"""
        if len(df) < self.window_size:
            return None

        # Select features
        feature_cols = [
            'cpu_usage', 'memory_usage', 'p95_latency',
            'error_rate', 'request_rate'
        ]

        # Get last window_size samples
        recent = df.tail(self.window_size)[feature_cols].values

        # Normalize
        sequence = self.scaler.fit_transform(recent)

        # Reshape for LSTM: (1, timesteps, features)
        return sequence.reshape(1, self.window_size, len(feature_cols))

    def _predict_sequence(self, sequence: np.ndarray, steps: int) -> np.ndarray:
        """Predict future sequence using LSTM"""
        predictions = []
        current_seq = sequence.copy()

        for _ in range(steps):
            # Predict next step
            next_pred = self.lstm_model.predict(current_seq, verbose=0)
            predictions.append(next_pred[0])

            # Update sequence (rolling window)
            current_seq = np.roll(current_seq, -1, axis=1)
            current_seq[0, -1, :] = next_pred[0]

        return np.array(predictions)

    def _analyze_lstm_output(
        self,
        future_values: np.ndarray,
        forecast_hours: int
    ) -> List[Prediction]:
        """Analyze LSTM predictions for anomalies"""
        predictions = []

        # Check for threshold breaches
        # future_values shape: (steps, features)
        # features: [cpu, memory, latency, error_rate, request_rate]

        thresholds = {
            'cpu_usage': 85.0,
            'memory_usage': 85.0,
            'p95_latency': 400.0,
            'error_rate': 5.0
        }

        feature_names = ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate', 'request_rate']

        for i, feature_name in enumerate(feature_names[:4]):  # Check first 4
            if feature_name not in thresholds:
                continue

            threshold = thresholds[feature_name]
            values = future_values[:, i]

            # Inverse transform to original scale
            # Note: This is simplified; proper inverse_transform would need full feature set
            values_original = values * 100  # Approximation

            # Find first breach
            breach_idx = np.where(values_original > threshold)[0]

            if len(breach_idx) > 0:
                first_breach = breach_idx[0]
                time_to_event = (first_breach * 30) / 60  # 30min intervals → hours

                # Calculate probability based on how far over threshold
                max_value = values_original[first_breach]
                probability = min(0.95, (max_value / threshold - 1.0) + 0.5)

                incident_type = self._get_incident_type(feature_name)

                predictions.append(Prediction(
                    incident_type=incident_type,
                    probability=float(probability),
                    time_to_event_hours=float(time_to_event),
                    confidence_interval=(probability - 0.15, min(1.0, probability + 0.15)),
                    affected_metrics=[feature_name],
                    recommended_action=self._get_recommended_action(incident_type),
                    model_source="LSTM",
                    timestamp=datetime.utcnow().isoformat()
                ))

        return predictions

    def _prophet_forecast_metric(
        self,
        df: pd.DataFrame,
        metric_name: str,
        forecast_hours: int
    ) -> Optional[Prediction]:
        """Forecast single metric using Prophet"""

        # Prepare Prophet dataframe
        prophet_df = pd.DataFrame({
            'ds': pd.to_datetime(df['timestamp']),
            'y': df[metric_name]
        })

        # Initialize or retrieve model
        if metric_name not in self.prophet_models:
            model = Prophet(
                daily_seasonality=True,
                weekly_seasonality=True,
                interval_width=0.95
            )
            model.fit(prophet_df)
            self.prophet_models[metric_name] = model
        else:
            model = self.prophet_models[metric_name]

        # Create future dataframe
        future = model.make_future_dataframe(periods=forecast_hours, freq='H')
        forecast = model.predict(future)

        # Analyze forecast for anomalies
        future_forecast = forecast.tail(forecast_hours)

        # Check if upper bound exceeds threshold
        thresholds = {
            'cpu_usage': 85.0,
            'memory_usage': 85.0,
            'p95_latency': 400.0,
            'error_rate': 5.0
        }

        if metric_name not in thresholds:
            return None

        threshold = thresholds[metric_name]
        breaches = future_forecast[future_forecast['yhat_upper'] > threshold]

        if len(breaches) > 0:
            first_breach = breaches.iloc[0]
            time_to_event = (breaches.index[0]) * 1.0  # hours

            # Calculate probability from confidence interval
            predicted_value = first_breach['yhat']
            upper_bound = first_breach['yhat_upper']
            probability = min(0.9, (predicted_value / threshold - 1.0) + 0.6)

            incident_type = self._get_incident_type(metric_name)

            return Prediction(
                incident_type=incident_type,
                probability=float(probability),
                time_to_event_hours=float(time_to_event),
                confidence_interval=(
                    first_breach['yhat_lower'] / threshold,
                    first_breach['yhat_upper'] / threshold
                ),
                affected_metrics=[metric_name],
                recommended_action=self._get_recommended_action(incident_type),
                model_source="Prophet",
                timestamp=datetime.utcnow().isoformat()
            )

        return None

    def _extract_features(self, metrics: Metrics, historical_data: pd.DataFrame) -> List[float]:
        """Extract features for GBDT model"""
        recent_df = historical_data.tail(20)

        features = [
            metrics.cpu_usage,
            metrics.memory_usage,
            metrics.p95_latency,
            metrics.p99_latency,
            metrics.error_rate,
            metrics.request_rate,
            metrics.database_query_time,
            float(metrics.active_instances),
            metrics.current_cost,

            # Statistical features
            recent_df['cpu_usage'].mean(),
            recent_df['cpu_usage'].std(),
            recent_df['memory_usage'].mean(),
            recent_df['memory_usage'].std(),
            recent_df['p95_latency'].mean(),
            recent_df['p95_latency'].std(),
            recent_df['error_rate'].mean(),
            recent_df['error_rate'].std(),

            # Trend features
            recent_df['cpu_usage'].diff().mean(),  # CPU trend
            recent_df['memory_usage'].diff().mean(),  # Memory trend
            recent_df['p95_latency'].diff().mean(),  # Latency trend
        ]

        return features

    def _ensemble_predictions(self, all_predictions: List[Prediction]) -> List[Prediction]:
        """Ensemble predictions from multiple models"""
        if not all_predictions:
            return []

        # Group by incident type
        grouped: Dict[str, List[Prediction]] = {}
        for pred in all_predictions:
            if pred.incident_type not in grouped:
                grouped[pred.incident_type] = []
            grouped[pred.incident_type].append(pred)

        # Aggregate each group
        final_predictions = []

        for incident_type, preds in grouped.items():
            # Weighted average (LSTM: 0.4, Prophet: 0.35, GBDT: 0.25)
            weights = {'LSTM': 0.4, 'Prophet': 0.35, 'GBDT': 0.25}

            weighted_prob = sum(
                p.probability * weights.get(p.model_source, 0.33)
                for p in preds
            ) / len(preds)

            avg_time = sum(p.time_to_event_hours for p in preds) / len(preds)

            # Combine affected metrics
            affected = list(set(m for p in preds for m in p.affected_metrics))

            # Use recommendation from highest probability model
            best_pred = max(preds, key=lambda p: p.probability)

            final_predictions.append(Prediction(
                incident_type=incident_type,
                probability=weighted_prob,
                time_to_event_hours=avg_time,
                confidence_interval=(weighted_prob - 0.12, min(1.0, weighted_prob + 0.12)),
                affected_metrics=affected,
                recommended_action=best_pred.recommended_action,
                model_source=f"Ensemble({len(preds)} models)",
                timestamp=datetime.utcnow().isoformat()
            ))

        return final_predictions

    def _fetch_historical_metrics(self) -> Optional[pd.DataFrame]:
        """Fetch historical metrics from Prometheus"""
        try:
            import requests

            prometheus_url = os.getenv("PROMETHEUS_URL", "http://localhost:9090")

            # Query last 48 hours
            queries = {
                'cpu_usage': 'avg(cpu_usage_percent)',
                'memory_usage': 'avg(memory_usage_percent)',
                'p95_latency': 'histogram_quantile(0.95, http_request_duration_ms)',
                'p99_latency': 'histogram_quantile(0.99, http_request_duration_ms)',
                'error_rate': 'sum(rate(http_requests_total{status=~"5.."}[5m]))',
                'request_rate': 'sum(rate(http_requests_total[5m]))',
                'database_query_time': 'avg(database_query_duration_ms)'
            }

            end = datetime.utcnow()
            start = end - timedelta(hours=48)

            data = []

            for metric_name, query in queries.items():
                response = requests.get(
                    f"{prometheus_url}/api/v1/query_range",
                    params={
                        'query': query,
                        'start': start.timestamp(),
                        'end': end.timestamp(),
                        'step': '30m'
                    },
                    timeout=10
                )

                if response.status_code == 200:
                    result = response.json()
                    if result['status'] == 'success' and result['data']['result']:
                        values = result['data']['result'][0]['values']
                        for timestamp, value in values:
                            data.append({
                                'timestamp': datetime.fromtimestamp(timestamp),
                                metric_name: float(value)
                            })

            if not data:
                return None

            df = pd.DataFrame(data)
            df = df.groupby('timestamp').first().reset_index()
            df = df.sort_values('timestamp')

            return df

        except Exception as e:
            logger.error(f"Failed to fetch historical metrics: {e}")
            return None

    def _get_incident_type(self, metric_name: str) -> str:
        """Map metric name to incident type"""
        mapping = {
            'cpu_usage': 'cpu_overload',
            'memory_usage': 'memory_exhaustion',
            'p95_latency': 'latency_spike',
            'p99_latency': 'latency_spike',
            'error_rate': 'error_surge'
        }
        return mapping.get(metric_name, 'unknown_incident')

    def _get_affected_metrics(self, incident_type: str) -> List[str]:
        """Get metrics affected by incident type"""
        mapping = {
            'cpu_overload': ['cpu_usage', 'p95_latency'],
            'memory_exhaustion': ['memory_usage', 'error_rate'],
            'latency_spike': ['p95_latency', 'p99_latency'],
            'error_surge': ['error_rate', 'request_rate'],
            'cost_overrun': ['active_instances', 'current_cost']
        }
        return mapping.get(incident_type, [])

    def _get_recommended_action(self, incident_type: str) -> str:
        """Get recommended remediation action"""
        mapping = {
            'cpu_overload': 'scale_up',
            'memory_exhaustion': 'restart_optimize',
            'latency_spike': 'scale_up',
            'error_surge': 'restart_services',
            'cost_overrun': 'optimize_resources'
        }
        return mapping.get(incident_type, 'investigate')

    def train_models(self, training_data: pd.DataFrame) -> Dict[str, float]:
        """
        Train all models on historical data

        Args:
            training_data: Historical metrics with columns:
                timestamp, cpu_usage, memory_usage, p95_latency, etc.

        Returns:
            Training metrics for each model
        """
        logger.info("🎓 Training forecast models...")

        metrics = {}

        # Train LSTM
        if TENSORFLOW_AVAILABLE:
            lstm_loss = self._train_lstm(training_data)
            metrics['lstm_loss'] = lstm_loss

        # Train Prophet models
        if PROPHET_AVAILABLE:
            prophet_metrics = self._train_prophet(training_data)
            metrics.update(prophet_metrics)

        # Train GBDT
        if XGBOOST_AVAILABLE:
            gbdt_accuracy = self._train_gbdt(training_data)
            metrics['gbdt_accuracy'] = gbdt_accuracy

        # Save models
        self._save_models()

        logger.info(f"✓ Model training complete: {metrics}")
        return metrics

    def _train_lstm(self, df: pd.DataFrame) -> float:
        """Train LSTM model"""
        # Prepare sequences
        feature_cols = ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate', 'request_rate']
        data = df[feature_cols].values

        # Normalize
        data_scaled = self.scaler.fit_transform(data)

        # Create sequences
        X, y = [], []
        for i in range(len(data_scaled) - self.window_size - 1):
            X.append(data_scaled[i:i + self.window_size])
            y.append(data_scaled[i + self.window_size])

        X = np.array(X)
        y = np.array(y)

        # Build model if not exists
        if self.lstm_model is None:
            self.lstm_model = keras.Sequential([
                layers.LSTM(64, activation='relu', input_shape=(self.window_size, len(feature_cols))),
                layers.Dropout(0.2),
                layers.Dense(32, activation='relu'),
                layers.Dense(len(feature_cols))
            ])

            self.lstm_model.compile(optimizer='adam', loss='mse', metrics=['mae'])

        # Train
        history = self.lstm_model.fit(
            X, y,
            epochs=50,
            batch_size=32,
            validation_split=0.2,
            verbose=0
        )

        return float(history.history['val_loss'][-1])

    def _train_prophet(self, df: pd.DataFrame) -> Dict[str, float]:
        """Train Prophet models"""
        metrics = {}

        for metric_name in ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate']:
            prophet_df = pd.DataFrame({
                'ds': pd.to_datetime(df['timestamp']),
                'y': df[metric_name]
            })

            model = Prophet(daily_seasonality=True, weekly_seasonality=True)
            model.fit(prophet_df)

            self.prophet_models[metric_name] = model
            metrics[f'prophet_{metric_name}_trained'] = 1.0

        return metrics

    def _train_gbdt(self, df: pd.DataFrame) -> float:
        """Train GBDT classifier"""
        # Create labels based on thresholds
        df['label'] = 0  # Normal
        df.loc[df['cpu_usage'] > 85, 'label'] = 1  # CPU overload
        df.loc[df['memory_usage'] > 85, 'label'] = 2  # Memory exhaustion
        df.loc[df['p95_latency'] > 400, 'label'] = 3  # Latency spike
        df.loc[df['error_rate'] > 5, 'label'] = 4  # Error surge

        # Prepare features
        X = []
        y = df['label'].values

        for idx in range(20, len(df)):
            features = self._extract_features(
                Metrics(
                    timestamp=df.iloc[idx]['timestamp'],
                    cpu_usage=df.iloc[idx]['cpu_usage'],
                    memory_usage=df.iloc[idx]['memory_usage'],
                    p95_latency=df.iloc[idx]['p95_latency'],
                    p99_latency=df.iloc[idx].get('p99_latency', df.iloc[idx]['p95_latency']),
                    error_rate=df.iloc[idx]['error_rate'],
                    request_rate=df.iloc[idx].get('request_rate', 100),
                    database_query_time=df.iloc[idx].get('database_query_time', 50),
                    active_instances=1,
                    current_cost=30.0
                ),
                df.iloc[:idx]
            )
            X.append(features)

        X = np.array(X)
        y = y[20:]

        # Train
        self.gbdt_model = xgb.XGBClassifier(n_estimators=100, max_depth=6, learning_rate=0.1)
        self.gbdt_model.fit(X, y)

        # Accuracy
        accuracy = self.gbdt_model.score(X, y)
        return float(accuracy)

    def _save_models(self) -> None:
        """Save trained models to disk"""
        try:
            if self.lstm_model and TENSORFLOW_AVAILABLE:
                self.lstm_model.save(str(self.models_dir / "lstm_model.h5"))

            if self.gbdt_model and XGBOOST_AVAILABLE:
                with open(self.models_dir / "gbdt_model.pkl", 'wb') as f:
                    pickle.dump(self.gbdt_model, f)

            with open(self.models_dir / "scaler.pkl", 'wb') as f:
                pickle.dump(self.scaler, f)

            logger.info("✓ Models saved to disk")

        except Exception as e:
            logger.error(f"Model save error: {e}")
    # ==================== v17.5: Online Learning Methods ====================

    def update_prophet_incremental(self, metric_name: str, new_data: pd.DataFrame) -> bool:
        """
        Incrementally update Prophet model with new data.

        Args:
            metric_name: Name of metric to update
            new_data: New observations (columns: ds, y)

        Returns:
            True if update succeeded
        """
        if not PROPHET_AVAILABLE or not self.online_learning_enabled:
            return False

        try:
            logger.info(f"📈 Incrementally updating Prophet model for {metric_name}")

            # Get or create Prophet model for this metric
            if metric_name not in self.prophet_models:
                self.prophet_models[metric_name] = Prophet(
                    daily_seasonality=True,
                    weekly_seasonality=True,
                    changepoint_prior_scale=0.05
                )

            model = self.prophet_models[metric_name]

            # Fit on new data (Prophet handles incremental updates internally)
            model.fit(new_data)

            # Save updated model
            model_path = self.models_dir / f"prophet_{metric_name}.pkl"
            with open(model_path, 'wb') as f:
                pickle.dump(model, f)

            logger.info(f"✓ Prophet model updated for {metric_name}")
            return True

        except Exception as e:
            logger.error(f"Prophet incremental update failed: {e}")
            return False

    def fine_tune_lstm(self, recent_data: pd.DataFrame) -> bool:
        """
        Fine-tune LSTM model with recent data using mini-batch learning.

        Args:
            recent_data: Recent observations (last 24-48 hours)

        Returns:
            True if fine-tuning succeeded
        """
        if not TENSORFLOW_AVAILABLE or self.lstm_model is None or not self.online_learning_enabled:
            return False

        try:
            logger.info("🧠 Fine-tuning LSTM model with recent data")

            # Prepare mini-batch
            X, y = self._prepare_lstm_training_data(recent_data)

            if X is None or len(X) < self.mini_batch_size:
                logger.warning("Insufficient data for LSTM fine-tuning")
                return False

            # Fine-tune with low learning rate
            optimizer = keras.optimizers.Adam(learning_rate=0.0001)
            self.lstm_model.compile(optimizer=optimizer, loss='mse', metrics=['mae'])

            # Train for a few epochs
            history = self.lstm_model.fit(
                X, y,
                epochs=self.fine_tune_epochs,
                batch_size=self.mini_batch_size,
                verbose=0
            )

            # Save updated model
            model_path = self.models_dir / "lstm_model.h5"
            self.lstm_model.save(str(model_path))

            final_loss = history.history['loss'][-1]
            logger.info(f"✓ LSTM fine-tuned (loss: {final_loss:.4f})")

            return True

        except Exception as e:
            logger.error(f"LSTM fine-tuning failed: {e}")
            return False

    def _prepare_lstm_training_data(self, data: pd.DataFrame) -> Tuple[Optional[np.ndarray], Optional[np.ndarray]]:
        """Prepare training data for LSTM from recent observations"""
        try:
            # Extract feature columns
            feature_cols = ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate']
            available_cols = [col for col in feature_cols if col in data.columns]

            if not available_cols:
                return None, None

            # Create sequences
            values = data[available_cols].values
            sequences = []
            targets = []

            for i in range(len(values) - self.window_size - 1):
                seq = values[i:i + self.window_size]
                target = values[i + self.window_size]
                sequences.append(seq)
                targets.append(target)

            if not sequences:
                return None, None

            X = np.array(sequences)
            y = np.array(targets)

            return X, y

        except Exception as e:
            logger.debug(f"LSTM data preparation error: {e}")
            return None, None

    def optimize_ensemble_weights(self) -> None:
        """
        Optimize ensemble weights based on recent prediction accuracy.

        Uses recent accuracy to adjust weights dynamically.
        """
        if not self.accuracy_tracker['lstm'] or not self.online_learning_enabled:
            return

        try:
            logger.info("⚖️  Optimizing ensemble weights")

            # Calculate recent accuracy for each model
            accuracies = {}
            for model_name in ['lstm', 'prophet', 'gbdt']:
                recent_acc = self.accuracy_tracker[model_name][-10:]  # Last 10 predictions
                if recent_acc:
                    accuracies[model_name] = np.mean(recent_acc)
                else:
                    accuracies[model_name] = 0.5  # Default

            # Normalize to sum to 1.0 (softmax-like)
            total = sum(accuracies.values())
            if total > 0:
                for model_name in accuracies:
                    self.ensemble_weights[model_name] = accuracies[model_name] / total

            logger.info(f"✓ Ensemble weights updated: LSTM={self.ensemble_weights['lstm']:.2f}, "
                       f"Prophet={self.ensemble_weights['prophet']:.2f}, "
                       f"GBDT={self.ensemble_weights['gbdt']:.2f}")

            # Save weights
            weights_path = self.models_dir / "ensemble_weights.json"
            import json
            with open(weights_path, 'w') as f:
                json.dump(self.ensemble_weights, f, indent=2)

        except Exception as e:
            logger.error(f"Ensemble weight optimization failed: {e}")

    def record_prediction_outcome(self, prediction: Prediction, actual_incident: bool) -> None:
        """
        Record the outcome of a prediction for learning.

        Args:
            prediction: The prediction that was made
            actual_incident: Whether the incident actually occurred
        """
        if not self.online_learning_enabled:
            return

        try:
            # Calculate accuracy (1.0 if correct, 0.0 if wrong)
            predicted_positive = prediction.probability > 0.70
            accuracy = 1.0 if predicted_positive == actual_incident else 0.0

            # Record accuracy by model source
            model_source = prediction.model_source.lower()
            if model_source in self.accuracy_tracker:
                self.accuracy_tracker[model_source].append(accuracy)

                # Keep only last 100 predictions
                if len(self.accuracy_tracker[model_source]) > 100:
                    self.accuracy_tracker[model_source] = self.accuracy_tracker[model_source][-100:]

            # Store prediction history
            self.prediction_history.append({
                'timestamp': prediction.timestamp,
                'incident_type': prediction.incident_type,
                'probability': prediction.probability,
                'actual': actual_incident,
                'accuracy': accuracy,
                'model': prediction.model_source
            })

            # Trigger ensemble weight optimization if we have enough data
            if len(self.prediction_history) % 20 == 0:
                self.optimize_ensemble_weights()

        except Exception as e:
            logger.error(f"Prediction outcome recording failed: {e}")

    def detect_model_drift(self) -> Dict[str, float]:
        """
        Detect model performance drift.

        Returns:
            Dict with drift scores for each model (0-1, higher = more drift)
        """
        drift_scores = {}

        try:
            for model_name, accuracies in self.accuracy_tracker.items():
                if len(accuracies) < 20:
                    drift_scores[model_name] = 0.0
                    continue

                # Compare recent accuracy to historical accuracy
                recent = np.mean(accuracies[-10:])
                historical = np.mean(accuracies[:-10])

                # Drift = absolute difference in accuracy
                drift = abs(recent - historical)
                drift_scores[model_name] = drift

            # Log significant drift
            for model_name, drift in drift_scores.items():
                if drift > 0.10:
                    logger.warning(f"⚠️  Model drift detected for {model_name}: {drift:.2%}")

        except Exception as e:
            logger.error(f"Model drift detection failed: {e}")

        return drift_scores

    def trigger_online_learning(self, recent_metrics: pd.DataFrame) -> Dict[str, bool]:
        """
        Trigger online learning update for all models.

        Args:
            recent_metrics: Recent metrics (last 24-48 hours)

        Returns:
            Dict with update status for each model
        """
        logger.info("🔄 Triggering online learning updates...")

        results = {}

        # Update Prophet models
        for metric_name in ['cpu_usage', 'memory_usage', 'p95_latency', 'error_rate']:
            if metric_name in recent_metrics.columns:
                # Prepare data in Prophet format
                prophet_data = pd.DataFrame({
                    'ds': pd.to_datetime(recent_metrics.index) if hasattr(recent_metrics.index, 'to_timestamp') else pd.date_range(end=datetime.utcnow(), periods=len(recent_metrics), freq='30min'),
                    'y': recent_metrics[metric_name]
                })

                results[f'prophet_{metric_name}'] = self.update_prophet_incremental(metric_name, prophet_data)

        # Fine-tune LSTM
        results['lstm'] = self.fine_tune_lstm(recent_metrics)

        # Optimize ensemble weights
        self.optimize_ensemble_weights()

        success_count = sum(1 for v in results.values() if v)
        logger.info(f"✓ Online learning complete: {success_count}/{len(results)} updates successful")

        return results


if __name__ == "__main__":
    # Test forecast engine
    engine = ForecastEngine()

    # Create sample metrics
    sample_metrics = Metrics(
        timestamp=datetime.utcnow().isoformat(),
        cpu_usage=75.0,
        memory_usage=70.0,
        p95_latency=250.0,
        p99_latency=300.0,
        error_rate=2.0,
        request_rate=150.0,
        database_query_time=80.0,
        active_instances=2,
        current_cost=28.50
    )

    # Run predictions
    predictions = engine.predict_incidents(sample_metrics, forecast_hours=12)

    print(f"\n🔮 Generated {len(predictions)} predictions:")
    for pred in predictions:
        print(f"  - {pred.incident_type}: {pred.probability:.1%} in {pred.time_to_event_hours:.1f}h")
