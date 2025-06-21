/**
 * Intelligent Job Classification System
 * Analyzes job descriptions to determine appropriate resume style, content, and design
 */

class JobClassifier {
  constructor() {
    // Job categories with specific patterns and requirements
    this.jobCategories = {
      // Entry-level positions
      entry_level: {
        keywords: [
          'entry level', 'junior', 'trainee', 'intern', 'assistant', 'associate',
          'no experience required', 'will train', 'recent graduate', 'part-time',
          'cashier', 'server', 'crew member', 'sales associate', 'receptionist'
        ],
        industries: ['retail', 'food service', 'customer service', 'hospitality'],
        salary_range: [0, 45000],
        content_style: 'simple',
        design_style: 'clean',
        focus: ['education', 'skills', 'enthusiasm', 'availability']
      },

      // Mid-level professional
      professional: {
        keywords: [
          'manager', 'specialist', 'coordinator', 'analyst', 'developer',
          'engineer', 'consultant', 'supervisor', 'lead', 'senior',
          '3-5 years', 'bachelor', 'experience required'
        ],
        industries: ['technology', 'finance', 'healthcare', 'consulting', 'marketing'],
        salary_range: [45000, 100000],
        content_style: 'professional',
        design_style: 'modern',
        focus: ['experience', 'achievements', 'skills', 'education']
      },

      // Executive/Leadership
      executive: {
        keywords: [
          'director', 'vice president', 'ceo', 'cto', 'cfo', 'president',
          'chief', 'head of', 'executive', 'senior director', 'managing director',
          '10+ years', 'leadership', 'strategy', 'p&l', 'board'
        ],
        industries: ['all'],
        salary_range: [100000, 500000],
        content_style: 'executive',
        design_style: 'luxury',
        focus: ['leadership', 'strategy', 'results', 'vision']
      },

      // Creative positions
      creative: {
        keywords: [
          'designer', 'artist', 'creative', 'photographer', 'writer',
          'marketing', 'brand', 'content creator', 'ux', 'ui', 'graphic',
          'video', 'animation', 'copywriter', 'social media'
        ],
        industries: ['design', 'advertising', 'media', 'entertainment'],
        salary_range: [35000, 85000],
        content_style: 'creative',
        design_style: 'artistic',
        focus: ['portfolio', 'creativity', 'projects', 'skills']
      },

      // Technical/Engineering
      technical: {
        keywords: [
          'software', 'engineer', 'developer', 'programmer', 'architect',
          'data scientist', 'devops', 'fullstack', 'backend', 'frontend',
          'machine learning', 'ai', 'cloud', 'security', 'database'
        ],
        industries: ['technology', 'software', 'fintech', 'startup'],
        salary_range: [60000, 200000],
        content_style: 'technical',
        design_style: 'tech',
        focus: ['technical_skills', 'projects', 'certifications', 'experience']
      },

      // Healthcare
      healthcare: {
        keywords: [
          'nurse', 'doctor', 'physician', 'therapist', 'medical',
          'healthcare', 'clinical', 'patient care', 'hospital',
          'pharmacy', 'dental', 'veterinary'
        ],
        industries: ['healthcare', 'medical', 'pharmaceutical'],
        salary_range: [40000, 300000],
        content_style: 'professional',
        design_style: 'medical',
        focus: ['certifications', 'experience', 'patient_care', 'education']
      },

      // Sales/Business Development
      sales: {
        keywords: [
          'sales', 'business development', 'account manager', 'representative',
          'quota', 'revenue', 'client', 'relationship', 'negotiation',
          'territory', 'commission', 'targets'
        ],
        industries: ['sales', 'business', 'technology', 'finance'],
        salary_range: [40000, 150000],
        content_style: 'results_focused',
        design_style: 'business',
        focus: ['achievements', 'numbers', 'relationships', 'results']
      },

      // Government/Public Service
      government: {
        keywords: [
          'government', 'public service', 'federal', 'state', 'municipal',
          'policy', 'administration', 'public sector', 'civil service',
          'security clearance', 'compliance'
        ],
        industries: ['government', 'public sector', 'non-profit'],
        salary_range: [35000, 120000],
        content_style: 'formal',
        design_style: 'conservative',
        focus: ['experience', 'education', 'compliance', 'service']
      }
    };

    // Industry-specific requirements
    this.industrySpecific = {
      technology: {
        must_have_skills: ['programming', 'software development', 'agile'],
        preferred_certifications: ['AWS', 'Azure', 'Google Cloud', 'Scrum'],
        keywords: ['innovation', 'scalable', 'optimization', 'automation']
      },
      finance: {
        must_have_skills: ['financial analysis', 'excel', 'reporting'],
        preferred_certifications: ['CFA', 'CPA', 'FRM'],
        keywords: ['accuracy', 'compliance', 'risk management', 'ROI']
      },
      healthcare: {
        must_have_skills: ['patient care', 'medical knowledge', 'empathy'],
        preferred_certifications: ['licensed', 'board certified', 'CPR'],
        keywords: ['patient outcomes', 'quality care', 'safety', 'compassion']
      }
    };
  }

