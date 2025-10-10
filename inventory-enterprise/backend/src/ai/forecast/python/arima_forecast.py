#!/usr/bin/env python3
"""
ARIMA Forecasting for Short-term Predictions (≤7 days)
NeuroInnovate Inventory Enterprise v2.8.0
"""

import sys
import json
import numpy as np
from datetime import datetime, timedelta

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tools.sm_exceptions import ConvergenceWarning
    import warnings
    warnings.filterwarnings('ignore', category=ConvergenceWarning)
except ImportError:
    print(json.dumps({
        "error": "statsmodels not installed. Run: pip install statsmodels",
        "predictions": [],
        "mape": None,
        "rmse": None
    }))
    sys.exit(1)

def forecast_arima(data, horizon):
    """
    Perform ARIMA forecasting

    Args:
        data: List of {ds: date, y: value}
        horizon: Number of days to forecast

    Returns:
        dict with predictions, confidence, and metrics
    """
    try:
        # Extract time series
        dates = [datetime.fromisoformat(d['ds']) for d in data]
        values = np.array([float(d['y']) for d in data])

        # Auto-select ARIMA parameters (p,d,q)
        # For short-term: (1,1,1) works well for most cases
        order = (1, 1, 1)

        # Fit ARIMA model
        model = ARIMA(values, order=order)
        fitted = model.fit()

        # Generate forecast
        forecast_result = fitted.forecast(steps=horizon, alpha=0.05)

        # Get confidence intervals
        forecast_df = fitted.get_forecast(steps=horizon)
        conf_int = forecast_df.conf_int()

        # Calculate metrics on training data
        predictions_in_sample = fitted.fittedvalues
        actual_in_sample = values[1:]  # ARIMA(1,1,1) loses first value
        pred_in_sample = predictions_in_sample[1:]

        mape = np.mean(np.abs((actual_in_sample - pred_in_sample) / actual_in_sample)) * 100
        rmse = np.sqrt(np.mean((actual_in_sample - pred_in_sample) ** 2))
        mae = np.mean(np.abs(actual_in_sample - pred_in_sample))

        # Format predictions
        last_date = dates[-1]
        predictions = []

        for i in range(horizon):
            pred_date = last_date + timedelta(days=i+1)
            predictions.append({
                "date": pred_date.strftime('%Y-%m-%d'),
                "value": float(forecast_result[i]),
                "lower": float(conf_int[i, 0]) if hasattr(conf_int, 'shape') else float(forecast_result[i]) * 0.9,
                "upper": float(conf_int[i, 1]) if hasattr(conf_int, 'shape') else float(forecast_result[i]) * 1.1
            })

        return {
            "predictions": predictions,
            "confidence": {
                "level": 0.95,
                "method": "ARIMA confidence intervals"
            },
            "mape": float(mape),
            "rmse": float(rmse),
            "mae": float(mae),
            "model_params": {
                "order": order,
                "aic": float(fitted.aic),
                "bic": float(fitted.bic)
            }
        }

    except Exception as e:
        raise Exception(f"ARIMA forecasting failed: {str(e)}")

if __name__ == "__main__":
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())

        data = input_data['data']
        horizon = input_data['horizon']

        # Validate input
        if not data or len(data) < 14:
            raise ValueError(f"Insufficient data points (need ≥14, got {len(data)})")

        if horizon > 7:
            raise ValueError(f"ARIMA is for short-term forecasts (≤7 days), got {horizon}")

        # Generate forecast
        result = forecast_arima(data, horizon)

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
