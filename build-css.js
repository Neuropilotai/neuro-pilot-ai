const fs = require('fs');
const postcss = require('postcss');
const tailwindcss = require('@tailwindcss/postcss');
const autoprefixer = require('autoprefixer');

const css = `
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom styles */
.quantum-glow {
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

.agent-card {
    transition: all 0.3s ease;
}

.agent-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
}

.status-online { 
    background: linear-gradient(135deg, #10b981, #059669); 
}

.status-idle { 
    background: linear-gradient(135deg, #f59e0b, #d97706); 
}

.status-offline { 
    background: linear-gradient(135deg, #ef4444, #dc2626); 
}

.consciousness-bar {
    background: linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4);
}
`;

async function buildCSS() {
    try {
        console.log('🎨 Building production CSS...');
        
        const result = await postcss([
            tailwindcss('./tailwind.config.js'),
            autoprefixer
        ]).process(css, { from: undefined });
        
        // Create dist directory if it doesn't exist
        if (!fs.existsSync('./dist')) {
            fs.mkdirSync('./dist');
        }
        
        fs.writeFileSync('./dist/styles.css', result.css);
        console.log('✅ CSS built successfully: ./dist/styles.css');
        
        // Also create a minified version
        const minified = result.css.replace(/\s+/g, ' ').trim();
        fs.writeFileSync('./dist/styles.min.css', minified);
        console.log('✅ Minified CSS created: ./dist/styles.min.css');
        
    } catch (error) {
        console.error('❌ Error building CSS:', error);
    }
}

buildCSS();