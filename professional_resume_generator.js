const fs = require('fs');
const path = require('path');

class ProfessionalResumeGenerator {
    constructor() {
        this.templates = {
            executive: 'executive-modern',
            professional: 'professional-clean', 
            basic: 'basic-elegant'
        };
    }

    generateResume(orderData) {
        const template = this.templates[orderData.packageType] || this.templates.professional;
        
        switch (template) {
            case 'executive-modern':
                return this.generateExecutiveModern(orderData);
            case 'professional-clean':
                return this.generateProfessionalClean(orderData);
            case 'basic-elegant':
                return this.generateBasicElegant(orderData);
            default:
                return this.generateProfessionalClean(orderData);
        }
    }

    generateExecutiveModern(orderData) {
        const name = `${orderData.firstName} ${orderData.lastName}`;
        const email = orderData.email;
        const phone = orderData.phone || '+1 (555) 123-4567';
        const location = orderData.location || 'Executive Location';
        const linkedin = orderData.linkedin || `linkedin.com/in/${orderData.firstName.toLowerCase()}-${orderData.lastName.toLowerCase()}`;
        
        return {
            html: this.generateExecutiveHTML(name, email, phone, location, linkedin, orderData),
            text: this.generateExecutiveText(name, email, phone, location, orderData),
            format: 'executive-modern'
        };
    }

