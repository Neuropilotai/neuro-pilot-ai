const express = require("express");
const app = express();
const port = 3010;

app.use(express.json());
app.use(express.static("public"));

// Orchestrator Dashboard HTML
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 Master Orchestrator Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0a0e27 0%, #1a1f3a 50%, #2d3561 100%);
            color: #ffffff;
            min-height: 100vh;
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding: 20px;
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            backdrop-filter: blur(10px);
        }
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .orchestrator-status {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .status-item {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            border-radius: 10px;
            text-align: center;
        }
        .status-value {
            font-size: 2rem;
            font-weight: bold;
            color: #667eea;
        }
        .status-label {
            font-size: 0.9rem;
            color: #94a3b8;
            margin-top: 5px;
        }
        .agents-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .agent-card {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
            transition: transform 0.3s ease;
        }
        .agent-card:hover {
            transform: translateY(-5px);
        }
        .agent-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .agent-name {
            font-size: 1.2rem;
            font-weight: bold;
        }
        .agent-status {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .status-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        .status-available { background: #10b981; }
        .status-busy { background: #f59e0b; }
        .status-offline { background: #ef4444; }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        .capabilities {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin: 10px 0;
        }
        .capability-tag {
            background: rgba(102, 126, 234, 0.2);
            color: #667eea;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
        }
        .load-bar {
            background: rgba(0,0,0,0.3);
            height: 20px;
            border-radius: 10px;
            overflow: hidden;
            margin: 10px 0;
        }
        .load-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            transition: width 0.3s ease;
        }
        .performance-score {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
        }
        .task-assignment {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .task-form {
            display: grid;
            grid-template-columns: 1fr 1fr auto;
            gap: 15px;
            align-items: end;
        }
        select, input {
            padding: 10px;
            border: 1px solid rgba(255,255,255,0.3);
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: white;
            font-size: 1rem;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: transform 0.3s ease;
        }
        .btn:hover {
            transform: scale(1.05);
        }
        .task-queue {
            background: rgba(255,255,255,0.1);
            padding: 25px;
            border-radius: 15px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.2);
        }
        .task-item {
            background: rgba(0,0,0,0.3);
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .task-info {
            flex: 1;
        }
        .task-id {
            font-size: 0.8rem;
            color: #94a3b8;
        }
        .task-type {
            font-weight: bold;
            margin: 5px 0;
        }
        .task-status {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85rem;
            font-weight: bold;
        }
        .status-pending { background: #64748b; }
        .status-assigned { background: #3b82f6; }
        .status-executing { background: #f59e0b; }
        .status-completed { background: #10b981; }
        .status-failed { background: #ef4444; }
        .priority-high { color: #ef4444; }
        .priority-medium { color: #f59e0b; }
        .priority-low { color: #64748b; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🧠 Master Orchestrator Dashboard</h1>
        <p>Intelligent Task Assignment & Agent Management</p>
    </div>

    <div class="orchestrator-status">
        <h2>📊 Orchestrator Status</h2>
        <div class="status-grid" id="orchestratorStatus">
            <div class="status-item">
                <div class="status-value">-</div>
                <div class="status-label">Uptime</div>
            </div>
            <div class="status-item">
                <div class="status-value">-</div>
                <div class="status-label">Task Queue</div>
            </div>
            <div class="status-item">
                <div class="status-value">-</div>
                <div class="status-label">Active Tasks</div>
            </div>
            <div class="status-item">
                <div class="status-value">-</div>
                <div class="status-label">Total Agents</div>
            </div>
        </div>
    </div>

    <div class="task-assignment">
        <h2>🎯 Assign New Task</h2>
        <form class="task-form" onsubmit="assignTask(event)">
            <select id="taskType" required>
                <option value="">Select Task Type</option>
                <option value="process_order">Process Order</option>
                <option value="customer_inquiry">Customer Inquiry</option>
                <option value="generate_report">Generate Report</option>
                <option value="match_resume">Match Resume</option>
            </select>
            <select id="taskPriority" required>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="low">Low Priority</option>
            </select>
            <button type="submit" class="btn">🚀 Assign Task</button>
        </form>
    </div>

    <h2 style="margin-bottom: 20px;">🤖 Agent Status & Performance</h2>
    <div class="agents-grid" id="agentsGrid">
        <div style="text-align: center; color: #94a3b8;">Loading agents...</div>
    </div>

    <div class="task-queue">
        <h2>📋 Recent Tasks</h2>
        <div id="taskList">
            <div style="text-align: center; color: #94a3b8;">No tasks yet...</div>
        </div>
    </div>

    <script>
        let orchestratorData = null;
        let recentTasks = [];

        // Load orchestrator status
        async function loadStatus() {
            try {
                const response = await fetch('http://localhost:9000/api/orchestrator/status');
                orchestratorData = await response.json();
                updateDashboard();
            } catch (error) {
                console.error('Failed to load orchestrator status:', error);
            }
        }

        // Update dashboard display
        function updateDashboard() {
            if (!orchestratorData) return;

            // Update orchestrator status
            const status = orchestratorData.orchestrator;
            document.getElementById('orchestratorStatus').innerHTML = \`
                <div class="status-item">
                    <div class="status-value">\${formatUptime(status.uptime)}</div>
                    <div class="status-label">Uptime</div>
                </div>
                <div class="status-item">
                    <div class="status-value">\${status.taskQueue}</div>
                    <div class="status-label">Task Queue</div>
                </div>
                <div class="status-item">
                    <div class="status-value">\${status.activeTasks}</div>
                    <div class="status-label">Active Tasks</div>
                </div>
                <div class="status-item">
                    <div class="status-value">\${orchestratorData.agents.length}</div>
                    <div class="status-label">Total Agents</div>
                </div>
            \`;

            // Update agents grid
            const agentsHTML = orchestratorData.agents.map(agent => \`
                <div class="agent-card">
                    <div class="agent-header">
                        <div class="agent-name">\${agent.name}</div>
                        <div class="agent-status">
                            <span class="status-dot status-\${agent.status}"></span>
                            <span>\${agent.status.toUpperCase()}</span>
                        </div>
                    </div>
                    <div class="capabilities">
                        \${agent.capabilities.map(cap => 
                            \`<span class="capability-tag">\${cap}</span>\`
                        ).join('')}
                    </div>
                    <div class="load-bar">
                        <div class="load-fill" style="width: \${agent.loadPercentage}%"></div>
                    </div>
                    <div class="performance-score">
                        <span>Load: \${agent.currentLoad}/\${agent.maxConcurrent}</span>
                        <span>Performance: \${agent.performanceScore.toFixed(1)}/100</span>
                    </div>
                </div>
            \`).join('');

            document.getElementById('agentsGrid').innerHTML = agentsHTML;

            // Update task list
            updateTaskList();
        }

        // Update task list display
        function updateTaskList() {
            if (recentTasks.length === 0) {
                document.getElementById('taskList').innerHTML = 
                    '<div style="text-align: center; color: #94a3b8;">No tasks yet...</div>';
                return;
            }

            const tasksHTML = recentTasks.map(task => \`
                <div class="task-item">
                    <div class="task-info">
                        <div class="task-id">\${task.id}</div>
                        <div class="task-type">\${task.type.replace(/_/g, ' ').toUpperCase()}</div>
                        <div class="priority-\${task.priority}">Priority: \${task.priority}</div>
                    </div>
                    <div class="task-status status-\${task.status}">\${task.status}</div>
                </div>
            \`).join('');

            document.getElementById('taskList').innerHTML = tasksHTML;
        }

        // Assign new task
        async function assignTask(event) {
            event.preventDefault();
            
            const taskType = document.getElementById('taskType').value;
            const priority = document.getElementById('taskPriority').value;

            try {
                const response = await fetch('http://localhost:9000/api/orchestrator/assign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: taskType,
                        data: { source: 'dashboard', timestamp: new Date() },
                        priority: priority
                    })
                });

                const result = await response.json();
                
                if (result.success) {
                    // Add to recent tasks
                    recentTasks.unshift({
                        id: result.taskId,
                        type: taskType,
                        priority: priority,
                        status: 'pending'
                    });
                    
                    if (recentTasks.length > 10) recentTasks.pop();
                    
                    updateTaskList();
                    
                    // Clear form
                    document.getElementById('taskType').value = '';
                    
                    // Refresh status
                    setTimeout(loadStatus, 1000);
                }
            } catch (error) {
                console.error('Failed to assign task:', error);
            }
        }

        // Format uptime
        function formatUptime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return \`\${hours}h \${minutes}m\`;
        }

        // Auto-refresh
        setInterval(loadStatus, 5000);
        
        // Initial load
        loadStatus();
    </script>
</body>
</html>
    `);
});

app.listen(port, () => {
  console.log(`🧠 Orchestrator Dashboard running on port ${port}`);
  console.log(`📊 Dashboard URL: http://localhost:${port}`);
});
