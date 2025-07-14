const EventEmitter = require('events');
const { io } = require('socket.io-client');

class AgentMonitorIntegration extends EventEmitter {
    constructor(agentId, agentName, capabilities, monitorUrl = 'http://localhost:3009') {
        super();
        this.agentId = agentId;
        this.agentName = agentName;
        this.capabilities = capabilities;
        this.monitorUrl = monitorUrl;
        this.socket = null;
        this.requiresApproval = [];
        this.status = 'idle';
        this.currentWork = null;
        
        this.connect();
    }
    
    connect() {
        this.socket = io(this.monitorUrl, {
            auth: {
                agentId: this.agentId,
                agentName: this.agentName
            }
        });
        
        this.socket.on('connect', () => {
            console.log(`📡 ${this.agentName} connected to monitor`);
            this.registerAgent();
        });
        
        this.socket.on('agent_command', (data) => {
            if (data.agentId === this.agentId) {
                this.handleCommand(data.command, data.parameters);
            }
        });
        
        this.socket.on('disconnect', () => {
            console.log(`📡 ${this.agentName} disconnected from monitor`);
        });
    }
    
    registerAgent() {
        this.socket.emit('register_agent', {
            id: this.agentId,
            name: this.agentName,
            capabilities: this.capabilities,
            requiresApproval: this.requiresApproval,
            status: this.status
        });
    }
    
    updateStatus(status, currentWork = null) {
        this.status = status;
        this.currentWork = currentWork;
        
        if (this.socket && this.socket.connected) {
            this.socket.emit('agent_status_update', {
                agentId: this.agentId,
                status,
                currentWork
            });
        }
    }
    
    async submitWork(workType, description, data, requiresApproval = false) {
        const work = {
            type: workType,
            description,
            data,
            requiresApproval
        };
        
        this.updateStatus('working', work);
        
        if (requiresApproval || this.requiresApproval.includes(workType)) {
            return new Promise((resolve, reject) => {
                this.socket.emit('submit_work_for_approval', {
                    agentId: this.agentId,
                    work
                }, (response) => {
                    if (response.approved) {
                        this.updateStatus('idle');
                        resolve(response);
                    } else {
                        this.updateStatus('idle');
                        reject(new Error(`Work rejected: ${response.feedback || 'No feedback provided'}`));
                    }
                });
            });
        } else {
            // Auto-execute if no approval needed
            this.socket.emit('work_completed', {
                agentId: this.agentId,
                work
            });
            this.updateStatus('idle');
            return { approved: true, auto: true };
        }
    }
    
    updateMetrics(metrics) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('agent_metrics_update', {
                agentId: this.agentId,
                metrics
            });
        }
    }
    
    handleCommand(command, parameters) {
        console.log(`📥 ${this.agentName} received command: ${command}`, parameters);
        
        switch (command) {
            case 'pause':
                this.emit('pause');
                this.updateStatus('paused');
                break;
                
            case 'resume':
                this.emit('resume');
                this.updateStatus('idle');
                break;
                
            case 'execute_task':
                this.emit('task', parameters);
                break;
                
            case 'update_config':
                this.emit('config_update', parameters);
                break;
                
            default:
                this.emit('custom_command', { command, parameters });
        }
    }
    
    reportError(error) {
        if (this.socket && this.socket.connected) {
            this.socket.emit('agent_error', {
                agentId: this.agentId,
                error: error.message,
                stack: error.stack
            });
        }
        this.updateStatus('error');
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

module.exports = AgentMonitorIntegration;