#!/usr/bin/env python3
"""
ARIMA Forecasting for Apple Silicon
Trains ARIMA models and returns REAL measured metrics
"""

import sys
import json
import time
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings('ignore')

def train_and_forecast(data_points, horizon_days, item_code):
    """
    Train ARIMA model and return real metrics

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
        from statsmodels.tsa.arima.model import ARIMA
        from statsmodels.tsa.stattools import adfuller
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
    df = df.set_index('ds')

    # Remove NaN
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
    train_df = df.iloc[:split_idx]
    valid_df = df.iloc[split_idx:]

    # Auto-select ARIMA order (simple heuristic)
    p, d, q = 1, 1, 1  # Default ARIMA(1,1,1)

    # Check stationarity
    try:
        adf_result = adfuller(train_df['y'].dropna())
        d = 1 if adf_result[1] > 0.05 else 0
    except:
        d = 1

    # Train ARIMA model
    try:
        model = ARIMA(train_df['y'], order=(p, d, q))
        model_fit = model.fit()
    except Exception as e:
        return {
            'error': f'ARIMA training failed: {str(e)}',
            'metrics': {
                'mape': None,
                'rmse': None,
                'mae': None,
                'wallClockSec': time.time() - start_time,
                'samples': len(df)
            }
        }

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
        try:
            forecast_valid = model_fit.forecast(steps=len(valid_df))
            actual = valid_df['y'].values
            predicted = forecast_valid.values

            # MAPE
            mask = actual != 0
            if mask.sum() > 0:
                mape = np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100
                metrics['mape'] = float(mape)

            # RMSE
            rmse = np.sqrt(np.mean((actual - predicted) ** 2))
            metrics['rmse'] = float(rmse)

            # MAE
            mae = np.mean(np.abs(actual - predicted))
            metrics['mae'] = float(mae)
        except:
            pass

    # Generate future forecast
    try:
        forecast = model_fit.forecast(steps=horizon_days)

        # Create forecast DataFrame
        last_date = df.index[-1]
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=horizon_days,
            freq='D'
        )

        forecast_df = pd.DataFrame({
            'ds': future_dates,
            'yhat': forecast.values,
            'yhat_lower': forecast.values * 0.9,  # Simple 10% CI
            'yhat_upper': forecast.values * 1.1
        })

    except Exception as e:
        forecast_df = pd.DataFrame()

    # Wall-clock time
    wall_clock_sec = time.time() - start_time
    metrics['wallClockSec'] = round(wall_clock_sec, 3)

    # Serialize model parameters
    model_params = {
        'order': (p, d, q),
        'params': model_fit.params.tolist() if hasattr(model_fit, 'params') else [],
        'aic': float(model_fit.aic) if hasattr(model_fit, 'aic') else None,
        'bic': float(model_fit.bic) if hasattr(model_fit, 'bic') else None
    }

    metadata = {
        'itemCode': item_code,
        'modelType': 'arima',
        'horizonDays': horizon_days,
        'trainedAt': datetime.now().isoformat(),
        'arimaOrder': f'({p},{d},{q})',
        'aic': model_params['aic'],
        'bic': model_params['bic']
    }

    return {
        'success': True,
        'model': model_params,
        'metrics': metrics,
        'forecast': forecast_df.to_dict('records') if not forecast_df.empty else [],
        'metadata': metadata
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: arima_forecast.py <data_file.json>'}))
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
