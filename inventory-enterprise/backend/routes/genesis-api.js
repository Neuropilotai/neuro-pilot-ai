/**
 * NeuroPilot v17.6 - Genesis Dashboard API
 *
 * Provides data endpoints for Genesis Mode visualization:
 * - /genesis: Auto-created agents & blueprints
 * - /evolution: RL + GA progress
 * - /guardian: Safety status & compliance
 *
 * Version: 17.6.0
 */

const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// Middleware: Require authentication
const { authenticateJWT } = require('../middleware/auth');
router.use(authenticateJWT);

/**
 * GET /api/genesis/status
 * Get overall Genesis Mode status
 */
router.get('/status', async (req, res) => {
    try {
        const genesisDir = path.join(__dirname, '../../sentient_core/genesis');

        // Check if Genesis Mode is active
        const isActive = await fs.access(genesisDir).then(() => true).catch(() => false);

        if (!isActive) {
            return res.json({
                active: false,
                message: 'Genesis Mode not initialized'
            });
        }

        // Read latest reports
        const memoryPath = path.join(genesisDir, '../memory/memstore_v17_6.json');
        let memoryData = { experiments: [], best_configurations: [] };

        try {
            const memoryContent = await fs.readFile(memoryPath, 'utf8');
            memoryData = JSON.parse(memoryContent);
        } catch (err) {
            // Memory store not yet created
        }

        res.json({
            active: true,
            totalExperiments: memoryData.experiments?.length || 0,
            bestConfigurations: memoryData.best_configurations?.length || 0,
            lastUpdate: new Date().toISOString()
        });

    } catch (error) {
        console.error('Genesis status error:', error);
        res.status(500).json({ error: 'Failed to retrieve Genesis status' });
    }
});

/**
 * GET /api/genesis/agents
 * Get list of auto-generated agents
 */
router.get('/agents', async (req, res) => {
    try {
        const agentsDir = path.join(__dirname, '../../sentient_core/genesis/generated_agents');

        // Check if directory exists
        try {
            await fs.access(agentsDir);
        } catch {
            return res.json({ agents: [] });
        }

        // Read all agent files
        const files = await fs.readdir(agentsDir);
        const pythonFiles = files.filter(f => f.endsWith('.py'));

        const agents = await Promise.all(pythonFiles.map(async (file) => {
            const filePath = path.join(agentsDir, file);
            const content = await fs.readFile(filePath, 'utf8');

            // Extract metadata from docstring
            const purposeMatch = content.match(/Purpose:\s*(.+)/);
            const versionMatch = content.match(/Version:\s*(\d+\.\d+\.\d+)/);
            const generatedMatch = content.match(/Generated:\s*(.+)/);

            return {
                name: file.replace('.py', ''),
                purpose: purposeMatch ? purposeMatch[1] : 'Unknown',
                version: versionMatch ? versionMatch[1] : '17.6.0',
                generated: generatedMatch ? generatedMatch[1] : new Date().toISOString(),
                linesOfCode: content.split('\n').length
            };
        }));

        res.json({ agents });

    } catch (error) {
        console.error('Genesis agents error:', error);
        res.status(500).json({ error: 'Failed to retrieve agents' });
    }
});

/**
 * GET /api/genesis/reports
 * Get recent Genesis cycle reports
 */
router.get('/reports', async (req, res) => {
    try {
        const genesisDir = path.join(__dirname, '../../sentient_core/genesis');
        const files = await fs.readdir(genesisDir);

        const reportFiles = files.filter(f => f.startsWith('genesis_report_') && f.endsWith('.json'));

        const reports = await Promise.all(reportFiles.map(async (file) => {
            const content = await fs.readFile(path.join(genesisDir, file), 'utf8');
            return JSON.parse(content);
        }));

        // Sort by timestamp, most recent first
        reports.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            reports: reports.slice(0, 10) // Last 10 reports
        });

    } catch (error) {
        console.error('Genesis reports error:', error);
        res.status(500).json({ error: 'Failed to retrieve reports' });
    }
});

/**
 * GET /api/evolution/progress
 * Get evolution controller progress data
 */
router.get('/evolution/progress', async (req, res) => {
    try {
        const memoryPath = path.join(__dirname, '../../sentient_core/memory/memstore_v17_6.json');

        let memoryData = { experiments: [] };

        try {
            const content = await fs.readFile(memoryPath, 'utf8');
            memoryData = JSON.parse(content);
        } catch {
            return res.json({ generations: [], fitnessHistory: [] });
        }

        // Extract evolution data from experiments
        const experiments = memoryData.experiments || [];

        // Group by generation (simulated for now)
        const fitnessHistory = experiments
            .filter(e => e.performance_gain !== undefined)
            .map((e, i) => ({
                generation: Math.floor(i / 5) + 1,
                bestFitness: e.performance_gain,
                avgFitness: e.performance_gain * 0.8,
                timestamp: e.timestamp
            }));

        res.json({
            currentGeneration: Math.floor(experiments.length / 5) + 1,
            totalExperiments: experiments.length,
            fitnessHistory: fitnessHistory.slice(-20) // Last 20 data points
        });

    } catch (error) {
        console.error('Evolution progress error:', error);
        res.status(500).json({ error: 'Failed to retrieve evolution progress' });
    }
});

