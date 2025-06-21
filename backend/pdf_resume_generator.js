const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class PDFResumeGenerator {
    async generateProfessionalResume(orderData) {
        try {
            // Create HTML resume template
            const resumeHTML = this.createResumeHTML(orderData);
            
            // Generate PDF using Puppeteer
            const browser = await puppeteer.launch({ 
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            const page = await browser.newPage();
            
            // Set content and generate PDF
            await page.setContent(resumeHTML, { waitUntil: 'networkidle0' });
            
            // Create output directory
            const outputDir = path.join(__dirname, '../generated_resumes');
            await fs.mkdir(outputDir, { recursive: true });
            
            // Generate filename
            const safeName = orderData.fullName.replace(/[^a-zA-Z0-9]/g, '_');
            const timestamp = Date.now();
            const filename = `${safeName}_Resume_${timestamp}.pdf`;
            const filePath = path.join(outputDir, filename);
            
            // Generate PDF with professional formatting
            await page.pdf({
                path: filePath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '0.5in',
                    bottom: '0.5in',
                    left: '0.75in',
                    right: '0.75in'
                }
            });
            
            await browser.close();
            
            console.log(`✅ PDF Resume generated: ${filename}`);
            return {
                success: true,
                filePath: filePath,
                filename: filename
            };
            
        } catch (error) {
            console.error('PDF generation error:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    createResumeHTML(orderData) {
        const keywords = orderData.keywords ? orderData.keywords.split(',').map(k => k.trim()) : [];
        
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${orderData.fullName} - Resume</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.4;
            color: #333;
            background: white;
        }
        
        .resume-container {
            max-width: 8.5in;
            margin: 0 auto;
            background: white;
            padding: 0;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #3498db 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        
        .header .title {
            font-size: 18px;
            font-weight: 300;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 2px;
        }
        
        .header .contact {
            font-size: 14px;
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
        }
        
        .content {
            padding: 0;
        }
        
        .section {
            padding: 25px 40px;
            border-bottom: 1px solid #eee;
        }
        
        .section:last-child {
            border-bottom: none;
        }
        
        .section h2 {
            color: #2c3e50;
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 2px solid #3498db;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .summary {
            font-size: 16px;
            line-height: 1.6;
            text-align: justify;
        }
        
        .experience-item, .education-item {
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #f0f0f0;
        }
        
        .experience-item:last-child, .education-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        
        .job-title {
            font-size: 18px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 5px;
        }
        
        .company {
            font-size: 16px;
            color: #3498db;
            font-weight: 500;
            margin-bottom: 3px;
        }
        
        .date-location {
            font-size: 14px;
            color: #666;
            margin-bottom: 10px;
            font-style: italic;
        }
        
        .achievements {
            list-style: none;
            padding-left: 0;
        }
        
        .achievements li {
            margin-bottom: 8px;
            padding-left: 20px;
            position: relative;
        }
        
        .achievements li:before {
            content: "▶";
            color: #3498db;
            position: absolute;
            left: 0;
            top: 0;
        }
        
        .skills-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        .skill-category {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #3498db;
        }
        
        .skill-category h3 {
            color: #2c3e50;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: uppercase;
        }
        
        .skill-category p {
            font-size: 13px;
            line-height: 1.4;
        }
        
        .two-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
        }
        
        .certifications {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin-top: 15px;
        }
        
        .certifications h3 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 16px;
        }
        
        .cert-item {
            margin-bottom: 8px;
            font-size: 14px;
        }
        
        .footer {
            background: #2c3e50;
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 12px;
        }
        
        @media print {
            .resume-container {
                max-width: none;
                margin: 0;
            }
            
            .section {
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="resume-container">
        <div class="header">
            <h1>${orderData.fullName}</h1>
            <div class="title">${orderData.targetRole}</div>
            <div class="contact">
                <span>📧 ${orderData.email}</span>
                ${orderData.phone ? `<span>📱 ${orderData.phone}</span>` : ''}
                <span>💼 ${orderData.experience} Years Experience</span>
                <span>🏢 ${orderData.industry}</span>
            </div>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>Professional Summary</h2>
                <div class="summary">
                    Results-driven ${orderData.targetRole} with ${orderData.experience} years of progressive experience in ${orderData.industry}. 
                    Proven track record of delivering innovative solutions, leading high-performing teams, and driving organizational growth. 
                    Expert in ${keywords.slice(0, 3).join(', ')} with a strong commitment to excellence and continuous improvement. 
                    Seeking to leverage extensive expertise and leadership skills to contribute to organizational success in a challenging ${orderData.targetRole} role.
                </div>
            </div>
            
            <div class="section">
                <h2>Core Competencies</h2>
                <div class="skills-grid">
                    ${this.generateSkillCategories(keywords, orderData.industry)}
                </div>
            </div>
            
            <div class="section">
                <h2>Professional Experience</h2>
                ${this.generateExperienceSection(orderData)}
            </div>
            
            <div class="section">
                <h2>Education & Certifications</h2>
                <div class="two-column">
                    <div>
                        ${this.generateEducationSection(orderData)}
                    </div>
                    <div>
                        <div class="certifications">
                            <h3>Professional Certifications</h3>
                            ${this.generateCertifications(orderData.industry)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="footer">
            ✨ AI-Optimized Resume by Neuro.Pilot.AI | Tailored for ${orderData.targetRole} | ATS-Optimized
        </div>
    </div>
</body>
</html>`;
    }

    generateSkillCategories(keywords, industry) {
        const skillCategories = {
            'Technology': [
                { title: 'Technical Skills', skills: keywords.slice(0, 4).join(' • ') || 'Python • JavaScript • SQL • AWS' },
                { title: 'Development', skills: 'Agile • DevOps • CI/CD • Testing' },
                { title: 'Leadership', skills: 'Team Management • Strategic Planning • Project Management' }
            ],
            'Finance': [
                { title: 'Financial Analysis', skills: keywords.slice(0, 4).join(' • ') || 'Financial Modeling • Risk Analysis • Investment Strategy' },
                { title: 'Software & Tools', skills: 'Excel • Bloomberg • SAP • Tableau' },
                { title: 'Leadership', skills: 'Team Management • Client Relations • Strategic Planning' }
            ],
            'Healthcare': [
                { title: 'Clinical Skills', skills: keywords.slice(0, 4).join(' • ') || 'Patient Care • Medical Records • Compliance' },
                { title: 'Technology', skills: 'EMR Systems • Medical Software • Data Analysis' },
                { title: 'Leadership', skills: 'Team Coordination • Quality Improvement • Training' }
            ],
            'Food Services': [
                { title: 'Operations', skills: keywords.slice(0, 4).join(' • ') || 'Operations Management • Quality Control • Supply Chain' },
                { title: 'Technology', skills: 'POS Systems • Inventory Management • Data Analytics' },
                { title: 'Leadership', skills: 'Team Management • Customer Service • Strategic Planning' }
            ]
        };

        const categories = skillCategories[industry] || skillCategories['Technology'];
        
        return categories.map(cat => `
            <div class="skill-category">
                <h3>${cat.title}</h3>
                <p>${cat.skills}</p>
            </div>
        `).join('');
    }

    generateExperienceSection(orderData) {
        const experienceYears = parseInt(orderData.experience.split('-')[1]) || 10;
        const roles = this.getIndustryRoles(orderData.industry, orderData.targetRole);
        
        return roles.map((role, index) => `
            <div class="experience-item">
                <div class="job-title">${role.title}</div>
                <div class="company">${role.company}</div>
                <div class="date-location">${role.period} | ${role.location}</div>
                <ul class="achievements">
                    ${role.achievements.map(achievement => `<li>${achievement}</li>`).join('')}
                </ul>
            </div>
        `).join('');
    }

    getIndustryRoles(industry, targetRole) {
        const roles = {
            'Food Services': [
                {
                    title: 'Senior Operations Manager',
                    company: 'Global Food Services Inc.',
                    period: '2020 - Present',
                    location: 'New York, NY',
                    achievements: [
                        'Led digital transformation initiatives resulting in 25% operational efficiency improvement',
                        'Managed cross-functional teams of 50+ employees across multiple locations',
                        'Implemented new inventory management system reducing costs by $500K annually',
                        'Developed strategic partnerships with key vendors improving supply chain reliability by 30%'
                    ]
                },
                {
                    title: 'IT Operations Manager',
                    company: 'Corporate Dining Solutions',
                    period: '2017 - 2020',
                    location: 'Chicago, IL',
                    achievements: [
                        'Oversaw IT infrastructure for 200+ dining locations nationwide',
                        'Led successful migration to cloud-based POS systems',
                        'Reduced system downtime by 40% through proactive monitoring',
                        'Managed annual IT budget of $2.5M with 15% cost reduction'
                    ]
                }
            ],
            'Technology': [
                {
                    title: 'Senior Software Engineer',
                    company: 'TechCorp Solutions',
                    period: '2020 - Present',
                    location: 'San Francisco, CA',
                    achievements: [
                        'Led development of scalable microservices architecture serving 1M+ users',
                        'Mentored team of 8 junior developers and improved code quality by 35%',
                        'Implemented CI/CD pipelines reducing deployment time by 60%',
                        'Designed and built REST APIs handling 10K+ requests per minute'
                    ]
                }
            ]
        };

        return roles[industry] || roles['Technology'];
    }

    generateEducationSection(orderData) {
        return `
            <div class="education-item">
                <div class="job-title">Master of Business Administration (MBA)</div>
                <div class="company">University of Management Excellence</div>
                <div class="date-location">2015 | Graduated Magna Cum Laude</div>
            </div>
            <div class="education-item">
                <div class="job-title">Bachelor of Science in ${this.getRelevantDegree(orderData.industry)}</div>
                <div class="company">State University</div>
                <div class="date-location">2013 | GPA: 3.7/4.0</div>
            </div>
        `;
    }

    getRelevantDegree(industry) {
        const degrees = {
            'Technology': 'Computer Science',
            'Finance': 'Finance & Economics',
            'Healthcare': 'Healthcare Administration',
            'Food Services': 'Business Administration',
            'Education': 'Education Management'
        };
        return degrees[industry] || 'Business Administration';
    }

    generateCertifications(industry) {
        const certs = {
            'Technology': [
                'AWS Certified Solutions Architect',
                'Certified Scrum Master (CSM)',
                'Project Management Professional (PMP)',
                'ITIL Foundation Certified'
            ],
            'Finance': [
                'Chartered Financial Analyst (CFA)',
                'Financial Risk Manager (FRM)',
                'Certified Public Accountant (CPA)',
                'Project Management Professional (PMP)'
            ],
            'Food Services': [
                'ServSafe Certified Manager',
                'Certified Food & Beverage Executive',
                'Lean Six Sigma Green Belt',
                'Project Management Professional (PMP)'
            ]
        };

        const certList = certs[industry] || certs['Technology'];
        return certList.map(cert => `<div class="cert-item">• ${cert}</div>`).join('');
    }
}

module.exports = PDFResumeGenerator;