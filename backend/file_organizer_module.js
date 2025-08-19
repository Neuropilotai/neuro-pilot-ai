const fs = require("fs").promises;
const path = require("path");

class FileOrganizerModule {
  constructor(superAgent) {
    this.superAgent = superAgent;
    this.projectRoot = path.join(__dirname, "..");
    this.organizationRules = new Map();
    this.learningData = {
      filePatterns: new Map(),
      dependencies: new Map(),
      usage: new Map(),
      performance: new Map(),
    };
    this.initializeRules();
  }

  initializeRules() {
    // Define intelligent organization rules
    this.organizationRules.set("backend", {
      agents: ["*_agent.js", "super_agent.js"],
      dashboards: ["*_dashboard.js"],
      servers: ["server.js", "*_server.js"],
      email: ["email_*.js", "*_email.js"],
      pdf: ["*_pdf*.js", "pdf_*.js"],
      configs: ["*.config.js", "*_config.js"],
      utils: ["*_utils.js", "utils_*.js", "*_helper.js"],
      logs: ["*.log"],
      data: ["*.json", "*.txt", "*.csv"],
      temp: ["temp_*.js", "*_temp.js"],
    });

    this.organizationRules.set("frontend", {
      components: ["*Component.js", "*Component.tsx"],
      pages: ["*Page.js", "*Page.tsx"],
      styles: ["*.css", "*.scss", "*.less"],
      assets: ["*.png", "*.jpg", "*.svg", "*.ico"],
      public: ["*.html"],
    });
  }

  async start() {
    await this.superAgent.log(
      "FILE_ORGANIZER",
      "🗂️ File Organizer Module starting...",
    );

    // Initial project analysis
    await this.analyzeProjectStructure();

    // Start periodic organization
    setInterval(async () => {
      await this.performOrganization();
    }, 600000); // Every 10 minutes

    // Start learning from file usage
    setInterval(async () => {
      await this.learnFromUsage();
    }, 300000); // Every 5 minutes
  }

  async analyzeProjectStructure() {
    try {
      await this.superAgent.log(
        "PROJECT_ANALYSIS",
        "🔍 Analyzing project structure...",
      );

      const structure = await this.scanDirectory(this.projectRoot);
      await this.identifyPatterns(structure);
      await this.suggestImprovements(structure);

      await this.superAgent.log(
        "PROJECT_ANALYSIS",
        "✅ Project structure analysis completed",
      );
    } catch (error) {
      await this.superAgent.log(
        "PROJECT_ANALYSIS_ERROR",
        `❌ Analysis failed: ${error.message}`,
      );
    }
  }

  async scanDirectory(dirPath, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return null;

    try {
      const items = await fs.readdir(dirPath);
      const structure = {
        path: dirPath,
        name: path.basename(dirPath),
        type: "directory",
        children: [],
        files: [],
        depth,
      };

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);

        if (stats.isDirectory() && !this.shouldIgnoreDirectory(item)) {
          const subStructure = await this.scanDirectory(
            itemPath,
            depth + 1,
            maxDepth,
          );
          if (subStructure) {
            structure.children.push(subStructure);
          }
        } else if (stats.isFile() && !this.shouldIgnoreFile(item)) {
          structure.files.push({
            name: item,
            path: itemPath,
            size: stats.size,
            modified: stats.mtime,
            extension: path.extname(item),
          });
        }
      }

