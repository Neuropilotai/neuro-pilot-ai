require("dotenv").config();
const fs = require("fs").promises;
const path = require("path");

class DevelopmentProgressTracker {
  constructor() {
    this.progressDatabase = "./development_progress.json";
    this.projectMilestones = new Map();
    this.developmentStages = new Map();
    this.currentProjects = new Map();
    this.initializeTracker();
  }

  async initializeTracker() {
    console.log("📊 Development Progress Tracker Starting...");
    await this.setupDevelopmentStages();
    await this.initializeProjectMilestones();
    await this.loadExistingProgress();
    console.log("✅ Development Progress Tracker Ready!");
  }

  async setupDevelopmentStages() {
    // Define comprehensive development stages for any project
    this.developmentStages.set("concept", {
      name: "Concept & Planning",
      weight: 5,
      description: "Initial idea, market research, and feasibility study",
      typical_duration: "3-5 days",
      deliverables: [
        "Project proposal",
        "Market analysis",
        "Technical feasibility",
      ],
    });

    this.developmentStages.set("design", {
      name: "Architecture & Design",
      weight: 15,
      description:
        "System architecture, technical specifications, and UI/UX design",
      typical_duration: "1-2 weeks",
      deliverables: [
        "System architecture",
        "Technical specs",
        "Database design",
        "API design",
      ],
    });

    this.developmentStages.set("setup", {
      name: "Development Setup",
      weight: 10,
      description: "Environment setup, dependencies, and project structure",
      typical_duration: "2-3 days",
      deliverables: [
        "Dev environment",
        "Project structure",
        "CI/CD pipeline",
        "Dependencies",
      ],
    });

    this.developmentStages.set("core_development", {
      name: "Core Development",
      weight: 40,
      description: "Main feature development and core functionality",
      typical_duration: "2-4 weeks",
      deliverables: [
        "Core algorithms",
        "Main features",
        "Business logic",
        "Data processing",
      ],
    });

    this.developmentStages.set("integration", {
      name: "Integration & APIs",
      weight: 15,
      description: "Third-party integrations and API connections",
      typical_duration: "1-2 weeks",
      deliverables: [
        "API integrations",
        "Database connections",
        "External services",
      ],
    });

    this.developmentStages.set("testing", {
      name: "Testing & QA",
      weight: 10,
      description: "Unit testing, integration testing, and quality assurance",
      typical_duration: "1 week",
      deliverables: [
        "Unit tests",
        "Integration tests",
        "Performance tests",
        "Bug fixes",
      ],
    });

    this.developmentStages.set("optimization", {
      name: "Optimization & Polish",
      weight: 3,
      description: "Performance optimization and final polish",
      typical_duration: "3-5 days",
      deliverables: [
        "Performance optimization",
        "Code cleanup",
        "Documentation",
      ],
    });

    this.developmentStages.set("deployment", {
      name: "Deployment & Launch",
      weight: 2,
      description: "Production deployment and go-live activities",
      typical_duration: "1-2 days",
      deliverables: [
        "Production deployment",
        "Launch checklist",
        "Monitoring setup",
      ],
    });

    console.log("🔧 Development stages configured");
  }

