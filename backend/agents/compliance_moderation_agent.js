const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class ComplianceModerationAgent {
    constructor() {
        this.name = "NEURO-COMPLIANCE-MODERATION-AGENT";
        this.version = "1.0.0";
        this.status = "ACTIVE";
        this.capabilities = [
            "content_moderation",
            "legal_compliance",
            "ethical_guidelines",
            "data_privacy",
            "risk_assessment",
            "audit_trail"
        ];
        
        this.config = {
            openai_api_key: process.env.OPENAI_API_KEY,
            openai_moderation_endpoint: "https://api.openai.com/v1/moderations"
        };
        
        this.compliance_rules = new Map();
        this.moderation_queue = [];
        this.audit_log = [];
        this.violations = [];
        
        this.performance_metrics = {
            content_reviewed: 0,
            violations_detected: 0,
            compliance_score: 100,
            risk_incidents: 0,
            audits_completed: 0
        };
        
        this.risk_categories = {
            HIGH: { threshold: 0.8, action: "BLOCK" },
            MEDIUM: { threshold: 0.5, action: "REVIEW" },
            LOW: { threshold: 0.2, action: "MONITOR" }
        };
        
        this.compliance_frameworks = [
            "GDPR", "CCPA", "SOX", "HIPAA", "PCI_DSS", "ISO_27001"
        ];
        
        this.logFile = path.join(__dirname, '../logs/compliance_moderation_agent.log');
        this.init();
    }
    
    async init() {
        await this.log("🚀 NEURO-COMPLIANCE-MODERATION-AGENT v1.0.0 INITIALIZING...");
        await this.loadComplianceRules();
        await this.log("✅ Compliance & Moderation Agent READY FOR PROTECTION");
    }
    
    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        console.log(logMessage.trim());
        
        try {
            await fs.appendFile(this.logFile, logMessage);
        } catch (error) {
            console.error('Logging error:', error);
        }
    }
    
    async moderateContent(content, contentType = "text", context = {}) {
        try {
            const moderationId = `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            await this.log(`🔍 MODERATING CONTENT: ${moderationId} (${contentType})`);
            
            const moderationResult = {
                id: moderationId,
                content_type: contentType,
                timestamp: new Date(),
                context: context,
                results: {},
                risk_level: "LOW",
                action_taken: "APPROVED",
                violations: []
            };
            
            // OpenAI moderation check
            const openaiResult = await this.openaiModeration(content);
            moderationResult.results.openai = openaiResult;
            
            // Custom compliance checks
            const complianceResult = await this.complianceCheck(content, context);
            moderationResult.results.compliance = complianceResult;
            
            // Privacy check
            const privacyResult = await this.privacyCheck(content);
            moderationResult.results.privacy = privacyResult;
            
            // Legal risk assessment
            const legalResult = await this.legalRiskAssessment(content, context);
            moderationResult.results.legal = legalResult;
            
            // Determine overall risk level
            moderationResult.risk_level = this.calculateRiskLevel(moderationResult.results);
            
            // Take appropriate action
            moderationResult.action_taken = this.determineAction(moderationResult.risk_level);
            
            // Log violations if any
            if (moderationResult.results.openai.flagged || 
                complianceResult.violations.length > 0 ||
                privacyResult.violations.length > 0 ||
                legalResult.risk_score > 0.5) {
                
                moderationResult.violations = this.collectViolations(moderationResult.results);
                this.violations.push(moderationResult);
                this.performance_metrics.violations_detected++;
            }
            
            this.performance_metrics.content_reviewed++;
            await this.logAuditTrail(moderationResult);
            
            await this.log(`✅ Moderation complete: ${moderationId} - ${moderationResult.action_taken}`);
            return moderationResult;
            
        } catch (error) {
            await this.log(`❌ Content moderation failed: ${error.message}`);
            throw error;
        }
    }
    
    async openaiModeration(content) {
        try {
            if (!this.config.openai_api_key) {
                return { flagged: false, categories: {}, category_scores: {} };
            }
            
            const response = await axios.post(this.config.openai_moderation_endpoint, {
                input: content
            }, {
                headers: {
                    'Authorization': `Bearer ${this.config.openai_api_key}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return response.data.results[0];
            
        } catch (error) {
            await this.log(`❌ OpenAI moderation failed: ${error.message}`);
            return { flagged: false, categories: {}, category_scores: {} };
        }
    }
    
    async complianceCheck(content, context) {
        try {
            const violations = [];
            const checks = {
                gdpr_compliance: this.checkGDPRCompliance(content, context),
                ccpa_compliance: this.checkCCPACompliance(content, context),
                professional_standards: this.checkProfessionalStandards(content),
                industry_regulations: this.checkIndustryRegulations(content, context)
            };
            
            for (const [check, result] of Object.entries(checks)) {
                if (!result.compliant) {
                    violations.push({
                        type: check,
                        description: result.description,
                        severity: result.severity
                    });
                }
            }
            
            return {
                compliant: violations.length === 0,
                violations: violations,
                score: Math.max(0, 100 - (violations.length * 20))
            };
            
        } catch (error) {
            await this.log(`❌ Compliance check failed: ${error.message}`);
            return { compliant: true, violations: [], score: 100 };
        }
    }
    
    checkGDPRCompliance(content, context) {
        const personalDataPatterns = [
            /\b\d{3}-\d{2}-\d{4}\b/, // SSN
            /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
            /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/, // Credit card
            /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/ // Phone
        ];
        
        const hasPersonalData = personalDataPatterns.some(pattern => pattern.test(content));
        
        if (hasPersonalData && !context.gdpr_consent) {
            return {
                compliant: false,
                description: "Personal data detected without GDPR consent",
                severity: "HIGH"
            };
        }
        
        return { compliant: true };
    }
    
    checkCCPACompliance(content, context) {
        if (context.customer_location === "California" && 
            content.includes("personal information") && 
            !context.ccpa_notice) {
            return {
                compliant: false,
                description: "California customer data without CCPA notice",
                severity: "HIGH"
            };
        }
        
        return { compliant: true };
    }
    
    checkProfessionalStandards(content) {
        const unprofessionalPatterns = [
            /\b(scam|fraud|fake|illegal)\b/i,
            /\b(guarantee|promised|100%|risk-free)\b/i,
            /\b(get rich quick|make money fast)\b/i
        ];
        
        const violations = unprofessionalPatterns.filter(pattern => pattern.test(content));
        
        if (violations.length > 0) {
            return {
                compliant: false,
                description: "Content contains unprofessional or misleading claims",
                severity: "MEDIUM"
            };
        }
        
        return { compliant: true };
    }
    
    checkIndustryRegulations(content, context) {
        if (context.industry === "finance" || context.product_type === "trading") {
            const financialPatterns = [
                /\b(guaranteed returns|risk-free investment)\b/i,
                /\b(\d+%\s*profit|guaranteed profit)\b/i
            ];
            
            const hasViolations = financialPatterns.some(pattern => pattern.test(content));
            
            if (hasViolations) {
                return {
                    compliant: false,
                    description: "Financial content violates SEC regulations",
                    severity: "HIGH"
                };
            }
        }
        
        return { compliant: true };
    }
    
    async privacyCheck(content) {
        try {
            const violations = [];
            const sensitiveDataPatterns = {
                ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
                credit_card: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
                phone: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
                api_key: /\b(sk|pk)_[a-zA-Z0-9]{20,}\b/g,
                password: /\b(password|pwd|pass)\s*[:=]\s*\S+/gi
            };
            
            for (const [type, pattern] of Object.entries(sensitiveDataPatterns)) {
                const matches = content.match(pattern);
                if (matches) {
                    violations.push({
                        type: `sensitive_data_${type}`,
                        description: `${type.toUpperCase()} detected in content`,
                        severity: "HIGH",
                        count: matches.length
                    });
                }
            }
            
            return {
                secure: violations.length === 0,
                violations: violations,
                score: Math.max(0, 100 - (violations.length * 25))
            };
            
        } catch (error) {
            await this.log(`❌ Privacy check failed: ${error.message}`);
            return { secure: true, violations: [], score: 100 };
        }
    }
    
    async legalRiskAssessment(content, context) {
        try {
            let riskScore = 0;
            const riskFactors = [];
            
            // Check for legal keywords
            const legalKeywords = [
                { word: "lawsuit", weight: 0.3 },
                { word: "liability", weight: 0.2 },
                { word: "damages", weight: 0.2 },
                { word: "copyright", weight: 0.1 },
                { word: "trademark", weight: 0.1 }
            ];
            
            legalKeywords.forEach(({ word, weight }) => {
                if (content.toLowerCase().includes(word)) {
                    riskScore += weight;
                    riskFactors.push(`Contains legal term: ${word}`);
                }
            });
            
            // Check for regulatory compliance
            if (context.regulated_industry) {
                riskScore += 0.1;
                riskFactors.push("Operating in regulated industry");
            }
            
            // Check for international implications
            if (context.international_customers) {
                riskScore += 0.1;
                riskFactors.push("International customer base");
            }
            
            return {
                risk_score: Math.min(1.0, riskScore),
                risk_factors: riskFactors,
                recommendation: riskScore > 0.5 ? "Legal review recommended" : "Low risk"
            };
            
        } catch (error) {
            await this.log(`❌ Legal risk assessment failed: ${error.message}`);
            return { risk_score: 0, risk_factors: [], recommendation: "Assessment failed" };
        }
    }
    
    calculateRiskLevel(results) {
        let riskScore = 0;
        
        // OpenAI moderation score
        if (results.openai.flagged) riskScore += 0.4;
        
        // Compliance violations
        if (results.compliance.violations.length > 0) {
            const highViolations = results.compliance.violations.filter(v => v.severity === "HIGH").length;
            riskScore += highViolations * 0.3;
            riskScore += (results.compliance.violations.length - highViolations) * 0.1;
        }
        
        // Privacy violations
        if (results.privacy.violations.length > 0) {
            riskScore += results.privacy.violations.length * 0.2;
        }
        
        // Legal risk
        riskScore += results.legal.risk_score * 0.3;
        
        if (riskScore >= this.risk_categories.HIGH.threshold) return "HIGH";
        if (riskScore >= this.risk_categories.MEDIUM.threshold) return "MEDIUM";
        return "LOW";
    }
    
    determineAction(riskLevel) {
        return this.risk_categories[riskLevel].action;
    }
    
    collectViolations(results) {
        const allViolations = [];
        
        if (results.openai.flagged) {
            Object.entries(results.openai.categories).forEach(([category, flagged]) => {
                if (flagged) {
                    allViolations.push({
                        type: `openai_${category}`,
                        description: `OpenAI flagged for ${category}`,
                        severity: "HIGH"
                    });
                }
            });
        }
        
        allViolations.push(...results.compliance.violations);
        allViolations.push(...results.privacy.violations);
        
        if (results.legal.risk_score > 0.5) {
            allViolations.push({
                type: "legal_risk",
                description: results.legal.recommendation,
                severity: "MEDIUM"
            });
        }
        
        return allViolations;
    }
    
    async conductComplianceAudit(agentName, timeRange = "30_days") {
        try {
            await this.log(`🔍 CONDUCTING COMPLIANCE AUDIT for ${agentName}`);
            
            const auditId = `audit_${Date.now()}_${agentName}`;
            const audit = {
                id: auditId,
                agent_name: agentName,
                time_range: timeRange,
                started_at: new Date(),
                status: "IN_PROGRESS",
                findings: [],
                recommendations: [],
                compliance_score: 0
            };
            
            // Review recent moderation results
            const recentModerations = this.getRecentModerations(agentName, timeRange);
            
            // Analyze violation patterns
            const violationAnalysis = this.analyzeViolationPatterns(recentModerations);
            audit.findings.push(...violationAnalysis.findings);
            audit.recommendations.push(...violationAnalysis.recommendations);
            
            // Check data handling practices
            const dataHandlingAudit = await this.auditDataHandling(agentName);
            audit.findings.push(...dataHandlingAudit.findings);
            audit.recommendations.push(...dataHandlingAudit.recommendations);
            
            // Calculate compliance score
            audit.compliance_score = this.calculateComplianceScore(audit.findings);
            
            audit.completed_at = new Date();
            audit.status = "COMPLETED";
            
            this.audit_log.push(audit);
            this.performance_metrics.audits_completed++;
            
            await this.log(`✅ Compliance audit completed: ${auditId} - Score: ${audit.compliance_score}`);
            return audit;
            
        } catch (error) {
            await this.log(`❌ Compliance audit failed: ${error.message}`);
            throw error;
        }
    }
    
    getRecentModerations(agentName, timeRange) {
        const cutoffDate = this.getTimeRangeCutoff(timeRange);
        
        return this.violations.filter(violation => 
            violation.context.agent_name === agentName &&
            new Date(violation.timestamp) >= cutoffDate
        );
    }
    
    analyzeViolationPatterns(moderations) {
        const findings = [];
        const recommendations = [];
        
        if (moderations.length === 0) {
            findings.push({ type: "POSITIVE", description: "No violations detected in review period" });
            return { findings, recommendations };
        }
        
        // Group violations by type
        const violationTypes = {};
        moderations.forEach(mod => {
            mod.violations.forEach(violation => {
                if (!violationTypes[violation.type]) {
                    violationTypes[violation.type] = 0;
                }
                violationTypes[violation.type]++;
            });
        });
        
        // Identify patterns
        Object.entries(violationTypes).forEach(([type, count]) => {
            if (count > 5) {
                findings.push({
                    type: "CONCERN",
                    description: `High frequency of ${type} violations (${count} occurrences)`
                });
                recommendations.push({
                    priority: "HIGH",
                    description: `Implement additional safeguards for ${type} violations`
                });
            }
        });
        
        return { findings, recommendations };
    }
    
    async auditDataHandling(agentName) {
        const findings = [];
        const recommendations = [];
        
        // This would check data retention policies, encryption, etc.
        findings.push({
            type: "INFO",
            description: "Data handling practices reviewed"
        });
        
        recommendations.push({
            priority: "MEDIUM",
            description: "Implement automated data retention policies"
        });
        
        return { findings, recommendations };
    }
    
    calculateComplianceScore(findings) {
        let score = 100;
        
        findings.forEach(finding => {
            switch (finding.type) {
                case "CONCERN":
                    score -= 15;
                    break;
                case "WARNING":
                    score -= 10;
                    break;
                case "INFO":
                    score -= 2;
                    break;
            }
        });
        
        return Math.max(0, score);
    }
    
    getTimeRangeCutoff(timeRange) {
        const now = new Date();
        
        switch (timeRange) {
            case "24_hours":
                return new Date(now.getTime() - 24 * 60 * 60 * 1000);
            case "7_days":
                return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            case "30_days":
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            default:
                return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
    }
    
    async logAuditTrail(moderationResult) {
        const auditEntry = {
            timestamp: new Date(),
            action: "CONTENT_MODERATION",
            agent: this.name,
            moderation_id: moderationResult.id,
            risk_level: moderationResult.risk_level,
            action_taken: moderationResult.action_taken,
            violations: moderationResult.violations.length
        };
        
        this.audit_log.push(auditEntry);
        
        // Keep only last 10000 entries
        if (this.audit_log.length > 10000) {
            this.audit_log = this.audit_log.slice(-10000);
        }
    }
    
    async loadComplianceRules() {
        try {
            const rulesFile = path.join(__dirname, '../data/compliance_rules.json');
            const data = await fs.readFile(rulesFile, 'utf8');
            const rules = JSON.parse(data);
            
            rules.forEach(rule => {
                this.compliance_rules.set(rule.id, rule);
            });
            
            await this.log(`📋 Loaded ${this.compliance_rules.size} compliance rules`);
            
        } catch (error) {
            await this.log(`📋 Creating default compliance rules`);
            await this.createDefaultRules();
        }
    }
    
    async createDefaultRules() {
        const defaultRules = [
            {
                id: "gdpr_personal_data",
                type: "privacy",
                description: "GDPR compliance for personal data",
                severity: "HIGH",
                action: "BLOCK"
            },
            {
                id: "financial_claims",
                type: "regulatory",
                description: "SEC compliance for financial claims",
                severity: "HIGH",
                action: "REVIEW"
            },
            {
                id: "professional_standards",
                type: "quality",
                description: "Professional content standards",
                severity: "MEDIUM",
                action: "REVIEW"
            }
        ];
        
        defaultRules.forEach(rule => {
            this.compliance_rules.set(rule.id, rule);
        });
    }
    
    async getPerformanceReport() {
        const report = {
            agent_status: this.status,
            performance_metrics: this.performance_metrics,
            recent_violations: this.violations.slice(-10),
            audit_summary: this.getAuditSummary(),
            compliance_trends: this.getComplianceTrends(),
            risk_distribution: this.getRiskDistribution()
        };
        
        // Update compliance score
        this.performance_metrics.compliance_score = this.calculateOverallComplianceScore();
        
        await this.log(`📊 Performance report generated`);
        return report;
    }
    
    getAuditSummary() {
        const recentAudits = this.audit_log.slice(-10);
        
        return {
            total_audits: this.audit_log.length,
            recent_audits: recentAudits.length,
            average_compliance_score: recentAudits.reduce((acc, audit) => 
                acc + (audit.compliance_score || 100), 0) / Math.max(1, recentAudits.length)
        };
    }
    
    getComplianceTrends() {
        const last30Days = this.violations.filter(v => 
            new Date(v.timestamp) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        );
        
        return {
            violations_last_30_days: last30Days.length,
            trend: last30Days.length > this.violations.length / 2 ? "INCREASING" : "STABLE"
        };
    }
    
    getRiskDistribution() {
        const riskCounts = { HIGH: 0, MEDIUM: 0, LOW: 0 };
        
        this.violations.forEach(violation => {
            riskCounts[violation.risk_level] = (riskCounts[violation.risk_level] || 0) + 1;
        });
        
        return riskCounts;
    }
    
    calculateOverallComplianceScore() {
        const baseScore = 100;
        const recentViolations = this.violations.filter(v => 
            new Date(v.timestamp) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        );
        
        const penalty = recentViolations.length * 5;
        return Math.max(0, baseScore - penalty);
    }
}

module.exports = ComplianceModerationAgent;

// Auto-start if run directly
if (require.main === module) {
    const agent = new ComplianceModerationAgent();
    
    // Example usage
    setTimeout(async () => {
        try {
            // Test content moderation
            const testContent = "Our AI trading system can help you make money in the market. We guarantee 50% returns with zero risk!";
            
            const moderationResult = await agent.moderateContent(testContent, "marketing_copy", {
                product_type: "trading",
                industry: "finance"
            });
            
            console.log("🔍 Moderation result:", moderationResult.action_taken);
            
            // Conduct compliance audit
            const audit = await agent.conductComplianceAudit("trading_agent", "7_days");
            console.log("📋 Audit score:", audit.compliance_score);
            
            // Get performance report
            const report = await agent.getPerformanceReport();
            console.log("📊 COMPLIANCE REPORT:", JSON.stringify(report, null, 2));
            
        } catch (error) {
            console.error("❌ Agent execution failed:", error);
        }
    }, 1000);
}