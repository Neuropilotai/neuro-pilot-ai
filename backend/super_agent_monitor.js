require("dotenv").config();
const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require("fs").promises;
const path = require("path");
const EventEmitter = require("events");

class SuperAgentMonitor extends EventEmitter {
  constructor(existingIO = null) {
    super();

    if (existingIO) {
      // Use existing Socket.io instance
      this.io = existingIO;
      this.setupSocketHandlers();
    } else {
      // Create new server (for standalone mode)
      this.app = express();
      this.server = createServer(this.app);
      this.io = new Server(this.server, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
        },
      });
      this.port = process.env.AGENT_MONITOR_PORT || 3010;
      this.setupMiddleware();
      this.setupRoutes();
      this.setupSocketHandlers();
    }

    // Agent state management
    this.agents = new Map();
    this.pendingApprovals = new Map();
    this.workHistory = [];
    this.approvalCallbacks = new Map();

    // Initialize agent definitions
    this.agentDefinitions = {
      sales_marketing: {
        id: "sales_marketing",
        name: "Sales & Marketing Agent",
        description:
          "Handles lead generation, content creation, and social media",
        capabilities: [
          "lead_generation",
          "content_creation",
          "social_media",
          "email_campaigns",
        ],
        requiresApproval: ["content_creation", "email_campaigns"],
        status: "idle",
        currentWork: null,
        metrics: {
          tasksCompleted: 0,
          successRate: 100,
          avgResponseTime: 0,
        },
      },
      product_generator: {
        id: "product_generator",
        name: "Product Generator Agent",
        description: "Creates and manages product listings",
        capabilities: [
          "product_creation",
          "pricing_strategy",
          "inventory_management",
        ],
        requiresApproval: ["product_creation", "pricing_strategy"],
        status: "idle",
        currentWork: null,
        metrics: {
          productsCreated: 0,
          avgCreationTime: 0,
          qualityScore: 95,
        },
      },
      billing_order: {
        id: "billing_order",
        name: "Billing & Order Agent",
        description: "Processes orders, payments, and invoices",
        capabilities: [
          "order_processing",
          "payment_handling",
          "invoice_generation",
          "refund_processing",
        ],
        requiresApproval: ["refund_processing"],
        status: "idle",
        currentWork: null,
        metrics: {
          ordersProcessed: 0,
          paymentSuccess: 100,
          avgProcessingTime: 0,
        },
      },
      compliance_moderation: {
        id: "compliance_moderation",
        name: "Compliance & Moderation Agent",
        description:
          "Ensures content compliance and moderates user submissions",
        capabilities: [
          "content_moderation",
          "compliance_check",
          "policy_enforcement",
        ],
        requiresApproval: ["policy_enforcement"],
        status: "idle",
        currentWork: null,
        metrics: {
          itemsReviewed: 0,
          violationsDetected: 0,
          accuracy: 98,
        },
      },
      customer_service: {
        id: "customer_service",
        name: "Customer Service Agent",
        description: "Handles customer inquiries and support tickets",
        capabilities: [
          "ticket_handling",
          "auto_response",
          "escalation",
          "sentiment_analysis",
        ],
        requiresApproval: ["escalation"],
        status: "idle",
        currentWork: null,
        metrics: {
          ticketsResolved: 0,
          satisfactionScore: 85,
          avgResponseTime: 0,
        },
      },
      trading: {
        id: "trading",
        name: "Trading Agent",
        description: "Analyzes markets and executes trades",
        capabilities: [
          "market_analysis",
          "trade_execution",
          "risk_management",
          "portfolio_optimization",
        ],
        requiresApproval: ["trade_execution"],
        status: "idle",
        currentWork: null,
        metrics: {
          tradesExecuted: 0,
          winRate: 0,
          portfolioValue: 100000,
        },
      },
    };

    // Initialize agents after all setup is complete
    this.initializeAgents();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static("public"));
  }

  setupRoutes() {
    // Serve the super monitor dashboard
    this.app.get("/", (req, res) => {
      res.send(this.getMonitorHTML());
    });

    // API endpoints
    this.app.get("/api/agents", (req, res) => {
      const agentList = Array.from(this.agents.values());
      res.json(agentList);
    });

    this.app.get("/api/pending-approvals", (req, res) => {
      const approvals = Array.from(this.pendingApprovals.values());
      res.json(approvals);
    });

    this.app.get("/api/work-history", (req, res) => {
      res.json(this.workHistory.slice(-100)); // Last 100 items
    });

    this.app.post("/api/approve/:approvalId", (req, res) => {
      const { approvalId } = req.params;
      const { approved, feedback } = req.body;

      this.handleApproval(approvalId, approved, feedback);
      res.json({ success: true });
    });

    this.app.post("/api/agent/:agentId/command", (req, res) => {
      const { agentId } = req.params;
      const { command, parameters } = req.body;

      this.sendAgentCommand(agentId, command, parameters);
      res.json({ success: true });
    });
  }

  setupSocketHandlers() {
    this.io.on("connection", (socket) => {
      const agentId = socket.handshake.auth?.agentId;

      if (agentId) {
        // This is an agent connection
        console.log(`🤖 Agent connected: ${socket.handshake.auth.agentName}`);
        this.handleAgentConnection(socket, agentId);
      } else {
        // This is a dashboard client connection
        console.log("📱 Dashboard client connected");
        this.handleDashboardConnection(socket);
      }
    });
  }

  handleAgentConnection(socket, agentId) {
    // Handle agent registration
    socket.on("register_agent", (agentData) => {
      console.log(`📝 Registering agent: ${agentData.name}`);

      // Update or add agent
      const agent = this.agents.get(agentId) || {
        ...this.agentDefinitions[agentId],
      };
      Object.assign(agent, agentData, {
        status: "online",
        lastSeen: new Date(),
        socketId: socket.id,
      });

      this.agents.set(agentId, agent);
      this.broadcastAgentUpdate(agentId);
    });

    // Handle agent status updates
    socket.on("agent_status_update", (data) => {
      this.updateAgentStatus(data.agentId, data.status, data.currentWork);
    });

    // Handle work submission for approval
    socket.on("submit_work_for_approval", async (data, callback) => {
      try {
        const approval = await this.submitWork(data.agentId, data.work);
        callback(approval);
      } catch (error) {
        callback({ approved: false, error: error.message });
      }
    });

    // Handle work completion (no approval needed)
    socket.on("work_completed", (data) => {
      const workItem = {
        id: `WORK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        agentId: data.agentId,
        agentName: this.agents.get(data.agentId)?.name || "Unknown",
        ...data.work,
        timestamp: new Date(),
        status: "executed",
        requiresApproval: false,
      };

      this.executeWork(workItem);
    });

    // Handle metrics updates
    socket.on("agent_metrics_update", (data) => {
      const agent = this.agents.get(data.agentId);
      if (agent) {
        Object.assign(agent.metrics, data.metrics);
        this.broadcastAgentUpdate(data.agentId);
      }
    });

    // Handle agent errors
    socket.on("agent_error", (data) => {
      console.error(`❌ Agent error from ${data.agentId}:`, data.error);
      this.updateAgentStatus(data.agentId, "error", {
        error: data.error,
        timestamp: new Date(),
      });
    });

    // Handle agent disconnect
    socket.on("disconnect", () => {
      const agent = this.agents.get(agentId);
      if (agent) {
        agent.status = "offline";
        agent.socketId = null;
        this.broadcastAgentUpdate(agentId);
      }
      console.log(`🤖 Agent disconnected: ${agentId}`);
    });
  }

  handleDashboardConnection(socket) {
    // Send initial state
    socket.emit("initial_state", {
      agents: Array.from(this.agents.values()),
      pendingApprovals: Array.from(this.pendingApprovals.values()),
      workHistory: this.workHistory.slice(-50),
    });

    // Handle real-time commands
    socket.on("approve_work", (data) => {
      this.handleApproval(data.approvalId, data.approved, data.feedback);
    });

    socket.on("pause_agent", (agentId) => {
      this.pauseAgent(agentId);
    });

    socket.on("resume_agent", (agentId) => {
      this.resumeAgent(agentId);
    });

    socket.on("assign_task", (data) => {
      this.assignTask(data.agentId, data.task);
    });

    socket.on("disconnect", () => {
      console.log("📱 Dashboard client disconnected");
    });
  }

  initializeAgents() {
    // Initialize all agents from definitions
    for (const [id, definition] of Object.entries(this.agentDefinitions)) {
      this.agents.set(id, { ...definition });
    }

    // Start agent simulation (replace with real agent connections)
    this.startAgentSimulation();
  }

  // Agent work submission that requires approval
  submitWork(agentId, work) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const workItem = {
      id: `WORK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      agentId,
      agentName: agent.name,
      type: work.type,
      description: work.description,
      data: work.data,
      timestamp: new Date(),
      requiresApproval: agent.requiresApproval.includes(work.type),
    };

    if (workItem.requiresApproval) {
      // Add to pending approvals
      this.pendingApprovals.set(workItem.id, {
        ...workItem,
        status: "pending",
      });

      // Notify dashboard
      this.io.emit("new_approval_required", workItem);

      // Return promise that resolves when approved/rejected
      return new Promise((resolve, reject) => {
        this.approvalCallbacks.set(workItem.id, { resolve, reject });
      });
    } else {
      // Auto-approve work that doesn't require approval
      this.executeWork(workItem);
      return Promise.resolve({ approved: true, auto: true });
    }
  }

  handleApproval(approvalId, approved, feedback) {
    const approval = this.pendingApprovals.get(approvalId);
    if (!approval) return;

    approval.status = approved ? "approved" : "rejected";
    approval.feedback = feedback;
    approval.reviewedAt = new Date();

    // Remove from pending
    this.pendingApprovals.delete(approvalId);

    // Add to history
    this.workHistory.push(approval);

    // Execute callback
    const callback = this.approvalCallbacks.get(approvalId);
    if (callback) {
      if (approved) {
        this.executeWork(approval);
        callback.resolve({ approved: true, feedback });
      } else {
        callback.reject({ approved: false, feedback });
      }
      this.approvalCallbacks.delete(approvalId);
    }

    // Update agent status
    const agent = this.agents.get(approval.agentId);
    if (agent) {
      agent.status = "idle";
      agent.currentWork = null;
    }

    // Notify dashboard
    this.io.emit("approval_processed", {
      approvalId,
      approved,
      feedback,
    });

    this.broadcastAgentUpdate(approval.agentId);
  }

  executeWork(workItem) {
    console.log(`✅ Executing approved work: ${workItem.id}`);

    // Add to history
    this.workHistory.push({
      ...workItem,
      executedAt: new Date(),
      status: "executed",
    });

    // Update agent metrics
    const agent = this.agents.get(workItem.agentId);
    if (agent) {
      if (workItem.type === "content_creation") {
        agent.metrics.tasksCompleted++;
      } else if (workItem.type === "product_creation") {
        agent.metrics.productsCreated++;
      } else if (workItem.type === "order_processing") {
        agent.metrics.ordersProcessed++;
      }
    }

    // Emit work executed event
    this.emit("work_executed", workItem);
  }

  updateAgentStatus(agentId, status, currentWork = null) {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.status = status;
    agent.currentWork = currentWork;
    agent.lastUpdate = new Date();

    this.broadcastAgentUpdate(agentId);
  }

  broadcastAgentUpdate(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.io.emit("agent_update", agent);
    }
  }

  pauseAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent && agent.status !== "offline") {
      agent.status = "paused";
      this.broadcastAgentUpdate(agentId);
      console.log(`⏸️ Agent paused: ${agent.name}`);
    }
  }

  resumeAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === "paused") {
      agent.status = "idle";
      this.broadcastAgentUpdate(agentId);
      console.log(`▶️ Agent resumed: ${agent.name}`);
    }
  }

  assignTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status !== "idle") {
      console.log(`❌ Cannot assign task to agent ${agentId}`);
      return;
    }

    agent.status = "working";
    agent.currentWork = {
      taskId: `TASK_${Date.now()}`,
      description: task.description,
      startTime: new Date(),
    };

    this.broadcastAgentUpdate(agentId);

    // Simulate task execution
    setTimeout(() => {
      this.submitWork(agentId, {
        type: task.type || "general_task",
        description: task.description,
        data: { result: "Task completed successfully" },
      });
    }, 5000);
  }

  // Simulate agent activity (replace with real agent connections)
  startAgentSimulation() {
    setInterval(() => {
      // Randomly update agent states
      for (const [agentId, agent] of this.agents) {
        if (agent.status === "idle" && Math.random() < 0.1) {
          // Simulate agent starting work
          const workTypes = agent.capabilities;
          const workType =
            workTypes[Math.floor(Math.random() * workTypes.length)];

          this.updateAgentStatus(agentId, "working", {
            type: workType,
            description: `Processing ${workType}`,
            startTime: new Date(),
          });

          // Submit work after delay
          setTimeout(
            () => {
              this.submitWork(agentId, {
                type: workType,
                description: `Completed ${workType}`,
                data: {
                  result: `${workType} completed successfully`,
                  details: `Sample output from ${agent.name}`,
                },
              });
            },
            Math.random() * 10000 + 5000,
          );
        }
      }
    }, 5000);
  }

  sendAgentCommand(agentId, command, parameters) {
    console.log(
      `📤 Sending command to agent ${agentId}: ${command}`,
      parameters,
    );

    // Emit command to connected agent (if using real agent connections)
    this.emit("agent_command", {
      agentId,
      command,
      parameters,
    });

    // Update UI
    this.io.emit("command_sent", {
      agentId,
      command,
      parameters,
      timestamp: new Date(),
    });
  }

  getMonitorHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Super Agent Monitor - Neuro.Pilot.AI</title>
    <script src="/socket.io/socket.io.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0e27;
            color: #ffffff;
            min-height: 100vh;
            overflow-x: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            padding: 20px;
            box-shadow: 0 2px 20px rgba(0,0,0,0.3);
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .header h1 {
            font-size: 2rem;
            margin-bottom: 5px;
        }
        
        .header p {
            color: #b8c5d6;
            font-size: 1.1rem;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            text-align: center;
            backdrop-filter: blur(10px);
        }
        
        .stat-card h3 {
            color: #64b5f6;
            font-size: 2.5rem;
            margin-bottom: 5px;
        }
        
        .stat-card p {
            color: #b8c5d6;
            font-size: 0.9rem;
        }
        
        .main-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .agents-section, .approvals-section {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        
        .section-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .section-header h2 {
            font-size: 1.5rem;
            color: #ffffff;
        }
        
        .agent-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 15px;
        }
        
        .agent-card {
            background: rgba(255,255,255,0.03);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 20px;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .agent-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
        }
        
        .agent-header {
            display: flex;
            justify-content: space-between;
            align-items: start;
            margin-bottom: 15px;
        }
        
        .agent-name {
            font-size: 1.2rem;
            font-weight: 600;
            color: #ffffff;
        }
        
        .agent-status {
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .status-idle { background: #2d3748; color: #a0aec0; }
        .status-working { background: #2b6cb0; color: #90cdf4; }
        .status-paused { background: #975a16; color: #fbd38d; }
        .status-offline { background: #742a2a; color: #fc8181; }
        .status-error { background: #e53e3e; color: #ffffff; }
        
        .agent-description {
            color: #a0aec0;
            font-size: 0.9rem;
            margin-bottom: 15px;
            line-height: 1.4;
        }
        
        .agent-metrics {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-bottom: 15px;
        }
        
        .metric {
            background: rgba(255,255,255,0.03);
            padding: 8px;
            border-radius: 8px;
            text-align: center;
        }
        
        .metric-value {
            font-size: 1.2rem;
            font-weight: 600;
            color: #64b5f6;
        }
        
        .metric-label {
            font-size: 0.75rem;
            color: #a0aec0;
            text-transform: uppercase;
        }
        
        .agent-work {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 15px;
        }
        
        .work-type {
            font-size: 0.9rem;
            color: #93bbfc;
            font-weight: 500;
        }
        
        .work-description {
            font-size: 0.85rem;
            color: #cbd5e0;
            margin-top: 5px;
        }
        
        .agent-actions {
            display: flex;
            gap: 10px;
        }
        
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            flex: 1;
        }
        
        .btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        
        .btn-primary {
            background: #3b82f6;
            color: white;
        }
        
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: #e2e8f0;
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .btn-success {
            background: #10b981;
            color: white;
        }
        
        .btn-danger {
            background: #ef4444;
            color: white;
        }
        
        .approval-card {
            background: rgba(59, 130, 246, 0.1);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 15px;
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { border-color: rgba(59, 130, 246, 0.3); }
            50% { border-color: rgba(59, 130, 246, 0.6); }
            100% { border-color: rgba(59, 130, 246, 0.3); }
        }
        
        .approval-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .approval-agent {
            font-weight: 600;
            color: #93bbfc;
        }
        
        .approval-type {
            font-size: 0.85rem;
            color: #64b5f6;
            background: rgba(59, 130, 246, 0.2);
            padding: 2px 8px;
            border-radius: 12px;
        }
        
        .approval-description {
            color: #e2e8f0;
            margin-bottom: 10px;
            font-size: 0.95rem;
        }
        
        .approval-data {
            background: rgba(0,0,0,0.3);
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 15px;
            font-family: 'Courier New', monospace;
            font-size: 0.85rem;
            color: #a0aec0;
            max-height: 150px;
            overflow-y: auto;
        }
        
        .approval-actions {
            display: flex;
            gap: 10px;
        }
        
        .feedback-input {
            width: 100%;
            padding: 8px;
            margin-bottom: 10px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            color: white;
            font-size: 0.9rem;
        }
        
        .feedback-input::placeholder {
            color: #64748b;
        }
        
        .history-section {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 15px;
            padding: 20px;
            margin-top: 20px;
        }
        
        .history-item {
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .history-info {
            flex: 1;
        }
        
        .history-agent {
            font-weight: 500;
            color: #64b5f6;
        }
        
        .history-action {
            font-size: 0.9rem;
            color: #a0aec0;
        }
        
        .history-time {
            font-size: 0.8rem;
            color: #64748b;
        }
        
        .history-status {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 500;
        }
        
        .status-approved { background: #065f46; color: #6ee7b7; }
        .status-rejected { background: #7f1d1d; color: #fca5a5; }
        .status-executed { background: #1e3a8a; color: #93c5fd; }
        
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #64748b;
        }
        
        .empty-state svg {
            width: 64px;
            height: 64px;
            margin-bottom: 16px;
            opacity: 0.5;
        }
        
        .notification {
            position: fixed;
            top: 20px;
            right: 20px;
            background: #1e3a8a;
            color: white;
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.4);
            display: none;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }
        
        .modal-content {
            background: #1a1f36;
            border-radius: 16px;
            padding: 30px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }
        
        .modal-header {
            font-size: 1.5rem;
            margin-bottom: 20px;
            color: #ffffff;
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        .form-label {
            display: block;
            margin-bottom: 8px;
            color: #a0aec0;
            font-size: 0.9rem;
        }
        
        .form-input, .form-select, .form-textarea {
            width: 100%;
            padding: 10px;
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 8px;
            color: white;
            font-size: 1rem;
        }
        
        .form-textarea {
            min-height: 100px;
            resize: vertical;
        }
        
        .modal-actions {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        @media (max-width: 768px) {
            .main-grid {
                grid-template-columns: 1fr;
            }
            
            .agent-grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="container">
            <h1>🚀 Super Agent Monitor</h1>
            <p>Real-time monitoring and control of all AI agents</p>
        </div>
    </div>
    
    <div class="container">
        <!-- Stats Overview -->
        <div class="stats-grid">
            <div class="stat-card">
                <h3 id="totalAgents">0</h3>
                <p>Total Agents</p>
            </div>
            <div class="stat-card">
                <h3 id="activeAgents">0</h3>
                <p>Active Agents</p>
            </div>
            <div class="stat-card">
                <h3 id="pendingApprovals">0</h3>
                <p>Pending Approvals</p>
            </div>
            <div class="stat-card">
                <h3 id="tasksCompleted">0</h3>
                <p>Tasks Completed</p>
            </div>
        </div>
        
        <!-- Main Content Grid -->
        <div class="main-grid">
            <!-- Agents Section -->
            <div class="agents-section">
                <div class="section-header">
                    <h2>AI Agents</h2>
                    <button class="btn btn-primary" onclick="showTaskModal()">
                        + Assign Task
                    </button>
                </div>
                <div class="agent-grid" id="agentGrid">
                    <!-- Agent cards will be dynamically inserted here -->
                </div>
            </div>
            
            <!-- Approvals Section -->
            <div class="approvals-section">
                <div class="section-header">
                    <h2>Pending Approvals</h2>
                    <span id="approvalCount" style="color: #64b5f6;">0</span>
                </div>
                <div id="approvalsList">
                    <div class="empty-state">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p>No pending approvals</p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- History Section -->
        <div class="history-section">
            <div class="section-header">
                <h2>Work History</h2>
                <button class="btn btn-secondary" onclick="clearHistory()">
                    Clear History
                </button>
            </div>
            <div id="historyList">
                <!-- History items will be dynamically inserted here -->
            </div>
        </div>
    </div>
    
    <!-- Task Assignment Modal -->
    <div id="taskModal" class="modal">
        <div class="modal-content">
            <h2 class="modal-header">Assign New Task</h2>
            <form id="taskForm">
                <div class="form-group">
                    <label class="form-label">Select Agent</label>
                    <select class="form-select" id="taskAgent" required>
                        <option value="">Choose an agent...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Task Type</label>
                    <select class="form-select" id="taskType" required>
                        <option value="">Select task type...</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Task Description</label>
                    <textarea class="form-textarea" id="taskDescription" placeholder="Describe the task..." required></textarea>
                </div>
                <div class="modal-actions">
                    <button type="submit" class="btn btn-primary">Assign Task</button>
                    <button type="button" class="btn btn-secondary" onclick="hideTaskModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>
    
    <!-- Notification -->
    <div id="notification" class="notification"></div>
    
    <script>
        const socket = io();
        let agents = new Map();
        let approvals = new Map();
        let history = [];
        
        // Socket event handlers
        socket.on('initial_state', (data) => {
            // Update agents
            agents.clear();
            data.agents.forEach(agent => {
                agents.set(agent.id, agent);
            });
            
            // Update approvals
            approvals.clear();
            data.pendingApprovals.forEach(approval => {
                approvals.set(approval.id, approval);
            });
            
            // Update history
            history = data.workHistory;
            
            // Render UI
            updateUI();
        });
        
        socket.on('agent_update', (agent) => {
            agents.set(agent.id, agent);
            updateAgentCard(agent);
            updateStats();
        });
        
        socket.on('new_approval_required', (approval) => {
            approvals.set(approval.id, approval);
            updateApprovalsList();
            updateStats();
            showNotification(\`New approval required from \${approval.agentName}\`);
        });
        
        socket.on('approval_processed', (data) => {
            approvals.delete(data.approvalId);
            updateApprovalsList();
            updateStats();
        });
        
        socket.on('command_sent', (data) => {
            showNotification(\`Command sent to \${data.agentId}: \${data.command}\`);
        });
        
        // UI Update Functions
        function updateUI() {
            updateAgentGrid();
            updateApprovalsList();
            updateHistoryList();
            updateStats();
        }
        
        function updateStats() {
            document.getElementById('totalAgents').textContent = agents.size;
            document.getElementById('activeAgents').textContent = 
                Array.from(agents.values()).filter(a => a.status === 'working').length;
            document.getElementById('pendingApprovals').textContent = approvals.size;
            document.getElementById('approvalCount').textContent = approvals.size;
            
            const totalCompleted = Array.from(agents.values())
                .reduce((sum, agent) => sum + (agent.metrics?.tasksCompleted || 0), 0);
            document.getElementById('tasksCompleted').textContent = totalCompleted;
        }
        
        function updateAgentGrid() {
            const grid = document.getElementById('agentGrid');
            grid.innerHTML = '';
            
            agents.forEach(agent => {
                grid.appendChild(createAgentCard(agent));
            });
        }
        
        function createAgentCard(agent) {
            const card = document.createElement('div');
            card.className = 'agent-card';
            card.id = \`agent-\${agent.id}\`;
            
            const metricsHtml = Object.entries(agent.metrics || {})
                .slice(0, 4)
                .map(([key, value]) => \`
                    <div class="metric">
                        <div class="metric-value">\${value}</div>
                        <div class="metric-label">\${formatMetricLabel(key)}</div>
                    </div>
                \`).join('');
            
            const workHtml = agent.currentWork ? \`
                <div class="agent-work">
                    <div class="work-type">\${agent.currentWork.type || 'Task'}</div>
                    <div class="work-description">\${agent.currentWork.description}</div>
                </div>
            \` : '';
            
            card.innerHTML = \`
                <div class="agent-header">
                    <div class="agent-name">\${agent.name}</div>
                    <div class="agent-status status-\${agent.status}">\${agent.status}</div>
                </div>
                <div class="agent-description">\${agent.description}</div>
                \${workHtml}
                <div class="agent-metrics">\${metricsHtml}</div>
                <div class="agent-actions">
                    \${agent.status === 'paused' ? 
                        \`<button class="btn btn-success" onclick="resumeAgent('\${agent.id}')">Resume</button>\` :
                        \`<button class="btn btn-secondary" onclick="pauseAgent('\${agent.id}')">Pause</button>\`
                    }
                    <button class="btn btn-primary" onclick="showAgentDetails('\${agent.id}')">Details</button>
                </div>
            \`;
            
            return card;
        }
        
        function updateAgentCard(agent) {
            const existingCard = document.getElementById(\`agent-\${agent.id}\`);
            if (existingCard) {
                const newCard = createAgentCard(agent);
                existingCard.replaceWith(newCard);
            }
        }
        
        function updateApprovalsList() {
            const list = document.getElementById('approvalsList');
            
            if (approvals.size === 0) {
                list.innerHTML = \`
                    <div class="empty-state">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p>No pending approvals</p>
                    </div>
                \`;
                return;
            }
            
            list.innerHTML = Array.from(approvals.values()).map(approval => \`
                <div class="approval-card" id="approval-\${approval.id}">
                    <div class="approval-header">
                        <div class="approval-agent">\${approval.agentName}</div>
                        <div class="approval-type">\${approval.type}</div>
                    </div>
                    <div class="approval-description">\${approval.description}</div>
                    <div class="approval-data">\${JSON.stringify(approval.data, null, 2)}</div>
                    <input type="text" class="feedback-input" id="feedback-\${approval.id}" 
                           placeholder="Add feedback (optional)">
                    <div class="approval-actions">
                        <button class="btn btn-success" onclick="approveWork('\${approval.id}')">
                            Approve
                        </button>
                        <button class="btn btn-danger" onclick="rejectWork('\${approval.id}')">
                            Reject
                        </button>
                    </div>
                </div>
            \`).join('');
        }
        
        function updateHistoryList() {
            const list = document.getElementById('historyList');
            const recentHistory = history.slice(-20).reverse();
            
            if (recentHistory.length === 0) {
                list.innerHTML = '<div class="empty-state"><p>No work history yet</p></div>';
                return;
            }
            
            list.innerHTML = recentHistory.map(item => \`
                <div class="history-item">
                    <div class="history-info">
                        <div class="history-agent">\${item.agentName}</div>
                        <div class="history-action">\${item.type}: \${item.description}</div>
                        <div class="history-time">\${formatTime(item.timestamp)}</div>
                    </div>
                    <div class="history-status status-\${item.status}">\${item.status}</div>
                </div>
            \`).join('');
        }
        
        // Action handlers
        function pauseAgent(agentId) {
            socket.emit('pause_agent', agentId);
        }
        
        function resumeAgent(agentId) {
            socket.emit('resume_agent', agentId);
        }
        
        function approveWork(approvalId) {
            const feedback = document.getElementById(\`feedback-\${approvalId}\`).value;
            socket.emit('approve_work', {
                approvalId,
                approved: true,
                feedback
            });
        }
        
        function rejectWork(approvalId) {
            const feedback = document.getElementById(\`feedback-\${approvalId}\`).value;
            socket.emit('approve_work', {
                approvalId,
                approved: false,
                feedback
            });
        }
        
        function showTaskModal() {
            const modal = document.getElementById('taskModal');
            const agentSelect = document.getElementById('taskAgent');
            
            // Populate agent options
            agentSelect.innerHTML = '<option value="">Choose an agent...</option>';
            agents.forEach(agent => {
                if (agent.status === 'idle') {
                    agentSelect.innerHTML += \`<option value="\${agent.id}">\${agent.name}</option>\`;
                }
            });
            
            modal.style.display = 'flex';
        }
        
        function hideTaskModal() {
            document.getElementById('taskModal').style.display = 'none';
            document.getElementById('taskForm').reset();
        }
        
        // Update task types when agent is selected
        document.getElementById('taskAgent').addEventListener('change', (e) => {
            const agentId = e.target.value;
            const agent = agents.get(agentId);
            const typeSelect = document.getElementById('taskType');
            
            if (agent) {
                typeSelect.innerHTML = '<option value="">Select task type...</option>';
                agent.capabilities.forEach(cap => {
                    typeSelect.innerHTML += \`<option value="\${cap}">\${formatMetricLabel(cap)}</option>\`;
                });
            }
        });
        
        // Handle task form submission
        document.getElementById('taskForm').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const agentId = document.getElementById('taskAgent').value;
            const type = document.getElementById('taskType').value;
            const description = document.getElementById('taskDescription').value;
            
            socket.emit('assign_task', {
                agentId,
                task: { type, description }
            });
            
            hideTaskModal();
            showNotification('Task assigned successfully');
        });
        
        function showAgentDetails(agentId) {
            const agent = agents.get(agentId);
            if (agent) {
                showNotification(\`Agent \${agent.name} capabilities: \${agent.capabilities.join(', ')}\`);
            }
        }
        
        function clearHistory() {
            if (confirm('Are you sure you want to clear the work history?')) {
                history = [];
                updateHistoryList();
                showNotification('History cleared');
            }
        }
        
        function showNotification(message) {
            const notification = document.getElementById('notification');
            notification.textContent = message;
            notification.style.display = 'block';
            
            setTimeout(() => {
                notification.style.display = 'none';
            }, 3000);
        }
        
        // Utility functions
        function formatMetricLabel(key) {
            return key.replace(/([A-Z])/g, ' $1')
                      .replace(/_/g, ' ')
                      .trim()
                      .split(' ')
                      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ');
        }
        
        function formatTime(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now - date;
            
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return \`\${Math.floor(diff / 60000)}m ago\`;
            if (diff < 86400000) return \`\${Math.floor(diff / 3600000)}h ago\`;
            
            return date.toLocaleString();
        }
        
        // Auto-refresh stats every 5 seconds
        setInterval(updateStats, 5000);
    </script>
</body>
</html>
        `;
  }

  start() {
    this.server.listen(this.port, "0.0.0.0", () => {
      console.log(
        `🚀 Super Agent Monitor started on http://localhost:${this.port}`,
      );
      console.log(`📊 Monitoring ${this.agents.size} agents`);
      console.log(
        `🌐 Server is binding to all interfaces (0.0.0.0:${this.port})`,
      );
    });

    this.server.on("error", (err) => {
      console.error("❌ Server error:", err);
    });
  }
}

// Export for use in other modules
module.exports = SuperAgentMonitor;

// Start if run directly
if (require.main === module) {
  const monitor = new SuperAgentMonitor();
  monitor.start();
}
