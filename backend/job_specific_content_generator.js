/**
 * Job-Specific Content Generator
 * Creates tailored resume content based on job type, level, and industry
 */

class JobSpecificContentGenerator {
  constructor() {
    // Content templates for different job categories
    this.contentTemplates = {
      // Entry-level positions (McDonald's, retail, etc.)
      entry_level: {
        summary_templates: {
          retail: "Enthusiastic and reliable {position} candidate with strong customer service skills and {experience}. Eager to contribute to team success while developing professional skills in a fast-paced retail environment.",
          food_service: "Dedicated team player with {experience} and excellent communication skills. Committed to providing outstanding customer service and maintaining high standards of food safety and cleanliness.",
          general: "Motivated and reliable individual with {experience} seeking an entry-level position. Strong work ethic, excellent interpersonal skills, and eager to learn and contribute to organizational success."
        },
        experience_templates: {
          retail: [
            {
              position: "Sales Associate",
              company: "Previous Retail Experience",
              period: "2023 - Present",
              description: "Provided excellent customer service, processed transactions accurately, maintained store appearance, and achieved sales targets."
            }
          ],
          food_service: [
            {
              position: "Team Member",
              company: "Previous Food Service",
              period: "2023 - Present", 
              description: "Delivered fast, friendly customer service, maintained food safety standards, handled cash transactions, and supported team operations."
            }
          ]
        },
        skills_focus: ['customer service', 'teamwork', 'reliability', 'communication', 'punctuality', 'cash handling', 'problem solving'],
        certifications: ['Food Safety Certification', 'First Aid/CPR', 'Customer Service Training']
      },

      // Professional positions
      professional: {
        summary_templates: {
          technology: "Results-driven {position} with {experience} in software development and technology solutions. Proven track record of delivering high-quality projects, collaborating effectively with cross-functional teams, and staying current with emerging technologies.",
          finance: "Detail-oriented {position} with {experience} in financial analysis and reporting. Strong analytical skills with expertise in financial modeling, risk assessment, and regulatory compliance.",
          healthcare: "Compassionate {position} with {experience} in patient care and clinical operations. Dedicated to providing quality healthcare services while maintaining strict adherence to medical protocols and patient safety standards.",
          general: "Experienced {position} with {experience} in {industry}. Proven ability to manage complex projects, drive process improvements, and deliver measurable results in dynamic business environments."
        },
        experience_templates: {
          technology: [
            {
              position: "Software Developer",
              company: "Tech Solutions Inc.",
              period: "2021 - Present",
              description: "Developed and maintained web applications using modern frameworks, collaborated with agile teams, and implemented automated testing procedures resulting in 25% reduction in deployment issues."
            }
          ],
          finance: [
            {
              position: "Financial Analyst",
              company: "Financial Services Corp",
              period: "2021 - Present",
              description: "Conducted comprehensive financial analysis, prepared detailed reports for senior management, and identified cost optimization opportunities resulting in $2M annual savings."
            }
          ]
        },
        skills_focus: ['project management', 'analytical thinking', 'leadership', 'strategic planning', 'data analysis'],
        certifications: ['PMP', 'Scrum Master', 'Industry-specific certifications']
      },

      // Executive positions (CEO, Director, etc.)
      executive: {
        summary_templates: {
          general: "Visionary {position} with {experience} driving organizational transformation and sustainable growth. Proven expertise in strategic planning, operational excellence, and stakeholder management with a track record of delivering exceptional business results.",
          technology: "Strategic technology leader with {experience} in digital transformation and innovation. Expert in scaling organizations, building high-performing teams, and driving technology initiatives that deliver competitive advantage.",
          finance: "Senior financial executive with {experience} in corporate finance, M&A, and capital markets. Demonstrated success in optimizing financial performance, managing risk, and creating shareholder value."
        },
        experience_templates: {
          general: [
            {
              position: "Senior Director of Operations",
              company: "Fortune 500 Company",
              period: "2018 - Present",
              description: "Led organization-wide transformation initiatives, managed $50M+ operational budget, and drove strategic initiatives resulting in 30% improvement in operational efficiency and $15M cost reduction."
            }
          ]
        },
        skills_focus: ['strategic leadership', 'P&L management', 'organizational transformation', 'stakeholder management', 'board relations'],
        certifications: ['Executive MBA', 'Board Certification', 'Industry Leadership Programs']
      },

      // Creative positions
      creative: {
        summary_templates: {
          design: "Creative {position} with {experience} in visual design and brand development. Passionate about creating compelling visual experiences that drive engagement and achieve business objectives.",
          marketing: "Innovative {position} with {experience} in digital marketing and brand strategy. Proven ability to develop creative campaigns that increase brand awareness and drive customer acquisition.",
          content: "Dynamic {position} with {experience} in content creation and storytelling. Expert in developing engaging content across multiple channels that resonates with target audiences."
        },
        skills_focus: ['creative thinking', 'visual design', 'brand development', 'content creation', 'digital marketing'],
        certifications: ['Adobe Certified', 'Google Analytics', 'HubSpot Certification']
      },

      // Technical positions
      technical: {
        summary_templates: {
          software: "Skilled {position} with {experience} in software development and system architecture. Expertise in {key_technologies} with a focus on building scalable, maintainable solutions.",
          data: "Data-driven {position} with {experience} in analytics and machine learning. Proven ability to extract insights from complex datasets and develop predictive models that drive business decisions.",
          infrastructure: "Technical {position} with {experience} in cloud infrastructure and DevOps. Expert in designing and implementing scalable systems that ensure high availability and performance."
        },
        skills_focus: ['programming languages', 'system design', 'cloud platforms', 'automation', 'technical leadership'],
        certifications: ['AWS Certified', 'Google Cloud Professional', 'Microsoft Azure', 'Kubernetes Certified']
      },

      // Sales positions
      sales: {
        summary_templates: {
          b2b: "Results-oriented {position} with {experience} in B2B sales and relationship management. Consistent track record of exceeding quota targets and building long-term client partnerships.",
          retail: "Customer-focused {position} with {experience} in retail sales and customer relationship management. Proven ability to drive revenue growth through exceptional service and product knowledge."
        },
        skills_focus: ['relationship building', 'negotiation', 'revenue generation', 'client management', 'sales strategy'],
        certifications: ['Sales Certification', 'CRM Platform Certified', 'Negotiation Training']
      }
    };

    // Industry-specific content modifiers
    this.industryModifiers = {
      technology: {
        keywords: ['innovation', 'scalable', 'agile', 'digital transformation', 'emerging technologies'],
        skills_emphasis: ['technical skills', 'problem solving', 'continuous learning'],
        achievements_focus: ['system performance', 'code quality', 'user experience', 'technical metrics']
      },
      finance: {
        keywords: ['compliance', 'risk management', 'ROI', 'financial modeling', 'regulatory'],
        skills_emphasis: ['analytical skills', 'attention to detail', 'regulatory knowledge'],
        achievements_focus: ['cost savings', 'revenue growth', 'risk reduction', 'efficiency improvements']
      },
      healthcare: {
        keywords: ['patient care', 'quality outcomes', 'safety protocols', 'clinical excellence'],
        skills_emphasis: ['patient care', 'clinical knowledge', 'empathy'],
        achievements_focus: ['patient outcomes', 'safety improvements', 'quality metrics', 'cost efficiency']
      },
      retail: {
        keywords: ['customer experience', 'sales performance', 'inventory management', 'team collaboration'],
        skills_emphasis: ['customer service', 'sales ability', 'teamwork'],
        achievements_focus: ['sales targets', 'customer satisfaction', 'team performance', 'operational efficiency']
      }
    };

    // Seniority level modifiers
    this.seniorityModifiers = {
      entry: {
        tone: 'enthusiastic',
        focus: ['potential', 'eagerness to learn', 'transferable skills', 'education'],
        action_words: ['learned', 'supported', 'assisted', 'contributed', 'participated']
      },
      mid: {
        tone: 'confident',
        focus: ['experience', 'achievements', 'skill development', 'project success'],
        action_words: ['managed', 'developed', 'implemented', 'improved', 'delivered']
      },
      senior: {
        tone: 'authoritative',
        focus: ['leadership', 'strategic impact', 'mentoring', 'innovation'],
        action_words: ['led', 'transformed', 'architected', 'optimized', 'pioneered']
      },
      executive: {
        tone: 'visionary',
        focus: ['strategic leadership', 'organizational impact', 'stakeholder management', 'business transformation'],
        action_words: ['orchestrated', 'spearheaded', 'revolutionized', 'strategized', 'transformed']
      }
    };
  }

