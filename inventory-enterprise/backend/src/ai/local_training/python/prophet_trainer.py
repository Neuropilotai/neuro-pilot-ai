#!/usr/bin/env python3
"""
Prophet Trainer for Apple Silicon
Trains Prophet forecasting models locally and returns real metrics
"""

import sys
import json
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings('ignore')

def train_prophet(data_points, horizon_days, item_code):
    """
    Train Prophet model on time series data
    Returns: dict with model, metrics, and metadata
    """
    try:
        import pandas as pd
        import numpy as np
        from prophet import Prophet
        from prophet.serialize import model_to_json
    except ImportError as e:
        return {
            'error': f'Missing dependency: {str(e)}',
            'metrics': {'mape': None, 'rmse': None, 'mae': None},
            'model': None,
            'metadata': {'error': 'Prophet not installed'}
        }

    # Convert to DataFrame
    df = pd.DataFrame(data_points)
    df.columns = ['ds', 'y']
    df['ds'] = pd.to_datetime(df['ds'])
    df['y'] = pd.to_numeric(df['y'])

    # Split train/test (80/20)
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]

    # Train Prophet model
    model = Prophet(
        daily_seasonality=False,
        weekly_seasonality=True,
        yearly_seasonality=True if len(df) > 365 else False,
        changepoint_prior_scale=0.05,
        seasonality_prior_scale=10.0
    )

    model.fit(train_df)

    # Calculate metrics on test set if available
    metrics = {'mape': None, 'rmse': None, 'mae': None}

    if len(test_df) > 0:
        forecast_test = model.predict(test_df[['ds']])
        actual = test_df['y'].values
        predicted = forecast_test['yhat'].values

        # Calculate MAPE (Mean Absolute Percentage Error)
        mask = actual != 0
        if mask.sum() > 0:
            mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100
            metrics['mape'] = float(mape)

        # Calculate RMSE
        rmse = np.sqrt(np.mean((actual - predicted) ** 2))
        metrics['rmse'] = float(rmse)

        # Calculate MAE
        mae = np.mean(np.abs(actual - predicted))
        metrics['mae'] = float(mae)

    # Generate forecast
    future = model.make_future_dataframe(periods=horizon_days)
    forecast = model.predict(future)

    # Serialize model
    model_json = model_to_json(model)

    metadata = {
        'item_code': item_code,
        'model_type': 'prophet',
        'version': '1.0.0',
        'train_samples': len(train_df),
        'test_samples': len(test_df),
        'horizon_days': horizon_days,
        'trained_at': datetime.now().isoformat(),
        'prophet_version': Prophet.__version__ if hasattr(Prophet, '__version__') else 'unknown'
    }

    return {
        'model': model_json,
        'metrics': metrics,
        'forecast': forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(horizon_days).to_dict('records'),
        'metadata': metadata
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: prophet_trainer.py <data_file.json>'}))
        sys.exit(1)

    data_file = sys.argv[1]

    try:
        with open(data_file, 'r') as f:
            input_data = json.load(f)

        data = input_data['data']
        horizon_days = input_data.get('horizonDays', 30)
        item_code = input_data.get('itemCode', 'unknown')

        result = train_prophet(data, horizon_days, item_code)
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'metrics': {'mape': None, 'rmse': None, 'mae': None},
            'model': None,
            'metadata': {'error': str(e)}
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
