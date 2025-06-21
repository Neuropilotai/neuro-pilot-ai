require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

class AIJobMatchingEngine {
    constructor() {
        this.matchingDatabase = './job_matching_database.json';
        this.jobSources = new Map();
        this.resumeProfiles = new Map();
        this.matchingAlgorithms = new Map();
        this.performanceMetrics = {
            totalMatches: 0,
            successfulPlacements: 0,
            averageMatchScore: 0,
            clientSatisfaction: 0
        };
        this.initializeEngine();
    }

    async initializeEngine() {
        console.log('🤖 AI Job Matching Engine Starting...');
        await this.setupMatchingAlgorithms();
        await this.initializeJobSources();
        await this.loadExistingData();
        console.log('✅ AI Job Matching Engine Ready!');
    }

    async setupMatchingAlgorithms() {
        // Advanced AI matching algorithms
        this.matchingAlgorithms.set('skills_matcher', {
            weight: 0.35,
            algorithm: this.skillsMatching.bind(this),
            description: 'Matches technical and soft skills with job requirements'
        });

        this.matchingAlgorithms.set('experience_matcher', {
            weight: 0.25,
            algorithm: this.experienceMatching.bind(this),
            description: 'Analyzes years of experience and industry background'
        });

        this.matchingAlgorithms.set('cultural_fit_matcher', {
            weight: 0.20,
            algorithm: this.culturalFitMatching.bind(this),
            description: 'Evaluates company culture and candidate preferences'
        });

        this.matchingAlgorithms.set('location_matcher', {
            weight: 0.10,
            algorithm: this.locationMatching.bind(this),
            description: 'Considers location preferences and remote work options'
        });

        this.matchingAlgorithms.set('salary_matcher', {
            weight: 0.10,
            algorithm: this.salaryMatching.bind(this),
            description: 'Matches salary expectations with job offers'
        });

        console.log('🧠 AI Matching Algorithms Initialized');
    }

    async initializeJobSources() {
        // Job board API integrations
        this.jobSources.set('linkedin', {
            active: true,
            apiKey: process.env.LINKEDIN_API_KEY || 'demo_key',
            endpoint: 'https://api.linkedin.com/v2/jobs',
            rateLimit: 1000,
            priority: 'high'
        });

        this.jobSources.set('indeed', {
            active: true,
            apiKey: process.env.INDEED_API_KEY || 'demo_key',
            endpoint: 'https://api.indeed.com/ads/apisearch',
            rateLimit: 500,
            priority: 'high'
        });

        this.jobSources.set('glassdoor', {
            active: true,
            apiKey: process.env.GLASSDOOR_API_KEY || 'demo_key',
            endpoint: 'https://api.glassdoor.com/api/api.htm',
            rateLimit: 300,
            priority: 'medium'
        });

        this.jobSources.set('stackoverflowjobs', {
            active: true,
            apiKey: process.env.STACKOVERFLOW_API_KEY || 'demo_key',
            endpoint: 'https://api.stackoverflowjobs.com/v1/jobs',
            rateLimit: 200,
            priority: 'high'
        });

        console.log('🔗 Job Source APIs Configured');
    }

    async findJobMatches(resumeData, preferences = {}) {
        try {
            console.log(`🔍 Finding job matches for: ${resumeData.fullName}`);
            
            // Fetch relevant jobs from multiple sources
            const jobs = await this.fetchRelevantJobs(resumeData, preferences);
            
            // Calculate match scores for each job
            const matchedJobs = [];
            for (const job of jobs) {
                const matchScore = await this.calculateMatchScore(resumeData, job);
                
                if (matchScore.overallScore >= 60) { // Include good quality matches
                    matchedJobs.push({
                        job,
                        matchScore,
                        recommendationReason: this.generateRecommendationReason(matchScore),
                        actionItems: this.generateActionItems(resumeData, job, matchScore)
                    });
                }
            }

            // Sort by match score
            matchedJobs.sort((a, b) => b.matchScore.overallScore - a.matchScore.overallScore);

            // Track performance
            this.performanceMetrics.totalMatches += matchedJobs.length;
            await this.saveMatchingResults(resumeData, matchedJobs);

            console.log(`✅ Found ${matchedJobs.length} high-quality job matches`);
            return {
                candidateName: resumeData.fullName,
                totalMatches: matchedJobs.length,
                topMatches: matchedJobs.slice(0, 10), // Return top 10 matches
                searchCriteria: preferences,
                generatedAt: new Date().toISOString(),
                averageMatchScore: this.calculateAverageScore(matchedJobs),
                recommendations: this.generateCandidateRecommendations(resumeData, matchedJobs)
            };

        } catch (error) {
            console.error('Error in job matching:', error);
            throw error;
        }
    }