  classifyJob(jobDescription, companyName = '', salaryRange = null) {
    const analysis = {
      primary_category: null,
      secondary_categories: [],
      seniority_level: null,
      industry: null,
      content_recommendations: {},
      design_recommendations: {},
      confidence_score: 0
    };

    const jobText = (jobDescription + ' ' + companyName).toLowerCase();
    const categoryScores = {};

    // Score each category based on keyword matches
    Object.keys(this.jobCategories).forEach(category => {
      const categoryData = this.jobCategories[category];
      let score = 0;

      // Keyword matching
      categoryData.keywords.forEach(keyword => {
        if (jobText.includes(keyword.toLowerCase())) {
          score += 2;
        }
      });

      // Salary range matching
      if (salaryRange && categoryData.salary_range) {
        const [minSalary, maxSalary] = categoryData.salary_range;
        if (salaryRange >= minSalary && salaryRange <= maxSalary) {
          score += 3;
        }
      }

      categoryScores[category] = score;
    });

    // Find primary category (highest score)
    const sortedCategories = Object.entries(categoryScores)
      .sort(([,a], [,b]) => b - a)
      .filter(([,score]) => score > 0);

    if (sortedCategories.length > 0) {
      analysis.primary_category = sortedCategories[0][0];
      analysis.confidence_score = Math.min(sortedCategories[0][1] * 10, 100);
      
      // Secondary categories (scores > 0 but not primary)
      analysis.secondary_categories = sortedCategories.slice(1, 3).map(([cat]) => cat);
    } else {
      // Default to professional if no clear match
      analysis.primary_category = 'professional';
      analysis.confidence_score = 50;
    }

    // Determine seniority level
    analysis.seniority_level = this.determineSeniorityLevel(jobText);
    
    // Determine industry
    analysis.industry = this.determineIndustry(jobText);

    // Generate recommendations
    analysis.content_recommendations = this.getContentRecommendations(analysis);
    analysis.design_recommendations = this.getDesignRecommendations(analysis);

    return analysis;
  }

  determineSeniorityLevel(jobText) {
    const seniorityIndicators = {
      entry: ['entry', 'junior', 'trainee', 'intern', 'assistant', '0-1 years', '0-2 years'],
      mid: ['mid', 'senior', 'lead', '3-5 years', '5-7 years', 'specialist', 'manager'],
      senior: ['senior', 'principal', 'staff', '7+ years', '10+ years'],
      executive: ['director', 'vp', 'vice president', 'ceo', 'cto', 'chief', 'executive', 'head of']
    };

    for (const [level, indicators] of Object.entries(seniorityIndicators)) {
      for (const indicator of indicators) {
        if (jobText.includes(indicator)) {
          return level;
        }
      }
    }

    return 'mid'; // Default
  }