  generateJobSpecificContent(jobAnalysis, candidateInfo, language = 'english') {
    const category = jobAnalysis.primary_category;
    const industry = jobAnalysis.industry || 'general';
    const seniority = jobAnalysis.seniority_level || 'mid';

    const content = {
      professional_summary: this.generateSummary(category, industry, candidateInfo, seniority),
      work_experience: this.generateExperience(category, industry, candidateInfo, seniority),
      core_skills: this.generateSkills(category, industry, candidateInfo, seniority),
      education: this.generateEducation(candidateInfo, category),
      certifications: this.generateCertifications(category, industry),
      contact_information: this.generateContactInfo(candidateInfo)
    };

    // Apply language localization if needed
    if (language === 'french') {
      return this.translateToFrench(content);
    }

    return content;
  }

  generateSummary(category, industry, candidateInfo, seniority) {
    const templates = this.contentTemplates[category]?.summary_templates || this.contentTemplates.professional.summary_templates;
    const template = templates[industry] || templates.general || 'Experienced {position} with {experience} in {industry}. Strong professional background and proven track record of success.';
    
    const position = candidateInfo.target_position || candidateInfo.name || 'Professional';
    const experience = candidateInfo.experience || '3+ years of experience';
    
    // Apply seniority tone modifications
    let summary = template
      .replace('{position}', position)
      .replace('{experience}', experience)
      .replace('{industry}', industry);

    // Add industry-specific keywords
    if (this.industryModifiers[industry]) {
      const keywords = this.industryModifiers[industry].keywords.slice(0, 2).join(' and ');
      summary += ` Strong background in ${keywords}.`;
    }

    return summary;
  }