    async fetchRelevantJobs(resumeData, preferences) {
        // Simulate fetching jobs from multiple APIs
        // In production, this would make real API calls
        return this.generateDemoJobs(resumeData, preferences);
    }

    generateDemoJobs(resumeData, preferences) {
        const jobTitles = [
            'Senior Software Engineer', 'Full Stack Developer', 'DevOps Engineer',
            'Product Manager', 'Data Scientist', 'Machine Learning Engineer',
            'Frontend Developer', 'Backend Developer', 'Cloud Architect',
            'Technical Lead', 'Engineering Manager', 'Solutions Architect'
        ];

        const companies = [
            'Google', 'Microsoft', 'Amazon', 'Meta', 'Apple', 'Netflix',
            'Spotify', 'Airbnb', 'Uber', 'Tesla', 'SpaceX', 'Stripe',
            'Shopify', 'Zoom', 'Slack', 'Dropbox', 'Salesforce', 'Adobe'
        ];

        const jobs = [];
        for (let i = 0; i < 50; i++) {
            jobs.push({
                id: `job_${Date.now()}_${i}`,
                title: jobTitles[Math.floor(Math.random() * jobTitles.length)],
                company: companies[Math.floor(Math.random() * companies.length)],
                location: preferences.location || 'San Francisco, CA',
                remote: Math.random() > 0.5,
                salary: {
                    min: 80000 + Math.floor(Math.random() * 120000),
                    max: 120000 + Math.floor(Math.random() * 180000),
                    currency: 'USD'
                },
                description: `Exciting opportunity for ${resumeData.targetRole || 'Software Engineer'} with cutting-edge technology`,
                requirements: [
                    resumeData.keywords?.split(',')[0]?.trim() || 'JavaScript',
                    'Problem solving',
                    'Team collaboration',
                    'Agile development'
                ],
                benefits: ['Health insurance', 'Stock options', 'Flexible hours', 'Remote work'],
                postedDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                source: ['linkedin', 'indeed', 'glassdoor'][Math.floor(Math.random() * 3)]
            });
        }
        return jobs;
    }

    async calculateMatchScore(resumeData, job) {
        let totalScore = 0;
        const breakdown = {};

        // Apply each matching algorithm
        for (const [name, config] of this.matchingAlgorithms) {
            const algorithmScore = await config.algorithm(resumeData, job);
            const weightedScore = algorithmScore * config.weight;
            totalScore += weightedScore;
            
            breakdown[name] = {
                score: algorithmScore,
                weight: config.weight,
                weightedScore: weightedScore,
                description: config.description
            };
        }

        return {
            overallScore: Math.round(totalScore),
            breakdown,
            confidence: this.calculateConfidence(breakdown),
            recommendations: this.generateScoreRecommendations(breakdown)
        };
    }

    async skillsMatching(resumeData, job) {
        const candidateSkills = (resumeData.keywords || '').toLowerCase().split(',').map(s => s.trim());
        const jobRequirements = job.requirements.map(r => r.toLowerCase());
        
        let matchCount = 0;
        const matchedSkills = [];
        
        for (const skill of candidateSkills) {
            if (jobRequirements.some(req => req.includes(skill) || skill.includes(req))) {
                matchCount++;
                matchedSkills.push(skill);
            }
        }
        
        const score = Math.min(100, (matchCount / Math.max(jobRequirements.length, 1)) * 100);
        return Math.max(20, score); // Minimum 20% to account for transferable skills
    }

    async experienceMatching(resumeData, job) {
        const candidateExp = this.parseExperience(resumeData.experience || '0');
        const jobTitle = job.title.toLowerCase();
        
        let score = 50; // Base score
        
        // Experience level matching
        if (candidateExp >= 8 && jobTitle.includes('senior')) score += 30;
        else if (candidateExp >= 5 && jobTitle.includes('mid')) score += 25;
        else if (candidateExp >= 2 && !jobTitle.includes('senior')) score += 20;
        else if (candidateExp < 2 && jobTitle.includes('junior')) score += 25;
        
        // Industry matching
        if (resumeData.industry && resumeData.industry.toLowerCase() === job.company.toLowerCase()) {
            score += 20;
        }
        
        return Math.min(100, score);
    }