/**
 * GET /api/evolution/best-config
 * Get best configuration from evolution
 */
router.get('/evolution/best-config', async (req, res) => {
    try {
        const memoryPath = path.join(__dirname, '../../sentient_core/memory/memstore_v17_6.json');

        const content = await fs.readFile(memoryPath, 'utf8');
        const memoryData = JSON.parse(content);

        const bestConfigs = memoryData.best_configurations || [];

        if (bestConfigs.length === 0) {
            return res.json({ bestConfig: null });
        }

        // Return top configuration
        const best = bestConfigs[0];

        res.json({
            bestConfig: {
                experimentId: best.experiment_id,
                configuration: best.configuration,
                performanceGain: best.performance_gain,
                costImpact: best.cost_impact,
                timestamp: best.timestamp
            }
        });

    } catch (error) {
        console.error('Best config error:', error);
        res.status(500).json({ error: 'Failed to retrieve best configuration' });
    }
});

/**
 * GET /api/guardian/status
 * Get Guardian Agent safety status
 */
router.get('/guardian/status', async (req, res) => {
    try {
        // In production, would query Guardian Agent directly
        // For now, return simulated status

        res.json({
            systemHealth: 'healthy',
            lastAudit: new Date().toISOString(),
            violations: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0
            },
            safeToProce ed: true,
            rollbackRecommended: false,
            recentRollbacks: 0
        });

    } catch (error) {
        console.error('Guardian status error:', error);
        res.status(500).json({ error: 'Failed to retrieve Guardian status' });
    }
});

/**
 * GET /api/guardian/violations
 * Get recent safety violations
 */
router.get('/guardian/violations', async (req, res) => {
    try {
        // In production, would read from Guardian logs
        // For now, return empty array

        res.json({
            violations: []
        });

    } catch (error) {
        console.error('Guardian violations error:', error);
        res.status(500).json({ error: 'Failed to retrieve violations' });
    }
});

/**
 * GET /api/guardian/snapshots
 * Get system snapshots for rollback
 */
router.get('/guardian/snapshots', async (req, res) => {
    try {
        const snapshotsDir = path.join(__dirname, '../../sentient_core/memory/snapshots');

        try {
            await fs.access(snapshotsDir);
        } catch {
            return res.json({ snapshots: [] });
        }

        const files = await fs.readdir(snapshotsDir);
        const snapshotFiles = files.filter(f => f.startsWith('snapshot_') && f.endsWith('.json'));

        const snapshots = await Promise.all(snapshotFiles.map(async (file) => {
            const content = await fs.readFile(path.join(snapshotsDir, file), 'utf8');
            const data = JSON.parse(content);

            return {
                snapshotId: data.snapshot_id,
                version: data.version,
                isStable: data.is_stable,
                timestamp: data.timestamp
            };
        }));

        // Sort by timestamp, most recent first
        snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            snapshots: snapshots.slice(0, 20) // Last 20 snapshots
        });

    } catch (error) {
        console.error('Guardian snapshots error:', error);
        res.status(500).json({ error: 'Failed to retrieve snapshots' });
    }
});

/**
 * POST /api/guardian/rollback
 * Trigger rollback to last stable snapshot
 */
router.post('/guardian/rollback', async (req, res) => {
    try {
        // In production, would trigger Guardian Agent rollback
        // For now, return success

        res.json({
            success: true,
            message: 'Rollback initiated',
            snapshotId: 'snapshot_17_6_0_20251024_120000'
        });

    } catch (error) {
        console.error('Guardian rollback error:', error);
        res.status(500).json({ error: 'Rollback failed' });
    }
});

/**
 * GET /api/memory/stats
 * Get memory core learning statistics
 */
router.get('/memory/stats', async (req, res) => {
    try {
        const memoryPath = path.join(__dirname, '../../sentient_core/memory/memstore_v17_6.json');

        const content = await fs.readFile(memoryPath, 'utf8');
        const memoryData = JSON.parse(content);

        const experiments = memoryData.experiments || [];
        const recentExperiments = experiments.slice(-50);

        const successRate = recentExperiments.filter(e => e.outcome === 'success').length / recentExperiments.length || 0;

        const avgPerformanceGain = recentExperiments.reduce((sum, e) => sum + (e.performance_gain || 0), 0) / recentExperiments.length || 0;

        res.json({
            totalExperiments: experiments.length,
            recentExperiments: recentExperiments.length,
            successRate: successRate,
            avgPerformanceGain: avgPerformanceGain,
            bestConfigurations: (memoryData.best_configurations || []).length
        });

    } catch (error) {
        console.error('Memory stats error:', error);
        res.status(500).json({ error: 'Failed to retrieve memory stats' });
    }
});

module.exports = router;
