// Railway Production Server - Neuro.Pilot.AI
// Optimized for Railway deployment
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false, // Allow Railway's default CSP
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint (required by Railway)
app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'neuro-pilot-ai',
        version: '1.0.0'
    });
});

// API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        service: 'Neuro.Pilot.AI',
        status: 'running',
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
        features: {
            trading: process.env.TRADING_ENABLED === 'true',
            resume: process.env.RESUME_ENABLED === 'true',
            agents: process.env.AI_AGENTS_ENABLED === 'true'
        }
    });
});

// Resume generation endpoint
app.post('/api/resume/generate', async (req, res) => {
    try {
        const { profileData, jobDescription } = req.body;
        
        if (!profileData || !jobDescription) {
            return res.status(400).json({ 
                error: 'Profile data and job description are required' 
            });
        }

        // Basic resume generation logic
        const resume = {
            id: `resume_${Date.now()}`,
            timestamp: new Date().toISOString(),
            profileData,
            jobDescription,
            status: 'generated',
            downloadUrl: `/api/resume/download/${Date.now()}`
        };

        res.json({
            success: true,
            resume,
            message: 'Resume generated successfully'
        });
    } catch (error) {
        console.error('Resume generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate resume',
            message: error.message 
        });
    }
});

// Trading data endpoint (mock for now)
app.get('/api/trading/status', (req, res) => {
    res.json({
        status: 'active',
        timestamp: new Date().toISOString(),
        agents: {
            total: 3,
            active: 2,
            performance: '12.5%'
        }
    });
});

// Catch-all route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Neuro.Pilot.AI Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});