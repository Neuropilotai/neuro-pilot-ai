#!/usr/bin/env python3
"""
File Organization and Cleanup Agent for Neuro-Pilot-AI
This agent helps organize, categorize, and clean up unnecessary files in the project.
"""

import os
import shutil
import json
import logging
import argparse
import datetime
import hashlib
from pathlib import Path
from typing import Dict, List, Set, Tuple
from collections import defaultdict
import time

class FileOrganizationAgent:
    def __init__(self, base_path: str, dry_run: bool = True, verbose: bool = False):
        self.base_path = Path(base_path)
        self.dry_run = dry_run
        self.verbose = verbose
        self.action_log = []
        self.stats = defaultdict(int)
        
        # Setup logging
        log_dir = self.base_path / "logs" / "file_organization"
        log_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = log_dir / f"file_organization_{timestamp}.log"
        
        logging.basicConfig(
            level=logging.DEBUG if verbose else logging.INFO,
            format='%(asctime)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(__name__)
        
        # Define cleanup patterns
        self.cleanup_patterns = {
            'temporary_files': [
                '*.tmp', '*.temp', '*.bak', '*.swp', '*.swo', '~*',
                '.DS_Store', 'Thumbs.db', 'desktop.ini'
            ],
            'python_cache': [
                '__pycache__', '*.pyc', '*.pyo', '*.pyd', '.pytest_cache',
                '*.egg-info', '.eggs', '*.egg'
            ],
            'node_modules': ['node_modules'],
            'build_artifacts': [
                'dist', 'build', '*.dll', '*.so', '*.dylib', '.cache'
            ],
            'logs': ['*.log'],
            'ide_files': [
                '.vscode', '.idea', '*.iml', '.project', '.classpath'
            ]
        }
        
        # Define file categories for organization
        self.file_categories = {
            'documents': ['.md', '.txt', '.doc', '.docx', '.pdf'],
            'data': ['.json', '.csv', '.xml', '.yaml', '.yml'],
            'images': ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'],
            'scripts': ['.js', '.py', '.sh', '.bat', '.ps1'],
            'web': ['.html', '.css', '.scss'],
            'config': ['.env', '.gitignore', 'Dockerfile', '.json', '.yml', '.yaml'],
            'archives': ['.zip', '.tar', '.gz', '.rar', '.7z']
        }
        
        # Directories to skip
        self.skip_dirs = {
            '.git', '.svn', '.hg', 'venv', 'env', '.env',
            'virtual_env', 'virtualenv', '.terraform'
        }
        
    def run(self):
        """Main execution method"""
        self.logger.info(f"Starting file organization agent in {'DRY RUN' if self.dry_run else 'LIVE'} mode")
        self.logger.info(f"Base path: {self.base_path}")
        
        # Phase 1: Analyze the directory structure
        self.logger.info("Phase 1: Analyzing directory structure...")
        analysis = self.analyze_directory_structure()
        
        # Phase 2: Identify unnecessary files
        self.logger.info("Phase 2: Identifying unnecessary files...")
        unnecessary_files = self.identify_unnecessary_files()
        
        # Phase 3: Find duplicate files
        self.logger.info("Phase 3: Finding duplicate files...")
        duplicates = self.find_duplicate_files()
        
        # Phase 4: Categorize files
        self.logger.info("Phase 4: Categorizing files...")
        categorized_files = self.categorize_files()
        
        # Phase 5: Generate recommendations
        self.logger.info("Phase 5: Generating recommendations...")
        recommendations = self.generate_recommendations(
            analysis, unnecessary_files, duplicates, categorized_files
        )
        
        # Phase 6: Execute cleanup (if not dry run)
        if not self.dry_run:
            self.logger.info("Phase 6: Executing cleanup...")
            if self.confirm_actions(recommendations):
                self.execute_cleanup(recommendations)
        else:
            self.logger.info("Phase 6: Skipping cleanup (dry run mode)")
            
        # Phase 7: Generate report
        self.logger.info("Phase 7: Generating report...")
        self.generate_report(recommendations)
        
    def analyze_directory_structure(self) -> Dict:
        """Analyze the directory structure and gather statistics"""
        analysis = {
            'total_files': 0,
            'total_directories': 0,
            'total_size': 0,
            'file_types': defaultdict(int),
            'largest_files': [],
            'largest_directories': []
        }
        
        for root, dirs, files in os.walk(self.base_path):
            # Skip certain directories
            dirs[:] = [d for d in dirs if d not in self.skip_dirs]
            
            analysis['total_directories'] += len(dirs)
            
            for file in files:
                file_path = Path(root) / file
                try:
                    file_size = file_path.stat().st_size
                    analysis['total_files'] += 1
                    analysis['total_size'] += file_size
                    
                    # Track file types
                    ext = file_path.suffix.lower()
                    analysis['file_types'][ext] += 1
                    
                    # Track largest files
                    analysis['largest_files'].append((file_path, file_size))
                    
                except Exception as e:
                    self.logger.debug(f"Error analyzing {file_path}: {e}")
                    
        # Sort and keep only top 20 largest files
        analysis['largest_files'].sort(key=lambda x: x[1], reverse=True)
        analysis['largest_files'] = analysis['largest_files'][:20]
        
        return analysis
        
    def identify_unnecessary_files(self) -> Dict[str, List[Path]]:
        """Identify files that can be safely deleted"""
        unnecessary = defaultdict(list)
        
        for category, patterns in self.cleanup_patterns.items():
            for root, dirs, files in os.walk(self.base_path):
                # Skip certain directories
                dirs[:] = [d for d in dirs if d not in self.skip_dirs]
                
                root_path = Path(root)
                
                for pattern in patterns:
                    # Check directories
                    if pattern in dirs:
                        dir_path = root_path / pattern
                        unnecessary[category].append(dir_path)
                        # Don't descend into these directories
                        dirs.remove(pattern)
                    
                    # Check files
                    if pattern.startswith('*'):
                        # Pattern matching
                        suffix = pattern[1:]
                        matching_files = [f for f in files if f.endswith(suffix)]
                        for file in matching_files:
                            unnecessary[category].append(root_path / file)
                    elif pattern in files:
                        unnecessary[category].append(root_path / pattern)
                        
        return unnecessary
        
    def find_duplicate_files(self, size_threshold: int = 1024) -> Dict[str, List[Path]]:
        """Find duplicate files based on content hash"""
        file_hashes = defaultdict(list)
        
        for root, dirs, files in os.walk(self.base_path):
            # Skip certain directories
            dirs[:] = [d for d in dirs if d not in self.skip_dirs]
            
            for file in files:
                file_path = Path(root) / file
                try:
                    # Only check files above size threshold
                    if file_path.stat().st_size < size_threshold:
                        continue
                        
                    # Calculate file hash
                    file_hash = self._calculate_file_hash(file_path)
                    if file_hash:
                        file_hashes[file_hash].append(file_path)
                        
                except Exception as e:
                    self.logger.debug(f"Error hashing {file_path}: {e}")
                    
        # Filter out non-duplicates
        duplicates = {k: v for k, v in file_hashes.items() if len(v) > 1}
        
        return duplicates
        
    def _calculate_file_hash(self, file_path: Path, chunk_size: int = 8192) -> str:
        """Calculate SHA256 hash of a file"""
        try:
            sha256_hash = hashlib.sha256()
            with open(file_path, "rb") as f:
                for byte_block in iter(lambda: f.read(chunk_size), b""):
                    sha256_hash.update(byte_block)
            return sha256_hash.hexdigest()
        except Exception as e:
            self.logger.debug(f"Error calculating hash for {file_path}: {e}")
            return None
            
    def categorize_files(self) -> Dict[str, List[Path]]:
        """Categorize files by type"""
        categorized = defaultdict(list)
        
        for root, dirs, files in os.walk(self.base_path):
            # Skip certain directories
            dirs[:] = [d for d in dirs if d not in self.skip_dirs]
            
            for file in files:
                file_path = Path(root) / file
                ext = file_path.suffix.lower()
                
                # Find category
                categorized_flag = False
                for category, extensions in self.file_categories.items():
                    if ext in extensions:
                        categorized[category].append(file_path)
                        categorized_flag = True
                        break
                        
                if not categorized_flag:
                    categorized['other'].append(file_path)
                    
        return categorized
        
    def generate_recommendations(self, analysis: Dict, unnecessary: Dict,
                                duplicates: Dict, categorized: Dict) -> Dict:
        """Generate cleanup and organization recommendations"""
        recommendations = {
            'delete': [],
            'archive': [],
            'organize': [],
            'summary': {}
        }
        
        # Recommend deletion of unnecessary files
        total_delete_size = 0
        for category, files in unnecessary.items():
            for file_path in files:
                try:
                    if file_path.exists():
                        size = self._get_path_size(file_path)
                        recommendations['delete'].append({
                            'path': file_path,
                            'category': category,
                            'size': size
                        })
                        total_delete_size += size
                except Exception as e:
                    self.logger.debug(f"Error checking {file_path}: {e}")
                    
        # Recommend handling of duplicates
        for file_hash, file_list in duplicates.items():
            if len(file_list) > 1:
                # Keep the first one, recommend deleting others
                original = file_list[0]
                for duplicate in file_list[1:]:
                    try:
                        size = duplicate.stat().st_size
                        recommendations['delete'].append({
                            'path': duplicate,
                            'category': 'duplicate',
                            'original': original,
                            'size': size
                        })
                        total_delete_size += size
                    except Exception:
                        pass
                        
        # Recommend archiving old historical data
        historical_data_path = self.base_path / "TradingDrive" / "historical_data"
        if historical_data_path.exists():
            old_data_files = []
            cutoff_date = datetime.datetime.now() - datetime.timedelta(days=30)
            
            for file_path in historical_data_path.glob("*.json"):
                try:
                    mtime = datetime.datetime.fromtimestamp(file_path.stat().st_mtime)
                    if mtime < cutoff_date:
                        old_data_files.append(file_path)
                except Exception:
                    pass
                    
            if old_data_files:
                recommendations['archive'].append({
                    'files': old_data_files,
                    'reason': 'Historical data older than 30 days',
                    'count': len(old_data_files)
                })
                
        # Summary statistics
        recommendations['summary'] = {
            'total_files_to_delete': len(recommendations['delete']),
            'total_size_to_free': total_delete_size,
            'total_size_to_free_mb': total_delete_size / (1024 * 1024),
            'duplicate_sets': len(duplicates),
            'files_to_archive': sum(len(a['files']) for a in recommendations['archive'])
        }
        
        return recommendations
        
    def _get_path_size(self, path: Path) -> int:
        """Get the size of a file or directory"""
        if path.is_file():
            return path.stat().st_size
        elif path.is_dir():
            total_size = 0
            for root, dirs, files in os.walk(path):
                for file in files:
                    try:
                        total_size += (Path(root) / file).stat().st_size
                    except Exception:
                        pass
            return total_size
        return 0
        
    def confirm_actions(self, recommendations: Dict) -> bool:
        """Confirm actions with the user"""
        print("\n" + "="*60)
        print("FILE ORGANIZATION RECOMMENDATIONS")
        print("="*60)
        
        summary = recommendations['summary']
        print(f"\nFiles to delete: {summary['total_files_to_delete']}")
        print(f"Space to free: {summary['total_size_to_free_mb']:.2f} MB")
        print(f"Duplicate file sets: {summary['duplicate_sets']}")
        print(f"Files to archive: {summary['files_to_archive']}")
        
        print("\n" + "-"*60)
        response = input("\nDo you want to proceed with these actions? (yes/no): ")
        return response.lower() in ['yes', 'y']
        
    def execute_cleanup(self, recommendations: Dict):
        """Execute the cleanup actions"""
        # Delete unnecessary files
        for item in recommendations['delete']:
            file_path = item['path']
            try:
                if file_path.exists():
                    if file_path.is_dir():
                        shutil.rmtree(file_path)
                        self.logger.info(f"Deleted directory: {file_path}")
                    else:
                        file_path.unlink()
                        self.logger.info(f"Deleted file: {file_path}")
                    self.stats['deleted'] += 1
                    self.action_log.append({
                        'action': 'delete',
                        'path': str(file_path),
                        'category': item['category'],
                        'timestamp': datetime.datetime.now().isoformat()
                    })
            except Exception as e:
                self.logger.error(f"Failed to delete {file_path}: {e}")
                
        # Archive old files
        for archive_group in recommendations['archive']:
            archive_name = f"archive_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.tar.gz"
            archive_path = self.base_path / "archives" / archive_name
            archive_path.parent.mkdir(exist_ok=True)
            
            # Create archive (implementation would go here)
            self.logger.info(f"Would archive {len(archive_group['files'])} files to {archive_path}")
            
    def generate_report(self, recommendations: Dict):
        """Generate a detailed report of actions taken"""
        report_dir = self.base_path / "logs" / "file_organization"
        report_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = report_dir / f"organization_report_{timestamp}.json"
        
        report = {
            'timestamp': datetime.datetime.now().isoformat(),
            'mode': 'dry_run' if self.dry_run else 'live',
            'base_path': str(self.base_path),
            'recommendations': {
                'summary': recommendations['summary'],
                'delete_count': len(recommendations['delete']),
                'archive_count': len(recommendations['archive'])
            },
            'actions_taken': self.action_log,
            'statistics': dict(self.stats)
        }
        
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
            
        self.logger.info(f"Report saved to: {report_file}")
        
        # Print summary
        print("\n" + "="*60)
        print("FILE ORGANIZATION COMPLETE")
        print("="*60)
        print(f"Mode: {'DRY RUN' if self.dry_run else 'LIVE'}")
        print(f"Files deleted: {self.stats.get('deleted', 0)}")
        print(f"Report saved to: {report_file}")
        

def main():
    parser = argparse.ArgumentParser(
        description="File Organization and Cleanup Agent"
    )
    parser.add_argument(
        '--path',
        default='.',
        help='Base path to organize (default: current directory)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=True,
        help='Run in dry-run mode (default: True)'
    )
    parser.add_argument(
        '--execute',
        action='store_true',
        help='Execute the cleanup (disables dry-run)'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose logging'
    )
    
    args = parser.parse_args()
    
    # If --execute is specified, disable dry-run
    if args.execute:
        args.dry_run = False
    
    agent = FileOrganizationAgent(
        base_path=args.path,
        dry_run=args.dry_run,
        verbose=args.verbose
    )
    
    agent.run()


if __name__ == "__main__":
    main()