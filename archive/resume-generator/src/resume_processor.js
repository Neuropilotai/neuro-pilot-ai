require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');
const { google } = require('googleapis');

class ResumeProcessor {
    constructor() {
        this.app = express();
        this.port = 5003;
        this.name = "RESUME-VALIDATION-PROCESSOR";
        
        // Required resume fields
        this.requiredFields = [
            'fullName',
            'email', 
            'phone',
            'location',
            'workExperience',
            'education',
            'skills',
            'summary'
        ];
        
        // Optional but recommended fields
        this.recommendedFields = [
            'linkedin',
            'github',
            'portfolio',
            'certifications',
            'languages',
            'achievements'
        ];
        
        this.setupMiddleware();
        this.setupGoogleSheets();
        this.setupRoutes();
        this.createUploadsDirectory();
    }
    
    async createUploadsDirectory() {
        try {
            await fs.mkdir('./uploads', { recursive: true });
            console.log('📁 Uploads directory ready');
        } catch (error) {
            console.log('📁 Uploads directory already exists');
        }
    }
    
    setupMiddleware() {
        this.app.use(cors({
            origin: ['http://localhost:4000', 'http://localhost:3000'],
            credentials: true
        }));
        this.app.use(express.json());
        
        // Configure multer for file uploads
        this.storage = multer.diskStorage({
            destination: (req, file, cb) => {
                cb(null, './uploads');
            },
            filename: (req, file, cb) => {
                const uniqueName = `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
                cb(null, uniqueName);
            }
        });
        
        this.upload = multer({
            storage: this.storage,
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
            fileFilter: (req, file, cb) => {
                const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
                const fileExt = path.extname(file.originalname).toLowerCase();
                
                if (allowedTypes.includes(fileExt)) {
                    cb(null, true);
                } else {
                    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.'));
                }
            }
        });
    }
    
    async setupGoogleSheets() {
        try {
            // Initialize Google Sheets API
            this.auth = new google.auth.GoogleAuth({
                keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || './google-credentials.json',
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });
            
            this.sheets = google.sheets({ version: 'v4', auth: this.auth });
            this.spreadsheetId = process.env.GOOGLE_SHEETS_ID || 'your-spreadsheet-id';
            
            console.log('📊 Google Sheets API initialized');
        } catch (error) {
            console.log('⚠️ Google Sheets setup failed:', error.message);
            console.log('📊 Will use local storage for validation data');
        }
    }
    
    setupRoutes() {
        // Health check
        this.app.get('/api/resume/status', (req, res) => {
            res.json({
                status: 'operational',
                service: this.name,
                timestamp: new Date().toISOString(),
                version: '1.0.0'
            });
        });
        
        // Upload and process resume
        this.app.post('/api/resume/upload', this.upload.single('resume'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        error: 'No resume file uploaded'
                    });
                }
                
                console.log(`📄 Processing resume: ${req.file.originalname}`);
                
                // Extract text from resume
                const resumeText = await this.extractTextFromFile(req.file.path);
                
                // Parse resume information
                const resumeData = await this.parseResumeText(resumeText);
                
                // Validate required fields
                const validation = this.validateResumeData(resumeData);
                
                // Save to Google Sheets
                const sheetResult = await this.saveToGoogleSheets(resumeData, validation, req.file.originalname);
                
                // Clean up uploaded file
                await fs.unlink(req.file.path);
                
                res.json({
                    success: true,
                    resumeData,
                    validation,
                    sheetResult,
                    readyForQueue: validation.isComplete,
                    message: validation.isComplete ? 
                        'Resume is complete and ready for processing!' : 
                        `Resume needs additional information: ${validation.missingFields.join(', ')}`
                });
                
            } catch (error) {
                console.error('❌ Resume processing error:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // Get validation status
        this.app.get('/api/resume/validation/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const validationData = await this.getValidationStatus(id);
                res.json(validationData);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // Update resume information
        this.app.put('/api/resume/update/:id', async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body;
                
                const result = await this.updateResumeData(id, updates);
                res.json(result);
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
        
        // Get resumes ready for queue
        this.app.get('/api/resume/ready-for-queue', async (req, res) => {
            try {
                const readyResumes = await this.getResumesReadyForQueue();
                res.json({
                    success: true,
                    resumes: readyResumes,
                    count: readyResumes.length
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }
    
    async extractTextFromFile(filePath) {
        const fileExt = path.extname(filePath).toLowerCase();
        
        try {
            switch (fileExt) {
                case '.pdf':
                    const pdfBuffer = await fs.readFile(filePath);
                    const pdfData = await pdfParse(pdfBuffer);
                    return pdfData.text;
                    
                case '.txt':
                    return await fs.readFile(filePath, 'utf8');
                    
                case '.doc':
                case '.docx':
                    // For now, return placeholder - would need mammoth or similar for full DOCX support
                    return await fs.readFile(filePath, 'utf8');
                    
                default:
                    throw new Error('Unsupported file format');
            }
        } catch (error) {
            throw new Error(`Failed to extract text from file: ${error.message}`);
        }
    }
    
    async parseResumeText(text) {
        const resumeData = {
            extractedAt: new Date().toISOString(),
            rawText: text.substring(0, 1000), // Store first 1000 chars for reference
        };
        
        // Extract email
        const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        resumeData.email = emailMatch ? emailMatch[0] : null;
        
        // Extract phone number
        const phoneMatch = text.match(/(\+?\d{1,3}[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/);
        resumeData.phone = phoneMatch ? phoneMatch[0] : null;
        
        // Extract name (usually at the beginning)
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        const nameCandidate = lines[0]?.trim();
        if (nameCandidate && nameCandidate.length < 50 && /^[A-Za-z\s]+$/.test(nameCandidate)) {
            resumeData.fullName = nameCandidate;
        }
        
        // Extract location/address
        const locationMatch = text.match(/([A-Z][a-z]+,\s*[A-Z]{2}|[A-Z][a-z]+\s+[A-Z][a-z]+,\s*[A-Z]{2})/);
        resumeData.location = locationMatch ? locationMatch[0] : null;
        
        // Check for LinkedIn
        const linkedinMatch = text.match(/linkedin\.com\/in\/[a-zA-Z0-9-]+/i);
        resumeData.linkedin = linkedinMatch ? `https://${linkedinMatch[0]}` : null;
        
        // Check for GitHub
        const githubMatch = text.match(/github\.com\/[a-zA-Z0-9-]+/i);
        resumeData.github = githubMatch ? `https://${githubMatch[0]}` : null;
        
        // Detect sections
        resumeData.hasWorkExperience = /experience|employment|work history/i.test(text);
        resumeData.hasEducation = /education|degree|university|college/i.test(text);
        resumeData.hasSkills = /skills|technical skills|competencies/i.test(text);
        resumeData.hasSummary = /summary|objective|profile/i.test(text);
        
        // Extract skills (basic detection)
        const skillsSection = this.extractSection(text, /skills|technical skills/i);
        if (skillsSection) {
            resumeData.skillsText = skillsSection.substring(0, 500);
        }
        
        // Extract work experience (basic detection)
        const experienceSection = this.extractSection(text, /experience|employment|work history/i);
        if (experienceSection) {
            resumeData.experienceText = experienceSection.substring(0, 800);
        }
        
        return resumeData;
    }
    
    extractSection(text, sectionRegex) {
        const lines = text.split('\n');
        let inSection = false;
        let sectionText = '';
        
        for (const line of lines) {
            if (sectionRegex.test(line)) {
                inSection = true;
                continue;
            }
            
            if (inSection) {
                // Stop at next major section
                if (/^(education|experience|skills|summary|objective)/i.test(line.trim()) && 
                    !sectionRegex.test(line)) {
                    break;
                }
                sectionText += line + '\n';
            }
        }
        
        return sectionText.trim();
    }
    
    validateResumeData(resumeData) {
        const validation = {
            isComplete: true,
            missingFields: [],
            missingRecommended: [],
            completionScore: 0,
            details: {}
        };
        
        // Check required fields
        const fieldChecks = {
            fullName: resumeData.fullName,
            email: resumeData.email,
            phone: resumeData.phone,
            location: resumeData.location,
            workExperience: resumeData.hasWorkExperience,
            education: resumeData.hasEducation,
            skills: resumeData.hasSkills,
            summary: resumeData.hasSummary
        };
        
        let requiredCount = 0;
        for (const [field, value] of Object.entries(fieldChecks)) {
            validation.details[field] = {
                present: !!value,
                value: value || null
            };
            
            if (value) {
                requiredCount++;
            } else {
                validation.missingFields.push(field);
                validation.isComplete = false;
            }
        }
        
        // Check recommended fields
        const recommendedChecks = {
            linkedin: resumeData.linkedin,
            github: resumeData.github,
            portfolio: null, // Would need more sophisticated parsing
            certifications: /certification|certified|license/i.test(resumeData.rawText),
            languages: /languages|bilingual|multilingual/i.test(resumeData.rawText),
            achievements: /award|achievement|accomplishment|recognition/i.test(resumeData.rawText)
        };
        
        let recommendedCount = 0;
        for (const [field, value] of Object.entries(recommendedChecks)) {
            if (value) {
                recommendedCount++;
            } else {
                validation.missingRecommended.push(field);
            }
        }
        
        // Calculate completion score (0-100)
        const requiredScore = (requiredCount / this.requiredFields.length) * 70; // 70% for required
        const recommendedScore = (recommendedCount / this.recommendedFields.length) * 30; // 30% for recommended
        validation.completionScore = Math.round(requiredScore + recommendedScore);
        
        return validation;
    }
    
    async saveToGoogleSheets(resumeData, validation, originalFilename) {
        try {
            if (!this.sheets) {
                // Fallback to local storage
                return await this.saveToLocalStorage(resumeData, validation, originalFilename);
            }
            
            const resumeId = `RESUME_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const row = [
                resumeId,
                new Date().toISOString(),
                originalFilename,
                resumeData.fullName || 'N/A',
                resumeData.email || 'N/A',
                resumeData.phone || 'N/A',
                resumeData.location || 'N/A',
                resumeData.linkedin || 'N/A',
                resumeData.github || 'N/A',
                validation.isComplete ? 'READY' : 'INCOMPLETE',
                validation.completionScore,
                validation.missingFields.join(', '),
                validation.missingRecommended.join(', '),
                resumeData.hasWorkExperience ? 'YES' : 'NO',
                resumeData.hasEducation ? 'YES' : 'NO',
                resumeData.hasSkills ? 'YES' : 'NO',
                resumeData.hasSummary ? 'YES' : 'NO'
            ];
            
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Resume_Validation!A:Q',
                valueInputOption: 'RAW',
                resource: {
                    values: [row]
                }
            });
            
            console.log(`📊 Resume data saved to Google Sheets: ${resumeId}`);
            return {
                success: true,
                resumeId,
                sheetUpdated: true
            };
            
        } catch (error) {
            console.error('❌ Google Sheets save failed:', error.message);
            return await this.saveToLocalStorage(resumeData, validation, originalFilename);
        }
    }
    
    async saveToLocalStorage(resumeData, validation, originalFilename) {
        try {
            const resumeId = `RESUME_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            
            const record = {
                resumeId,
                timestamp: new Date().toISOString(),
                originalFilename,
                resumeData,
                validation
            };
            
            // Save to local JSON file
            const filePath = './resume_validation_log.json';
            let existingData = [];
            
            try {
                const existing = await fs.readFile(filePath, 'utf8');
                existingData = JSON.parse(existing);
            } catch (error) {
                // File doesn't exist yet
            }
            
            existingData.push(record);
            await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
            
            console.log(`💾 Resume data saved locally: ${resumeId}`);
            return {
                success: true,
                resumeId,
                localStorage: true
            };
            
        } catch (error) {
            throw new Error(`Failed to save resume data: ${error.message}`);
        }
    }
    
    async getValidationStatus(resumeId) {
        // Try Google Sheets first, then local storage
        try {
            const localData = await fs.readFile('./resume_validation_log.json', 'utf8');
            const records = JSON.parse(localData);
            const record = records.find(r => r.resumeId === resumeId);
            
            if (record) {
                return {
                    success: true,
                    ...record
                };
            }
            
            return {
                success: false,
                error: 'Resume not found'
            };
            
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    async getResumesReadyForQueue() {
        try {
            const localData = await fs.readFile('./resume_validation_log.json', 'utf8');
            const records = JSON.parse(localData);
            
            const readyResumes = records
                .filter(record => record.validation.isComplete)
                .map(record => ({
                    resumeId: record.resumeId,
                    fullName: record.resumeData.fullName,
                    email: record.resumeData.email,
                    completionScore: record.validation.completionScore,
                    timestamp: record.timestamp
                }))
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            return readyResumes;
            
        } catch (error) {
            return [];
        }
    }
    
    async updateResumeData(resumeId, updates) {
        try {
            const localData = await fs.readFile('./resume_validation_log.json', 'utf8');
            const records = JSON.parse(localData);
            const recordIndex = records.findIndex(r => r.resumeId === resumeId);
            
            if (recordIndex === -1) {
                throw new Error('Resume not found');
            }
            
            // Update the record
            Object.assign(records[recordIndex].resumeData, updates);
            
            // Re-validate
            records[recordIndex].validation = this.validateResumeData(records[recordIndex].resumeData);
            records[recordIndex].lastUpdated = new Date().toISOString();
            
            // Save back
            await fs.writeFile('./resume_validation_log.json', JSON.stringify(records, null, 2));
            
            return {
                success: true,
                resumeData: records[recordIndex].resumeData,
                validation: records[recordIndex].validation
            };
            
        } catch (error) {
            throw new Error(`Failed to update resume: ${error.message}`);
        }
    }
    
    start() {
        this.app.listen(this.port, () => {
            console.log('📄 ═══════════════════════════════════════════════════════════════');
            console.log('🔍 RESUME VALIDATION & PROCESSING SYSTEM');
            console.log('📄 ═══════════════════════════════════════════════════════════════');
            console.log('');
            console.log(`🌐 Resume API: http://localhost:${this.port}`);
            console.log('📤 Upload: POST /api/resume/upload');
            console.log('📊 Status: GET /api/resume/validation/:id');
            console.log('✅ Ready Queue: GET /api/resume/ready-for-queue');
            console.log('📝 Update: PUT /api/resume/update/:id');
            console.log('');
            console.log('✨ Smart resume validation with Google Sheets integration!');
            console.log(`📋 Required Fields: ${this.requiredFields.join(', ')}`);
            console.log(`💡 Recommended: ${this.recommendedFields.join(', ')}`);
        });
    }
}

// Start the Resume Processor
if (require.main === module) {
    const processor = new ResumeProcessor();
    processor.start();
}

module.exports = ResumeProcessor;