  async initializeProjectMilestones() {
    // AI Job Matching Engine specific milestones
    await this.setupProjectMilestones("AI-Powered Job Matching Engine", {
      concept: [
        {
          task: "Market research completed",
          completed: true,
          date: "2025-06-20",
        },
        {
          task: "Technical feasibility confirmed",
          completed: true,
          date: "2025-06-20",
        },
        { task: "Project approved", completed: true, date: "2025-06-20" },
      ],
      design: [
        {
          task: "System architecture designed",
          completed: true,
          date: "2025-06-20",
        },
        {
          task: "AI algorithms specified",
          completed: true,
          date: "2025-06-20",
        },
        { task: "Database schema designed", completed: false },
        { task: "API endpoints documented", completed: false },
      ],
      setup: [
        {
          task: "Development environment setup",
          completed: true,
          date: "2025-06-20",
        },
        {
          task: "Project dependencies installed",
          completed: true,
          date: "2025-06-20",
        },
        { task: "Code structure created", completed: true, date: "2025-06-20" },
      ],
      core_development: [
        {
          task: "Core matching engine developed",
          completed: true,
          date: "2025-06-20",
        },
        {
          task: "Skills matching algorithm",
          completed: true,
          date: "2025-06-20",
        },
        {
          task: "Experience matching algorithm",
          completed: true,
          date: "2025-06-20",
        },
        { task: "Cultural fit algorithm", completed: true, date: "2025-06-20" },
        {
          task: "Location matching algorithm",
          completed: true,
          date: "2025-06-20",
        },
        {
          task: "Salary matching algorithm",
          completed: true,
          date: "2025-06-20",
        },
        { task: "Job data fetching system", completed: false },
        { task: "Real API integrations", completed: false },
        { task: "Advanced ML models", completed: false },
        { task: "Performance optimization", completed: false },
      ],
      integration: [
        { task: "LinkedIn API integration", completed: false },
        { task: "Indeed API integration", completed: false },
        { task: "Glassdoor API integration", completed: false },
        { task: "Resume system integration", completed: false },
        { task: "Email notification system", completed: false },
      ],
      testing: [
        { task: "Unit tests for algorithms", completed: false },
        { task: "Integration tests", completed: false },
        { task: "Performance testing", completed: false },
        { task: "User acceptance testing", completed: false },
      ],
      optimization: [
        { task: "Algorithm accuracy optimization", completed: false },
        { task: "Response time optimization", completed: false },
        { task: "Code documentation", completed: false },
      ],
      deployment: [
        { task: "Production environment setup", completed: false },
        { task: "Launch preparation", completed: false },
        { task: "Go-live execution", completed: false },
      ],
    });

    console.log("📋 Project milestones initialized");
  }

  async setupProjectMilestones(projectName, milestones) {
    this.projectMilestones.set(projectName, milestones);
    await this.saveProgressData();
  }

  async getProjectProgress(projectName) {
    const milestones = this.projectMilestones.get(projectName);
    if (!milestones) {
      return { error: "Project not found" };
    }

    const stageProgress = {};
    let totalWeight = 0;
    let completedWeight = 0;
    let totalTasks = 0;
    let completedTasks = 0;

    // Calculate progress for each stage
    for (const [stageName, stageTasks] of Object.entries(milestones)) {
      const stageInfo = this.developmentStages.get(stageName);
      if (!stageInfo) continue;

      const stageTasksCompleted = stageTasks.filter(
        (task) => task.completed,
      ).length;
      const stageCompletionRate =
        stageTasks.length > 0
          ? (stageTasksCompleted / stageTasks.length) * 100
          : 0;

      stageProgress[stageName] = {
        name: stageInfo.name,
        description: stageInfo.description,
        weight: stageInfo.weight,
        tasks: stageTasks,
        tasksCompleted: stageTasksCompleted,
        totalTasks: stageTasks.length,
        completionRate: Math.round(stageCompletionRate),
        status: this.getStageStatus(stageCompletionRate),
        estimatedDuration: stageInfo.typical_duration,
        deliverables: stageInfo.deliverables,
      };

      totalWeight += stageInfo.weight;
      completedWeight += (stageCompletionRate / 100) * stageInfo.weight;
      totalTasks += stageTasks.length;
      completedTasks += stageTasksCompleted;
    }

    const overallProgress =
      totalWeight > 0 ? (completedWeight / totalWeight) * 100 : 0;
    const currentStage = this.getCurrentStage(stageProgress);
    const nextMilestones = this.getNextMilestones(milestones, 5);
    const estimatedCompletion = this.estimateCompletion(
      stageProgress,
      overallProgress,
    );

    return {
      projectName,
      overallProgress: Math.round(overallProgress),
      currentStage,
      totalTasks,
      completedTasks,
      stageProgress,
      nextMilestones,
      estimatedCompletion,
      lastUpdated: new Date().toISOString(),
      performanceMetrics: await this.getPerformanceMetrics(projectName),
      riskAssessment: this.assessRisks(stageProgress, overallProgress),
    };
  }

  getStageStatus(completionRate) {
    if (completionRate === 100) return "completed";
    if (completionRate > 50) return "in_progress";
    if (completionRate > 0) return "started";
    return "not_started";
  }

