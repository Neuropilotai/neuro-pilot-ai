#!/usr/bin/env python3
"""
ARIMA Time-Series Forecasting Training Script
Fallback forecasting method when Prophet is not suitable
"""

import sys
import json
import pandas as pd
import numpy as np
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller
from datetime import datetime, timedelta
import joblib
import os
import warnings
warnings.filterwarnings('ignore')

def calculate_metrics(y_true, y_pred):
    """Calculate forecasting accuracy metrics"""
    mask = ~np.isnan(y_true) & ~np.isnan(y_pred)
    y_true = y_true[mask]
    y_pred = y_pred[mask]

    if len(y_true) == 0:
        return {
            'mape': None,
            'rmse': None,
            'mae': None,
            'r2': None
        }

    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-10))) * 100
    rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))
    mae = np.mean(np.abs(y_true - y_pred))

    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    r2 = 1 - (ss_res / (ss_tot + 1e-10))

    return {
        'mape': round(float(mape), 2),
        'rmse': round(float(rmse), 4),
        'mae': round(float(mae), 4),
        'r2': round(float(r2), 4)
    }

def check_stationarity(timeseries):
    """
    Check if time series is stationary using Augmented Dickey-Fuller test
    Returns (is_stationary, adf_statistic, p_value)
    """
    try:
        result = adfuller(timeseries.dropna(), autolag='AIC')
        adf_statistic = result[0]
        p_value = result[1]
        is_stationary = p_value < 0.05  # 5% significance level
        return is_stationary, adf_statistic, p_value
    except Exception as e:
        return False, None, None

def auto_select_order(timeseries, max_p=5, max_d=2, max_q=5):
    """
    Automatically select best ARIMA(p,d,q) order using AIC
    """
    best_aic = float('inf')
    best_order = (1, 1, 1)  # default

    # Check stationarity to estimate d
    is_stationary, _, _ = check_stationarity(timeseries)
    d_range = [0] if is_stationary else [1, 2]

    for p in range(0, max_p + 1):
        for d in d_range:
            for q in range(0, max_q + 1):
                if p == 0 and q == 0:
                    continue
                try:
                    model = ARIMA(timeseries, order=(p, d, q))
                    fitted = model.fit()
                    if fitted.aic < best_aic:
                        best_aic = fitted.aic
                        best_order = (p, d, q)
                except:
                    continue

    return best_order, best_aic

