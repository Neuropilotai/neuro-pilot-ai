"""
NeuroPilot v17.6 - Genesis Mode

Autonomous agent creation and meta-learning system.

Components:
- genesis_engine: Creates new agents autonomously
- evolution_controller: RL + GA optimization
- memory_core: Persistent learning storage
- guardian_agent: Safety and anti-loop enforcement

Version: 17.6.0
Release: 2025-10-24
"""

__version__ = "17.6.0"
__author__ = "NeuroPilot Genesis Team"

from .genesis_engine import GenesisEngine, AgentDesign, GenesisReport

__all__ = ["GenesisEngine", "AgentDesign", "GenesisReport", "__version__"]
