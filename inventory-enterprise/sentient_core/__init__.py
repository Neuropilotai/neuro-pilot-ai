"""
NeuroPilot v17.4 - Sentient Cloud Mode

Autonomous predictive optimization and self-healing infrastructure.

Components:
- master_controller: Orchestration engine
- predictive.forecast_engine: LSTM + Prophet + GBDT predictions
- agents.remediator: Autonomous remediation with playbooks
- scripts.self_audit: Compliance scanning and governance

Version: 17.4.0
Release: 2025-10-23
"""

__version__ = "17.4.0"
__author__ = "NeuroPilot AI Ops Team"

from .master_controller import MasterController

__all__ = ["MasterController", "__version__"]
