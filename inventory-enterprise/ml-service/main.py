"""
NeuroNexus ML Service - FastAPI
Minimal autonomous forecast & training endpoints
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, date, timedelta
import numpy as np
import pandas as pd
import sqlite3
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NeuroNexus ML Service", version="1.0.0")

# === Configuration ===
DB_PATH = "../backend/database.db"

# === Models ===
class TrainRequest(BaseModel):
    backfill_days: int = Field(365, description="Days of history to use for training")
    force: bool = Field(False, description="Force retrain even if MAPE is acceptable")

class InferRequest(BaseModel):
    mode: str = Field("daily", description="Inference mode: daily or batch")
    item_ids: Optional[List[int]] = Field(None, description="Specific items to forecast")

class StatusResponse(BaseModel):
    status: str
    version: str
    uptime_seconds: int

# === Database Helper ===
def get_db_connection():
    """Get SQLite database connection"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# === Baseline Forecasting (Seasonal Naive) ===
def forecast_seasonal_naive(history: pd.DataFrame, horizon_days: int = 28) -> Dict:
    """
    Simple seasonal naive forecast: average of last 4 weeks
    """
    if len(history) < 28:
        # Insufficient data: use overall mean
        mean_forecast = history['qty_used'].mean()
        std_forecast = history['qty_used'].std()
    else:
        # Use last 4 weeks (28 days)
        recent = history.tail(28)
        mean_forecast = recent['qty_used'].mean()
        std_forecast = recent['qty_used'].std()

    # Project for horizon
    total_forecast = mean_forecast * horizon_days

    # 90% prediction interval (±1.65 std)
    p05 = max(0, total_forecast - 1.65 * std_forecast * np.sqrt(horizon_days))
    p95 = total_forecast + 1.65 * std_forecast * np.sqrt(horizon_days)

    return {
        'mean_forecast': float(total_forecast),
        'p05_forecast': float(p05),
        'p95_forecast': float(p95),
        'model_version': 'seasonal_naive_v1.0'
    }

# === Endpoints ===

@app.get("/status", response_model=StatusResponse)
async def status():
    """Health check endpoint"""
    return StatusResponse(
        status="healthy",
        version="1.0.0",
        uptime_seconds=int((datetime.now() - app.state.start_time).total_seconds())
    )

@app.post("/train/infer-latest")
async def infer_latest(request: InferRequest):
    """
    Generate forecasts for all items (or specified items)
    Called by scheduler daily at 02:00 UTC
    """
    logger.info(f"Starting inference in {request.mode} mode")

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Get active items
        if request.item_ids:
            items_query = f"SELECT id, name, sku FROM inventory_items WHERE id IN ({','.join(map(str, request.item_ids))})"
        else:
            items_query = "SELECT id, name, sku FROM inventory_items WHERE is_active = 1 LIMIT 100"

        items = pd.read_sql_query(items_query, conn)

        results = []
        for _, item in items.iterrows():
            item_id = item['id']

            # Get usage history (last 90 days)
            history_query = """
                SELECT usage_date, qty_used
                FROM usage_history
                WHERE item_id = ?
                ORDER BY usage_date DESC
                LIMIT 90
            """
            history = pd.read_sql_query(history_query, conn, params=[item_id])

            if len(history) < 7:
                logger.warning(f"Insufficient history for item {item_id}: {len(history)} days")
                continue

            # Generate forecast (28-day horizon)
            forecast = forecast_seasonal_naive(history, horizon_days=28)

            # Calculate MAPE if we have recent actuals
            mape = calculate_mape(conn, item_id)

            # Store forecast
            forecast_date = date.today()
            cur.execute("""
                INSERT INTO forecasts (item_id, forecast_date, horizon, mean_forecast, p05_forecast, p95_forecast, mape, model_version)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item_id,
                forecast_date.isoformat(),
                28,
                forecast['mean_forecast'],
                forecast['p05_forecast'],
                forecast['p95_forecast'],
                mape,
                forecast['model_version']
            ))

            results.append({
                'item_id': item_id,
                'sku': item['sku'],
                'mean_forecast': forecast['mean_forecast'],
                'mape': mape
            })

        conn.commit()
        logger.info(f"Generated {len(results)} forecasts")

        return {
            "success": True,
            "count": len(results),
            "sample": results[:5],
            "avg_mape": np.mean([r['mape'] for r in results if r['mape'] is not None])
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"Inference failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/train/full")
async def train_full(request: TrainRequest):
    """
    Full retraining pipeline (weekly on Sunday 03:00 UTC)
    For MVP, this just updates model metadata
    """
    logger.info(f"Starting full retraining with {request.backfill_days} days of history")

    conn = get_db_connection()
    cur = conn.cursor()

    try:
        # Get all items with sufficient history
        items_query = f"""
            SELECT i.id, i.name, COUNT(uh.id) as history_count
            FROM inventory_items i
            INNER JOIN usage_history uh ON i.id = uh.item_id
            WHERE uh.usage_date > date('now', '-{request.backfill_days} days')
            GROUP BY i.id, i.name
            HAVING history_count >= 28
        """
        items = pd.read_sql_query(items_query, conn)

        retrained_count = 0
        for _, item in items.iterrows():
            item_id = item['id']

            # Check if retraining is needed
            if not request.force:
                current_mape = calculate_mape(conn, item_id)
                if current_mape is not None and current_mape < 30:
                    logger.info(f"Item {item_id} MAPE ({current_mape:.2f}%) acceptable, skipping")
                    continue

            # Train new model (for MVP, just update model_version timestamp)
            # In production, this would train ETS/Prophet/LightGBM
            new_version = f"retrain_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

            # Update model version in latest forecast
            cur.execute("""
                UPDATE forecasts
                SET model_version = ?
                WHERE item_id = ? AND forecast_date = date('now')
            """, (new_version, item_id))

            retrained_count += 1

        conn.commit()
        logger.info(f"Retrained {retrained_count} models")

        return {
            "success": True,
            "models_updated": retrained_count,
            "total_items": len(items)
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"Retraining failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

def calculate_mape(conn, item_id: int) -> Optional[float]:
    """
    Calculate MAPE from recent forecast errors
    """
    cur = conn.cursor()
    result = cur.execute("""
        SELECT AVG(abs_pct_err) as mape
        FROM forecast_errors
        WHERE item_id = ?
          AND error_date > date('now', '-30 days')
    """, (item_id,)).fetchone()

    return result['mape'] if result and result['mape'] else None

# === Startup Event ===
@app.on_event("startup")
async def startup_event():
    app.state.start_time = datetime.now()
    logger.info("NeuroNexus ML Service started")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
