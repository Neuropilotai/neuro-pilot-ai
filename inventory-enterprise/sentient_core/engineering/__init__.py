"""
NeuroPilot v17.5 - Engineering Mode

Autonomous self-evolving infrastructure engineering system.

Components:
- architect_agent: Evolution planning and design
- refactor_agent: Code improvement and optimization
- validator_agent: Testing and verification
- compliance_agent: Zero-trust and compliance validation
- version_manager: Semantic versioning and upgrade orchestration

Version: 17.5.0
Release: 2025-10-24
"""

__version__ = "17.5.0"
__author__ = "NeuroPilot Engineering Team"

from .version_manager import VersionManager

__all__ = ["VersionManager", "__version__"]
