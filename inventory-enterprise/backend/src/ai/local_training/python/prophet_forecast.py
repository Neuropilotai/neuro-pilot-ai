#!/usr/bin/env python3
"""
Prophet Forecasting for Apple Silicon
Trains Prophet models and returns REAL measured metrics
"""

import sys
import json
import time
import warnings
from datetime import datetime

warnings.filterwarnings('ignore')

def train_and_forecast(data_points, horizon_days, item_code):
    """
    Train Prophet model and return real metrics

    Args:
        data_points: List of {date, quantity}
        horizon_days: Forecast horizon
        item_code: Item identifier

    Returns:
        dict with model, metrics, forecast
    """
    start_time = time.time()

    try:
        import pandas as pd
        import numpy as np
        from prophet import Prophet
        from prophet.serialize import model_to_json
    except ImportError as e:
        return {
            'error': f'Missing dependency: {str(e)}',
            'metrics': {
                'mape': None,
                'rmse': None,
                'mae': None,
                'wallClockSec': None,
                'samples': 0
            }
        }

    # Convert to DataFrame
    df = pd.DataFrame(data_points)
    df.columns = ['ds', 'y']
    df['ds'] = pd.to_datetime(df['ds'])
    df['y'] = pd.to_numeric(df['y'], errors='coerce')

    # Remove NaN values
    df = df.dropna()

    if len(df) < 14:
        return {
            'error': f'Insufficient data: {len(df)} rows (need >= 14)',
            'metrics': {
                'mape': None,
                'rmse': None,
                'mae': None,
                'wallClockSec': time.time() - start_time,
                'samples': len(df)
            }
        }

    # Split: 80% train, 20% validation
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx].copy()
    valid_df = df.iloc[split_idx:].copy()

    # Configure Prophet
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True if len(df) >= 365 else False,
        changepoint_prior_scale=0.05,
        seasonality_prior_scale=10.0,
        interval_width=0.95
    )

    # Train
    model.fit(train_df)

    # Calculate REAL metrics on validation set
    metrics = {
        'mape': None,
        'rmse': None,
        'mae': None,
        'wallClockSec': None,
        'samples': len(df),
        'trainSamples': len(train_df),
        'validSamples': len(valid_df)
    }

    if len(valid_df) > 0:
        # Predict on validation
        forecast_valid = model.predict(valid_df[['ds']])
        actual = valid_df['y'].values
        predicted = forecast_valid['yhat'].values

        # MAPE (Mean Absolute Percentage Error)
        mask = actual != 0
        if mask.sum() > 0:
            mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100
            metrics['mape'] = float(mape)

        # RMSE (Root Mean Squared Error)
        rmse = np.sqrt(np.mean((actual - predicted) ** 2))
        metrics['rmse'] = float(rmse)

        # MAE (Mean Absolute Error)
        mae = np.mean(np.abs(actual - predicted))
        metrics['mae'] = float(mae)

    # Generate future forecast
    future = model.make_future_dataframe(periods=horizon_days, freq='D')
    forecast = model.predict(future)

    # Get only future predictions
    forecast_future = forecast.tail(horizon_days)[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]

    # Wall-clock time
    wall_clock_sec = time.time() - start_time
    metrics['wallClockSec'] = round(wall_clock_sec, 3)

    # Serialize model
    model_json = model_to_json(model)

    metadata = {
        'itemCode': item_code,
        'modelType': 'prophet',
        'horizonDays': horizon_days,
        'trainedAt': datetime.now().isoformat(),
        'prophetParams': {
            'changepoint_prior_scale': 0.05,
            'seasonality_prior_scale': 10.0,
            'yearly_seasonality': len(df) >= 365
        }
    }

    return {
        'success': True,
        'model': model_json,
        'metrics': metrics,
        'forecast': forecast_future.to_dict('records'),
        'metadata': metadata
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: prophet_forecast.py <data_file.json>'}))
        sys.exit(1)

    data_file = sys.argv[1]

    try:
        with open(data_file, 'r') as f:
            input_data = json.load(f)

        data = input_data['data']
        horizon_days = input_data.get('horizonDays', 30)
        item_code = input_data.get('itemCode', 'unknown')

        result = train_and_forecast(data, horizon_days, item_code)
        print(json.dumps(result))

        sys.exit(0 if result.get('success') else 1)

    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'metrics': {
                'mape': None,
                'rmse': None,
                'mae': None,
                'wallClockSec': None,
                'samples': 0
            }
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
