// Railway Production Server - Neuro.Pilot.AI
// Optimized for Railway deployment
// Build: 2025-07-14-20:15
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
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" }
}));

// CORS Configuration - Security Hardened (v18.0-ultimate)
// NO WILDCARD FALLBACK - enterprise security policy
const rawAllowed = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Production-safe defaults with wildcard subdomain support
const defaultProdOrigins = [
  'https://neuropilot-inventory.vercel.app',
  'https://*.vercel.app'
];

const isProd = process.env.NODE_ENV === 'production';
const allowlist = rawAllowed.length > 0 ? rawAllowed : defaultProdOrigins;

// Wildcard subdomain matcher for patterns like https://*.vercel.app
function matchOrigin(origin, list) {
  if (!origin) return true; // Allow server-to-server/no-origin

  for (const rule of list) {
    if (rule.includes('*')) {
      const pattern = '^' + rule.replace(/\./g, '\\.').replace(/\*/g, '[a-z0-9-]+') + '$';
      const re = new RegExp(pattern, 'i');
      if (re.test(origin)) return true;
    } else if (origin === rule) {
      return true;
    }
  }
  return false;
}

// Startup security banner
console.log('[SECURE-CORS] mode=%s allowlist_count=%d node=%s',
  process.env.NODE_ENV || 'production',
  allowlist.length,
  process.version
);

app.use(cors({
  origin: function (origin, callback) {
    const isAllowed = matchOrigin(origin, allowlist);
    if (isAllowed) {
      callback(null, origin || true);
    } else {
      const crypto = require('crypto');
      const hash = origin ? crypto.createHash('sha256').update(origin).digest('hex').slice(0, 8) : 'null';
      console.warn('CORS blocked unauthorized origin hash:', hash);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
  maxAge: 600
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

// Serve static files from React build (Railway copies to public/)
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

// API Routes (keep these before catch-all)

// Resume order processing
app.get('/api/resume/order', (req, res) => {
    const { package: packageType } = req.query;
    const packages = {
        express: { price: 39, name: 'Express Resume', delivery: '24 hours' },
        professional: { price: 79, name: 'Professional Package', delivery: '12 hours' },
        executive: { price: 149, name: 'Executive Suite', delivery: '6 hours' }
    };
    
    const selectedPackage = packages[packageType] || packages.professional;
    
    res.json({
        success: true,
        package: selectedPackage,
        order_id: `order_${Date.now()}`,
        payment_link: `https://buy.stripe.com/your-payment-link-${packageType}`,
        message: 'Redirect to payment processor',
        international: true
    });
});

// Analytics tracking
app.post('/api/analytics/track', (req, res) => {
    // Log international visitor data
    console.log('International visitor:', req.body);
    res.json({ success: true });
});

// Contact endpoint
app.get('/api/contact', (req, res) => {
    res.json({
        email: 'support@neuropilot.ai',
        response_time: '2-4 hours',
        languages: ['English', 'French'],
        timezone: 'UTC-5 (EST)',
        international_support: true
    });
});

// Catch-all route for React SPA
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (require('fs').existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        // Fallback if React build not found
        res.json({
            service: 'Neuro.Pilot.AI',
            status: 'running',
            message: 'Professional AI Resume Service',
            features: ['4 AI Agents', 'Job-Specific Optimization', 'Global Payment Processing'],
            api_endpoints: {
                health: '/api/health',
                resume_order: '/api/resume/order',
                contact: '/api/contact'
            }
        });
    }
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