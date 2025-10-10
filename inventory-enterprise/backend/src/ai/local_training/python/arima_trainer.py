#!/usr/bin/env python3
"""
ARIMA Trainer for Apple Silicon
Trains ARIMA forecasting models locally and returns real metrics
"""

import sys
import json
import warnings
from datetime import datetime

warnings.filterwarnings('ignore')

def train_arima(data_points, horizon_days, item_code):
    """
    Train ARIMA model on time series data
    Returns: dict with model, metrics, and metadata
    """
    try:
        import pandas as pd
        import numpy as np
        from statsmodels.tsa.arima.model import ARIMA
        from statsmodels.tsa.stattools import adfuller
    except ImportError as e:
        return {
            'error': f'Missing dependency: {str(e)}',
            'metrics': {'mape': None, 'rmse': None, 'mae': None},
            'model': None,
            'metadata': {'error': 'statsmodels not installed'}
        }

    # Convert to DataFrame
    df = pd.DataFrame(data_points)
    df.columns = ['ds', 'y']
    df['ds'] = pd.to_datetime(df['ds'])
    df['y'] = pd.to_numeric(df['y'])
    df = df.set_index('ds')

    # Split train/test (80/20)
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]

    # Auto-select ARIMA order (simple heuristic)
    # For production, use auto_arima from pmdarima
    p, d, q = 1, 1, 1  # Default ARIMA(1,1,1)

    try:
        # Check stationarity
        adf_result = adfuller(train_df['y'].dropna())
        if adf_result[1] > 0.05:
            d = 1  # Need differencing
        else:
            d = 0  # Already stationary
    except:
        d = 1  # Default to differencing

    # Train ARIMA model
    try:
        model = ARIMA(train_df['y'], order=(p, d, q))
        model_fit = model.fit()
    except Exception as e:
        return {
            'error': f'ARIMA training failed: {str(e)}',
            'metrics': {'mape': None, 'rmse': None, 'mae': None},
            'model': None,
            'metadata': {'error': str(e)}
        }

    # Calculate metrics on test set if available
    metrics = {'mape': None, 'rmse': None, 'mae': None}

    if len(test_df) > 0:
        try:
            forecast_test = model_fit.forecast(steps=len(test_df))
            actual = test_df['y'].values
            predicted = forecast_test.values

            # Calculate MAPE
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
        except Exception as e:
            pass  # Metrics not available

    # Generate forecast
    try:
        forecast = model_fit.forecast(steps=horizon_days)
        forecast_df = pd.DataFrame({
            'ds': pd.date_range(start=df.index[-1] + pd.Timedelta(days=1), periods=horizon_days, freq='D'),
            'yhat': forecast.values,
            'yhat_lower': forecast.values * 0.9,  # Simple confidence interval
            'yhat_upper': forecast.values * 1.1
        })
    except Exception as e:
        forecast_df = pd.DataFrame()

    # Serialize model (simplified - store parameters)
    model_params = {
        'order': (p, d, q),
        'params': model_fit.params.tolist() if hasattr(model_fit, 'params') else [],
        'aic': float(model_fit.aic) if hasattr(model_fit, 'aic') else None,
        'bic': float(model_fit.bic) if hasattr(model_fit, 'bic') else None
    }

    metadata = {
        'item_code': item_code,
        'model_type': 'arima',
        'version': '1.0.0',
        'train_samples': len(train_df),
        'test_samples': len(test_df),
        'horizon_days': horizon_days,
        'arima_order': f'({p},{d},{q})',
        'trained_at': datetime.now().isoformat()
    }

    return {
        'model': model_params,
        'metrics': metrics,
        'forecast': forecast_df.to_dict('records') if not forecast_df.empty else [],
        'metadata': metadata
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: arima_trainer.py <data_file.json>'}))
        sys.exit(1)

    data_file = sys.argv[1]

    try:
        with open(data_file, 'r') as f:
            input_data = json.load(f)

        data = input_data['data']
        horizon_days = input_data.get('horizonDays', 30)
        item_code = input_data.get('itemCode', 'unknown')

        result = train_arima(data, horizon_days, item_code)
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