    async culturalFitMatching(resumeData, job) {
        let score = 60; // Base cultural fit score
        
        // Remote work preference
        if (job.remote) score += 15;
        
        // Company size preference (simulated)
        const largeTechCompanies = ['Google', 'Microsoft', 'Amazon', 'Meta', 'Apple'];
        if (largeTechCompanies.includes(job.company)) {
            score += 10; // Assume preference for large tech companies
        }
        
        // Benefits alignment
        if (job.benefits.includes('Stock options')) score += 10;
        if (job.benefits.includes('Flexible hours')) score += 5;
        
        return Math.min(100, score);
    }

    async locationMatching(resumeData, job) {
        let score = 50;
        
        if (job.remote) {
            score = 95; // High score for remote positions
        } else if (job.location) {
            // Simple location matching (in production, use geocoding)
            score = 70; // Assume reasonable commute
        }
        
        return score;
    }

    async salaryMatching(resumeData, job) {
        // Estimate expected salary based on experience and role
        const baseExpectedSalary = 80000 + (this.parseExperience(resumeData.experience || '0') * 15000);
        const jobSalaryMid = (job.salary.min + job.salary.max) / 2;
        
        const salaryRatio = jobSalaryMid / baseExpectedSalary;
        
        if (salaryRatio >= 1.2) return 100; // 20% above expectations
        if (salaryRatio >= 1.0) return 90;  // Meets expectations
        if (salaryRatio >= 0.9) return 75;  // Slightly below
        if (salaryRatio >= 0.8) return 60;  // Notably below
        return 40; // Significantly below expectations
    }

    parseExperience(expString) {
        const match = expString.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    }

    calculateConfidence(breakdown) {
        const scores = Object.values(breakdown).map(b => b.score);
        const variance = this.calculateVariance(scores);
        return Math.max(60, 100 - variance); // Higher variance = lower confidence
    }

    calculateVariance(scores) {
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;
        return Math.sqrt(variance);
    }

    generateRecommendationReason(matchScore) {
        const { breakdown } = matchScore;
        const reasons = [];
        
        if (breakdown.skills_matcher.score > 80) {
            reasons.push('Excellent skills match for this role');
        }
        if (breakdown.experience_matcher.score > 85) {
            reasons.push('Perfect experience level for this position');
        }
        if (breakdown.salary_matcher.score > 90) {
            reasons.push('Salary exceeds expectations');
        }
        if (breakdown.cultural_fit_matcher.score > 80) {
            reasons.push('Strong cultural fit with company values');
        }
        
        return reasons.length > 0 ? reasons.join(', ') : 'Well-rounded match across multiple criteria';
    }

    generateActionItems(resumeData, job, matchScore) {
        const actions = [];
        const { breakdown } = matchScore;
        
        if (breakdown.skills_matcher.score < 70) {
            actions.push('Consider highlighting transferable skills more prominently');
        }
        if (breakdown.experience_matcher.score < 70) {
            actions.push('Emphasize relevant project experience');
        }
        
        actions.push(`Research ${job.company} company culture and values`);
        actions.push('Customize resume for this specific role');
        actions.push('Prepare for technical interview questions');
        
        return actions;
    }

    calculateAverageScore(matchedJobs) {
        if (matchedJobs.length === 0) return 0;
        const total = matchedJobs.reduce((sum, match) => sum + match.matchScore.overallScore, 0);
        return Math.round(total / matchedJobs.length);
    }

    generateCandidateRecommendations(resumeData, matchedJobs) {
        const recommendations = [];
        
        if (matchedJobs.length === 0) {
            recommendations.push('Consider expanding your skill set or broadening your job search criteria');
            return recommendations;
        }
        
        const avgScore = this.calculateAverageScore(matchedJobs);
        
        if (avgScore > 85) {
            recommendations.push('Excellent profile! You\'re a strong candidate for most of these positions');
        } else if (avgScore > 70) {
            recommendations.push('Good profile with several strong matches. Consider tailoring your resume for specific roles');
        } else {
            recommendations.push('Consider strengthening your profile in key areas highlighted by the low-scoring matches');
        }
        
        // Identify top companies
        const topCompanies = matchedJobs.slice(0, 5).map(m => m.job.company).join(', ');
        recommendations.push(`Top target companies: ${topCompanies}`);
        
        return recommendations;
    }