  getCurrentStage(stageProgress) {
    // Find the current active stage
    for (const [stageName, stage] of Object.entries(stageProgress)) {
      if (stage.status === "in_progress" || stage.status === "started") {
        return {
          name: stage.name,
          stage: stageName,
          progress: stage.completionRate,
          nextTask:
            stage.tasks.find((task) => !task.completed)?.task ||
            "All tasks completed",
        };
      }
    }

    // If no in-progress stage, find the next stage to start
    for (const [stageName, stage] of Object.entries(stageProgress)) {
      if (stage.status === "not_started") {
        return {
          name: `Next: ${stage.name}`,
          stage: stageName,
          progress: 0,
          nextTask: stage.tasks[0]?.task || "No tasks defined",
        };
      }
    }

    return {
      name: "Project Completed",
      stage: "completed",
      progress: 100,
      nextTask: "Project ready for launch",
    };
  }

  getNextMilestones(milestones, count = 5) {
    const nextTasks = [];

    for (const [stageName, stageTasks] of Object.entries(milestones)) {
      for (const task of stageTasks) {
        if (!task.completed && nextTasks.length < count) {
          nextTasks.push({
            task: task.task,
            stage: stageName,
            stageName: this.developmentStages.get(stageName)?.name || stageName,
            priority: this.getTaskPriority(stageName, task),
            estimatedDays: this.estimateTaskDays(stageName, task),
          });
        }
      }
    }

    return nextTasks;
  }

  getTaskPriority(stageName, task) {
    const highPriorityStages = ["core_development", "integration"];
    const criticalTasks = ["api integration", "database", "algorithm"];

    if (highPriorityStages.includes(stageName)) return "high";
    if (
      criticalTasks.some((critical) =>
        task.task.toLowerCase().includes(critical),
      )
    )
      return "high";
    return "medium";
  }

  estimateTaskDays(stageName, task) {
    const taskComplexity = {
      algorithm: 3,
      integration: 2,
      testing: 1,
      documentation: 1,
      setup: 1,
      optimization: 2,
    };

    for (const [keyword, days] of Object.entries(taskComplexity)) {
      if (task.task.toLowerCase().includes(keyword)) {
        return days;
      }
    }

    return 1; // Default 1 day
  }

  estimateCompletion(stageProgress, overallProgress) {
    if (overallProgress >= 100) {
      return {
        status: "completed",
        date: "Project completed",
        daysRemaining: 0,
      };
    }

    // Calculate remaining work
    let remainingDays = 0;
    for (const [stageName, stage] of Object.entries(stageProgress)) {
      if (stage.status !== "completed") {
        const stageDuration = this.parseDuration(stage.estimatedDuration);
        const stageRemainingWork = (100 - stage.completionRate) / 100;
        remainingDays += stageDuration * stageRemainingWork;
      }
    }

    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + Math.ceil(remainingDays));

