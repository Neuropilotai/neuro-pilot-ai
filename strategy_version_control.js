#!/usr/bin/env node

/**
 * 🔄 Strategy Version Control System
 * 
 * Git-integrated version control for AI trading strategies
 * Tracks performance improvements and strategy evolution
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class StrategyVersionControl {
    constructor() {
        this.strategyPath = './TradingDrive/pinescript_strategies';
        this.performancePath = './TradingDrive/performance_logs';
        this.versionsPath = './TradingDrive/strategy_versions';
        
        this.currentVersion = '1.0.0';
        this.versionHistory = [];
        
        this.ensureDirectories();
        this.initializeGit();
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.versionsPath, { recursive: true });
            console.log('📁 Strategy versions directory ready');
        } catch (error) {
            console.error('Directory creation error:', error.message);
        }
    }

    async initializeGit() {
        try {
            // Check if git is already initialized
            try {
                await execAsync('git status', { cwd: this.strategyPath });
                console.log('📂 Git repository already initialized');
            } catch (error) {
                // Initialize git repository
                await execAsync('git init', { cwd: this.strategyPath });
                await execAsync('git config user.name "AI Trading Bot"', { cwd: this.strategyPath });
                await execAsync('git config user.email "ai@neuro-pilot.com"', { cwd: this.strategyPath });
                console.log('🔧 Git repository initialized');
            }
            
            // Create .gitignore if it doesn't exist
            const gitignorePath = path.join(this.strategyPath, '.gitignore');
            try {
                await fs.access(gitignorePath);
            } catch (error) {
                await fs.writeFile(gitignorePath, `
# AI Strategy Version Control
*.log
*.tmp
node_modules/
.env
`);
                console.log('📝 .gitignore created');
            }
            
        } catch (error) {
            console.error('Git initialization error:', error.message);
        }
    }

    async getCurrentStrategies() {
        try {
            const files = await fs.readdir(this.strategyPath);
            return files.filter(file => file.endsWith('.pine'));
        } catch (error) {
            console.error('Error reading strategies:', error.message);
            return [];
        }
    }

    async getPerformanceMetrics() {
        try {
            const progressFile = path.join(this.performancePath, 'learning_progress.json');
            const data = await fs.readFile(progressFile, 'utf8');
            const progress = JSON.parse(data);
            
            return {
                accuracy: progress.modelAccuracy || 0,
                dataPoints: progress.performance?.dataPointsCollected || 0,
                modelsRetrained: progress.performance?.modelsRetrained || 0,
                learningProgress: progress.learningProgress || 0,
                timestamp: progress.timestamp || new Date().toISOString()
            };
        } catch (error) {
            return {
                accuracy: 0,
                dataPoints: 0,
                modelsRetrained: 0,
                learningProgress: 0,
                timestamp: new Date().toISOString()
            };
        }
    }

    async createVersionTag(version, description, performanceMetrics) {
        try {
            // Stage all changes
            await execAsync('git add .', { cwd: this.strategyPath });
            
            // Create commit with performance data
            const commitMessage = `v${version}: ${description}

Performance Metrics:
- AI Accuracy: ${(performanceMetrics.accuracy * 100).toFixed(2)}%
- Data Points: ${performanceMetrics.dataPoints.toLocaleString()}
- Models Retrained: ${performanceMetrics.modelsRetrained}
- Learning Progress: ${performanceMetrics.learningProgress}%

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>`;

            await execAsync(`git commit -m "${commitMessage}"`, { cwd: this.strategyPath });
            
            // Create annotated tag
            await execAsync(`git tag -a v${version} -m "${description}"`, { cwd: this.strategyPath });
            
            console.log(`🏷️ Version v${version} tagged successfully`);
            return true;
        } catch (error) {
            console.error('Version tagging error:', error.message);
            return false;
        }
    }

    async saveVersionSnapshot(version, performanceMetrics) {
        try {
            const strategies = await this.getCurrentStrategies();
            const snapshot = {
                version,
                timestamp: new Date().toISOString(),
                performance: performanceMetrics,
                strategies: {}
            };
            
            // Save content of all strategies
            for (const strategy of strategies) {
                const strategyPath = path.join(this.strategyPath, strategy);
                const content = await fs.readFile(strategyPath, 'utf8');
                snapshot.strategies[strategy] = content;
            }
            
            const snapshotFile = path.join(this.versionsPath, `v${version}.json`);
            await fs.writeFile(snapshotFile, JSON.stringify(snapshot, null, 2));
            
            console.log(`📸 Snapshot saved: v${version}`);
            return snapshot;
        } catch (error) {
            console.error('Snapshot save error:', error.message);
            return null;
        }
    }

    async getVersionHistory() {
        try {
            const { stdout } = await execAsync('git log --oneline --tags', { cwd: this.strategyPath });
            const commits = stdout.split('\n').filter(line => line.trim());
            
            return commits.map(commit => {
                const [hash, ...messageParts] = commit.split(' ');
                const message = messageParts.join(' ');
                const tagMatch = message.match(/v(\d+\.\d+\.\d+)/);
                
                return {
                    hash: hash.substring(0, 7),
                    message,
                    version: tagMatch ? tagMatch[1] : null
                };
            });
        } catch (error) {
            console.error('Version history error:', error.message);
            return [];
        }
    }

    incrementVersion(currentVersion, type = 'patch') {
        const [major, minor, patch] = currentVersion.split('.').map(Number);
        
        switch (type) {
            case 'major':
                return `${major + 1}.0.0`;
            case 'minor':
                return `${major}.${minor + 1}.0`;
            case 'patch':
            default:
                return `${major}.${minor}.${patch + 1}`;
        }
    }

    async detectSignificantChanges(performanceMetrics) {
        try {
            const historyFile = path.join(this.versionsPath, 'version_history.json');
            let history = [];
            
            try {
                const data = await fs.readFile(historyFile, 'utf8');
                history = JSON.parse(data);
            } catch (error) {
                // No history file yet
            }
            
            if (history.length === 0) {
                return { shouldVersion: true, type: 'major', reason: 'Initial version' };
            }
            
            const lastVersion = history[history.length - 1];
            const accuracyImprovement = performanceMetrics.accuracy - lastVersion.performance.accuracy;
            const dataPointsIncrease = performanceMetrics.dataPoints - lastVersion.performance.dataPoints;
            
            // Determine version type based on improvements
            if (accuracyImprovement > 0.05) {
                return { shouldVersion: true, type: 'major', reason: `Significant accuracy improvement: +${(accuracyImprovement * 100).toFixed(2)}%` };
            } else if (accuracyImprovement > 0.02) {
                return { shouldVersion: true, type: 'minor', reason: `Moderate accuracy improvement: +${(accuracyImprovement * 100).toFixed(2)}%` };
            } else if (dataPointsIncrease > 1000) {
                return { shouldVersion: true, type: 'patch', reason: `Significant data collection: +${dataPointsIncrease.toLocaleString()} points` };
            } else if (performanceMetrics.modelsRetrained > lastVersion.performance.modelsRetrained) {
                return { shouldVersion: true, type: 'patch', reason: 'Model retraining completed' };
            }
            
            return { shouldVersion: false, reason: 'No significant changes detected' };
        } catch (error) {
            console.error('Change detection error:', error.message);
            return { shouldVersion: true, type: 'patch', reason: 'Error in change detection' };
        }
    }

    async saveVersionHistory(version, performanceMetrics, description) {
        try {
            const historyFile = path.join(this.versionsPath, 'version_history.json');
            let history = [];
            
            try {
                const data = await fs.readFile(historyFile, 'utf8');
                history = JSON.parse(data);
            } catch (error) {
                // No history file yet
            }
            
            history.push({
                version,
                timestamp: new Date().toISOString(),
                performance: performanceMetrics,
                description,
                gitHash: await this.getLatestCommitHash()
            });
            
            // Keep only last 50 versions
            if (history.length > 50) {
                history = history.slice(-50);
            }
            
            await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
        } catch (error) {
            console.error('Version history save error:', error.message);
        }
    }

    async getLatestCommitHash() {
        try {
            const { stdout } = await execAsync('git rev-parse HEAD', { cwd: this.strategyPath });
            return stdout.trim().substring(0, 7);
        } catch (error) {
            return 'unknown';
        }
    }

    async checkForVersioning() {
        console.log('\n🔄 Checking for strategy versioning...');
        
        const performanceMetrics = await this.getPerformanceMetrics();
        const changeAnalysis = await this.detectSignificantChanges(performanceMetrics);
        
        console.log(`📊 Performance Analysis:`);
        console.log(`   AI Accuracy: ${(performanceMetrics.accuracy * 100).toFixed(2)}%`);
        console.log(`   Data Points: ${performanceMetrics.dataPoints.toLocaleString()}`);
        console.log(`   Models Retrained: ${performanceMetrics.modelsRetrained}`);
        
        if (changeAnalysis.shouldVersion) {
            console.log(`✅ Versioning triggered: ${changeAnalysis.reason}`);
            
            const newVersion = this.incrementVersion(this.currentVersion, changeAnalysis.type);
            const description = `${changeAnalysis.type.toUpperCase()} update: ${changeAnalysis.reason}`;
            
            // Create version
            const success = await this.createVersionTag(newVersion, description, performanceMetrics);
            
            if (success) {
                await this.saveVersionSnapshot(newVersion, performanceMetrics);
                await this.saveVersionHistory(newVersion, performanceMetrics, description);
                
                this.currentVersion = newVersion;
                console.log(`🎉 Strategy version v${newVersion} created successfully!`);
                
                return {
                    versioned: true,
                    version: newVersion,
                    description,
                    performance: performanceMetrics
                };
            }
        } else {
            console.log(`ℹ️ No versioning needed: ${changeAnalysis.reason}`);
        }
        
        return {
            versioned: false,
            reason: changeAnalysis.reason,
            performance: performanceMetrics
        };
    }

    async startVersionMonitoring() {
        console.log('🔄 Starting Strategy Version Control Monitoring...');
        
        // Check for versioning every 30 minutes
        setInterval(async () => {
            try {
                await this.checkForVersioning();
            } catch (error) {
                console.error('❌ Version monitoring error:', error.message);
            }
        }, 1800000); // 30 minutes
        
        // Initial check
        await this.checkForVersioning();
    }

    async getVersionReport() {
        const history = await this.getVersionHistory();
        const performanceMetrics = await this.getPerformanceMetrics();
        
        return {
            currentVersion: this.currentVersion,
            totalVersions: history.length,
            latestPerformance: performanceMetrics,
            recentVersions: history.slice(-5),
            lastVersioned: history.length > 0 ? history[history.length - 1] : null
        };
    }
}

// Start version control monitoring
async function startVersionControl() {
    const versionControl = new StrategyVersionControl();
    await versionControl.startVersionMonitoring();
    
    // Version control reporting every 2 hours
    setInterval(async () => {
        const report = await versionControl.getVersionReport();
        console.log('\n📋 VERSION CONTROL REPORT:');
        console.log(`   Current Version: v${report.currentVersion}`);
        console.log(`   Total Versions: ${report.totalVersions}`);
        console.log(`   Latest Performance: ${(report.latestPerformance.accuracy * 100).toFixed(2)}% accuracy`);
        if (report.lastVersioned) {
            console.log(`   Last Versioned: ${new Date(report.lastVersioned.timestamp).toLocaleString()}`);
        }
    }, 7200000); // 2 hours
}

// Execute if run directly
if (require.main === module) {
    startVersionControl().catch(error => {
        console.error('💥 Version control error:', error);
        process.exit(1);
    });
}

module.exports = StrategyVersionControl;