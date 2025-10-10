#!/usr/bin/env python3
"""
Prophet Time-Series Forecasting Training Script
Reads training data from stdin, trains model, outputs forecast and metrics to stdout
"""

import sys
import json
import pandas as pd
import numpy as np
from prophet import Prophet
from datetime import datetime, timedelta
import joblib
import os

def calculate_metrics(y_true, y_pred):
    """Calculate forecasting accuracy metrics"""
    # Remove NaN values
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

    # Mean Absolute Percentage Error
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-10))) * 100

    # Root Mean Squared Error
    rmse = np.sqrt(np.mean((y_true - y_pred) ** 2))

    # Mean Absolute Error
    mae = np.mean(np.abs(y_true - y_pred))

    # R-squared
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    r2 = 1 - (ss_res / (ss_tot + 1e-10))

    return {
        'mape': round(float(mape), 2),
        'rmse': round(float(rmse), 4),
        'mae': round(float(mae), 4),
        'r2': round(float(r2), 4)
    }

def train_prophet_model(training_data, config):
    """
    Train Prophet model on consumption data

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
        forecast_periods = config.get('forecast_periods', 30)  # days ahead
        model_dir = config.get('model_dir', './ai/models')

        # Hyperparameters
        seasonality_mode = config.get('seasonality_mode', 'multiplicative')
        changepoint_prior_scale = config.get('changepoint_prior_scale', 0.05)
        seasonality_prior_scale = config.get('seasonality_prior_scale', 10.0)
        yearly_seasonality = config.get('yearly_seasonality', True)
        weekly_seasonality = config.get('weekly_seasonality', True)
        daily_seasonality = config.get('daily_seasonality', False)

        # Convert training data to DataFrame
        df = pd.DataFrame(training_data)
        df['ds'] = pd.to_datetime(df['date'])
        df['y'] = df['quantity'].astype(float)
        df = df[['ds', 'y']].sort_values('ds')

        # Remove outliers (optional, using IQR method)
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
        train_df = df_clean.iloc[:split_idx]
        test_df = df_clean.iloc[split_idx:]

        # Initialize Prophet model
        model = Prophet(
            seasonality_mode=seasonality_mode,
            changepoint_prior_scale=changepoint_prior_scale,
            seasonality_prior_scale=seasonality_prior_scale,
            yearly_seasonality=yearly_seasonality,
            weekly_seasonality=weekly_seasonality,
            daily_seasonality=daily_seasonality,
            interval_width=0.95
        )

        # Add custom seasonalities if data is sufficient
        if len(train_df) > 365:
            model.add_seasonality(name='monthly', period=30.5, fourier_order=5)

        # Fit model
        model.fit(train_df)

        # Backtest on test set
        if len(test_df) > 0:
            test_forecast = model.predict(test_df[['ds']])
            metrics = calculate_metrics(
                test_df['y'].values,
                test_forecast['yhat'].values
            )
        else:
            metrics = {'mape': None, 'rmse': None, 'mae': None, 'r2': None}

        # Generate future forecast
        future = model.make_future_dataframe(periods=forecast_periods, freq='D')
        forecast = model.predict(future)

        # Extract forecast results
        forecast_results = []
        for _, row in forecast.tail(forecast_periods).iterrows():
            forecast_results.append({
                'date': row['ds'].strftime('%Y-%m-%d'),
                'predicted_value': round(float(row['yhat']), 4),
                'confidence_lower': round(float(row['yhat_lower']), 4),
                'confidence_upper': round(float(row['yhat_upper']), 4),
                'trend': round(float(row['trend']), 4),
                'weekly_effect': round(float(row.get('weekly', 0)), 4),
                'yearly_effect': round(float(row.get('yearly', 0)), 4)
            })

        # Save model to disk
        os.makedirs(model_dir, exist_ok=True)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        model_filename = f'prophet_{entity_type}_{entity_id}_{timestamp}.pkl'
        model_path = os.path.join(model_dir, model_filename)
        joblib.dump(model, model_path)

        # Return results
        return {
            'success': True,
            'model_path': model_path,
            'model_type': 'prophet',
            'entity_type': entity_type,
            'entity_id': entity_id,
            'training_data_range': {
                'start_date': df_clean['ds'].min().strftime('%Y-%m-%d'),
                'end_date': df_clean['ds'].max().strftime('%Y-%m-%d'),
                'num_records': len(df_clean),
                'train_size': len(train_df),
                'test_size': len(test_df)
            },
            'accuracy_metrics': metrics,
            'hyperparameters': {
                'seasonality_mode': seasonality_mode,
                'changepoint_prior_scale': changepoint_prior_scale,
                'seasonality_prior_scale': seasonality_prior_scale,
                'yearly_seasonality': yearly_seasonality,
                'weekly_seasonality': weekly_seasonality,
                'daily_seasonality': daily_seasonality
            },
            'forecast': forecast_results
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'error_type': type(e).__name__
        }

def predict_with_model(model_path, start_date, periods):
    """
    Load existing model and generate predictions

    Args:
        model_path: Path to saved Prophet model
        start_date: Start date for predictions
        periods: Number of periods to predict

    Returns:
        Dict with forecast data
    """
    try:
        # Load model
        model = joblib.load(model_path)

        # Create future dataframe
        future_dates = pd.date_range(start=start_date, periods=periods, freq='D')
        future_df = pd.DataFrame({'ds': future_dates})

        # Generate predictions
        forecast = model.predict(future_df)

        # Extract results
        forecast_results = []
        for _, row in forecast.iterrows():
            forecast_results.append({
                'date': row['ds'].strftime('%Y-%m-%d'),
                'predicted_value': round(float(row['yhat']), 4),
                'confidence_lower': round(float(row['yhat_lower']), 4),
                'confidence_upper': round(float(row['yhat_upper']), 4)
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
        # Read input from stdin
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
                result = train_prophet_model(training_data, config)

        elif command == 'predict':
            model_path = input_data.get('model_path')
            start_date = input_data.get('start_date', datetime.now().strftime('%Y-%m-%d'))
            periods = input_data.get('periods', 30)

            result = predict_with_model(model_path, start_date, periods)

        else:
            result = {
                'success': False,
                'error': f'Unknown command: {command}'
            }

        # Output result as JSON
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
