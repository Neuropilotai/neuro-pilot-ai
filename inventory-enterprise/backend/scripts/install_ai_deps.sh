#!/bin/bash
#
# Install AI/ML Dependencies for Apple Silicon (M3 Pro)
# Optimized for local training on macOS
#

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "🍎 AI/ML Dependencies Installation for Apple Silicon"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Detect platform
if [[ $(uname -m) != "arm64" ]]; then
  echo "⚠️  Warning: This script is optimized for Apple Silicon (ARM64)"
  echo "   Current architecture: $(uname -m)"
fi

# Check Python
echo "📍 Checking Python installation..."
if ! command -v python3 &> /dev/null; then
  echo "❌ Python3 not found. Install with: brew install python@3.11"
  exit 1
fi

PYTHON_VERSION=$(python3 --version)
echo "✅ Python installed: $PYTHON_VERSION"

# Upgrade pip
echo ""
echo "📦 Upgrading pip..."
python3 -m pip install --upgrade pip

# Install NumPy with Apple Silicon optimization
echo ""
echo "📦 Installing NumPy (with Accelerate framework support)..."
python3 -m pip install numpy

# Install Pandas
echo ""
echo "📦 Installing Pandas..."
python3 -m pip install pandas

# Install Prophet (Facebook forecasting)
echo ""
echo "📦 Installing Prophet..."
python3 -m pip install prophet

# Install statsmodels (for ARIMA)
echo ""
echo "📦 Installing statsmodels..."
python3 -m pip install statsmodels

# Install scikit-learn (for Isolation Forest, future models)
echo ""
echo "📦 Installing scikit-learn..."
python3 -m pip install scikit-learn

# Optional: Install pmdarima for auto-ARIMA
echo ""
echo "📦 Installing pmdarima (auto-ARIMA)..."
python3 -m pip install pmdarima || echo "⚠️  pmdarima installation failed (optional)"

# Verify installations
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🧪 Verifying Installations"
echo "═══════════════════════════════════════════════════════════════"

# Check NumPy and BLAS
echo ""
echo "📊 NumPy Configuration:"
python3 << 'EOF'
import numpy as np
import sys

print(f"NumPy version: {np.__version__}")
print(f"BLAS/LAPACK Info:")

# Try to detect BLAS backend
config = np.__config__.show()
EOF

# Check Pandas
echo ""
python3 -c "import pandas as pd; print(f'✅ Pandas version: {pd.__version__}')"

# Check Prophet
echo ""
python3 << 'EOF'
try:
    import prophet
    print(f"✅ Prophet installed (version: {prophet.__version__ if hasattr(prophet, '__version__') else 'unknown'})")
except ImportError:
    print("❌ Prophet not installed")
EOF

# Check statsmodels
echo ""
python3 -c "import statsmodels; print(f'✅ Statsmodels version: {statsmodels.__version__}')"

# Check scikit-learn
echo ""
python3 -c "import sklearn; print(f'✅ Scikit-learn version: {sklearn.__version__}')"

# Hardware info
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🖥️  Hardware Information"
echo "═══════════════════════════════════════════════════════════════"
sysctl -n machdep.cpu.brand_string
sysctl -n hw.perflevel0.logicalcpu 2>/dev/null && echo "Performance cores: $(sysctl -n hw.perflevel0.logicalcpu)" || true
sysctl -n hw.perflevel1.logicalcpu 2>/dev/null && echo "Efficiency cores: $(sysctl -n hw.perflevel1.logicalcpu)" || true
echo "Total memory: $(sysctl -n hw.memsize | awk '{print $1/1024/1024/1024}') GB"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Installation Complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Run database migration: sqlite3 db/inventory_enterprise.db < migrations/sqlite/011_ai_training_release_system.sql"
echo "  2. Make Python scripts executable: chmod +x src/ai/local_training/python/*.py"
echo "  3. Start server with: PORT=8083 node server.js"
echo ""