    generateScoreRecommendations(breakdown) {
        const recommendations = [];
        
        Object.entries(breakdown).forEach(([key, data]) => {
            if (data.score < 60) {
                switch (key) {
                    case 'skills_matcher':
                        recommendations.push('Consider acquiring additional technical skills');
                        break;
                    case 'experience_matcher':
                        recommendations.push('Highlight relevant project experience');
                        break;
                    case 'cultural_fit_matcher':
                        recommendations.push('Research company culture and values');
                        break;
                    case 'location_matcher':
                        recommendations.push('Consider remote opportunities or relocation');
                        break;
                    case 'salary_matcher':
                        recommendations.push('Adjust salary expectations or target higher-paying roles');
                        break;
                }
            }
        });
        
        return recommendations;
    }

    async saveMatchingResults(resumeData, matchedJobs) {
        const result = {
            candidateId: `candidate_${Date.now()}`,
            candidateName: resumeData.fullName,
            searchDate: new Date().toISOString(),
            totalMatches: matchedJobs.length,
            averageScore: this.calculateAverageScore(matchedJobs),
            topMatch: matchedJobs[0] || null,
            performance: this.performanceMetrics
        };
        
        try {
            let database = [];
            try {
                const data = await fs.readFile(this.matchingDatabase, 'utf8');
                database = JSON.parse(data);
            } catch (error) {
                // File doesn't exist yet
            }
            
            database.push(result);
            
            // Keep only last 100 results
            if (database.length > 100) {
                database = database.slice(-100);
            }
            
            await fs.writeFile(this.matchingDatabase, JSON.stringify(database, null, 2));
        } catch (error) {
            console.error('Error saving matching results:', error);
        }
    }

    async loadExistingData() {
        try {
            const data = await fs.readFile(this.matchingDatabase, 'utf8');
            const database = JSON.parse(data);
            
            // Update performance metrics
            this.performanceMetrics.totalMatches = database.length;
            if (database.length > 0) {
                const totalScore = database.reduce((sum, record) => sum + record.averageScore, 0);
                this.performanceMetrics.averageMatchScore = Math.round(totalScore / database.length);
            }
            
        } catch (error) {
            // Database doesn't exist yet, will be created on first save
        }
    }

    async getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            engineStatus: 'Active',
            lastUpdated: new Date().toISOString(),
            jobSourcesActive: Array.from(this.jobSources.keys()).filter(source => 
                this.jobSources.get(source).active
            ).length,
            algorithmsActive: this.matchingAlgorithms.size
        };
    }
}

// Command line usage
if (require.main === module) {
    const engine = new AIJobMatchingEngine();
    
    // Test with sample resume data
    setTimeout(async () => {
        console.log('\n🧪 Testing AI Job Matching Engine...');
        
        const sampleResume = {
            fullName: 'Alex Johnson',
            targetRole: 'Senior Software Engineer',
            industry: 'Technology',
            experience: '5 years',
            keywords: 'JavaScript, React, Node.js, Python, AWS, Docker',
            education: 'Computer Science'
        };
        
        const preferences = {
            location: 'San Francisco, CA',
            remote: true,
            salaryMin: 120000
        };
        
        const matches = await engine.findJobMatches(sampleResume, preferences);
        
        console.log(`\n✅ Found ${matches.totalMatches} job matches`);
        console.log(`📊 Average match score: ${matches.averageMatchScore}%`);
        
        if (matches.topMatches.length > 0) {
            const topMatch = matches.topMatches[0];
            console.log(`\n🎯 Top Match: ${topMatch.job.title} at ${topMatch.job.company}`);
            console.log(`📈 Match Score: ${topMatch.matchScore.overallScore}%`);
            console.log(`💰 Salary: $${topMatch.job.salary.min.toLocaleString()} - $${topMatch.job.salary.max.toLocaleString()}`);
            console.log(`🎪 Why this match: ${topMatch.recommendationReason}`);
        }
        
        const metrics = await engine.getPerformanceMetrics();
        console.log(`\n📊 Engine Performance:`, metrics);
        
    }, 2000);
}

module.exports = AIJobMatchingEngine;