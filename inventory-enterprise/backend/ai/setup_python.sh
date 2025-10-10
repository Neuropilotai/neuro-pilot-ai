#!/bin/bash
# Setup Python Environment for AI Forecasting
# Installs Prophet, ARIMA, and other ML dependencies

set -e

echo "======================================"
echo "AI Forecasting Python Setup"
echo "======================================"
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.9+ first."
    echo ""
    echo "Installation instructions:"
    echo "  - macOS: brew install python@3.11"
    echo "  - Ubuntu/Debian: sudo apt-get install python3.11 python3-pip"
    echo "  - Windows: Download from https://www.python.org/downloads/"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 --version | awk '{print $2}')
echo "✓ Found Python $PYTHON_VERSION"

# Check if version is 3.9+
if python3 -c "import sys; exit(0 if sys.version_info >= (3,9) else 1)"; then
    echo "✓ Python version is compatible (3.9+)"
else
    echo "❌ Python 3.9 or higher is required"
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip first."
    exit 1
fi

echo "✓ Found pip $(pip3 --version)"
echo ""

# Create virtual environment (optional but recommended)
echo "Creating Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✓ Virtual environment created at ./venv"
else
    echo "✓ Virtual environment already exists"
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate || . venv/Scripts/activate 2>/dev/null

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo ""
echo "Installing AI/ML dependencies..."
echo "(This may take a few minutes...)"
echo ""

pip install -r python/requirements.txt

# Verify installations
echo ""
echo "Verifying installations..."

# Test Prophet
if python3 -c "import prophet" 2>/dev/null; then
    PROPHET_VERSION=$(python3 -c "import prophet; print(prophet.__version__)")
    echo "✓ Prophet $PROPHET_VERSION installed successfully"
else
    echo "❌ Prophet installation failed"
    exit 1
fi

# Test statsmodels (ARIMA)
if python3 -c "import statsmodels" 2>/dev/null; then
    STATSMODELS_VERSION=$(python3 -c "import statsmodels; print(statsmodels.__version__)")
    echo "✓ Statsmodels $STATSMODELS_VERSION installed successfully"
else
    echo "❌ Statsmodels installation failed"
    exit 1
fi

# Test scikit-learn
if python3 -c "import sklearn" 2>/dev/null; then
    SKLEARN_VERSION=$(python3 -c "import sklearn; print(sklearn.__version__)")
    echo "✓ Scikit-learn $SKLEARN_VERSION installed successfully"
else
    echo "❌ Scikit-learn installation failed"
    exit 1
fi

# Test pandas
if python3 -c "import pandas" 2>/dev/null; then
    PANDAS_VERSION=$(python3 -c "import pandas; print(pandas.__version__)")
    echo "✓ Pandas $PANDAS_VERSION installed successfully"
else
    echo "❌ Pandas installation failed"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ Python environment setup complete!"
echo "======================================"
echo ""
echo "Next steps:"
echo "  1. Run migrations: npm run migrate"
echo "  2. Derive consumption data: POST /api/ai/consumption/derive"
echo "  3. Train forecasting models: POST /api/ai/forecast/train"
echo ""
echo "To activate virtual environment in future sessions:"
echo "  source venv/bin/activate"
echo ""
echo "To deactivate:"
echo "  deactivate"
echo ""