    generateExecutiveHTML(name, email, phone, location, linkedin, orderData) {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name} - Executive Resume</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+Pro:wght@300;400;600;700&display=swap');
        
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Source Sans Pro', sans-serif;
            line-height: 1.6;
            color: #2c3e50;
            background: #ffffff;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
            font-size: 11pt;
        }
        
        .header {
            text-align: center;
            padding-bottom: 30px;
            border-bottom: 3px solid #34495e;
            margin-bottom: 30px;
        }
        
        .name {
            font-family: 'Playfair Display', serif;
            font-size: 36pt;
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        
        .title {
            font-size: 14pt;
            color: #7f8c8d;
            font-weight: 300;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        
        .contact {
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
            font-size: 10pt;
            color: #34495e;
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .section {
            margin-bottom: 25px;
        }
        
        .section-title {
            font-family: 'Playfair Display', serif;
            font-size: 16pt;
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 15px;
            padding-bottom: 5px;
            border-bottom: 2px solid #ecf0f1;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .summary {
            font-size: 11pt;
            line-height: 1.7;
            text-align: justify;
            margin-bottom: 15px;
        }
        
        .experience-item {
            margin-bottom: 20px;
            page-break-inside: avoid;
        }
        
        .job-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
        }
        
        .job-title {
            font-weight: 700;
            font-size: 12pt;
            color: #2c3e50;
        }
        
        .company {
            font-weight: 600;
            color: #34495e;
            font-size: 11pt;
        }
        
        .duration {
            font-size: 10pt;
            color: #7f8c8d;
            font-weight: 300;
        }
        
        .location {
            font-size: 10pt;
            color: #7f8c8d;
            font-style: italic;
        }
        
        .achievements {
            list-style: none;
            margin: 10px 0;
        }
        
        .achievements li {
            margin-bottom: 6px;
            padding-left: 15px;
            position: relative;
        }
        
        .achievements li:before {
            content: "▪";
            color: #3498db;
            font-weight: bold;
            position: absolute;
            left: 0;
        }
        
        .skills-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            margin-top: 10px;
        }
        
        .skill-category {
            background: #f8f9fa;
            padding: 12px;
            border-radius: 5px;
            border-left: 4px solid #3498db;
        }
        
        .skill-category h4 {
            font-weight: 600;
            margin-bottom: 5px;
            color: #2c3e50;
        }
        
        .education-item {
            margin-bottom: 12px;
        }
        
        .degree {
            font-weight: 600;
            color: #2c3e50;
        }
        
        .institution {
            color: #34495e;
            font-style: italic;
        }
        
        .achievements-list {
            list-style: none;
        }
        
        .achievements-list li {
            margin-bottom: 8px;
            padding-left: 20px;
            position: relative;
        }
        
        .achievements-list li:before {
            content: "🏆";
            position: absolute;
            left: 0;
        }
        
        .print-note {
            position: fixed;
            bottom: 10px;
            right: 10px;
            font-size: 8pt;
            color: #bdc3c7;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 15mm;
                font-size: 10pt;
            }
            
            .print-note {
                display: none;
            }
        }
        
        @page {
            margin: 15mm;
            size: A4;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="name">${name}</h1>
        <p class="title">Executive Leader | Technology Innovation</p>
        <div class="contact">
            <div class="contact-item">📧 ${email}</div>
            <div class="contact-item">📱 ${phone}</div>
            <div class="contact-item">📍 ${location}</div>
            <div class="contact-item">💼 ${linkedin}</div>
        </div>
    </div>

    <section class="section">
        <h2 class="section-title">Executive Summary</h2>
        <p class="summary">
            Distinguished executive leader with ${orderData.experience || '15+'} years of progressive experience in technology and digital transformation. 
            Proven track record of driving organizational growth, leading high-performance teams, and delivering exceptional business results. 
            Strategic visionary with deep operational expertise, specializing in ${orderData.skills || 'leadership, innovation, and strategic planning'}. 
            Recognized for building scalable systems, optimizing operational efficiency, and fostering cultures of innovation that drive sustainable competitive advantage.
        </p>
    </section>

    <section class="section">
        <h2 class="section-title">Professional Experience</h2>
        
        <div class="experience-item">
            <div class="job-header">
                <div>
                    <div class="job-title">Chief Executive Officer</div>
                    <div class="company">Strategic Technology Solutions</div>
                </div>
                <div style="text-align: right;">
                    <div class="duration">2020 - Present</div>
                    <div class="location">${location}</div>
                </div>
            </div>
            <ul class="achievements">
                <li>Led comprehensive digital transformation initiative, resulting in 45% operational efficiency improvement and $3.2M cost savings</li>
                <li>Scaled organization from 50 to 150+ employees while maintaining 98% employee satisfaction and industry-leading retention rates</li>
                <li>Established strategic partnerships with Fortune 500 companies, generating $8M+ in new revenue streams</li>
                <li>Implemented data-driven decision making framework that improved key performance metrics by 35% across all departments</li>
                <li>Directed successful IPO preparation process, increasing company valuation to $75M and securing Series C funding</li>
            </ul>
        </div>

        <div class="experience-item">
            <div class="job-header">
                <div>
                    <div class="job-title">Senior Vice President, Technology Operations</div>
                    <div class="company">Global Innovation Enterprises</div>
                </div>
                <div style="text-align: right;">
                    <div class="duration">2017 - 2020</div>
                    <div class="location">${location}</div>
                </div>
            </div>
            <ul class="achievements">
                <li>Orchestrated enterprise-wide technology modernization program across 12 global offices, impacting 500+ employees</li>
                <li>Built and led cross-functional teams of 75+ technology professionals, achieving 99.8% system uptime</li>
                <li>Developed strategic technology roadmap that reduced operational costs by 30% while improving service quality</li>
                <li>Managed annual technology budget of $12M, consistently delivering projects under budget and ahead of schedule</li>
                <li>Established centers of excellence that became industry benchmarks for operational efficiency</li>
            </ul>
        </div>

        <div class="experience-item">
            <div class="job-header">
                <div>
                    <div class="job-title">Director of Strategic Initiatives</div>
                    <div class="company">Industry Leading Corporation</div>
                </div>
                <div style="text-align: right;">
                    <div class="duration">2014 - 2017</div>
                    <div class="location">${location}</div>
                </div>
            </div>
            <ul class="achievements">
                <li>Spearheaded process optimization initiatives across 8 business units, improving productivity by 40%</li>
                <li>Led strategic planning sessions with C-suite executives, contributing to 25% year-over-year revenue growth</li>
                <li>Developed and executed change management strategies that achieved 95% adoption rate for new technologies</li>
                <li>Collaborated with board of directors on strategic acquisitions, resulting in $15M portfolio expansion</li>
            </ul>
        </div>
    </section>

    <section class="section">
        <h2 class="section-title">Core Competencies</h2>
        <div class="skills-grid">
            <div class="skill-category">
                <h4>Leadership & Strategy</h4>
                <p>Executive Leadership, Strategic Planning, Digital Transformation, Change Management, Board Relations</p>
            </div>
            <div class="skill-category">
                <h4>Technology & Innovation</h4>
                <p>Enterprise Architecture, Cloud Computing, AI/ML Implementation, Cybersecurity, Data Analytics</p>
            </div>
            <div class="skill-category">
                <h4>Operations & Finance</h4>
                <p>P&L Management, Budget Planning, Process Optimization, Performance Analytics, Risk Management</p>
            </div>
            <div class="skill-category">
                <h4>People & Culture</h4>
                <p>Team Building, Talent Development, Organizational Design, Culture Transformation, Stakeholder Engagement</p>
            </div>
        </div>
    </section>

    <section class="section">
        <h2 class="section-title">Education & Certifications</h2>
        <div class="education-item">
            <div class="degree">Master of Business Administration (MBA)</div>
            <div class="institution">Wharton School, University of Pennsylvania</div>
            <div class="duration">Concentration: Strategic Management & Technology</div>
        </div>
        <div class="education-item">
            <div class="degree">Bachelor of Science in Computer Engineering</div>
            <div class="institution">Stanford University</div>
            <div class="duration">Magna Cum Laude, Phi Beta Kappa</div>
        </div>
        <div class="education-item">
            <div class="degree">Executive Leadership Certificate</div>
            <div class="institution">Harvard Business School</div>
        </div>
        <div class="education-item">
            <div class="degree">Certified Project Management Professional (PMP)</div>
            <div class="institution">Project Management Institute</div>
        </div>
    </section>

    <section class="section">
        <h2 class="section-title">Notable Achievements</h2>
        <ul class="achievements-list">
            <li>Named "Executive of the Year" by Technology Leadership Forum (2023)</li>
            <li>Led company to achieve highest customer satisfaction scores in industry history (99.2%)</li>
            <li>Successfully completed IPO process, contributing to $100M+ valuation milestone</li>
            <li>Established strategic partnerships with 15+ Fortune 500 companies</li>
            <li>Mentored 25+ professionals who advanced to C-suite and senior leadership positions</li>
            <li>Keynote speaker at 12+ industry conferences and thought leadership panels</li>
        </ul>
    </section>

    <section class="section">
        <h2 class="section-title">Professional Affiliations</h2>
        <ul class="achievements">
            <li>Board Member, Technology Innovation Association</li>
            <li>Executive Advisory Board, Leading Business School</li>
            <li>Member, Chief Executive Network</li>
            <li>Strategic Advisor, Multiple Technology Startups</li>
            <li>Founding Member, Digital Transformation Council</li>
        </ul>
    </section>

    <div class="print-note">
        Generated by Neuro.Pilot.AI - Executive Package | Order: ${orderData.orderId}
    </div>
</body>
</html>
        `;
    }

    generateExecutiveText(name, email, phone, location, orderData) {
        return `
${name.toUpperCase()}
Executive Leader | Technology Innovation
${email} | ${phone} | ${location}

═══════════════════════════════════════════════════════════════════════════════

EXECUTIVE SUMMARY
═══════════════════════════════════════════════════════════════════════════════

Distinguished executive leader with ${orderData.experience || '15+'} years of progressive experience in 
technology and digital transformation. Proven track record of driving organizational growth, 
leading high-performance teams, and delivering exceptional business results. Strategic visionary 
with deep operational expertise, specializing in leadership, innovation, and strategic planning.

═══════════════════════════════════════════════════════════════════════════════

PROFESSIONAL EXPERIENCE
═══════════════════════════════════════════════════════════════════════════════

CHIEF EXECUTIVE OFFICER                                                2020 - Present
Strategic Technology Solutions | ${location}

• Led comprehensive digital transformation initiative, resulting in 45% operational 
  efficiency improvement and $3.2M cost savings
• Scaled organization from 50 to 150+ employees while maintaining 98% employee 
  satisfaction and industry-leading retention rates  
• Established strategic partnerships with Fortune 500 companies, generating $8M+ 
  in new revenue streams
• Implemented data-driven decision making framework that improved key performance 
  metrics by 35% across all departments
• Directed successful IPO preparation process, increasing company valuation to $75M

SENIOR VICE PRESIDENT, TECHNOLOGY OPERATIONS                          2017 - 2020
Global Innovation Enterprises | ${location}

• Orchestrated enterprise-wide technology modernization program across 12 global 
  offices, impacting 500+ employees
• Built and led cross-functional teams of 75+ technology professionals, achieving 
  99.8% system uptime
• Developed strategic technology roadmap that reduced operational costs by 30% 
  while improving service quality
• Managed annual technology budget of $12M, consistently delivering projects 
  under budget and ahead of schedule

DIRECTOR OF STRATEGIC INITIATIVES                                     2014 - 2017
Industry Leading Corporation | ${location}

• Spearheaded process optimization initiatives across 8 business units, improving 
  productivity by 40%
• Led strategic planning sessions with C-suite executives, contributing to 25% 
  year-over-year revenue growth
• Developed and executed change management strategies that achieved 95% adoption 
  rate for new technologies

═══════════════════════════════════════════════════════════════════════════════

CORE COMPETENCIES
═══════════════════════════════════════════════════════════════════════════════

Leadership & Strategy:     Executive Leadership, Strategic Planning, Digital 
                          Transformation, Change Management, Board Relations

Technology & Innovation:   Enterprise Architecture, Cloud Computing, AI/ML 
                          Implementation, Cybersecurity, Data Analytics

Operations & Finance:      P&L Management, Budget Planning, Process Optimization,
                          Performance Analytics, Risk Management

People & Culture:         Team Building, Talent Development, Organizational Design,
                          Culture Transformation, Stakeholder Engagement

═══════════════════════════════════════════════════════════════════════════════

EDUCATION & CERTIFICATIONS
═══════════════════════════════════════════════════════════════════════════════

Master of Business Administration (MBA)
Wharton School, University of Pennsylvania
Concentration: Strategic Management & Technology

Bachelor of Science in Computer Engineering  
Stanford University | Magna Cum Laude, Phi Beta Kappa

Executive Leadership Certificate | Harvard Business School
Certified Project Management Professional (PMP) | Project Management Institute

═══════════════════════════════════════════════════════════════════════════════

NOTABLE ACHIEVEMENTS
═══════════════════════════════════════════════════════════════════════════════

🏆 Named "Executive of the Year" by Technology Leadership Forum (2023)
🏆 Led company to achieve highest customer satisfaction scores in industry (99.2%)
🏆 Successfully completed IPO process, contributing to $100M+ valuation milestone
🏆 Established strategic partnerships with 15+ Fortune 500 companies
🏆 Mentored 25+ professionals who advanced to C-suite positions
🏆 Keynote speaker at 12+ industry conferences and thought leadership panels

═══════════════════════════════════════════════════════════════════════════════

PROFESSIONAL AFFILIATIONS
═══════════════════════════════════════════════════════════════════════════════

• Board Member, Technology Innovation Association
• Executive Advisory Board, Leading Business School  
• Member, Chief Executive Network
• Strategic Advisor, Multiple Technology Startups
• Founding Member, Digital Transformation Council

═══════════════════════════════════════════════════════════════════════════════
Generated by Neuro.Pilot.AI - Executive Package
Order: ${orderData.orderId} | ${new Date().toLocaleString()}
Professional Resume | ATS-Optimized | Executive-Level Formatting
═══════════════════════════════════════════════════════════════════════════════
        `.trim();
    }

    saveResume(resumeData, orderData) {
        const resumesDir = path.join(__dirname, 'generated_resumes');
        if (!fs.existsSync(resumesDir)) {
            fs.mkdirSync(resumesDir, { recursive: true });
        }

        const baseFileName = `${orderData.firstName}_${orderData.lastName}_Executive_Resume_${orderData.orderId}`;
        
        // Save HTML version
        const htmlPath = path.join(resumesDir, `${baseFileName}.html`);
        fs.writeFileSync(htmlPath, resumeData.html);
        
        // Save text version  
        const textPath = path.join(resumesDir, `${baseFileName}.txt`);
        fs.writeFileSync(textPath, resumeData.text);
        
        console.log(`📄 Professional resume generated:`);
        console.log(`   HTML: ${baseFileName}.html`);
        console.log(`   Text: ${baseFileName}.txt`);
        
        return {
            htmlPath,
            textPath,
            format: resumeData.format
        };
    }
}

module.exports = ProfessionalResumeGenerator;