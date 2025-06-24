#!/usr/bin/env node

/**
 * Deployment Script for Neuro-Pilot-AI Resume Service
 * Handles production deployment and service launch
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ServiceDeployer {
    constructor() {
        this.projectRoot = process.cwd();
        this.packageJson = this.loadPackageJson();
    }

    loadPackageJson() {
        try {
            const packageData = fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf8');
            return JSON.parse(packageData);
        } catch (error) {
            console.log('📦 Creating package.json...');
            return this.createPackageJson();
        }
    }

    createPackageJson() {
        const packageJson = {
            name: 'neuro-pilot-ai-resume-service',
            version: '1.0.0',
            description: 'Automated AI-powered resume generation service',
            main: 'automated-resume-workflow.js',
            scripts: {
                start: 'node automated-resume-workflow.js',
                dev: 'nodemon automated-resume-workflow.js',
                test: 'node test-pipeline.js',
                setup: 'node notion-integration-setup.js',
                'create-payment-links': 'node stripe-payment-integration.js --create-links',
                deploy: 'node deploy-service.js',
            },
            keywords: ['ai', 'resume', 'automation', 'notion', 'stripe', 'openai'],
            author: 'Neuro-Pilot-AI',
            license: 'MIT',
            dependencies: {
                '@notionhq/client': '^2.2.15',
                'openai': '^4.20.1',
                'stripe': '^14.9.0',
                'express': '^4.18.2',
                'dotenv': '^16.3.1',
                'cors': '^2.8.5',
                'helmet': '^7.1.0',
                'compression': '^1.7.4',
                'morgan': '^1.10.0',
            },
            devDependencies: {
                'nodemon': '^3.0.2',
            },
            engines: {
                node: '>=16.0.0',
                npm: '>=8.0.0',
            },
        };

        fs.writeFileSync(
            path.join(this.projectRoot, 'package.json'),
            JSON.stringify(packageJson, null, 2)
        );

        console.log('✅ Created package.json');
        return packageJson;
    }

    async installDependencies() {
        console.log('📥 Installing dependencies...');
        
        try {
            execSync('npm install', { 
                stdio: 'inherit', 
                cwd: this.projectRoot 
            });
            console.log('✅ Dependencies installed successfully');
        } catch (error) {
            console.error('❌ Failed to install dependencies:', error.message);
            throw error;
        }
    }

    createDockerfile() {
        const dockerfile = `
# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Change ownership of the app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3001/health || exit 1

# Start the application
CMD ["npm", "start"]
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, 'Dockerfile'), dockerfile);
        console.log('✅ Created Dockerfile');
    }

    createDockerCompose() {
        const dockerCompose = `
version: '3.8'

services:
  neuro-pilot-ai:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    volumes:
      - ./logs:/app/logs
    networks:
      - neuro-pilot-network

  # Optional: Add nginx reverse proxy
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - neuro-pilot-ai
    networks:
      - neuro-pilot-network
    restart: unless-stopped

networks:
  neuro-pilot-network:
    driver: bridge
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, 'docker-compose.yml'), dockerCompose);
        console.log('✅ Created docker-compose.yml');
    }

    createNginxConfig() {
        const nginxConfig = `
events {
    worker_connections 1024;
}

http {
    upstream neuro_pilot_ai {
        server neuro-pilot-ai:3001;
    }

    server {
        listen 80;
        server_name your-domain.com;

        # Redirect HTTP to HTTPS
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        # SSL Configuration
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

        # Proxy to Node.js app
        location / {
            proxy_pass http://neuro_pilot_ai;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # Special handling for Stripe webhooks
        location /webhook {
            proxy_pass http://neuro_pilot_ai;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, 'nginx.conf'), nginxConfig);
        console.log('✅ Created nginx.conf');
    }

    createProductionEnv() {
        const prodEnv = `
# Neuro-Pilot-AI Production Environment
NODE_ENV=production
PORT=3001

# Notion Integration (Required)
NOTION_TOKEN=your_production_notion_token
NOTION_PARENT_PAGE_ID=your_production_parent_page_id
NOTION_RESUME_DATABASE_ID=your_production_resume_database_id
NOTION_TEMPLATE_DATABASE_ID=your_production_template_database_id

# OpenAI Configuration (Required)
OPENAI_API_KEY=your_production_openai_api_key

# Stripe Payment Processing (Required - LIVE KEYS)
STRIPE_SECRET_KEY=sk_live_your_live_stripe_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_live_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_production_webhook_secret

# Email Configuration (Required)
EMAIL_USER=your_production_email@gmail.com
EMAIL_PASS=your_production_app_password
EMAIL_FROM=noreply@yourdomain.com

# Production URLs
FRONTEND_URL=https://yourdomain.com
WEBHOOK_URL=https://yourdomain.com/webhook

# Security
JWT_SECRET=your_super_secure_jwt_secret_32_chars_min
ENCRYPTION_KEY=your_32_character_encryption_key_here

# Monitoring
LOG_LEVEL=info
ENABLE_ANALYTICS=true
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, '.env.production'), prodEnv);
        console.log('✅ Created .env.production template');
    }

    createSystemdService() {
        const serviceName = 'neuro-pilot-ai';
        const serviceFile = `
[Unit]
Description=Neuro-Pilot-AI Resume Service
After=network.target

[Service]
Type=simple
User=nodejs
WorkingDirectory=${this.projectRoot}
ExecStart=/usr/bin/node automated-resume-workflow.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=${this.projectRoot}/.env.production

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=neuro-pilot-ai

# Security
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${this.projectRoot}

[Install]
WantedBy=multi-user.target
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, `${serviceName}.service`), serviceFile);
        console.log('✅ Created systemd service file');
        console.log(`   Copy to: sudo cp ${serviceName}.service /etc/systemd/system/`);
    }

    createHealthCheck() {
        const healthCheck = `
#!/bin/bash

# Health check script for Neuro-Pilot-AI service
URL="http://localhost:3001/health"
TIMEOUT=10

echo "Checking Neuro-Pilot-AI service health..."

response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json --max-time $TIMEOUT "$URL")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 200 ]; then
    echo "✅ Service is healthy"
    cat /tmp/health_response.json | jq '.'
    exit 0
else
    echo "❌ Service is unhealthy (HTTP $http_code)"
    cat /tmp/health_response.json
    exit 1
fi
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, 'health-check.sh'), healthCheck);
        execSync('chmod +x health-check.sh');
        console.log('✅ Created health check script');
    }

    createDeploymentScript() {
        const deployScript = `
#!/bin/bash

# Deployment script for Neuro-Pilot-AI
set -e

echo "🚀 Deploying Neuro-Pilot-AI Resume Service..."

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "❌ Don't run this script as root"
    exit 1
fi

# Check Node.js version
node_version=$(node -v | sed 's/v//')
required_version="16.0.0"

if [ "$(printf '%s\\n' "$required_version" "$node_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ Node.js version $required_version or higher required (current: $node_version)"
    exit 1
fi

# Install dependencies
echo "📥 Installing dependencies..."
npm ci --only=production

# Run tests
echo "🧪 Running tests..."
npm test

# Build if needed
if [ -f "package.json" ] && grep -q "build" package.json; then
    echo "🔨 Building application..."
    npm run build
fi

# Setup systemd service (requires sudo)
if [ -f "neuro-pilot-ai.service" ]; then
    echo "🛠  Setting up systemd service..."
    echo "Please run: sudo cp neuro-pilot-ai.service /etc/systemd/system/"
    echo "Then run: sudo systemctl enable neuro-pilot-ai"
    echo "And start: sudo systemctl start neuro-pilot-ai"
fi

echo "✅ Deployment preparation complete!"
echo "🔧 Next steps:"
echo "1. Configure your .env.production file"
echo "2. Set up SSL certificates"
echo "3. Configure domain and DNS"
echo "4. Start the service"
        `.trim();

        fs.writeFileSync(path.join(this.projectRoot, 'deploy.sh'), deployScript);
        execSync('chmod +x deploy.sh');
        console.log('✅ Created deployment script');
    }

    async deploy() {
        console.log('🚀 Starting Neuro-Pilot-AI Service Deployment...\n');

        try {
            // Create package.json if it doesn't exist
            this.loadPackageJson();

            // Install dependencies
            await this.installDependencies();

            // Create deployment files
            this.createDockerfile();
            this.createDockerCompose();
            this.createNginxConfig();
            this.createProductionEnv();
            this.createSystemdService();
            this.createHealthCheck();
            this.createDeploymentScript();

            console.log('\n🎉 Deployment files created successfully!\n');
            console.log('📋 Next Steps:');
            console.log('1. Configure your .env.production file with real API keys');
            console.log('2. Set up your domain and SSL certificates');
            console.log('3. Configure Stripe webhooks for your domain');
            console.log('4. Choose deployment method:');
            console.log('   - Docker: docker-compose up -d');
            console.log('   - Systemd: ./deploy.sh');
            console.log('   - Manual: npm start');
            console.log('\n🔍 Test deployment: ./health-check.sh');

        } catch (error) {
            console.error('❌ Deployment preparation failed:', error.message);
            throw error;
        }
    }

    async checkStatus() {
        console.log('📊 Checking service status...\n');

        try {
            const response = await fetch('http://localhost:3001/health');
            const health = await response.json();
            
            console.log('✅ Service is running');
            console.log('Health status:', health);
        } catch (error) {
            console.log('❌ Service appears to be down');
            console.log('Error:', error.message);
        }
    }
}

// CLI interface
if (require.main === module) {
    const deployer = new ServiceDeployer();
    const command = process.argv[2];

    switch (command) {
        case 'status':
            deployer.checkStatus();
            break;
        case 'deploy':
        default:
            deployer.deploy()
                .then(() => {
                    console.log('\n🚀 Ready to launch your automated resume service!');
                    process.exit(0);
                })
                .catch(error => {
                    console.error('❌ Deployment failed:', error);
                    process.exit(1);
                });
            break;
    }
}

module.exports = ServiceDeployer;