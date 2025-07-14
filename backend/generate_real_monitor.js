const fs = require('fs').promises;
const path = require('path');

async function generateRealMonitor() {
    console.log('🔍 Generating real agent monitor with actual data...');
    
    const agents = [
        'super_agent.js',
        'enhanced_super_agent.js', 
        'customer_service_agent.js',
        'email_agent.js',
        'real_trading_agent.js',
        'super_trading_agent.js',
        'inventory_super_agent.js',
        'platform_integration_super_agent.js',
        'super_learning_ai_agent.js'
    ];
    
    const agentData = [];
    
    // Get real agent file information
    for (const agentFile of agents) {
        try {
            const filePath = path.join(__dirname, agentFile);
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf8');
            
            const lines = content.split('\n');
            const functions = (content.match(/function\s+\w+/g) || []).length;
            const classes = (content.match(/class\s+\w+/g) || []).length;
            const consoleLogsLines = content.split('\n').filter(line => line.includes('console.log'));
            
            agentData.push({
                name: agentFile.replace('.js', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                file: agentFile,
                size: Math.round(stats.size / 1024) + ' KB',
                lastModified: stats.mtime.toLocaleString(),
                linesOfCode: lines.length,
                functions: functions,
                classes: classes,
                hasLogging: consoleLogsLines.length,
                recentlyModified: (new Date() - stats.mtime) < (24 * 60 * 60 * 1000),
                exists: true
            });
        } catch (error) {
            agentData.push({
                name: agentFile.replace('.js', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                file: agentFile,
                exists: false,
                error: 'File not found'
            });
        }
    }
    
    // Get recent files
    const allFiles = await fs.readdir(__dirname);
    const recentFiles = [];
    
    for (const file of allFiles) {
        if (file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.log')) {
            try {
                const stats = await fs.stat(path.join(__dirname, file));
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                
                if (stats.mtime > oneHourAgo) {
                    recentFiles.push({
                        name: file,
                        size: Math.round(stats.size / 1024) + ' KB',
                        modified: stats.mtime.toLocaleString()
                    });
                }
            } catch (error) {
                // Skip files we can't read
            }
        }
    }
    
    // Get log data
    const logData = [];
    const logFiles = ['email_agent.log', 'server_8080.log', 'processed_orders_log.json'];
    
    for (const logFile of logFiles) {
        try {
            const logPath = path.join(__dirname, logFile);
            const stats = await fs.stat(logPath);
            const content = await fs.readFile(logPath, 'utf8');
            
            logData.push({
                file: logFile,
                size: Math.round(stats.size / 1024) + ' KB',
                lastModified: stats.mtime.toLocaleString(),
                lineCount: content.split('\n').length,
                exists: true
            });
        } catch (error) {
            logData.push({
                file: logFile,
                exists: false
            });
        }
    }
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Real Agent Monitor - Neuro.Pilot.AI</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f36 100%);
            color: #ffffff;
            min-height: 100vh;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .header p {
            color: #b8c5d6;
            font-size: 1.1rem;
        }
        
        .timestamp {
            background: rgba(255,255,255,0.1);
            padding: 10px 20px;
            border-radius: 25px;
            display: inline-block;
            margin-top: 15px;
            font-size: 0.9rem;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 25px;
        }
        
        .card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 25px;
            backdrop-filter: blur(10px);
        }
        
        .card h3 {
            color: #64b5f6;
            margin-bottom: 20px;
            font-size: 1.4rem;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .agent-item {
            background: rgba(255,255,255,0.03);
            border-radius: 12px;
            padding: 18px;
            margin-bottom: 15px;
            border-left: 4px solid;
            transition: all 0.3s ease;
        }
        
        .agent-item:hover {
            transform: translateX(5px);
            background: rgba(255,255,255,0.06);
        }
        
        .agent-exists { border-left-color: #10b981; }
        .agent-recent { border-left-color: #3b82f6; }
        .agent-missing { border-left-color: #ef4444; }
        
        .agent-name {
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 10px;
            font-size: 1.1rem;
        }
        
        .agent-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            font-size: 0.9rem;
            color: #a0aec0;
        }
        
        .detail-item {
            display: flex;
            justify-content: space-between;
        }
        
        .detail-label {
            color: #64748b;
        }
        
        .detail-value {
            color: #e2e8f0;
            font-weight: 500;
        }
        
        .file-item {
            background: rgba(255,255,255,0.03);
            border-radius: 10px;
            padding: 15px;
            margin-bottom: 12px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .file-name {
            font-weight: 600;
            color: #93c5fd;
            margin-bottom: 8px;
        }
        
        .file-meta {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            color: #64748b;
        }
        
        .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
            display: inline-block;
            margin-left: 10px;
        }
        
        .badge-exists { background: #065f46; color: #6ee7b7; }
        .badge-recent { background: #1e3a8a; color: #93c5fd; }
        .badge-missing { background: #7f1d1d; color: #fca5a5; }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            background: rgba(255,255,255,0.03);
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }
        
        .stat-number {
            font-size: 2rem;
            font-weight: 700;
            color: #64b5f6;
            margin-bottom: 5px;
        }
        
        .stat-label {
            color: #a0aec0;
            font-size: 0.9rem;
        }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #64748b;
        }
        
        @media (max-width: 768px) {
            .grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .agent-details {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Real Agent Monitor</h1>
        <p>Actual status and metrics from your Neuro.Pilot.AI system</p>
        <div class="timestamp">
            📅 Generated: ${new Date().toLocaleString()}
        </div>
    </div>
    
    <!-- Stats Overview -->
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-number">${agentData.filter(a => a.exists).length}</div>
            <div class="stat-label">Agent Files Found</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${agentData.filter(a => a.recentlyModified).length}</div>
            <div class="stat-label">Recently Modified</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${recentFiles.length}</div>
            <div class="stat-label">Files Changed (1h)</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${logData.filter(l => l.exists).length}</div>
            <div class="stat-label">Active Log Files</div>
        </div>
    </div>
    
    <div class="grid">
        <!-- Agent Files Status -->
        <div class="card">
            <h3>🤖 Agent Files</h3>
            ${agentData.map(agent => {
                if (!agent.exists) {
                    return `
                        <div class="agent-item agent-missing">
                            <div class="agent-name">
                                ${agent.name}
                                <span class="status-badge badge-missing">Missing</span>
                            </div>
                            <div style="color: #fca5a5;">File not found: ${agent.file}</div>
                        </div>
                    `;
                }
                
                const statusClass = agent.recentlyModified ? 'agent-recent' : 'agent-exists';
                const badgeClass = agent.recentlyModified ? 'badge-recent' : 'badge-exists';
                const statusText = agent.recentlyModified ? 'Recently Active' : 'Exists';
                
                return `
                    <div class="agent-item ${statusClass}">
                        <div class="agent-name">
                            ${agent.name}
                            <span class="status-badge ${badgeClass}">${statusText}</span>
                        </div>
                        <div class="agent-details">
                            <div class="detail-item">
                                <span class="detail-label">File Size:</span>
                                <span class="detail-value">${agent.size}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Lines of Code:</span>
                                <span class="detail-value">${agent.linesOfCode.toLocaleString()}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Functions:</span>
                                <span class="detail-value">${agent.functions}</span>
                            </div>
                            <div class="detail-item">
                                <span class="detail-label">Classes:</span>
                                <span class="detail-value">${agent.classes}</span>
                            </div>
                        </div>
                        <div style="margin-top: 10px; font-size: 0.85rem; color: #64748b;">
                            📅 Last Modified: ${agent.lastModified}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        <!-- Log Files Status -->
        <div class="card">
            <h3>📝 Log Files Status</h3>
            ${logData.length === 0 ? 
                '<div class="empty-state">No log files found</div>' :
                logData.map(log => {
                    if (!log.exists) {
                        return `
                            <div class="file-item" style="border-left: 4px solid #ef4444;">
                                <div class="file-name">${log.file}</div>
                                <div style="color: #fca5a5;">File not found</div>
                            </div>
                        `;
                    }
                    
                    return `
                        <div class="file-item" style="border-left: 4px solid #10b981;">
                            <div class="file-name">${log.file}</div>
                            <div class="file-meta">
                                <span>${log.size} • ${log.lineCount.toLocaleString()} lines</span>
                                <span>${log.lastModified}</span>
                            </div>
                        </div>
                    `;
                }).join('')
            }
        </div>
        
        <!-- Recent File Changes -->
        <div class="card">
            <h3>📁 Recent Changes (1 hour)</h3>
            ${recentFiles.length === 0 ? 
                '<div class="empty-state">No recent file changes</div>' :
                recentFiles.slice(0, 10).map(file => `
                    <div class="file-item">
                        <div class="file-name">${file.name}</div>
                        <div class="file-meta">
                            <span>${file.size}</span>
                            <span>${file.modified}</span>
                        </div>
                    </div>
                `).join('')
            }
        </div>
    </div>
    
    <div style="text-align: center; margin-top: 40px; color: #64748b;">
        <p>📊 This monitor shows real data from your Neuro.Pilot.AI backend system</p>
        <p style="margin-top: 10px;">🔄 Refresh this page or regenerate to see updated information</p>
    </div>
</body>
</html>
    `;
    
    // Write to file
    const outputPath = path.join(__dirname, 'public', 'real_agent_monitor.html');
    await fs.writeFile(outputPath, html);
    
    console.log('✅ Real agent monitor generated successfully!');
    console.log(`📁 File saved to: ${outputPath}`);
    console.log(`🌐 Open in browser: file://${outputPath}`);
    console.log('');
    console.log('📊 Summary:');
    console.log(`   • Agent files found: ${agentData.filter(a => a.exists).length}/${agentData.length}`);
    console.log(`   • Recently modified: ${agentData.filter(a => a.recentlyModified).length}`);
    console.log(`   • Recent file changes: ${recentFiles.length}`);
    console.log(`   • Active log files: ${logData.filter(l => l.exists).length}`);
    
    return outputPath;
}

// Run if called directly
if (require.main === module) {
    generateRealMonitor().catch(console.error);
}

module.exports = generateRealMonitor;