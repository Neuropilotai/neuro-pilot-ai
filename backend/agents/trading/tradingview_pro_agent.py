import asyncio
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
import logging
import sqlite3
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import pickle
import requests
import threading
import time

class TradingViewProAgent:
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)
        self.status = "offline"
        self.is_learning = False
        
        # Paper trading account
        self.paper_balance = 100000.0  # $100K starting balance
        self.positions = {}
        self.trades_history = []
        
        # AI Learning components
        self.models = {}
        self.scalers = {}
        self.feature_importance = {}
        
        # TradingView symbols to monitor
        self.symbols = [
            "AAPL", "MSFT", "GOOGL", "TSLA", "NVDA",  # Tech stocks
            "SPY", "QQQ", "IWM",  # ETFs
        ]
        
        # Market data storage
        self.market_data = {}
        self.predictions = {}
        self.confidence_scores = {}
        
        # Learning parameters
        self.learning_interval = 300  # 5 minutes
        self.model_retrain_interval = 3600  # 1 hour
        self.prediction_horizon = [15, 60, 240]  # 15min, 1hr, 4hr
        
        # Performance tracking
        self.performance_metrics = {
            "total_return": 0.0,
            "win_rate": 0.0,
            "sharpe_ratio": 0.0,
            "max_drawdown": 0.0,
            "avg_trade_duration": 0.0,
            "predictions_accuracy": {},
            "model_performance": {},
            "learning_cycles": 0
        }
        
        # Initialize database for learning history
        self.init_database()
        
    def init_database(self):
        """Initialize SQLite database for storing learning data"""
        try:
            self.db_path = "learning_database.db"
            
            conn = sqlite3.connect(self.db_path)
            
            # Create tables for storing learning data
            conn.execute('''
                CREATE TABLE IF NOT EXISTS market_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    timestamp DATETIME,
                    open_price REAL,
                    high_price REAL,
                    low_price REAL,
                    close_price REAL,
                    volume INTEGER,
                    rsi REAL,
                    macd REAL,
                    bollinger_upper REAL,
                    bollinger_lower REAL,
                    sma_20 REAL,
                    sma_50 REAL,
                    volatility REAL
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    timestamp DATETIME,
                    horizon_minutes INTEGER,
                    predicted_direction TEXT,
                    predicted_price REAL,
                    confidence REAL,
                    actual_price REAL,
                    accuracy REAL,
                    model_version TEXT
                )
            ''')
            
            conn.execute('''
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT,
                    entry_time DATETIME,
                    exit_time DATETIME,
                    entry_price REAL,
                    exit_price REAL,
                    quantity REAL,
                    trade_type TEXT,
                    pnl REAL,
                    pnl_percentage REAL,
                    duration_minutes INTEGER,
                    strategy TEXT,
                    confidence REAL
                )
            ''')
            
            conn.commit()
            conn.close()
            
            self.logger.info(f"📊 Learning database initialized at {self.db_path}")
            
        except Exception as e:
            self.logger.error(f"Error initializing database: {e}")
    
    async def start_trading_agent(self):
        """Start the AI trading agent with learning capabilities"""
        try:
            self.status = "online"
            self.is_learning = True
            
            self.logger.info("🚀 Starting Advanced AI Trading Agent...")
            
            # Load initial data
            await self.load_market_data()
            
            # Start background tasks
            asyncio.create_task(self.ai_learning_loop())
            asyncio.create_task(self.prediction_engine())
            asyncio.create_task(self.paper_trading_executor())
            
            self.logger.info("✅ AI Trading Agent is now learning and trading!")
            
            return {"status": "success", "message": "AI Trading Agent started"}
            
        except Exception as e:
            self.logger.error(f"Error starting trading agent: {e}")
            return {"status": "error", "message": str(e)}
    
    async def load_market_data(self):
        """Load initial market data for all symbols"""
        try:
            for symbol in self.symbols:
                ticker = yf.Ticker(symbol)
                data = ticker.history(period="1mo", interval="1h")
                
                if not data.empty:
                    # Calculate technical indicators
                    data = self.calculate_technical_indicators(data)
                    self.market_data[symbol] = data
                    self.logger.info(f"📈 Loaded {len(data)} data points for {symbol}")
                
                await asyncio.sleep(1)  # Rate limiting
                
        except Exception as e:
            self.logger.error(f"Error loading market data: {e}")
    
    def calculate_technical_indicators(self, df):
        """Calculate comprehensive technical indicators"""
        try:
            # Moving averages
            df['SMA_20'] = df['Close'].rolling(window=20).mean()
            df['SMA_50'] = df['Close'].rolling(window=50).mean()
            df['EMA_12'] = df['Close'].ewm(span=12).mean()
            df['EMA_26'] = df['Close'].ewm(span=26).mean()
            
            # MACD
            df['MACD'] = df['EMA_12'] - df['EMA_26']
            df['MACD_Signal'] = df['MACD'].ewm(span=9).mean()
            
            # RSI
            delta = df['Close'].diff()
            gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss
            df['RSI'] = 100 - (100 / (1 + rs))
            
            # Bollinger Bands
            df['BB_Middle'] = df['Close'].rolling(window=20).mean()
            bb_std = df['Close'].rolling(window=20).std()
            df['BB_Upper'] = df['BB_Middle'] + (bb_std * 2)
            df['BB_Lower'] = df['BB_Middle'] - (bb_std * 2)
            df['BB_Position'] = (df['Close'] - df['BB_Lower']) / (df['BB_Upper'] - df['BB_Lower'])
            
            # Volatility
            df['Volatility'] = df['Close'].rolling(window=20).std()
            
            # Volume indicators
            df['Volume_Ratio'] = df['Volume'] / df['Volume'].rolling(window=20).mean()
            
            # Price momentum
            df['Price_Change'] = df['Close'].pct_change()
            df['Price_Change_5'] = df['Close'].pct_change(periods=5)
            
            return df
            
        except Exception as e:
            self.logger.error(f"Error calculating indicators: {e}")
            return df
    
    async def ai_learning_loop(self):
        """Main AI learning loop"""
        while self.is_learning:
            try:
                self.logger.info("🧠 Starting AI learning cycle...")
                
                for symbol in self.symbols:
                    if symbol in self.market_data:
                        await self.train_prediction_models(symbol)
                
                self.performance_metrics["learning_cycles"] += 1
                
                self.logger.info(f"✅ Learning cycle completed. Total cycles: {self.performance_metrics['learning_cycles']}")
                
                await asyncio.sleep(self.model_retrain_interval)
                
            except Exception as e:
                self.logger.error(f"Error in AI learning loop: {e}")
                await asyncio.sleep(300)
    
    async def train_prediction_models(self, symbol):
        """Train ML models for price prediction"""
        try:
            if symbol not in self.market_data or len(self.market_data[symbol]) < 100:
                return
            
            df = self.market_data[symbol].copy()
            
            # Prepare features
            features = self.prepare_features(df)
            
            if len(features) < 50:
                return
            
            # Train models for different time horizons
            for horizon in self.prediction_horizon:
                model_key = f"{symbol}_{horizon}min"
                
                # Prepare target variable
                target = self.prepare_target(df, horizon)
                
                if len(target) != len(features):
                    min_len = min(len(features), len(target))
                    features_adj = features[:min_len]
                    target_adj = target[:min_len]
                else:
                    features_adj = features
                    target_adj = target
                
                # Split data
                X_train, X_test, y_train, y_test = train_test_split(
                    features_adj, target_adj, test_size=0.2, random_state=42
                )
                
                # Scale features
                scaler = StandardScaler()
                X_train_scaled = scaler.fit_transform(X_train)
                X_test_scaled = scaler.transform(X_test)
                
                # Train Random Forest model
                model = RandomForestRegressor(n_estimators=100, random_state=42)
                model.fit(X_train_scaled, y_train)
                score = model.score(X_test_scaled, y_test)
                
                # Store model and scaler
                self.models[model_key] = model
                self.scalers[model_key] = scaler
                
                self.logger.info(f"🤖 Trained model for {model_key} with score: {score:.4f}")
                
        except Exception as e:
            self.logger.error(f"Error training models for {symbol}: {e}")
    
    def prepare_features(self, df):
        """Prepare feature matrix for ML"""
        try:
            feature_columns = [
                'RSI', 'MACD', 'MACD_Signal', 'BB_Position',
                'Volume_Ratio', 'Volatility', 'Price_Change', 'Price_Change_5'
            ]
            
            available_features = [col for col in feature_columns if col in df.columns]
            
            if not available_features:
                return []
            
            features = df[available_features].fillna(0).values
            
            return features[50:]  # Skip first 50 rows
            
        except Exception as e:
            self.logger.error(f"Error preparing features: {e}")
            return []
    
    def prepare_target(self, df, horizon_minutes):
        """Prepare target variable (future price change)"""
        try:
            # Calculate future price change
            future_price = df['Close'].shift(-horizon_minutes)
            current_price = df['Close']
            price_change = (future_price - current_price) / current_price
            
            return price_change.fillna(0).values[50:-horizon_minutes]
            
        except Exception as e:
            self.logger.error(f"Error preparing target: {e}")
            return []
    
    async def prediction_engine(self):
        """Generate predictions using trained models"""
        while self.is_learning:
            try:
                for symbol in self.symbols:
                    if symbol in self.market_data:
                        predictions = await self.generate_predictions(symbol)
                        if predictions:
                            self.predictions[symbol] = predictions
                
                await asyncio.sleep(self.learning_interval)
                
            except Exception as e:
                self.logger.error(f"Error in prediction engine: {e}")
                await asyncio.sleep(60)
    
    async def generate_predictions(self, symbol):
        """Generate price predictions for a symbol"""
        try:
            if symbol not in self.market_data:
                return None
            
            df = self.market_data[symbol]
            if len(df) < 50:
                return None
            
            features = self.prepare_features(df)
            if len(features) == 0:
                return None
            
            current_features = features[-1].reshape(1, -1)
            predictions = {}
            
            for horizon in self.prediction_horizon:
                model_key = f"{symbol}_{horizon}min"
                
                if model_key in self.models and model_key in self.scalers:
                    # Scale features
                    features_scaled = self.scalers[model_key].transform(current_features)
                    
                    # Generate prediction
                    prediction = self.models[model_key].predict(features_scaled)[0]
                    
                    # Calculate confidence
                    confidence = min(abs(prediction) * 1000, 95)  # Simple confidence metric
                    
                    predictions[f"{horizon}min"] = {
                        "price_change_prediction": prediction,
                        "direction": "UP" if prediction > 0.01 else "DOWN" if prediction < -0.01 else "NEUTRAL",
                        "confidence": confidence,
                        "timestamp": datetime.now()
                    }
            
            return predictions
            
        except Exception as e:
            self.logger.error(f"Error generating predictions for {symbol}: {e}")
            return None
    
    async def paper_trading_executor(self):
        """Execute paper trades based on predictions"""
        while self.is_learning:
            try:
                await self.evaluate_trading_opportunities()
                await self.manage_existing_positions()
                await asyncio.sleep(300)  # Check every 5 minutes
                
            except Exception as e:
                self.logger.error(f"Error in paper trading: {e}")
                await asyncio.sleep(300)
    
    async def evaluate_trading_opportunities(self):
        """Evaluate and execute trading opportunities"""
        try:
            for symbol, predictions in self.predictions.items():
                if not predictions:
                    continue
                
                if symbol not in self.market_data:
                    continue
                
                current_price = self.market_data[symbol]['Close'].iloc[-1]
                
                # Analyze predictions for trading signals
                signal = self.analyze_trading_signals(symbol, predictions, current_price)
                
                if signal and signal["action"] != "HOLD":
                    await self.execute_paper_trade(symbol, signal, current_price)
                    
        except Exception as e:
            self.logger.error(f"Error evaluating trading opportunities: {e}")
    
    def analyze_trading_signals(self, symbol, predictions, current_price):
        """Analyze predictions to generate trading signals"""
        try:
            signal_strength = 0
            confidence_sum = 0
            
            for horizon, pred in predictions.items():
                weight = {"15min": 0.3, "60min": 0.5, "240min": 0.2}.get(horizon, 0.3)
                
                if pred["direction"] == "UP":
                    signal_strength += weight * pred["confidence"]
                elif pred["direction"] == "DOWN":
                    signal_strength -= weight * pred["confidence"]
                
                confidence_sum += pred["confidence"] * weight
            
            # Determine action
            if signal_strength > 60 and confidence_sum > 70:
                return {
                    "action": "BUY",
                    "confidence": confidence_sum,
                    "signal_strength": signal_strength,
                    "reasoning": f"Strong bullish signal: {signal_strength:.1f}"
                }
            elif signal_strength < -60 and confidence_sum > 70:
                return {
                    "action": "SELL",
                    "confidence": confidence_sum,
                    "signal_strength": signal_strength,
                    "reasoning": f"Strong bearish signal: {signal_strength:.1f}"
                }
            else:
                return {
                    "action": "HOLD",
                    "confidence": confidence_sum,
                    "signal_strength": signal_strength,
                    "reasoning": "Signal not strong enough"
                }
                
        except Exception as e:
            self.logger.error(f"Error analyzing signals: {e}")
            return None
    
    async def execute_paper_trade(self, symbol, signal, current_price):
        """Execute a paper trade"""
        try:
            # Calculate position size (risk 1% of account per trade)
            risk_amount = self.paper_balance * 0.01
            position_size = risk_amount / (current_price * 0.02)  # 2% stop loss
            
            trade = {
                "symbol": symbol,
                "action": signal["action"],
                "entry_price": current_price,
                "quantity": position_size,
                "entry_time": datetime.now(),
                "confidence": signal["confidence"],
                "reasoning": signal["reasoning"],
                "stop_loss": current_price * (0.98 if signal["action"] == "BUY" else 1.02),
                "take_profit": current_price * (1.04 if signal["action"] == "BUY" else 0.96)
            }
            
            # Add to positions
            position_id = f"{symbol}_{int(trade['entry_time'].timestamp())}"
            self.positions[position_id] = trade
            
            self.logger.info(f"📊 Paper trade executed: {signal['action']} {symbol} @ ${current_price:.2f}")
            
        except Exception as e:
            self.logger.error(f"Error executing paper trade: {e}")
    
    async def manage_existing_positions(self):
        """Manage existing paper trading positions"""
        try:
            positions_to_close = []
            
            for position_id, position in self.positions.items():
                symbol = position["symbol"]
                
                if symbol not in self.market_data:
                    continue
                
                current_price = self.market_data[symbol]['Close'].iloc[-1]
                
                # Check stop loss and take profit
                should_close = False
                close_reason = ""
                
                if position["action"] == "BUY":
                    if current_price <= position["stop_loss"]:
                        should_close = True
                        close_reason = "Stop Loss"
                    elif current_price >= position["take_profit"]:
                        should_close = True
                        close_reason = "Take Profit"
                else:  # SELL
                    if current_price >= position["stop_loss"]:
                        should_close = True
                        close_reason = "Stop Loss"
                    elif current_price <= position["take_profit"]:
                        should_close = True
                        close_reason = "Take Profit"
                
                # Time-based exit (24 hours max)
                time_diff = datetime.now() - position["entry_time"]
                if time_diff.total_seconds() > 86400:  # 24 hours
                    should_close = True
                    close_reason = "Time Exit"
                
                if should_close:
                    await self.close_paper_trade(position_id, current_price, close_reason)
                    positions_to_close.append(position_id)
            
            # Remove closed positions
            for position_id in positions_to_close:
                del self.positions[position_id]
                
        except Exception as e:
            self.logger.error(f"Error managing positions: {e}")
    
    async def close_paper_trade(self, position_id, exit_price, reason):
        """Close a paper trade and calculate PnL"""
        try:
            position = self.positions[position_id]
            
            # Calculate PnL
            if position["action"] == "BUY":
                pnl = (exit_price - position["entry_price"]) * position["quantity"]
            else:  # SELL
                pnl = (position["entry_price"] - exit_price) * position["quantity"]
            
            pnl_percentage = (pnl / (position["entry_price"] * position["quantity"])) * 100
            
            # Update paper balance
            self.paper_balance += pnl
            
            # Store trade
            trade_data = {
                **position,
                "exit_price": exit_price,
                "exit_time": datetime.now(),
                "pnl": pnl,
                "pnl_percentage": pnl_percentage,
                "reason": reason
            }
            
            self.trades_history.append(trade_data)
            
            self.logger.info(f"💰 Trade closed: {position['symbol']} PnL: ${pnl:.2f} ({pnl_percentage:.2f}%) - {reason}")
            
        except Exception as e:
            self.logger.error(f"Error closing trade: {e}")
    
    def get_agent_status(self):
        """Get comprehensive agent status"""
        return {
            "status": self.status,
            "is_learning": self.is_learning,
            "paper_balance": self.paper_balance,
            "symbols_monitored": len(self.symbols),
            "active_positions": len(self.positions),
            "total_trades": len(self.trades_history),
            "learning_cycles": self.performance_metrics["learning_cycles"],
            "performance_metrics": self.performance_metrics,
            "models_trained": len(self.models),
            "last_updated": datetime.now().isoformat()
        }
    
    def get_current_predictions(self):
        """Get current predictions for all symbols"""
        return {
            "predictions": self.predictions,
            "symbols_count": len(self.predictions),
            "timestamp": datetime.now().isoformat(),
            "agent_status": self.status
        }
    
    async def stop_agent(self):
        """Stop the trading agent"""
        try:
            self.is_learning = False
            self.status = "offline"
            
            # Close all active positions
            for position_id in list(self.positions.keys()):
                symbol = self.positions[position_id]["symbol"]
                if symbol in self.market_data and not self.market_data[symbol].empty:
                    current_price = self.market_data[symbol]['Close'].iloc[-1]
                    await self.close_paper_trade(position_id, current_price, "Agent Shutdown")
            
            self.positions.clear()
            
            self.logger.info("🛑 AI Trading Agent stopped")
            return {"status": "success", "message": "Trading agent stopped successfully"}
            
        except Exception as e:
            self.logger.error(f"Error stopping agent: {e}")
            return {"status": "error", "message": str(e)}

# Main execution
async def main():
    """Main function to run the trading agent"""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    agent = TradingViewProAgent()
    
    try:
        # Start the agent
        start_result = await agent.start_trading_agent()
        print(f"Agent start result: {start_result}")
        
        if start_result["status"] == "success":
            # Run indefinitely
            while agent.is_learning:
                await asyncio.sleep(60)
                
                # Print status every 10 minutes
                if agent.performance_metrics["learning_cycles"] % 10 == 0:
                    status = agent.get_agent_status()
                    print(f"Agent Status: {status['status']}, Balance: ${status['paper_balance']:.2f}, Trades: {status['total_trades']}")
        
    except KeyboardInterrupt:
        print("\n⏹️  Shutting down AI Trading Agent...")
        await agent.stop_agent()
    except Exception as e:
        print(f"❌ Error running agent: {e}")
        await agent.stop_agent()

if __name__ == "__main__":
    asyncio.run(main())