  determineIndustry(jobText) {
    const industryKeywords = {
      technology: ['software', 'tech', 'startup', 'saas', 'cloud', 'ai', 'data'],
      finance: ['bank', 'financial', 'investment', 'trading', 'fintech'],
      healthcare: ['hospital', 'medical', 'health', 'pharmaceutical', 'clinical'],
      retail: ['retail', 'store', 'customer', 'sales', 'merchandise'],
      education: ['school', 'university', 'education', 'teaching', 'academic'],
      manufacturing: ['manufacturing', 'production', 'factory', 'industrial'],
      consulting: ['consulting', 'advisory', 'strategy', 'transformation']
    };

    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some(keyword => jobText.includes(keyword))) {
        return industry;
      }
    }

    return 'general';
  }

  getContentRecommendations(analysis) {
    const category = this.jobCategories[analysis.primary_category];
    
    return {
      content_style: category.content_style,
      focus_areas: category.focus,
      tone: this.getRecommendedTone(analysis),
      section_emphasis: this.getSectionEmphasis(analysis),
      keyword_strategy: this.getKeywordStrategy(analysis)
    };
  }

  getDesignRecommendations(analysis) {
    const category = this.jobCategories[analysis.primary_category];
    
    return {
      design_style: category.design_style,
      color_scheme: this.getColorScheme(analysis),
      layout_style: this.getLayoutStyle(analysis),
      font_recommendation: this.getFontRecommendation(analysis),
      visual_elements: this.getVisualElements(analysis)
    };
  }

  getRecommendedTone(analysis) {
    const toneMap = {
      entry_level: 'enthusiastic_professional',
      professional: 'confident_professional',
      executive: 'authoritative_strategic',
      creative: 'innovative_expressive',
      technical: 'precise_technical',
      healthcare: 'compassionate_professional',
      sales: 'results_driven',
      government: 'formal_service_oriented'
    };

    return toneMap[analysis.primary_category] || 'professional';
  }

  getSectionEmphasis(analysis) {
    const emphasisMap = {
      entry_level: ['education', 'skills', 'projects', 'volunteer'],
      professional: ['experience', 'achievements', 'skills', 'education'],
      executive: ['leadership', 'strategy', 'results', 'board_experience'],
      creative: ['portfolio', 'projects', 'creative_skills', 'awards'],
      technical: ['technical_skills', 'projects', 'certifications', 'experience'],
      healthcare: ['certifications', 'clinical_experience', 'patient_care', 'education'],
      sales: ['achievements', 'quota_performance', 'client_relationships', 'results'],
      government: ['clearance', 'compliance_experience', 'education', 'service_record']
    };

    return emphasisMap[analysis.primary_category] || ['experience', 'skills', 'education'];
  }

  getKeywordStrategy(analysis) {
    // Return industry-specific keywords to include
    if (analysis.industry && this.industrySpecific[analysis.industry]) {
      return this.industrySpecific[analysis.industry];
    }
    
    return {
      must_have_skills: [],
      preferred_certifications: [],
      keywords: ['professional', 'dedicated', 'results-oriented', 'collaborative']
    };
  }

  getColorScheme(analysis) {
    const colorSchemes = {
      entry_level: 'fresh_blue',
      professional: 'corporate_navy',
      executive: 'luxury_gold',
      creative: 'vibrant_multi',
      technical: 'modern_tech',
      healthcare: 'medical_green',
      sales: 'dynamic_red',
      government: 'conservative_blue'
    };

    return colorSchemes[analysis.primary_category] || 'professional_blue';
  }

  getLayoutStyle(analysis) {
    const layoutStyles = {
      entry_level: 'simple_clean',
      professional: 'structured_professional',
      executive: 'executive_elegant',
      creative: 'creative_dynamic',
      technical: 'technical_precise',
      healthcare: 'medical_trust',
      sales: 'results_focused',
      government: 'formal_traditional'
    };

    return layoutStyles[analysis.primary_category] || 'professional';
  }

  getFontRecommendation(analysis) {
    const fontMap = {
      entry_level: 'modern_sans',
      professional: 'professional_serif',
      executive: 'luxury_serif',
      creative: 'creative_display',
      technical: 'clean_mono',
      healthcare: 'trustworthy_sans',
      sales: 'bold_sans',
      government: 'traditional_serif'
    };

    return fontMap[analysis.primary_category] || 'professional_sans';
  }

  getVisualElements(analysis) {
    const visualElements = {
      entry_level: ['clean_lines', 'friendly_icons'],
      professional: ['professional_icons', 'subtle_graphics'],
      executive: ['elegant_borders', 'premium_accents'],
      creative: ['creative_graphics', 'color_blocks', 'artistic_elements'],
      technical: ['tech_icons', 'geometric_elements'],
      healthcare: ['medical_icons', 'trust_symbols'],
      sales: ['performance_charts', 'dynamic_elements'],
      government: ['formal_borders', 'traditional_elements']
    };

    return visualElements[analysis.primary_category] || ['professional_elements'];
  }

  // Get specific templates for each job category
  getCanvaTemplateRecommendations(analysis, packageType = 'professional') {
    const baseTemplate = `${analysis.primary_category}_${packageType}`;
    const fallbackTemplate = `${packageType}_${analysis.design_recommendations.design_style}`;
    
    return {
      primary_template: baseTemplate,
      fallback_template: fallbackTemplate,
      style_modifiers: {
        color_scheme: analysis.design_recommendations.color_scheme,
        layout: analysis.design_recommendations.layout_style,
        font: analysis.design_recommendations.font_recommendation,
        visual_elements: analysis.design_recommendations.visual_elements
      }
    };
  }
}

module.exports = JobClassifier;