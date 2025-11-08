# ML Trainer and Inference Pseudo-Code
## Demand Forecast System Implementation

**Document Version:** 1.0
**Author:** ML Engineering Team
**Date:** 2025-10-28

---

## Table of Contents

1. [Data Layer](#data-layer)
2. [Feature Engineering](#feature-engineering)
3. [Model Trainers](#model-trainers)
4. [Inference Engine](#inference-engine)
5. [Reorder Policy Engine](#reorder-policy-engine)
6. [Training Pipeline Orchestrator](#training-pipeline-orchestrator)
7. [Utilities](#utilities)

---

## 1. Data Layer

### 1.1 Database Connection

```python
# src/ml/data/database.py

import sqlite3
from contextlib import contextmanager
from typing import Optional
import pandas as pd

class DatabaseConnection:
    """
    Database connection manager with context manager support
    """
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.connection: Optional[sqlite3.Connection] = None

    @contextmanager
    def get_connection(self):
        """
        Context manager for database connections
        """
        try:
            self.connection = sqlite3.connect(self.db_path)
            self.connection.row_factory = sqlite3.Row
            yield self.connection
        finally:
            if self.connection:
                self.connection.close()

    def execute_query(self, query: str, params: tuple = ()) -> pd.DataFrame:
        """
        Execute SELECT query and return DataFrame
        """
        with self.get_connection() as conn:
            return pd.read_sql_query(query, conn, params=params)

    def execute_insert(self, query: str, params: tuple = ()) -> int:
        """
        Execute INSERT/UPDATE/DELETE and return affected rows
        """
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
            return cursor.lastrowid
```

### 1.2 Data Extraction

```python
# src/ml/data/extractor.py

from datetime import date, timedelta
import pandas as pd
from .database import DatabaseConnection

class DataExtractor:
    """
    Extract training data from database with proper joins
    """
    def __init__(self, db: DatabaseConnection):
        self.db = db

    def extract_usage_history(
        self,
        sku: Optional[str] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        min_weeks: int = 12
    ) -> pd.DataFrame:
        """
        Extract usage history with inventory item details and events

        Args:
            sku: Filter by SKU (None = all SKUs)
            start_date: Start date for data extraction
            end_date: End date for data extraction
            min_weeks: Minimum weeks of history required

        Returns:
            DataFrame with columns:
              - sku, usage_date, quantity_used, category, unit_cost,
                lead_time_days, event_multiplier, event_type
        """
        query = """
        SELECT
            uh.sku,
            uh.usage_date,
            uh.quantity_used,
            uh.quantity_wasted,
            uh.is_special_event,
            ii.name AS sku_name,
            ii.category,
            ii.unit_cost,
            ii.lead_time_days,
            ii.min_order_quantity,
            ii.lot_size,
            COALESCE(se.impact_multiplier, 1.0) as event_multiplier,
            se.event_type
        FROM usage_history uh
        INNER JOIN inventory_items ii ON uh.sku = ii.sku
        LEFT JOIN special_events se
            ON uh.usage_date = se.event_date
            AND (se.applies_to_category IS NULL OR se.applies_to_category = ii.category)
        WHERE 1=1
        """

        params = []

        if sku:
            query += " AND uh.sku = ?"
            params.append(sku)

        if start_date:
            query += " AND uh.usage_date >= ?"
            params.append(start_date)

        if end_date:
            query += " AND uh.usage_date <= ?"
            params.append(end_date)

        query += " ORDER BY uh.sku, uh.usage_date"

        df = self.db.execute_query(query, tuple(params))

        # Filter SKUs with insufficient history
        if min_weeks > 0:
            sku_counts = df.groupby('sku').size()
            valid_skus = sku_counts[sku_counts >= min_weeks].index
            df = df[df['sku'].isin(valid_skus)]

        # Convert date column
        df['usage_date'] = pd.to_datetime(df['usage_date'])

        return df

    def get_current_inventory_levels(self) -> pd.DataFrame:
        """
        Get current stock levels for all SKUs
        """
        query = """
        SELECT
            sku,
            current_stock,
            reorder_point,
            safety_stock
        FROM inventory_items
        """
        return self.db.execute_query(query)

    def get_pending_orders(self) -> pd.DataFrame:
        """
        Get pending orders by SKU
        """
        query = """
        SELECT
            sku,
            SUM(quantity_ordered - COALESCE(quantity_received, 0)) as pending_quantity
        FROM order_history
        WHERE status = 'pending'
        GROUP BY sku
        """
        return self.db.execute_query(query)
```

---

## 2. Feature Engineering

```python
# src/ml/features/engineer.py

import numpy as np
import pandas as pd
from typing import Dict, List
from scipy import stats

class FeatureEngineer:
    """
    Create ML features from raw usage data
    """
    def __init__(self):
        self.feature_columns = []

    def engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create all features for model training

        Args:
            df: Raw usage data with sku, usage_date, quantity_used

        Returns:
            DataFrame with engineered features
        """
        # Ensure sorted by SKU and date
        df = df.sort_values(['sku', 'usage_date']).copy()

        features = df.copy()

        # 1. Lag features
        features = self._create_lag_features(features)

        # 2. Rolling statistics
        features = self._create_rolling_features(features)

        # 3. Trend features
        features = self._create_trend_features(features)

        # 4. Seasonality features
        features = self._create_seasonality_features(features)

        # 5. External regressors (already in df as event_multiplier)

        # Store feature column names
        self.feature_columns = [
            col for col in features.columns
            if col not in ['sku', 'usage_date', 'quantity_used', 'sku_name', 'category']
        ]

        return features

    def _create_lag_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create lagged usage features (1, 2, 4 weeks ago)
        """
        for lag in [1, 2, 4]:
            df[f'usage_lag_{lag}w'] = df.groupby('sku')['quantity_used'].shift(lag)

        return df

    def _create_rolling_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create rolling window statistics
        """
        for window in [4, 12]:
            rolling = df.groupby('sku')['quantity_used'].rolling(
                window=window,
                min_periods=1
            )

            df[f'usage_mean_{window}w'] = rolling.mean().reset_index(0, drop=True)
            df[f'usage_std_{window}w'] = rolling.std().reset_index(0, drop=True)
            df[f'usage_min_{window}w'] = rolling.min().reset_index(0, drop=True)
            df[f'usage_max_{window}w'] = rolling.max().reset_index(0, drop=True)

        return df

    def _create_trend_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create trend features (linear regression slope)
        """
        def rolling_trend(series, window=4):
            """
            Calculate linear regression slope over rolling window
            """
            result = np.full(len(series), np.nan)

            for i in range(window - 1, len(series)):
                window_data = series.iloc[i - window + 1:i + 1]
                if len(window_data) >= window:
                    x = np.arange(window)
                    slope, _, _, _, _ = stats.linregress(x, window_data)
                    result[i] = slope

            return pd.Series(result, index=series.index)

        df['usage_trend_4w'] = df.groupby('sku')['quantity_used'].apply(
            lambda x: rolling_trend(x, window=4)
        ).reset_index(0, drop=True)

        # Percentage change from 4 weeks ago
        df['usage_pct_change_4w'] = df.groupby('sku')['quantity_used'].pct_change(periods=4) * 100

        return df

    def _create_seasonality_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Create seasonality indicator features
        """
        df['day_of_week'] = df['usage_date'].dt.dayofweek
        df['week_of_year'] = df['usage_date'].dt.isocalendar().week
        df['month'] = df['usage_date'].dt.month
        df['quarter'] = df['usage_date'].dt.quarter

        df['is_month_start'] = df['usage_date'].dt.is_month_start
        df['is_month_end'] = df['usage_date'].dt.is_month_end
        df['is_quarter_start'] = df['usage_date'].dt.is_quarter_start
        df['is_quarter_end'] = df['usage_date'].dt.is_quarter_end

        return df
```

---

## 3. Model Trainers

### 3.1 Base Model Interface

```python
# src/ml/models/base.py

from abc import ABC, abstractmethod
from typing import Dict, Any
import pandas as pd
import numpy as np

class BaseForecaster(ABC):
    """
    Abstract base class for all forecast models
    """
    def __init__(self, name: str):
        self.name = name
        self.is_fitted = False
        self.model = None

    @abstractmethod
    def fit(self, train_data: pd.DataFrame) -> None:
        """
        Train the model on historical data
        """
        pass

    @abstractmethod
    def predict(self, horizon: int) -> Dict[str, Any]:
        """
        Generate forecast for specified horizon

        Args:
            horizon: Number of periods (weeks) to forecast

        Returns:
            dict with keys:
              - point_forecast: array of point forecasts
              - lower_80: lower bound of 80% PI
              - upper_80: upper bound of 80% PI
              - lower_95: lower bound of 95% PI
              - upper_95: upper bound of 95% PI
        """
        pass

    @abstractmethod
    def get_hyperparameters(self) -> Dict[str, Any]:
        """
        Return model hyperparameters
        """
        pass
```

### 3.2 Seasonal Naive Model

```python
# src/ml/models/seasonal_naive.py

from .base import BaseForecaster
import numpy as np

class SeasonalNaiveForecaster(BaseForecaster):
    """
    Baseline model: Forecast = same period last year (or last week)
    """
    def __init__(self, seasonal_period: int = 52):
        super().__init__('seasonal_naive')
        self.seasonal_period = seasonal_period
        self.history = None

    def fit(self, train_data: pd.DataFrame) -> None:
        """
        Store historical data for seasonal naive forecast
        """
        self.history = train_data['quantity_used'].values
        self.is_fitted = True

    def predict(self, horizon: int) -> Dict[str, Any]:
        """
        Naive forecast: repeat last seasonal period
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")

        # If we have full seasonal period, use it
        if len(self.history) >= self.seasonal_period:
            seasonal_pattern = self.history[-self.seasonal_period:]
        else:
            # Otherwise, use all available history and repeat
            seasonal_pattern = self.history

        # Repeat pattern for horizon
        forecast = np.tile(seasonal_pattern, horizon // len(seasonal_pattern) + 1)[:horizon]

        # Simple prediction intervals (±20% and ±30%)
        std = np.std(self.history) if len(self.history) > 1 else forecast.mean() * 0.2

        return {
            'point_forecast': forecast,
            'lower_80': forecast - 1.28 * std,
            'upper_80': forecast + 1.28 * std,
            'lower_95': forecast - 1.96 * std,
            'upper_95': forecast + 1.96 * std,
        }

    def get_hyperparameters(self) -> Dict[str, Any]:
        return {'seasonal_period': self.seasonal_period}
```

### 3.3 ETS Model

```python
# src/ml/models/ets.py

from .base import BaseForecaster
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import numpy as np

class ETSForecaster(BaseForecaster):
    """
    Exponential Smoothing (ETS) model
    """
    def __init__(
        self,
        trend: str = 'add',
        seasonal: str = 'add',
        seasonal_periods: int = 52
    ):
        super().__init__('ets')
        self.trend = trend
        self.seasonal = seasonal
        self.seasonal_periods = seasonal_periods
        self.model = None
        self.fitted_model = None

    def fit(self, train_data: pd.DataFrame) -> None:
        """
        Fit ETS model
        """
        y = train_data['quantity_used'].values

        # Determine if we have enough data for seasonality
        if len(y) < self.seasonal_periods * 2:
            seasonal = None
            seasonal_periods = None
        else:
            seasonal = self.seasonal
            seasonal_periods = self.seasonal_periods

        self.model = ExponentialSmoothing(
            y,
            trend=self.trend,
            seasonal=seasonal,
            seasonal_periods=seasonal_periods
        )

        self.fitted_model = self.model.fit(optimized=True)
        self.is_fitted = True

    def predict(self, horizon: int) -> Dict[str, Any]:
        """
        Generate ETS forecast with prediction intervals
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")

        forecast_result = self.fitted_model.forecast(steps=horizon)

        # Get prediction intervals (statsmodels doesn't provide these directly)
        # Use residuals to estimate std
        residuals = self.fitted_model.resid
        std = np.std(residuals)

        point_forecast = forecast_result

        return {
            'point_forecast': point_forecast,
            'lower_80': point_forecast - 1.28 * std,
            'upper_80': point_forecast + 1.28 * std,
            'lower_95': point_forecast - 1.96 * std,
            'upper_95': point_forecast + 1.96 * std,
        }

    def get_hyperparameters(self) -> Dict[str, Any]:
        return {
            'trend': self.trend,
            'seasonal': self.seasonal,
            'seasonal_periods': self.seasonal_periods,
            'params': self.fitted_model.params.to_dict() if self.fitted_model else {}
        }
```

### 3.4 Prophet Model

```python
# src/ml/models/prophet.py

from .base import BaseForecaster
from prophet import Prophet
import pandas as pd

class ProphetForecaster(BaseForecaster):
    """
    Facebook Prophet model with external regressors
    """
    def __init__(
        self,
        yearly_seasonality: bool = True,
        weekly_seasonality: bool = True,
        changepoint_prior_scale: float = 0.05
    ):
        super().__init__('prophet')
        self.yearly_seasonality = yearly_seasonality
        self.weekly_seasonality = weekly_seasonality
        self.changepoint_prior_scale = changepoint_prior_scale
        self.model = None

    def fit(self, train_data: pd.DataFrame) -> None:
        """
        Fit Prophet model with external regressors
        """
        # Prepare data in Prophet format (ds, y)
        df = pd.DataFrame({
            'ds': pd.to_datetime(train_data['usage_date']),
            'y': train_data['quantity_used']
        })

        # Add external regressors if available
        if 'event_multiplier' in train_data.columns:
            df['event_multiplier'] = train_data['event_multiplier'].values

        if 'is_special_event' in train_data.columns:
            df['is_special_event'] = train_data['is_special_event'].astype(int).values

        # Initialize Prophet
        self.model = Prophet(
            yearly_seasonality=self.yearly_seasonality,
            weekly_seasonality=self.weekly_seasonality,
            changepoint_prior_scale=self.changepoint_prior_scale,
            interval_width=0.80  # 80% prediction interval
        )

        # Add regressors
        if 'event_multiplier' in df.columns:
            self.model.add_regressor('event_multiplier')

        if 'is_special_event' in df.columns:
            self.model.add_regressor('is_special_event')

        # Fit model
        self.model.fit(df)
        self.is_fitted = True

    def predict(self, horizon: int, future_regressors: pd.DataFrame = None) -> Dict[str, Any]:
        """
        Generate Prophet forecast

        Args:
            horizon: Number of weeks to forecast
            future_regressors: DataFrame with future event_multiplier and is_special_event
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")

        # Create future dataframe
        future = self.model.make_future_dataframe(periods=horizon, freq='W')

        # Add future regressors if provided
        if future_regressors is not None:
            for col in ['event_multiplier', 'is_special_event']:
                if col in future_regressors.columns:
                    future[col] = future_regressors[col].values[-horizon:]
        else:
            # Default values
            future['event_multiplier'] = 1.0
            future['is_special_event'] = 0

        # Generate forecast
        forecast = self.model.predict(future)

        # Extract last 'horizon' predictions
        forecast = forecast.iloc[-horizon:]

        return {
            'point_forecast': forecast['yhat'].values,
            'lower_80': forecast['yhat_lower'].values,
            'upper_80': forecast['yhat_upper'].values,
            'lower_95': forecast['yhat_lower'].values * 0.85,  # Approximate 95% PI
            'upper_95': forecast['yhat_upper'].values * 1.15,
        }

    def get_hyperparameters(self) -> Dict[str, Any]:
        return {
            'yearly_seasonality': self.yearly_seasonality,
            'weekly_seasonality': self.weekly_seasonality,
            'changepoint_prior_scale': self.changepoint_prior_scale
        }
```

### 3.5 LightGBM Model

```python
# src/ml/models/lightgbm.py

from .base import BaseForecaster
import lightgbm as lgb
import numpy as np
import pandas as pd

class LightGBMForecaster(BaseForecaster):
    """
    Gradient boosting model using LightGBM
    """
    def __init__(
        self,
        n_estimators: int = 100,
        learning_rate: float = 0.05,
        max_depth: int = 5,
        num_leaves: int = 31
    ):
        super().__init__('lightgbm')
        self.n_estimators = n_estimators
        self.learning_rate = learning_rate
        self.max_depth = max_depth
        self.num_leaves = num_leaves
        self.model = None
        self.feature_cols = []

    def fit(self, train_data: pd.DataFrame) -> None:
        """
        Fit LightGBM model on engineered features
        """
        # Define feature columns
        self.feature_cols = [
            'usage_lag_1w', 'usage_lag_2w', 'usage_lag_4w',
            'usage_mean_4w', 'usage_std_4w', 'usage_mean_12w', 'usage_std_12w',
            'usage_trend_4w', 'usage_pct_change_4w',
            'day_of_week', 'week_of_year', 'month', 'quarter',
            'is_month_end', 'event_multiplier'
        ]

        # Filter columns that exist
        self.feature_cols = [col for col in self.feature_cols if col in train_data.columns]

        # Prepare data
        X = train_data[self.feature_cols].fillna(0)  # Fill NaN with 0
        y = train_data['quantity_used'].values

        # Split train/validation
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]

        # Train model
        self.model = lgb.LGBMRegressor(
            n_estimators=self.n_estimators,
            learning_rate=self.learning_rate,
            max_depth=self.max_depth,
            num_leaves=self.num_leaves,
            random_state=42,
            verbose=-1
        )

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_val, y_val)],
            callbacks=[lgb.early_stopping(10, verbose=False)]
        )

        self.is_fitted = True

    def predict(self, horizon: int, future_features: pd.DataFrame) -> Dict[str, Any]:
        """
        Generate LightGBM forecast (requires future features)
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")

        # Ensure future_features has required columns
        X_future = future_features[self.feature_cols].fillna(0)

        # Point forecast
        point_forecast = self.model.predict(X_future[:horizon])

        # Estimate prediction intervals using quantile regression (simplified)
        # In production, train separate models for quantiles
        std = np.std(point_forecast) * 0.15  # Estimate uncertainty

        return {
            'point_forecast': point_forecast,
            'lower_80': point_forecast - 1.28 * std,
            'upper_80': point_forecast + 1.28 * std,
            'lower_95': point_forecast - 1.96 * std,
            'upper_95': point_forecast + 1.96 * std,
        }

    def get_hyperparameters(self) -> Dict[str, Any]:
        return {
            'n_estimators': self.n_estimators,
            'learning_rate': self.learning_rate,
            'max_depth': self.max_depth,
            'num_leaves': self.num_leaves,
            'feature_importance': dict(zip(
                self.feature_cols,
                self.model.feature_importances_
            )) if self.model else {}
        }
```

### 3.6 Ensemble Model

```python
# src/ml/models/ensemble.py

from .base import BaseForecaster
import numpy as np
from typing import List, Dict

class EnsembleForecaster(BaseForecaster):
    """
    Weighted ensemble of multiple models
    """
    def __init__(self, models: List[BaseForecaster], weights: List[float] = None):
        super().__init__('ensemble')
        self.models = models

        # Default equal weights
        if weights is None:
            weights = [1.0 / len(models)] * len(models)

        # Normalize weights
        total = sum(weights)
        self.weights = [w / total for w in weights]

    def fit(self, train_data: pd.DataFrame) -> None:
        """
        Fit all component models
        """
        for model in self.models:
            model.fit(train_data)

        self.is_fitted = True

    def predict(self, horizon: int, **kwargs) -> Dict[str, Any]:
        """
        Generate ensemble forecast (weighted average of components)
        """
        if not self.is_fitted:
            raise ValueError("Model not fitted. Call fit() first.")

        # Get predictions from all models
        predictions = []
        for model in self.models:
            pred = model.predict(horizon, **kwargs)
            predictions.append(pred)

        # Weighted average
        point_forecast = np.sum([
            w * pred['point_forecast']
            for w, pred in zip(self.weights, predictions)
        ], axis=0)

        # Conservative PI: use widest intervals
        lower_80 = np.min([pred['lower_80'] for pred in predictions], axis=0)
        upper_80 = np.max([pred['upper_80'] for pred in predictions], axis=0)
        lower_95 = np.min([pred['lower_95'] for pred in predictions], axis=0)
        upper_95 = np.max([pred['upper_95'] for pred in predictions], axis=0)

        return {
            'point_forecast': point_forecast,
            'lower_80': lower_80,
            'upper_80': upper_80,
            'lower_95': lower_95,
            'upper_95': upper_95,
        }

    def get_hyperparameters(self) -> Dict[str, Any]:
        return {
            'models': [m.name for m in self.models],
            'weights': self.weights,
            'component_params': {
                m.name: m.get_hyperparameters()
                for m in self.models
            }
        }
```

---

## 4. Inference Engine

```python
# src/ml/inference/engine.py

from datetime import date, timedelta
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional
from ..models.base import BaseForecaster
from ..data.database import DatabaseConnection

class ForecastInferenceEngine:
    """
    Production inference engine for generating forecasts
    """
    def __init__(self, db: DatabaseConnection, model_registry: 'ModelRegistry'):
        self.db = db
        self.model_registry = model_registry
        self.cache = {}  # In-memory cache (use Redis in production)

    def generate_forecast(
        self,
        sku: str,
        horizon_weeks: int = 4,
        as_of_date: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Generate forecast for a single SKU

        Returns:
            dict with forecast data and metadata
        """
        as_of_date = as_of_date or date.today()

        # Check cache
        cache_key = f"{sku}_{as_of_date}_{horizon_weeks}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        # Load production model for SKU
        model = self.model_registry.get_production_model(sku)

        if not model:
            # Fallback to seasonal naive
            model = self._create_fallback_model(sku)

        # Generate prediction
        try:
            prediction = model.predict(horizon_weeks)

            # Format result
            forecast = {
                'sku': sku,
                'forecast_date': as_of_date.isoformat(),
                'horizon_weeks': horizon_weeks,
                'point_forecast': float(np.sum(prediction['point_forecast'])),
                'prediction_interval_80': {
                    'lower': float(np.sum(prediction['lower_80'])),
                    'upper': float(np.sum(prediction['upper_80']))
                },
                'prediction_interval_95': {
                    'lower': float(np.sum(prediction['lower_95'])),
                    'upper': float(np.sum(prediction['upper_95']))
                },
                'confidence_score': self._calculate_confidence(model, prediction),
                'by_week': [
                    {
                        'week': i + 1,
                        'forecast': float(prediction['point_forecast'][i])
                    }
                    for i in range(horizon_weeks)
                ],
                'model': {
                    'name': model.name,
                    'version': getattr(model, 'version', 'unknown')
                }
            }

            # Cache result
            self.cache[cache_key] = forecast

            return forecast

        except Exception as e:
            raise ValueError(f"Forecast generation failed for {sku}: {str(e)}")

    def _calculate_confidence(self, model: BaseForecaster, prediction: Dict) -> float:
        """
        Calculate confidence score based on PI width
        """
        point = np.mean(prediction['point_forecast'])
        pi_width = np.mean(prediction['upper_80']) - np.mean(prediction['lower_80'])

        if point == 0:
            return 0.5

        # Narrower PI = higher confidence
        relative_width = pi_width / (point + 1e-6)
        confidence = 1.0 / (1.0 + relative_width)

        return float(np.clip(confidence, 0, 1))

    def _create_fallback_model(self, sku: str) -> BaseForecaster:
        """
        Create fallback model (seasonal naive) when no trained model exists
        """
        from ..models.seasonal_naive import SeasonalNaiveForecaster
        from ..data.extractor import DataExtractor

        extractor = DataExtractor(self.db)
        data = extractor.extract_usage_history(
            sku=sku,
            end_date=date.today() - timedelta(days=1),
            min_weeks=4
        )

        model = SeasonalNaiveForecaster()
        model.fit(data)

        return model
```

---

## 5. Reorder Policy Engine

```python
# src/ml/reorder/policy.py

import numpy as np
from typing import Dict
from scipy import stats

class ReorderPolicyEngine:
    """
    Calculate reorder recommendations based on forecast and safety stock
    """
    SERVICE_LEVELS = {'A': 0.99, 'B': 0.95, 'C': 0.90}
    Z_SCORES = {'A': 2.33, 'B': 1.65, 'C': 1.28}

    def calculate_recommendation(
        self,
        sku: str,
        forecast: Dict,
        current_stock: float,
        abc_class: str,
        lead_time_days: int,
        min_order_qty: float = 1.0,
        lot_size: float = 1.0
    ) -> Dict:
        """
        Calculate reorder recommendation

        Args:
            sku: SKU identifier
            forecast: Forecast dict from inference engine
            current_stock: Current inventory level
            abc_class: ABC classification (A, B, or C)
            lead_time_days: Supplier lead time
            min_order_qty: Minimum order quantity
            lot_size: Order lot size (for rounding)

        Returns:
            dict with reorder recommendation
        """
        # Forecast for next 4 weeks
        forecasted_demand_4w = forecast['point_forecast']
        avg_daily_demand = forecasted_demand_4w / 28

        # Estimate demand std from PI width
        pi_width = forecast['prediction_interval_80']['upper'] - forecast['prediction_interval_80']['lower']
        std_daily_demand = (pi_width / 28) / 2.56  # 80% PI ≈ ±1.28 std

        # Service level and z-score
        service_level = self.SERVICE_LEVELS.get(abc_class, 0.95)
        z_score = self.Z_SCORES.get(abc_class, 1.65)

        # Safety stock calculation
        # σ_LT = √(L × σ_d²)  (assuming fixed lead time)
        sigma_lt = np.sqrt(lead_time_days * std_daily_demand**2)
        safety_stock = z_score * sigma_lt

        # Reorder point
        reorder_point = (avg_daily_demand * lead_time_days) + safety_stock

        # Current on-order (would query from database)
        current_on_order = 0  # TODO: Fetch from order_history

        # Stock position
        stock_position = current_stock + current_on_order

        # Should reorder?
        should_reorder = stock_position < reorder_point

        # Recommended order quantity
        if should_reorder:
            # Target stock level = 4 weeks demand + safety stock
            target_stock = forecasted_demand_4w + safety_stock
            order_quantity = max(target_stock - stock_position, 0)

            # Round up to lot size
            order_quantity = np.ceil(order_quantity / lot_size) * lot_size

            # Enforce minimum order quantity
            order_quantity = max(order_quantity, min_order_qty)
        else:
            order_quantity = 0

        # Priority calculation
        days_until_stockout = (stock_position - safety_stock) / (avg_daily_demand + 1e-6)

        if days_until_stockout < lead_time_days:
            priority = 'urgent'
        elif days_until_stockout < lead_time_days * 1.5:
            priority = 'high'
        elif should_reorder:
            priority = 'medium'
        else:
            priority = 'low'

        return {
            'sku': sku,
            'abc_class': abc_class,
            'forecasted_demand_4w': round(forecasted_demand_4w, 2),
            'avg_daily_demand': round(avg_daily_demand, 2),
            'std_daily_demand': round(std_daily_demand, 2),
            'lead_time_days': lead_time_days,
            'service_level_target': service_level,
            'z_score': z_score,
            'safety_stock': round(safety_stock, 2),
            'reorder_point': round(reorder_point, 2),
            'current_stock': current_stock,
            'current_on_order': current_on_order,
            'stock_position': stock_position,
            'should_reorder': should_reorder,
            'recommended_order_quantity': round(order_quantity, 2),
            'priority': priority,
            'days_until_stockout': round(days_until_stockout, 1)
        }
```

---

## 6. Training Pipeline Orchestrator

```python
# src/ml/training/pipeline.py

from datetime import date, timedelta
import pandas as pd
from typing import Dict, List
from ..data.extractor import DataExtractor
from ..features.engineer import FeatureEngineer
from ..models.seasonal_naive import SeasonalNaiveForecaster
from ..models.ets import ETSForecaster
from ..models.prophet import ProphetForecaster
from ..models.lightgbm import LightGBMForecaster
from ..models.ensemble import EnsembleForecaster

class ForecastTrainingPipeline:
    """
    Orchestrator for model training pipeline
    """
    def __init__(self, db):
        self.db = db
        self.extractor = DataExtractor(db)
        self.engineer = FeatureEngineer()

    def run_training(self, training_date: date = None) -> Dict:
        """
        Main training loop - runs weekly via cron/Airflow
        """
        training_date = training_date or date.today()

        print("[1/6] Extracting training data...")
        data = self.extractor.extract_usage_history(
            start_date=training_date - timedelta(weeks=104),  # 2 years
            end_date=training_date - timedelta(days=7),  # 1 week lag
            min_weeks=12
        )

        print("[2/6] Engineering features...")
        features = self.engineer.engineer_features(data)

        print("[3/6] Running ABC analysis...")
        abc_classes = self.classify_items_abc(data, training_date)

        print("[4/6] Training models...")
        models = {}
        for sku in data['sku'].unique():
            sku_data = data[data['sku'] == sku]

            if len(sku_data) < 12:
                print(f"  ⚠ Skipping {sku}: insufficient history ({len(sku_data)} weeks)")
                continue

            print(f"  Training {sku}...")
            models[sku] = self.train_sku_models(sku, sku_data, features, abc_classes)

        print("[5/6] Running backtests...")
        backtest_results = self.run_backtest(data, models)

        print("[6/6] Registering models...")
        # Register models to database

        print(f"✅ Training complete: {len(models)} SKUs trained")
        return models

    def classify_items_abc(self, data: pd.DataFrame, as_of_date: date) -> Dict:
        """
        ABC classification based on annual usage value
        """
        annual_usage = data.groupby('sku').agg({
            'quantity_used': 'sum',
            'unit_cost': 'first'
        })
        annual_usage['annual_value'] = annual_usage['quantity_used'] * annual_usage['unit_cost']
        annual_usage = annual_usage.sort_values('annual_value', ascending=False)

        annual_usage['cumulative_pct'] = (
            annual_usage['annual_value'].cumsum() / annual_usage['annual_value'].sum()
        )

        annual_usage['abc_class'] = 'C'
        annual_usage.loc[annual_usage['cumulative_pct'] <= 0.80, 'abc_class'] = 'A'
        annual_usage.loc[
            (annual_usage['cumulative_pct'] > 0.80) & (annual_usage['cumulative_pct'] <= 0.95),
            'abc_class'
        ] = 'B'

        return annual_usage[['abc_class', 'annual_value']].to_dict('index')

    def train_sku_models(self, sku: str, sku_data: pd.DataFrame, features: pd.DataFrame, abc_classes: Dict) -> Dict:
        """
        Train multiple models for a single SKU
        """
        models = {}

        # Always train baseline
        models['seasonal_naive'] = SeasonalNaiveForecaster()
        models['seasonal_naive'].fit(sku_data)

        # ETS if 12+ weeks
        if len(sku_data) >= 12:
            models['ets'] = ETSForecaster()
            models['ets'].fit(sku_data)

        # Prophet if 52+ weeks
        if len(sku_data) >= 52:
            models['prophet'] = ProphetForecaster()
            models['prophet'].fit(sku_data)

        # LightGBM if 104+ weeks AND A-class
        abc_class = abc_classes.get(sku, {}).get('abc_class', 'C')
        if len(sku_data) >= 104 and abc_class == 'A':
            sku_features = features[features['sku'] == sku]
            models['lightgbm'] = LightGBMForecaster()
            models['lightgbm'].fit(sku_features)

        return models

    def run_backtest(self, data: pd.DataFrame, models: Dict) -> Dict:
        """
        Walk-forward backtesting
        """
        # Simplified - implement full walk-forward validation
        return {}
```

---

## 7. Utilities

```python
# src/ml/utils/metrics.py

import numpy as np

def mean_absolute_percentage_error(y_true, y_pred):
    """Calculate MAPE"""
    return np.mean(np.abs((y_true - y_pred) / (y_true + 1e-6))) * 100

def root_mean_squared_error(y_true, y_pred):
    """Calculate RMSE"""
    return np.sqrt(np.mean((y_true - y_pred)**2))

def mean_absolute_error(y_true, y_pred):
    """Calculate MAE"""
    return np.mean(np.abs(y_true - y_pred))

def forecast_bias(y_true, y_pred):
    """Calculate forecast bias (negative = under-forecasting)"""
    return np.mean(y_pred - y_true)

def prediction_interval_coverage(y_true, lower, upper):
    """Calculate PI coverage (% of actuals within interval)"""
    within = (y_true >= lower) & (y_true <= upper)
    return np.mean(within)
```

---

**END OF ML TRAINER AND INFERENCE PSEUDO-CODE**