      return structure;
    } catch (error) {
      return null;
    }
  }

  shouldIgnoreDirectory(name) {
    const ignored = [
      "node_modules",
      ".git",
      ".DS_Store",
      "dist",
      "build",
      "coverage",
    ];
    return ignored.includes(name);
  }

  shouldIgnoreFile(name) {
    const ignored = [".DS_Store", ".gitignore", "package-lock.json"];
    return ignored.includes(name) || name.startsWith(".");
  }

  async identifyPatterns(structure) {
    // Analyze file patterns and relationships
    await this.analyzeFileTypes(structure);
    await this.analyzeDependencies(structure);
    await this.analyzeNaming(structure);
  }

  async analyzeFileTypes(structure) {
    const fileTypes = new Map();

    const collectFiles = (node) => {
      if (node.files) {
        node.files.forEach((file) => {
          const ext = file.extension || "no-extension";
          if (!fileTypes.has(ext)) {
            fileTypes.set(ext, []);
          }
          fileTypes.get(ext).push(file);
        });
      }

      if (node.children) {
        node.children.forEach(collectFiles);
      }
    };

    collectFiles(structure);

    // Learn from file type distribution
    for (const [ext, files] of fileTypes) {
      this.learningData.filePatterns.set(ext, {
        count: files.length,
        avgSize: files.reduce((sum, f) => sum + f.size, 0) / files.length,
        locations: files.map((f) => path.dirname(f.path)),
        lastAnalyzed: new Date().toISOString(),
      });
    }
  }

  async analyzeDependencies(structure) {
    // Analyze which files depend on each other
    const jsFiles = this.getAllJSFiles(structure);

    for (const file of jsFiles) {
      try {
        const content = await fs.readFile(file.path, "utf8");
        const dependencies = this.extractDependencies(content);

        this.learningData.dependencies.set(file.path, {
          requires: dependencies.requires,
          imports: dependencies.imports,
          exports: dependencies.exports,
          lastAnalyzed: new Date().toISOString(),
        });
      } catch (error) {
        // Skip files that can't be read
      }
    }
  }

  getAllJSFiles(structure) {
    const jsFiles = [];

    const collect = (node) => {
      if (node.files) {
        jsFiles.push(
          ...node.files.filter(
            (f) => f.extension === ".js" || f.extension === ".ts",
          ),
        );
      }
      if (node.children) {
        node.children.forEach(collect);
      }
    };

    collect(structure);
    return jsFiles;
  }

  extractDependencies(content) {
    const requires = [];
    const imports = [];
    const exports = [];

    // Extract require statements
    const requireMatches = content.match(/require\(['"`]([^'"`]+)['"`]\)/g);
    if (requireMatches) {
      requireMatches.forEach((match) => {
        const module = match.match(/require\(['"`]([^'"`]+)['"`]\)/)[1];
        requires.push(module);
      });
    }

    // Extract import statements
    const importMatches = content.match(/import .+ from ['"`]([^'"`]+)['"`]/g);
    if (importMatches) {
      importMatches.forEach((match) => {
        const module = match.match(/from ['"`]([^'"`]+)['"`]/)[1];
        imports.push(module);
      });
    }

    // Extract exports
    if (content.includes("module.exports")) {
      exports.push("commonjs");
    }
    if (content.includes("export ")) {
      exports.push("es6");
    }

    return { requires, imports, exports };
  }

  async analyzeNaming(structure) {
    const namingPatterns = new Map();

    const analyzeNames = (node) => {
      if (node.files) {
        node.files.forEach((file) => {
          const name = file.name;
          const patterns = this.extractNamingPatterns(name);

          patterns.forEach((pattern) => {
            if (!namingPatterns.has(pattern)) {
              namingPatterns.set(pattern, 0);
            }
            namingPatterns.set(pattern, namingPatterns.get(pattern) + 1);
          });
        });
      }

      if (node.children) {
        node.children.forEach(analyzeNames);
      }
    };

    analyzeNames(structure);

    // Store learned naming patterns
    this.learningData.usage.set("naming_patterns", {
      patterns: Array.from(namingPatterns.entries()),
      lastAnalyzed: new Date().toISOString(),
    });
  }

  extractNamingPatterns(filename) {
    const patterns = [];
    const nameWithoutExt = path.parse(filename).name;

    // Check for common patterns
    if (nameWithoutExt.includes("_")) patterns.push("snake_case");
    if (nameWithoutExt.includes("-")) patterns.push("kebab-case");
    if (/[A-Z]/.test(nameWithoutExt)) patterns.push("camelCase");
    if (nameWithoutExt.endsWith("Agent")) patterns.push("agent_suffix");
    if (nameWithoutExt.endsWith("Dashboard")) patterns.push("dashboard_suffix");
    if (nameWithoutExt.endsWith("Server")) patterns.push("server_suffix");
    if (nameWithoutExt.startsWith("test")) patterns.push("test_prefix");

    return patterns;
  }

  async suggestImprovements(structure) {
    const suggestions = [];

    // Analyze for organization improvements
    const misplacedFiles = await this.findMisplacedFiles(structure);
    const duplicateCode = await this.findDuplicateCode(structure);
    const unusedFiles = await this.findUnusedFiles(structure);

    if (misplacedFiles.length > 0) {
      suggestions.push({
        type: "REORGANIZATION",
        priority: "medium",
        description: `Found ${misplacedFiles.length} files that could be better organized`,
        files: misplacedFiles,
        action: "reorganize",
      });
    }

    if (duplicateCode.length > 0) {
      suggestions.push({
        type: "REFACTORING",
        priority: "high",
        description: `Found ${duplicateCode.length} potential code duplications`,
        files: duplicateCode,
        action: "refactor",
      });
    }

    if (unusedFiles.length > 0) {
      suggestions.push({
        type: "CLEANUP",
        priority: "low",
        description: `Found ${unusedFiles.length} potentially unused files`,
        files: unusedFiles,
        action: "review",
      });
    }

    // Store suggestions for action
    this.learningData.suggestions = suggestions;

    if (suggestions.length > 0) {
      await this.superAgent.log(
        "IMPROVEMENTS_SUGGESTED",
        `💡 Suggested ${suggestions.length} improvements`,
        { suggestions },
      );
    }
  }

  async findMisplacedFiles(structure) {
    const misplaced = [];

    const checkFiles = (node, currentDir) => {
      if (node.files) {
        node.files.forEach((file) => {
          const suggestedDir = this.suggestOptimalLocation(file, structure);
          if (suggestedDir && suggestedDir !== currentDir) {
            misplaced.push({
              file: file.path,
              current: currentDir,
              suggested: suggestedDir,
              reason: this.getReorganizationReason(file, suggestedDir),
            });
          }
        });
      }

      if (node.children) {
        node.children.forEach((child) => checkFiles(child, child.name));
      }
    };

    checkFiles(structure, structure.name);
    return misplaced;
  }

  suggestOptimalLocation(file, structure) {
    const filename = file.name.toLowerCase();

    // Agent files should be in agents/ directory
    if (filename.includes("agent")) {
      return "agents";
    }

    // Dashboard files should be in dashboards/ directory
    if (filename.includes("dashboard")) {
      return "dashboards";
    }

    // Server files should be in servers/ directory
    if (filename.includes("server")) {
      return "servers";
    }

    // Email related files
    if (filename.includes("email")) {
      return "email";
    }

    // PDF related files
    if (filename.includes("pdf")) {
      return "pdf";
    }

    // Configuration files
    if (filename.includes("config") || file.extension === ".json") {
      return "config";
    }

    // Log files
    if (file.extension === ".log") {
      return "logs";
    }

    return null;
  }

  getReorganizationReason(file, suggestedDir) {
    const filename = file.name.toLowerCase();

    if (filename.includes("agent")) return "Agent functionality";
    if (filename.includes("dashboard")) return "Dashboard interface";
    if (filename.includes("server")) return "Server component";
    if (filename.includes("email")) return "Email handling";
    if (filename.includes("pdf")) return "PDF processing";
    if (filename.includes("config")) return "Configuration file";
    if (file.extension === ".log") return "Log file";

    return "Better organization";
  }

  async findDuplicateCode(structure) {
    // Simplified duplicate detection (in production, would use AST analysis)
    const jsFiles = this.getAllJSFiles(structure);
    const duplicates = [];

    for (let i = 0; i < jsFiles.length; i++) {
      for (let j = i + 1; j < jsFiles.length; j++) {
        try {
          const content1 = await fs.readFile(jsFiles[i].path, "utf8");
          const content2 = await fs.readFile(jsFiles[j].path, "utf8");

          const similarity = this.calculateSimilarity(content1, content2);
          if (similarity > 0.7) {
            duplicates.push({
              file1: jsFiles[i].path,
              file2: jsFiles[j].path,
              similarity: similarity,
              reason: "High code similarity detected",
            });
          }
        } catch (error) {
          // Skip files that can't be read
        }
      }
    }

    return duplicates;
  }

  calculateSimilarity(content1, content2) {
    // Simple similarity calculation (Jaccard coefficient)
    const words1 = new Set(content1.split(/\W+/));
    const words2 = new Set(content2.split(/\W+/));

    const intersection = new Set([...words1].filter((x) => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  async findUnusedFiles(structure) {
    const jsFiles = this.getAllJSFiles(structure);
    const unused = [];

    for (const file of jsFiles) {
      const isUsed = await this.checkFileUsage(file, jsFiles);
      if (!isUsed && !this.isEntryPoint(file)) {
        unused.push({
          file: file.path,
          reason: "No references found in other files",
          lastModified: file.modified,
        });
      }
    }

    return unused;
  }

  async checkFileUsage(targetFile, allFiles) {
    const targetName = path.parse(targetFile.name).name;

    for (const file of allFiles) {
      if (file.path === targetFile.path) continue;

      try {
        const content = await fs.readFile(file.path, "utf8");
        if (
          content.includes(targetName) ||
          content.includes(targetFile.name) ||
          content.includes(
            path.relative(path.dirname(file.path), targetFile.path),
          )
        ) {
          return true;
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return false;
  }

  isEntryPoint(file) {
    const entryPoints = ["server.js", "index.js", "app.js", "main.js"];
    return entryPoints.includes(file.name);
  }

  async performOrganization() {
    if (
      !this.learningData.suggestions ||
      this.learningData.suggestions.length === 0
    ) {
      return;
    }

    await this.superAgent.log(
      "AUTO_ORGANIZATION",
      "🗂️ Starting automatic file organization...",
    );

    for (const suggestion of this.learningData.suggestions) {
      if (
        suggestion.type === "REORGANIZATION" &&
        suggestion.priority === "medium"
      ) {
        await this.autoReorganizeFiles(suggestion);
      }
    }

    await this.superAgent.log(
      "AUTO_ORGANIZATION",
      "✅ File organization completed",
    );
  }

  async autoReorganizeFiles(suggestion) {
    try {
      for (const item of suggestion.files.slice(0, 3)) {
        // Limit to 3 files per run
        await this.moveFileToOptimalLocation(item);
      }

      await this.superAgent.log(
        "FILE_MOVED",
        `📁 Auto-organized ${suggestion.files.length} files`,
        { suggestion },
      );
    } catch (error) {
      await this.superAgent.log(
        "ORGANIZATION_ERROR",
        `❌ Auto-organization failed: ${error.message}`,
      );
    }
  }

  async moveFileToOptimalLocation(item) {
    const targetDir = path.join(this.projectRoot, "backend", item.suggested);

    // Create target directory if it doesn't exist
    await fs.mkdir(targetDir, { recursive: true });

    const targetPath = path.join(targetDir, path.basename(item.file));

    // Move the file
    await fs.rename(item.file, targetPath);

    // Update any references (simplified)
    await this.updateFileReferences(item.file, targetPath);
  }

  async updateFileReferences(oldPath, newPath) {
    // Update require/import statements in other files
    const jsFiles = await this.getAllProjectJSFiles();

    for (const file of jsFiles) {
      try {
        let content = await fs.readFile(file, "utf8");
        let updated = false;

        // Update relative paths
        const oldRelative = path.relative(path.dirname(file), oldPath);
        const newRelative = path.relative(path.dirname(file), newPath);

        if (content.includes(oldRelative)) {
          content = content.replace(new RegExp(oldRelative, "g"), newRelative);
          updated = true;
        }

        if (updated) {
          await fs.writeFile(file, content);
        }
      } catch (error) {
        // Skip files that can't be updated
      }
    }
  }

  async getAllProjectJSFiles() {
    const files = [];

    const scanDir = async (dir) => {
      try {
        const items = await fs.readdir(dir);

        for (const item of items) {
          const itemPath = path.join(dir, item);
          const stats = await fs.stat(itemPath);

          if (stats.isDirectory() && !this.shouldIgnoreDirectory(item)) {
            await scanDir(itemPath);
          } else if (
            stats.isFile() &&
            (item.endsWith(".js") || item.endsWith(".ts"))
          ) {
            files.push(itemPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    await scanDir(this.projectRoot);
    return files;
  }

  async learnFromUsage() {
    // Learn from file access patterns, error rates, performance
    await this.analyzeFilePerformance();
    await this.analyzeErrorPatterns();
    await this.optimizeBasedOnLearning();
  }

  async analyzeFilePerformance() {
    // Track which files are accessed frequently vs rarely
    // This would integrate with system monitoring in production

    const performanceData = {
      timestamp: new Date().toISOString(),
      accessPatterns: new Map(),
      loadTimes: new Map(),
      errorRates: new Map(),
    };

    this.learningData.performance.set("latest", performanceData);
  }

  async analyzeErrorPatterns() {
    // Analyze error logs to identify problematic files
    try {
      const logFiles = [
        "super_agent.log",
        "email_agent.log",
        "server_8080.log",
      ];

      for (const logFile of logFiles) {
        try {
          const content = await fs.readFile(
            path.join(__dirname, logFile),
            "utf8",
          );
          const errors = this.extractErrorPatterns(content);

          if (errors.length > 0) {
            await this.suggestFixesForErrors(errors);
          }
        } catch (error) {
          // Log file doesn't exist or can't be read
        }
      }
    } catch (error) {
      // Error analysis failed
    }
  }

  extractErrorPatterns(logContent) {
    const errors = [];
    const lines = logContent.split("\n");

    for (const line of lines) {
      if (
        line.includes("ERROR") ||
        line.includes("❌") ||
        line.includes("Failed")
      ) {
        errors.push({
          line,
          timestamp: this.extractTimestamp(line),
          type: this.classifyError(line),
        });
      }
    }

    return errors;
  }

  extractTimestamp(line) {
    const match = line.match(/\[(.*?)\]/);
    return match ? match[1] : new Date().toISOString();
  }

  classifyError(line) {
    if (line.includes("ECONNREFUSED")) return "CONNECTION_ERROR";
    if (line.includes("ENOENT")) return "FILE_NOT_FOUND";
    if (line.includes("Permission denied")) return "PERMISSION_ERROR";
    if (line.includes("port") && line.includes("use")) return "PORT_CONFLICT";
    return "UNKNOWN_ERROR";
  }

  async suggestFixesForErrors(errors) {
    const fixes = [];

    for (const error of errors) {
      const fix = this.generateFixSuggestion(error);
      if (fix) {
        fixes.push(fix);
      }
    }

    if (fixes.length > 0) {
      await this.superAgent.log(
        "AUTO_FIX_SUGGESTED",
        `🔧 Suggested ${fixes.length} automatic fixes`,
        { fixes },
      );
    }
  }

  generateFixSuggestion(error) {
    switch (error.type) {
      case "CONNECTION_ERROR":
        return {
          type: "RESTART_SERVICE",
          description: "Restart failed service",
          action: "restart",
          priority: "high",
        };

      case "FILE_NOT_FOUND":
        return {
          type: "CREATE_MISSING_FILE",
          description: "Create missing file or update path",
          action: "create_or_fix_path",
          priority: "medium",
        };

      case "PORT_CONFLICT":
        return {
          type: "CHANGE_PORT",
          description: "Change to available port",
          action: "update_port",
          priority: "high",
        };

      default:
        return null;
    }
  }

  async optimizeBasedOnLearning() {
    // Apply learned optimizations
    await this.optimizeFileStructure();
    await this.optimizeConfigurations();
    await this.cleanupUnusedFiles();
  }

  async optimizeFileStructure() {
    // Create optimal directory structure based on learning
    const optimalStructure = this.calculateOptimalStructure();
    await this.createOptimalDirectories(optimalStructure);
  }

  calculateOptimalStructure() {
    return {
      "backend/agents": "AI agent files",
      "backend/dashboards": "Dashboard interfaces",
      "backend/servers": "Server components",
      "backend/email": "Email handling",
      "backend/pdf": "PDF processing",
      "backend/config": "Configuration files",
      "backend/utils": "Utility functions",
      "backend/logs": "Log files",
      "backend/data": "Data files",
      "backend/temp": "Temporary files",
    };
  }

  async createOptimalDirectories(structure) {
    for (const [dir, description] of Object.entries(structure)) {
      const dirPath = path.join(this.projectRoot, dir);

      try {
        await fs.mkdir(dirPath, { recursive: true });

        // Create README.md for each directory
        const readmePath = path.join(dirPath, "README.md");
        const readmeContent = `# ${path.basename(dir)}\n\n${description}\n\nAuto-generated by NEURO-SUPER-AGENT`;

        await fs.writeFile(readmePath, readmeContent);
      } catch (error) {
        // Directory already exists or can't be created
      }
    }
  }

  async optimizeConfigurations() {
    // Optimize configuration files based on learning
    // This would analyze config files and suggest improvements
  }

  async cleanupUnusedFiles() {
    // Clean up files that haven't been used in a while
    if (this.learningData.suggestions) {
      const cleanupSuggestions = this.learningData.suggestions.filter(
        (s) => s.type === "CLEANUP",
      );

      for (const suggestion of cleanupSuggestions.slice(0, 2)) {
        // Limit cleanup
        await this.performCleanup(suggestion);
      }
    }
  }

  async performCleanup(suggestion) {
    // Move unused files to archive directory instead of deleting
    const archiveDir = path.join(this.projectRoot, "backend", "archive");
    await fs.mkdir(archiveDir, { recursive: true });

    for (const item of suggestion.files.slice(0, 2)) {
      // Limit files per cleanup
      try {
        const archivePath = path.join(archiveDir, path.basename(item.file));
        await fs.rename(item.file, archivePath);

        await this.superAgent.log(
          "FILE_ARCHIVED",
          `📦 Archived unused file: ${path.basename(item.file)}`,
        );
      } catch (error) {
        // File already moved or doesn't exist
      }
    }
  }

  getOrganizationStats() {
    return {
      filePatterns: this.learningData.filePatterns.size,
      dependencies: this.learningData.dependencies.size,
      suggestions: this.learningData.suggestions?.length || 0,
      lastAnalysis: new Date().toISOString(),
    };
  }
}

module.exports = FileOrganizerModule;
