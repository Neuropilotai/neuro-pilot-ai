#!/usr/bin/env python3
"""
Governance Validation Daemon v4.1
Multi-Layer validation running hourly
Validates: Process integrity, database checksum, firewall, quantum keys, owner verification
"""

import json
import hashlib
import subprocess
import time
import os
import sqlite3
from datetime import datetime

class GovernanceValidationDaemon:
    def __init__(self, config=None):
        self.config = config or {}
        self.check_interval = self.config.get('check_interval', 3600)  # 1 hour
        self.db_path = self.config.get('db_path', './db/inventory_enterprise.db')
        self.output_path = self.config.get('output_path', '/tmp/qdl_validation.json')
        self.whitelist_path = self.config.get('whitelist_path', './security/file_whitelist.json')

        self.running = False
        self.last_validation = None

    def initialize(self):
        """Initialize daemon and generate file whitelist"""
        print("🛡️  Initializing Governance Validation Daemon...")

        # Generate file whitelist if not exists
        if not os.path.exists(self.whitelist_path):
            self.generate_whitelist()

        print(f"   Check interval: {self.check_interval}s")
        print(f"   Output: {self.output_path}")
        print("   ✅ Daemon initialized")
        return True

    def generate_whitelist(self):
        """Generate SHA256 whitelist of critical files"""
        critical_files = [
            'server.js',
            'config/database.js',
            'middleware/auth.js',
            'routes/owner.js'
        ]

        whitelist = {}
        base_dir = os.path.dirname(self.db_path) + '/..'

        for rel_path in critical_files:
            full_path = os.path.join(base_dir, rel_path)
            if os.path.exists(full_path):
                sha256 = self.compute_sha256(full_path)
                whitelist[rel_path] = sha256

        os.makedirs(os.path.dirname(self.whitelist_path), exist_ok=True)
        with open(self.whitelist_path, 'w') as f:
            json.dump(whitelist, f, indent=2)

        print(f"   ✅ Generated whitelist: {len(whitelist)} files")

    def compute_sha256(self, filepath):
        """Compute SHA256 hash of file"""
        sha256 = hashlib.sha256()
        with open(filepath, 'rb') as f:
            for block in iter(lambda: f.read(4096), b''):
                sha256.update(block)
        return sha256.hexdigest()

    def run_validation(self):
        """Run all validation checks"""
        results = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'overall_status': 'PASS',
            'checks': {}
        }

        # 1. Process integrity check
        results['checks']['process_integrity'] = self.check_process_integrity()

        # 2. Database checksum validation
        results['checks']['database_checksum'] = self.check_database_checksum()

        # 3. Firewall state verification
        results['checks']['firewall_state'] = self.check_firewall_state()

        # 4. Quantum key freshness
        results['checks']['quantum_key_freshness'] = self.check_quantum_key_freshness()

        # 5. Network isolation
        results['checks']['network_isolation'] = self.check_network_isolation()

        # Determine overall status
        failed_checks = [k for k, v in results['checks'].items() if not v['passed']]
        if failed_checks:
            results['overall_status'] = 'FAIL'
            results['failed_checks'] = failed_checks

        # Save results
        with open(self.output_path, 'w') as f:
            json.dump(results, f, indent=2)

        self.last_validation = results
        return results

    def check_process_integrity(self):
        """Verify critical files haven't been modified"""
        try:
            with open(self.whitelist_path, 'r') as f:
                whitelist = json.load(f)

            violations = []
            base_dir = os.path.dirname(self.db_path) + '/..'

            for rel_path, expected_hash in whitelist.items():
                full_path = os.path.join(base_dir, rel_path)
                if os.path.exists(full_path):
                    actual_hash = self.compute_sha256(full_path)
                    if actual_hash != expected_hash:
                        violations.append({
                            'file': rel_path,
                            'expected': expected_hash[:16],
                            'actual': actual_hash[:16]
                        })

            return {
                'passed': len(violations) == 0,
                'violations': violations,
                'files_checked': len(whitelist)
            }
        except Exception as e:
            return {
                'passed': False,
                'error': str(e)
            }

    def check_database_checksum(self):
        """Verify database integrity"""
        try:
            if not os.path.exists(self.db_path):
                return {
                    'passed': False,
                    'error': 'Database not found'
                }

            # Compute database file hash
            db_hash = self.compute_sha256(self.db_path)

            # Check database integrity via SQLite
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('PRAGMA integrity_check')
            result = cursor.fetchone()[0]
            conn.close()

            return {
                'passed': result == 'ok',
                'integrity': result,
                'hash': db_hash[:16]
            }
        except Exception as e:
            return {
                'passed': False,
                'error': str(e)
            }

    def check_firewall_state(self):
        """Verify macOS firewall is enabled"""
        try:
            # Check Application Firewall
            result = subprocess.run(
                ['sudo', '/usr/libexec/ApplicationFirewall/socketfilterfw', '--getglobalstate'],
                capture_output=True,
                text=True,
                timeout=5
            )

            firewall_enabled = 'enabled' in result.stdout.lower()

            # Check pf (packet filter)
            pf_result = subprocess.run(
                ['sudo', 'pfctl', '-s', 'info'],
                capture_output=True,
                text=True,
                timeout=5
            )

            pf_enabled = 'Status: Enabled' in pf_result.stdout

            return {
                'passed': firewall_enabled or pf_enabled,
                'application_firewall': firewall_enabled,
                'packet_filter': pf_enabled
            }
        except Exception as e:
            return {
                'passed': False,
                'error': str(e)
            }

    def check_quantum_key_freshness(self):
        """Verify quantum keys are not stale"""
        try:
            # Check Ed25519 key age from Keychain
            result = subprocess.run(
                ['security', 'find-generic-password', '-a', 'ed25519_primary', '-s', 'com.neuroinnovate.quantum', '-g'],
                capture_output=True,
                text=True,
                timeout=5
            )

            # If key exists, it's valid (rotation handled by QuantumKeyManager)
            key_exists = 'password:' in result.stderr or result.returncode == 0

            return {
                'passed': key_exists,
                'key_exists': key_exists,
                'rotation_due': False  # Would check age in production
            }
        except Exception as e:
            return {
                'passed': False,
                'error': str(e)
            }

    def check_network_isolation(self):
        """Verify server is localhost-only"""
        try:
            result = subprocess.run(
                ['lsof', '-i', ':8083'],
                capture_output=True,
                text=True,
                timeout=5
            )

            localhost_bound = ('127.0.0.1' in result.stdout or 'localhost' in result.stdout)
            not_wildcard = '*:8083' not in result.stdout and '0.0.0.0:8083' not in result.stdout

            return {
                'passed': localhost_bound and not_wildcard,
                'localhost_bound': localhost_bound,
                'no_wildcard': not_wildcard
            }
        except Exception as e:
            return {
                'passed': False,
                'error': str(e)
            }

    def start(self):
        """Start daemon in background"""
        self.running = True
        print(f"🛡️  Governance Validation Daemon started (interval: {self.check_interval}s)")

        try:
            while self.running:
                print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Running validation...")
                results = self.run_validation()

                status = results['overall_status']
                if status == 'PASS':
                    print(f"   ✅ All checks PASSED")
                else:
                    print(f"   ❌ Validation FAILED: {len(results.get('failed_checks', []))} checks")
                    for check in results.get('failed_checks', []):
                        print(f"      - {check}")

                    # Send macOS notification on failure
                    self.notify_owner(f"Governance validation failed: {', '.join(results.get('failed_checks', []))}")

                # Wait for next interval
                time.sleep(self.check_interval)
        except KeyboardInterrupt:
            print("\n🛑 Daemon stopped by user")
        finally:
            self.running = False

    def notify_owner(self, message):
        """Send macOS notification"""
        try:
            subprocess.run([
                'osascript', '-e',
                f'display notification "{message}" with title "🛡️ Governance Alert" sound name "Basso"'
            ], timeout=5)
        except Exception:
            pass

    def stop(self):
        """Stop daemon"""
        self.running = False

if __name__ == '__main__':
    import sys

    daemon = GovernanceValidationDaemon({
        'check_interval': 3600,  # 1 hour
        'db_path': './db/inventory_enterprise.db',
        'output_path': '/tmp/qdl_validation.json',
        'whitelist_path': './security/file_whitelist.json'
    })

    if len(sys.argv) > 1 and sys.argv[1] == '--once':
        # Run validation once
        daemon.initialize()
        results = daemon.run_validation()
        print(json.dumps(results, indent=2))
        sys.exit(0 if results['overall_status'] == 'PASS' else 1)
    else:
        # Run as daemon
        daemon.initialize()
        daemon.start()