  generateExperience(category, industry, candidateInfo, seniority) {
    const experienceBase = this.contentTemplates[category]?.experience_templates?.[industry] || 
                          this.contentTemplates.professional.experience_templates.general || [];
    
    const actionWords = this.seniorityModifiers[seniority]?.action_words || ['managed', 'developed'];
    
    // Customize experience based on candidate info
    const experience = experienceBase.map(job => ({
      ...job,
      description: this.enhanceJobDescription(job.description, actionWords, industry, seniority)
    }));

    // If candidate provided specific experience, use that
    if (candidateInfo.experience_details) {
      return candidateInfo.experience_details;
    }

    return experience;
  }

  enhanceJobDescription(description, actionWords, industry, seniority) {
    // Replace generic action words with seniority-appropriate ones
    let enhanced = description;
    
    // Add quantifiable achievements based on seniority
    const achievements = this.getAchievementsByLevel(seniority, industry);
    if (achievements.length > 0) {
      enhanced += ` ${achievements[0]}`;
    }

    return enhanced;
  }

  getAchievementsByLevel(seniority, industry) {
    const achievementMap = {
      entry: [
        "Consistently met performance targets.",
        "Received positive customer feedback scores.",
        "Successfully completed training programs."
      ],
      mid: [
        "Increased efficiency by 15-20%.",
        "Led team of 3-5 members.",
        "Delivered projects on time and under budget."
      ],
      senior: [
        "Improved departmental performance by 25-30%.",
        "Managed budgets of $1M+.",
        "Mentored junior team members."
      ],
      executive: [
        "Drove organizational transformation resulting in $10M+ impact.",
        "Led cross-functional teams of 50+ employees.",
        "Established strategic partnerships with key stakeholders."
      ]
    };

    return achievementMap[seniority] || achievementMap.mid;
  }

