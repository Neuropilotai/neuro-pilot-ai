# Super Agent Monitor

A real-time monitoring and control system for all AI agents in the Neuro.Pilot.AI ecosystem.

## Features

### 🎯 Real-Time Agent Monitoring
- Live status updates for all connected agents
- Visual indicators for agent states (idle, working, paused, offline, error)
- Current work tracking with detailed task information
- Performance metrics display

### ✅ Work Approval System
- Approve or reject agent work before execution
- Add feedback to approvals
- Configurable approval requirements per agent capability
- Visual queue of pending approvals with notifications

### 📊 Comprehensive Dashboard
- Beautiful dark-themed UI with glassmorphism effects
- Real-time statistics (total agents, active agents, pending approvals, tasks completed)
- Work history tracking with status indicators
- Agent metrics and performance data

### 🎮 Agent Control
- Pause/resume agents on demand
- Assign tasks to specific agents
- Send custom commands to agents
- Monitor agent errors and issues

## Quick Start

1. **Start the Super Agent Monitor:**
   ```bash
   cd backend
   node start_super_monitor.js
   ```

2. **Access the Dashboard:**
   Open your browser to http://localhost:3009

3. **The dashboard will show:**
   - All registered agents and their current status
   - Pending work items that need approval
   - Real-time updates as agents work
   - Complete work history

## Integration Guide

### For New Agents

1. **Install the integration module:**
   ```javascript
   const AgentMonitorIntegration = require('./agent_monitor_integration');
   ```

2. **Initialize in your agent:**
   ```javascript
   class YourAgent {
       constructor() {
           this.monitor = new AgentMonitorIntegration(
               'your_agent_id',
               'Your Agent Name',
               ['capability1', 'capability2', 'capability3']
           );
           
           // Specify which capabilities require approval
           this.monitor.requiresApproval = ['capability2'];
       }
   }
   ```

3. **Update status as you work:**
   ```javascript
   // When starting work
   this.monitor.updateStatus('working', {
       type: 'task_type',
       description: 'What the agent is doing'
   });
   
   // When idle
   this.monitor.updateStatus('idle');
   ```

4. **Submit work for approval:**
   ```javascript
   try {
       const approval = await this.monitor.submitWork(
           'content_creation',
           'Created marketing blog post',
           { content: blogPostData },
           true // requires approval
       );
       
       if (approval.approved) {
           // Execute the approved work
           console.log('Work approved!', approval.feedback);
       }
   } catch (error) {
       console.log('Work rejected:', error.message);
   }
   ```

5. **Update metrics:**
   ```javascript
   this.monitor.updateMetrics({
       tasksCompleted: 42,
       successRate: 98.5,
       avgResponseTime: 1200
   });
   ```

## Architecture

### Components

1. **SuperAgentMonitor** (`super_agent_monitor.js`)
   - Main server that hosts the dashboard
   - Manages agent connections via Socket.io
   - Handles approval workflow
   - Maintains work history

2. **AgentMonitorIntegration** (`agent_monitor_integration.js`)
   - Client library for agents
   - Handles Socket.io connection to monitor
   - Provides simple API for status updates and work submission

3. **Dashboard UI** (embedded in monitor)
   - Real-time web interface
   - Socket.io client for live updates
   - Responsive design for desktop and mobile

### Communication Flow

```
Agent → AgentMonitorIntegration → Socket.io → SuperAgentMonitor → Dashboard UI
                                      ↑                               ↓
                                      └─────── User Approvals ────────┘
```

## Approval Workflow

1. Agent submits work that requires approval
2. Work appears in dashboard's "Pending Approvals" section
3. User reviews the work details and data
4. User can approve or reject with optional feedback
5. Agent receives response and proceeds accordingly
6. Work is logged in history with final status

## Configuration

### Agent Capabilities
Define what each agent can do in the agent definitions:
```javascript
capabilities: ['lead_generation', 'content_creation', 'email_campaigns']
```

### Approval Requirements
Specify which capabilities need approval:
```javascript
requiresApproval: ['content_creation', 'email_campaigns']
```

### Port Configuration
Set the monitor port via environment variable:
```bash
AGENT_MONITOR_PORT=3009 node start_super_monitor.js
```

## Example Agents

See `agents/monitored_agent_example.js` for a complete example of:
- Agent initialization with monitor
- Handling pause/resume commands
- Submitting work for approval
- Updating metrics
- Error handling

## Troubleshooting

### Agent Not Showing in Dashboard
- Ensure the agent is connecting to the correct monitor URL
- Check that the agent is calling `registerAgent()` after connection
- Verify no firewall is blocking port 3009

### Approvals Not Working
- Make sure the work type is in the agent's `requiresApproval` array
- Check browser console for any JavaScript errors
- Ensure Socket.io connection is established

### Real-time Updates Not Working
- Verify WebSocket connection in browser dev tools
- Check for any proxy or network issues
- Ensure all Socket.io events are properly emitted

## Future Enhancements

- [ ] Agent performance analytics and graphs
- [ ] Bulk approval actions
- [ ] Agent scheduling and automation rules
- [ ] Integration with existing business systems
- [ ] Mobile app for on-the-go monitoring
- [ ] Alert system for critical agent events
- [ ] Agent collaboration workflows
- [ ] Machine learning for auto-approval patterns