const express = require('express');
const app = express();
const port = 3008;

app.use(express.json());

// Test API endpoint
app.get('/api/test', (req, res) => {
    res.json({ message: 'Working!', data: [1,2,3] });
});

// Simple dashboard page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Simple Test Dashboard</title>
    <style>
        body { font-family: Arial; padding: 20px; background: #1e293b; color: white; }
        .card { background: #334155; padding: 20px; margin: 10px; border-radius: 10px; }
        .loading { color: #fbbf24; }
        .success { color: #10b981; }
        .error { color: #ef4444; }
    </style>
</head>
<body>
    <h1>🧪 Simple Test Dashboard</h1>
    <div class="card">
        <h3>API Test</h3>
        <div id="apiResult" class="loading">Loading...</div>
    </div>
    
    <div class="card">
        <h3>🤖 AI Task Assistant Test</h3>
        <textarea id="taskInput" placeholder="Enter test task">Add analytics dashboard</textarea>
        <button onclick="testAI()">Execute Task</button>
        <div id="aiResult"></div>
    </div>

    <script>
        // Test API loading
        document.addEventListener('DOMContentLoaded', async function() {
            console.log('🚀 Simple dashboard loading...');
            
            try {
                const response = await fetch('/api/test');
                const data = await response.json();
                document.getElementById('apiResult').innerHTML = 
                    '<span class="success">✅ API Working: ' + JSON.stringify(data) + '</span>';
                console.log('✅ API test successful');
            } catch (error) {
                document.getElementById('apiResult').innerHTML = 
                    '<span class="error">❌ API Error: ' + error.message + '</span>';
                console.error('❌ API test failed:', error);
            }
        });
        
        async function testAI() {
            const task = document.getElementById('taskInput').value;
            const result = document.getElementById('aiResult');
            
            result.innerHTML = '<span class="loading">Processing...</span>';
            
            try {
                const response = await fetch('http://localhost:3007/api/ai-assistant/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task, priority: 'high' })
                });
                
                const data = await response.json();
                result.innerHTML = '<span class="success">✅ AI Response: ' + JSON.stringify(data, null, 2) + '</span>';
            } catch (error) {
                result.innerHTML = '<span class="error">❌ AI Error: ' + error.message + '</span>';
            }
        }
    </script>
</body>
</html>
    `);
});

app.listen(port, () => {
    console.log(`🧪 Simple test dashboard: http://localhost:${port}`);
});