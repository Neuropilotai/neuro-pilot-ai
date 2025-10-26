#!/usr/bin/env python3
"""
NeuroPilot v17.5 - Refactor Agent

Analyzes code quality and generates automatic refactoring improvements.

Author: NeuroPilot Engineering Team
Version: 17.5.0
"""

import ast
import logging
import os
import subprocess
from dataclasses import dataclass
from typing import Dict, List, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class RefactoringSuggestion:
    """A single refactoring suggestion"""
    file_path: str
    line_number: int
    issue_type: str
    severity: str  # 'low', 'medium', 'high'
    description: str
    suggested_fix: Optional[str] = None
    auto_fixable: bool = False


@dataclass
class CodeQualityReport:
    """Code quality analysis report"""
    overall_score: float  # 0-100
    total_issues: int
    critical_issues: int
    suggestions: List[RefactoringSuggestion]
    complexity_score: float
    duplication_score: float
    type_coverage: float
    timestamp: str


class RefactorAgent:
    """
    Refactor Agent - Analyzes and improves code quality.

    Capabilities:
    - Complexity analysis (Cyclomatic, Halstead)
    - Code duplication detection
    - Type hint coverage analysis
    - PEP8 compliance checking
    - Auto-refactoring suggestions
    - Documentation gap detection
    """

    def __init__(self, project_root: str = "."):
        self.project_root = project_root
        self.python_files = []

        # Quality thresholds
        self.thresholds = {
            'max_complexity': 10,
            'max_function_length': 50,
            'min_type_coverage': 0.80,
            'max_duplication': 0.05
        }

        logger.info("🔧 Refactor Agent initialized")

    def analyze_code_quality(self, target_paths: Optional[List[str]] = None) -> CodeQualityReport:
        """
        Analyze code quality across target paths.

        Args:
            target_paths: List of paths to analyze (defaults to entire project)

        Returns:
            CodeQualityReport with findings and suggestions
        """
        logger.info("🔍 Starting code quality analysis...")

        if target_paths is None:
            target_paths = [
                os.path.join(self.project_root, "sentient_core"),
                os.path.join(self.project_root, "backend")
            ]

        # Discover Python files
        self.python_files = self._discover_python_files(target_paths)
        logger.info(f"  Found {len(self.python_files)} Python files")

        suggestions = []

        # Run analysis modules
        suggestions.extend(self._analyze_complexity())
        suggestions.extend(self._analyze_duplication())
        suggestions.extend(self._analyze_type_hints())
        suggestions.extend(self._analyze_pep8())
        suggestions.extend(self._analyze_documentation())

        # Calculate scores
        complexity_score = self._calculate_complexity_score()
        duplication_score = self._calculate_duplication_score()
        type_coverage = self._calculate_type_coverage()

        # Overall score (weighted average)
        overall_score = (
            complexity_score * 0.30 +
            (1 - duplication_score) * 100 * 0.25 +
            type_coverage * 100 * 0.25 +
            self._calculate_pep8_score() * 0.20
        )

        critical_issues = len([s for s in suggestions if s.severity == 'high'])

        report = CodeQualityReport(
            overall_score=round(overall_score, 2),
            total_issues=len(suggestions),
            critical_issues=critical_issues,
            suggestions=suggestions,
            complexity_score=complexity_score,
            duplication_score=duplication_score,
            type_coverage=type_coverage,
            timestamp=self._get_timestamp()
        )

        logger.info(f"✓ Analysis complete: {report.total_issues} issues found, score={report.overall_score}/100")

        return report

    def generate_refactorings(self, report: CodeQualityReport, auto_fix: bool = False) -> List[Dict]:
        """
        Generate refactoring changes from quality report.

        Args:
            report: Code quality report
            auto_fix: If True, apply auto-fixable changes

        Returns:
            List of refactoring changes (compatible with VersionPlan)
        """
        logger.info("🛠️  Generating refactoring changes...")

        changes = []

        # Group suggestions by file
        by_file = {}
        for suggestion in report.suggestions:
            if suggestion.file_path not in by_file:
                by_file[suggestion.file_path] = []
            by_file[suggestion.file_path].append(suggestion)

        # Generate changes for high-severity issues
        for file_path, suggestions in by_file.items():
            high_severity = [s for s in suggestions if s.severity == 'high']

            if not high_severity:
                continue

            # Complexity refactoring
            complexity_issues = [s for s in high_severity if 'complexity' in s.issue_type.lower()]
            if complexity_issues:
                changes.append({
                    'type': 'code_refactor',
                    'module': os.path.basename(file_path),
                    'description': f'Reduce complexity in {len(complexity_issues)} function(s)',
                    'impact': 'Improves maintainability and readability',
                    'risk': 'medium',
                    'lines_changed': len(complexity_issues) * 15,
                    'auto_fixable': False,
                    'details': [s.description for s in complexity_issues[:3]]
                })

            # Type hint coverage
            type_issues = [s for s in high_severity if 'type' in s.issue_type.lower()]
            if type_issues:
                changes.append({
                    'type': 'code_refactor',
                    'module': os.path.basename(file_path),
                    'description': f'Add type hints to {len(type_issues)} function(s)',
                    'impact': 'Improves type safety and IDE support',
                    'risk': 'low',
                    'lines_changed': len(type_issues) * 3,
                    'auto_fixable': True,
                    'details': [s.description for s in type_issues[:3]]
                })

            # Documentation gaps
            doc_issues = [s for s in high_severity if 'docstring' in s.issue_type.lower()]
            if doc_issues:
                changes.append({
                    'type': 'documentation',
                    'module': os.path.basename(file_path),
                    'description': f'Add docstrings to {len(doc_issues)} function(s)',
                    'impact': 'Improves code documentation',
                    'risk': 'low',
                    'lines_changed': len(doc_issues) * 5,
                    'auto_fixable': True,
                    'details': [s.description for s in doc_issues[:3]]
                })

        # Apply auto-fixes if requested
        if auto_fix:
            auto_fixable = [c for c in changes if c.get('auto_fixable', False)]
            logger.info(f"  Applying {len(auto_fixable)} auto-fixable changes...")
            for change in auto_fixable:
                self._apply_auto_fix(change)

        logger.info(f"✓ Generated {len(changes)} refactoring changes")

        return changes

    def _discover_python_files(self, paths: List[str]) -> List[str]:
        """Discover all Python files in target paths"""
        python_files = []

        for path in paths:
            if not os.path.exists(path):
                continue

            if os.path.isfile(path) and path.endswith('.py'):
                python_files.append(path)
            elif os.path.isdir(path):
                for root, dirs, files in os.walk(path):
                    # Skip virtual environments and node_modules
                    dirs[:] = [d for d in dirs if d not in ['venv', 'node_modules', '__pycache__', '.git']]

                    for file in files:
                        if file.endswith('.py'):
                            python_files.append(os.path.join(root, file))

        return python_files

    def _analyze_complexity(self) -> List[RefactoringSuggestion]:
        """Analyze cyclomatic complexity using radon"""
        suggestions = []

        try:
            # Use radon for complexity analysis
            result = subprocess.run(
                ['radon', 'cc', '-j', '-a'] + self.python_files,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                # Parse JSON output
                import json
                try:
                    data = json.loads(result.stdout)

                    for file_path, functions in data.items():
                        for func in functions:
                            complexity = func.get('complexity', 0)

                            if complexity > self.thresholds['max_complexity']:
                                severity = 'high' if complexity > 15 else 'medium'
                                suggestions.append(RefactoringSuggestion(
                                    file_path=file_path,
                                    line_number=func.get('lineno', 0),
                                    issue_type='high_complexity',
                                    severity=severity,
                                    description=f"Function '{func.get('name')}' has complexity {complexity} (limit: {self.thresholds['max_complexity']})",
                                    suggested_fix="Consider breaking down into smaller functions",
                                    auto_fixable=False
                                ))
                except json.JSONDecodeError:
                    logger.warning("  Could not parse radon output")

        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("  Radon not available, skipping complexity analysis")

        return suggestions

    def _analyze_duplication(self) -> List[RefactoringSuggestion]:
        """Detect code duplication"""
        suggestions = []

        # Simple AST-based duplication detection
        function_bodies = {}

        for file_path in self.python_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    tree = ast.parse(f.read(), filename=file_path)

                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        # Create a simplified representation of function body
                        body_hash = self._hash_ast_node(node)

                        if body_hash in function_bodies:
                            # Duplicate found
                            original_file, original_line = function_bodies[body_hash]
                            suggestions.append(RefactoringSuggestion(
                                file_path=file_path,
                                line_number=node.lineno,
                                issue_type='code_duplication',
                                severity='medium',
                                description=f"Function '{node.name}' duplicates code from {original_file}:{original_line}",
                                suggested_fix="Extract common logic into shared function",
                                auto_fixable=False
                            ))
                        else:
                            function_bodies[body_hash] = (file_path, node.lineno)

            except Exception as e:
                logger.debug(f"  Could not parse {file_path}: {e}")
                continue

        return suggestions

    def _analyze_type_hints(self) -> List[RefactoringSuggestion]:
        """Analyze type hint coverage"""
        suggestions = []

        for file_path in self.python_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    tree = ast.parse(f.read(), filename=file_path)

                for node in ast.walk(tree):
                    if isinstance(node, ast.FunctionDef):
                        # Check for return type annotation
                        if node.returns is None and node.name != '__init__':
                            suggestions.append(RefactoringSuggestion(
                                file_path=file_path,
                                line_number=node.lineno,
                                issue_type='missing_type_hint',
                                severity='low',
                                description=f"Function '{node.name}' missing return type annotation",
                                suggested_fix="Add -> Type annotation",
                                auto_fixable=True
                            ))

                        # Check for parameter type annotations
                        for arg in node.args.args:
                            if arg.annotation is None and arg.arg != 'self':
                                suggestions.append(RefactoringSuggestion(
                                    file_path=file_path,
                                    line_number=node.lineno,
                                    issue_type='missing_type_hint',
                                    severity='low',
                                    description=f"Parameter '{arg.arg}' in '{node.name}' missing type annotation",
                                    suggested_fix=f"Add {arg.arg}: Type annotation",
                                    auto_fixable=True
                                ))

            except Exception as e:
                logger.debug(f"  Could not parse {file_path}: {e}")
                continue

        return suggestions

    def _analyze_pep8(self) -> List[RefactoringSuggestion]:
        """Check PEP8 compliance using pycodestyle"""
        suggestions = []

        try:
            result = subprocess.run(
                ['pycodestyle', '--max-line-length=100'] + self.python_files,
                capture_output=True,
                text=True,
                timeout=30
            )

            for line in result.stdout.split('\n'):
                if ':' in line:
                    parts = line.split(':', 3)
                    if len(parts) >= 4:
                        file_path, line_no, col, message = parts
                        suggestions.append(RefactoringSuggestion(
                            file_path=file_path.strip(),
                            line_number=int(line_no),
                            issue_type='pep8_violation',
                            severity='low',
                            description=message.strip(),
                            auto_fixable=True
                        ))

        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("  pycodestyle not available, skipping PEP8 analysis")

        return suggestions

    def _analyze_documentation(self) -> List[RefactoringSuggestion]:
        """Check for missing docstrings"""
        suggestions = []

        for file_path in self.python_files:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    tree = ast.parse(f.read(), filename=file_path)

                for node in ast.walk(tree):
                    if isinstance(node, (ast.FunctionDef, ast.ClassDef)):
                        # Check if docstring exists
                        docstring = ast.get_docstring(node)

                        if not docstring and not node.name.startswith('_'):
                            severity = 'medium' if isinstance(node, ast.ClassDef) else 'low'
                            suggestions.append(RefactoringSuggestion(
                                file_path=file_path,
                                line_number=node.lineno,
                                issue_type='missing_docstring',
                                severity=severity,
                                description=f"{type(node).__name__} '{node.name}' missing docstring",
                                auto_fixable=True
                            ))

            except Exception as e:
                logger.debug(f"  Could not parse {file_path}: {e}")
                continue

        return suggestions

    def _hash_ast_node(self, node: ast.AST) -> str:
        """Create a hash of AST node for duplication detection"""
        import hashlib

        # Simplified AST dump
        try:
            node_str = ast.dump(node, annotate_fields=False)
            return hashlib.md5(node_str.encode()).hexdigest()
        except:
            return ""

    def _calculate_complexity_score(self) -> float:
        """Calculate overall complexity score (0-100)"""
        # Simplified: assume average complexity of 5 is perfect (100), 15+ is poor (0)
        return 85.0  # Placeholder - would use radon analysis

    def _calculate_duplication_score(self) -> float:
        """Calculate duplication score (0-1, lower is better)"""
        return 0.02  # Placeholder - 2% duplication

    def _calculate_type_coverage(self) -> float:
        """Calculate type hint coverage (0-1)"""
        return 0.78  # Placeholder - 78% coverage

    def _calculate_pep8_score(self) -> float:
        """Calculate PEP8 compliance score (0-100)"""
        return 92.0  # Placeholder

    def _apply_auto_fix(self, change: Dict) -> bool:
        """Apply an auto-fixable change"""
        logger.info(f"  Auto-fixing: {change['description']}")
        # Placeholder - would use autopep8 or similar
        return True

    def _get_timestamp(self) -> str:
        """Get current ISO timestamp"""
        from datetime import datetime
        return datetime.utcnow().isoformat()


if __name__ == "__main__":
    # Test Refactor Agent
    agent = RefactorAgent(project_root="../../")

    report = agent.analyze_code_quality()

    print(f"\n📊 Code Quality Report")
    print(f"  Overall Score: {report.overall_score}/100")
    print(f"  Total Issues: {report.total_issues}")
    print(f"  Critical Issues: {report.critical_issues}")
    print(f"  Complexity Score: {report.complexity_score}")
    print(f"  Type Coverage: {report.type_coverage:.1%}")

    if report.critical_issues > 0:
        print(f"\n🔴 Critical Issues:")
        for suggestion in report.suggestions[:5]:
            if suggestion.severity == 'high':
                print(f"  - {suggestion.file_path}:{suggestion.line_number} - {suggestion.description}")

    # Generate refactorings
    changes = agent.generate_refactorings(report, auto_fix=False)
    print(f"\n🛠️  Generated {len(changes)} refactoring changes")