    return {
      status: "in_progress",
      date: estimatedDate.toISOString().split("T")[0],
      daysRemaining: Math.ceil(remainingDays),
      confidence: this.calculateEstimateConfidence(overallProgress),
    };
  }

  parseDuration(duration) {
    // Parse durations like "1-2 weeks", "3-5 days"
    const weekMatch = duration.match(/(\d+)(?:-(\d+))?\s*weeks?/);
    if (weekMatch) {
      const min = parseInt(weekMatch[1]);
      const max = weekMatch[2] ? parseInt(weekMatch[2]) : min;
      return ((min + max) / 2) * 7; // Convert to days
    }

    const dayMatch = duration.match(/(\d+)(?:-(\d+))?\s*days?/);
    if (dayMatch) {
      const min = parseInt(dayMatch[1]);
      const max = dayMatch[2] ? parseInt(dayMatch[2]) : min;
      return (min + max) / 2;
    }

    return 7; // Default 1 week
  }

  calculateEstimateConfidence(overallProgress) {
    if (overallProgress >= 80) return "high";
    if (overallProgress >= 40) return "medium";
    return "low";
  }

  async getPerformanceMetrics(projectName) {
    // Simulate performance metrics
    return {
      velocity: "3.2 tasks/day",
      qualityScore: "94%",
      onTimeDelivery: "87%",
      teamEfficiency: "High",
      lastCommit: new Date().toISOString(),
      codeQuality: "A",
      testCoverage: "78%",
    };
  }

  assessRisks(stageProgress, overallProgress) {
    const risks = [];

    // Check for delayed stages
    for (const [stageName, stage] of Object.entries(stageProgress)) {
      if (stage.status === "started" && stage.completionRate < 30) {
        risks.push({
          level: "medium",
          risk: `${stage.name} stage may be behind schedule`,
          mitigation: "Consider additional resources or scope adjustment",
        });
      }
    }

    // Check overall progress
    if (overallProgress < 30) {
      risks.push({
        level: "low",
        risk: "Project in early stages",
        mitigation: "Monitor key milestones closely",
      });
    }

    // Add dependency risks
    if (!stageProgress.integration?.tasks.some((t) => t.completed)) {
      risks.push({
        level: "medium",
        risk: "API integration dependencies not started",
        mitigation: "Begin API key acquisition and integration planning",
      });
    }

    return risks.length > 0
      ? risks
      : [
          {
            level: "low",
            risk: "No significant risks identified",
            mitigation: "Continue current development pace",
          },
        ];
  }

  async markTaskCompleted(projectName, stageName, taskName) {
    const milestones = this.projectMilestones.get(projectName);
    if (!milestones || !milestones[stageName]) {
      throw new Error("Project or stage not found");
    }

    const task = milestones[stageName].find((t) => t.task === taskName);
    if (!task) {
      throw new Error("Task not found");
    }

    task.completed = true;
    task.date = new Date().toISOString().split("T")[0];

    await this.saveProgressData();
    console.log(`✅ Task completed: ${taskName}`);

    return await this.getProjectProgress(projectName);
  }

  async addTask(projectName, stageName, taskName) {
    const milestones = this.projectMilestones.get(projectName);
    if (!milestones) {
      throw new Error("Project not found");
    }

    if (!milestones[stageName]) {
      milestones[stageName] = [];
    }

    milestones[stageName].push({
      task: taskName,
      completed: false,
    });

    await this.saveProgressData();
    console.log(`➕ Task added: ${taskName}`);

    return await this.getProjectProgress(projectName);
  }

  async getAllProjectsProgress() {
    const projects = [];
    for (const projectName of this.projectMilestones.keys()) {
      const progress = await this.getProjectProgress(projectName);
      projects.push(progress);
    }
    return projects;
  }

  async saveProgressData() {
    const data = {
      projects: Object.fromEntries(this.projectMilestones),
      lastUpdated: new Date().toISOString(),
    };

    try {
      await fs.writeFile(this.progressDatabase, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Error saving progress data:", error);
    }
  }

  async loadExistingProgress() {
    try {
      const data = await fs.readFile(this.progressDatabase, "utf8");
      const parsed = JSON.parse(data);

      if (parsed.projects) {
        this.projectMilestones = new Map(Object.entries(parsed.projects));
      }
    } catch (error) {
      // File doesn't exist yet
      await this.saveProgressData();
    }
  }
}

// Command line usage
if (require.main === module) {
  const tracker = new DevelopmentProgressTracker();

  setTimeout(async () => {
    console.log("\n📊 Getting AI Job Matching Engine Progress...\n");

    const progress = await tracker.getProjectProgress(
      "AI-Powered Job Matching Engine",
    );

    console.log(`🎯 Project: ${progress.projectName}`);
    console.log(`📈 Overall Progress: ${progress.overallProgress}%`);
    console.log(
      `🔄 Current Stage: ${progress.currentStage.name} (${progress.currentStage.progress}%)`,
    );
    console.log(`📋 Next Task: ${progress.currentStage.nextTask}`);
    console.log(
      `⏱️ Estimated Completion: ${progress.estimatedCompletion.date} (${progress.estimatedCompletion.daysRemaining} days)`,
    );
    console.log(
      `✅ Tasks Completed: ${progress.completedTasks}/${progress.totalTasks}`,
    );

    console.log(`\n🔮 Next 5 Milestones:`);
    progress.nextMilestones.forEach((milestone, i) => {
      console.log(
        `  ${i + 1}. ${milestone.task} (${milestone.stageName}) - ${milestone.priority} priority`,
      );
    });

    console.log(`\n⚠️ Risk Assessment:`);
    progress.riskAssessment.forEach((risk) => {
      console.log(`  ${risk.level.toUpperCase()}: ${risk.risk}`);
    });

    console.log(`\n📊 Performance Metrics:`);
    console.log(`  Velocity: ${progress.performanceMetrics.velocity}`);
    console.log(`  Quality: ${progress.performanceMetrics.qualityScore}`);
    console.log(`  Code Quality: ${progress.performanceMetrics.codeQuality}`);
  }, 1000);
}

module.exports = DevelopmentProgressTracker;