  generateSkills(category, industry, candidateInfo, seniority) {
    let skills = [];
    
    // Base skills from category
    const categorySkills = this.contentTemplates[category]?.skills_focus || [];
    skills.push(...categorySkills.slice(0, 4));

    // Add industry-specific skills
    if (this.industryModifiers[industry]) {
      skills.push(...this.industryModifiers[industry].skills_emphasis);
    }

    // Add candidate-provided skills
    if (candidateInfo.skills) {
      const candidateSkills = candidateInfo.skills.split(',').map(s => s.trim());
      skills.push(...candidateSkills.slice(0, 6));
    }

    // Add leadership skills for senior roles
    if (seniority === 'senior' || seniority === 'executive') {
      skills.push('Strategic Leadership', 'Team Management', 'Decision Making');
    }

    // Remove duplicates and limit to 10-12 skills
    return [...new Set(skills)].slice(0, 12);
  }

  generateEducation(candidateInfo, category) {
    // Use provided education or generate appropriate default
    if (candidateInfo.education) {
      return candidateInfo.education;
    }

    const defaultEducation = {
      entry_level: {
        degree: 'High School Diploma',
        institution: 'Local High School',
        year: '2020'
      },
      professional: {
        degree: 'Bachelor of Science',
        institution: 'State University',
        year: '2018'
      },
      executive: {
        degree: 'Master of Business Administration',
        institution: 'Prestigious University',
        year: '2015'
      }
    };

    return defaultEducation[category] || defaultEducation.professional;
  }

  generateCertifications(category, industry) {
    const certifications = this.contentTemplates[category]?.certifications || [];
    
    // Add industry-specific certifications
    if (this.industryModifiers[industry]) {
      // Industry certifications would be added here
    }

    return certifications.slice(0, 3);
  }

  generateContactInfo(candidateInfo) {
    return {
      name: candidateInfo.name || 'Professional Candidate',
      email: candidateInfo.email || 'professional@email.com',
      phone: candidateInfo.phone || '+1 (555) 123-4567',
      location: candidateInfo.location || 'United States'
    };
  }

  translateToFrench(content) {
    // French translation mapping
    const frenchSections = {
      professional_summary: 'Résumé Professionnel',
      work_experience: 'Expérience Professionnelle',
      core_skills: 'Compétences Clés',
      education: 'Formation',
      certifications: 'Certifications',
      contact_information: 'Coordonnées'
    };

    // This would include full French translation logic
    // For now, return structure with French section names
    const frenchContent = {};
    Object.keys(content).forEach(key => {
      const frenchKey = frenchSections[key] || key;
      frenchContent[frenchKey] = content[key]; // Would translate content here
    });

    return frenchContent;
  }

  // Get content recommendations for specific job types
  getContentStrategy(jobAnalysis) {
    const category = jobAnalysis.primary_category;
    const seniority = jobAnalysis.seniority_level;
    
    return {
      primary_focus: this.seniorityModifiers[seniority]?.focus || ['experience', 'skills'],
      tone: this.seniorityModifiers[seniority]?.tone || 'professional',
      content_length: this.getRecommendedLength(category, seniority),
      section_order: this.getOptimalSectionOrder(category, seniority),
      emphasis_areas: jobAnalysis.content_recommendations?.section_emphasis || []
    };
  }

  getRecommendedLength(category, seniority) {
    const lengthMap = {
      entry_level: { pages: 1, words: 300-400 },
      professional: { pages: 1-2, words: 400-600 },
      executive: { pages: 2, words: 600-800 }
    };

    return lengthMap[category] || lengthMap.professional;
  }

  getOptimalSectionOrder(category, seniority) {
    const orderMap = {
      entry: ['contact', 'summary', 'education', 'skills', 'experience', 'certifications'],
      mid: ['contact', 'summary', 'experience', 'skills', 'education', 'certifications'],
      senior: ['contact', 'summary', 'experience', 'leadership', 'skills', 'education'],
      executive: ['contact', 'executive_summary', 'leadership_experience', 'strategic_achievements', 'education', 'board_positions']
    };

    return orderMap[seniority] || orderMap.mid;
  }
}

module.exports = JobSpecificContentGenerator;