def train_arima_model(training_data, config):
    """
    Train ARIMA model on consumption data

    Args:
        training_data: List of dicts with 'date' and 'quantity' keys
        config: Dict with hyperparameters and settings

    Returns:
        Dict with model_path, metrics, and forecast data
    """
    try:
        # Parse configuration
        entity_id = config.get('entity_id', 'global')
        entity_type = config.get('entity_type', 'item')
        forecast_periods = config.get('forecast_periods', 30)
        model_dir = config.get('model_dir', './ai/models')

        # Hyperparameters
        auto_order = config.get('auto_order', True)
        p = config.get('p', 1)  # AR order
        d = config.get('d', 1)  # Differencing order
        q = config.get('q', 1)  # MA order

        # Convert training data to DataFrame
        df = pd.DataFrame(training_data)
        df['ds'] = pd.to_datetime(df['date'])
        df['y'] = df['quantity'].astype(float)
        df = df[['ds', 'y']].sort_values('ds').set_index('ds')

        # Remove outliers using IQR
        Q1 = df['y'].quantile(0.25)
        Q3 = df['y'].quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - 1.5 * IQR
        upper_bound = Q3 + 1.5 * IQR
        df_clean = df[(df['y'] >= lower_bound) & (df['y'] <= upper_bound)].copy()

        if len(df_clean) < 10:
            return {
                'success': False,
                'error': 'Insufficient data after outlier removal (min 10 records required)'
            }

        # Split into train/test (80/20)
        split_idx = int(len(df_clean) * 0.8)
        train_series = df_clean['y'].iloc[:split_idx]
        test_series = df_clean['y'].iloc[split_idx:]

        # Auto-select order if enabled
        if auto_order:
            order, aic = auto_select_order(train_series)
            p, d, q = order
        else:
            order = (p, d, q)
            aic = None

        # Check stationarity
        is_stationary, adf_stat, p_value = check_stationarity(train_series)

        # Fit ARIMA model
        model = ARIMA(train_series, order=order)
        fitted_model = model.fit()

        # Backtest on test set
        if len(test_series) > 0:
            test_predictions = fitted_model.forecast(steps=len(test_series))
            metrics = calculate_metrics(
                test_series.values,
                test_predictions.values
            )
        else:
            metrics = {'mape': None, 'rmse': None, 'mae': None, 'r2': None}

        # Generate future forecast
        forecast_values = fitted_model.forecast(steps=forecast_periods)

        # Calculate confidence intervals (approximate using standard error)
        forecast_se = fitted_model.get_forecast(steps=forecast_periods).se_mean
        z_score = 1.96  # 95% confidence

        # Generate date range for forecast
        last_date = df_clean.index[-1]
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=forecast_periods,
            freq='D'
        )

        # Extract forecast results
        forecast_results = []
        for i, date in enumerate(future_dates):
            pred_value = float(forecast_values.iloc[i])
            se = float(forecast_se.iloc[i])
            forecast_results.append({
                'date': date.strftime('%Y-%m-%d'),
                'predicted_value': round(pred_value, 4),
                'confidence_lower': round(pred_value - z_score * se, 4),
                'confidence_upper': round(pred_value + z_score * se, 4)
            })

        # Save model to disk
        os.makedirs(model_dir, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        model_filename = f'arima_{entity_type}_{entity_id}_{timestamp}.pkl'
        model_path = os.path.join(model_dir, model_filename)

        # Save both model and last training data for forecasting continuation
        model_data = {
            'model': fitted_model,
            'last_values': train_series.tail(max(p, q) + d).tolist(),
            'last_date': last_date.strftime('%Y-%m-%d'),
            'order': order
        }
        joblib.dump(model_data, model_path)

        # Return results
        return {
            'success': True,
            'model_path': model_path,
            'model_type': 'arima',
            'entity_type': entity_type,
            'entity_id': entity_id,
            'training_data_range': {
                'start_date': df_clean.index.min().strftime('%Y-%m-%d'),
                'end_date': df_clean.index.max().strftime('%Y-%m-%d'),
                'num_records': len(df_clean),
                'train_size': len(train_series),
                'test_size': len(test_series)
            },
            'accuracy_metrics': metrics,
            'hyperparameters': {
                'order': order,
                'aic': round(float(fitted_model.aic), 2) if hasattr(fitted_model, 'aic') else aic,
                'bic': round(float(fitted_model.bic), 2) if hasattr(fitted_model, 'bic') else None,
                'is_stationary': is_stationary,
                'adf_statistic': round(float(adf_stat), 4) if adf_stat else None,
                'adf_p_value': round(float(p_value), 4) if p_value else None
            },
            'forecast': forecast_results
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }

def predict_with_model(model_path, periods):
    """
    Load existing ARIMA model and generate predictions

    Args:
        model_path: Path to saved ARIMA model
        periods: Number of periods to predict

    Returns:
        Dict with forecast data
    """
    try:
        # Load model data
        model_data = joblib.load(model_path)
        fitted_model = model_data['model']
        last_date = datetime.strptime(model_data['last_date'], '%Y-%m-%d')

        # Generate predictions
        forecast_values = fitted_model.forecast(steps=periods)
        forecast_se = fitted_model.get_forecast(steps=periods).se_mean
        z_score = 1.96

        # Generate date range
        future_dates = pd.date_range(
            start=last_date + timedelta(days=1),
            periods=periods,
            freq='D'
        )

        # Extract results
        forecast_results = []
        for i, date in enumerate(future_dates):
            pred_value = float(forecast_values.iloc[i])
            se = float(forecast_se.iloc[i])
            forecast_results.append({
                'date': date.strftime('%Y-%m-%d'),
                'predicted_value': round(pred_value, 4),
                'confidence_lower': round(pred_value - z_score * se, 4),
                'confidence_upper': round(pred_value + z_score * se, 4)
            })

        return {
            'success': True,
            'forecast': forecast_results
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }

def main():
    """Main entry point - reads JSON from stdin, outputs JSON to stdout"""
    try:
        input_data = json.load(sys.stdin)
        command = input_data.get('command', 'train')

        if command == 'train':
            training_data = input_data.get('training_data', [])
            config = input_data.get('config', {})

            if len(training_data) < 10:
                result = {
                    'success': False,
                    'error': 'Insufficient training data (minimum 10 records required)'
                }
            else:
                result = train_arima_model(training_data, config)

        elif command == 'predict':
            model_path = input_data.get('model_path')
            periods = input_data.get('periods', 30)

            result = predict_with_model(model_path, periods)

        else:
            result = {
                'success': False,
                'error': f'Unknown command: {command}'
            }

        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == '__main__':
    main()
