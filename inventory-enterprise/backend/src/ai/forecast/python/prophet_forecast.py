#!/usr/bin/env python3
"""
Prophet Forecasting for Long-term Predictions (>7 days)
NeuroInnovate Inventory Enterprise v2.8.0
"""

import sys
import json
import pandas as pd
import numpy as np
from datetime import datetime

try:
    from prophet import Prophet
except ImportError:
    print(json.dumps({
        "error": "prophet not installed. Run: pip install prophet",
        "predictions": [],
        "mape": None,
        "rmse": None
    }))
    sys.exit(1)

def forecast_prophet(data, horizon):
    """
    Perform Prophet forecasting with seasonality detection

    Args:
        data: List of {ds: date, y: value}
        horizon: Number of days to forecast

    Returns:
        dict with predictions, confidence, and metrics
    """
    try:
        # Convert to DataFrame
        df = pd.DataFrame(data)
        df['ds'] = pd.to_datetime(df['ds'])
        df['y'] = df['y'].astype(float)

        # Initialize Prophet with sensible defaults for inventory
        model = Prophet(
            seasonality_mode='multiplicative',
            yearly_seasonality=True,
            weekly_seasonality=True,
            daily_seasonality=False,
            changepoint_prior_scale=0.05,  # Less sensitive to trend changes
            seasonality_prior_scale=10.0,  # More emphasis on seasonality
            interval_width=0.95  # 95% confidence intervals
        )

        # Fit model
        model.fit(df)

        # Generate future dataframe
        future = model.make_future_dataframe(periods=horizon, freq='D')
        forecast = model.predict(future)

        # Calculate metrics on historical data
        y_true = df['y'].values
        y_pred = forecast['yhat'][:len(y_true)].values

        # Handle division by zero
        mask = y_true != 0
        mape = np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100 if mask.any() else 0

        rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
        mae = np.mean(np.abs(y_true - y_pred))

        # Extract future predictions
        future_forecast = forecast.tail(horizon)

        predictions = []
        for _, row in future_forecast.iterrows():
            predictions.append({
                "date": row['ds'].strftime('%Y-%m-%d'),
                "value": float(row['yhat']),
                "lower": float(row['yhat_lower']),
                "upper": float(row['yhat_upper'])
            })

        return {
            "predictions": predictions,
            "confidence": {
                "level": 0.95,
                "method": "Prophet confidence intervals"
            },
            "mape": float(mape),
            "rmse": float(rmse),
            "mae": float(mae),
            "model_params": {
                "changepoint_prior_scale": 0.05,
                "seasonality_prior_scale": 10.0,
                "yearly_seasonality": True,
                "weekly_seasonality": True
            }
        }

    except Exception as e:
        raise Exception(f"Prophet forecasting failed: {str(e)}")

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())

        data = input_data['data']
        horizon = input_data['horizon']

        # Validate input
        if not data or len(data) < 14:
            raise ValueError(f"Insufficient data points (need ≥14, got {len(data)})")

        # Generate forecast
        result = forecast_prophet(data, horizon)

        # Output result as JSON
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        error_result = {
            "error": str(e),
            "predictions": [],
            "mape": None,
            "rmse": None
        }
        print(json.dumps(error_result))
        sys.exit(1)
