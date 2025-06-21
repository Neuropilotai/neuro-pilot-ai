/**
 * Canva Template Library
 * Comprehensive template system with job-specific designs and patterns
 */

class CanvaTemplateLibrary {
  constructor() {
    // Extensive template library organized by job type and design style
    this.templateLibrary = {
      // Entry-level job templates (clean, simple, approachable)
      entry_level: {
        basic: {
          retail: {
            english: 'entry-retail-clean-en',
            french: 'entry-retail-propre-fr',
            description: 'Clean, friendly design perfect for retail positions',
            features: ['easy_to_read', 'approachable_colors', 'clear_sections'],
            color_scheme: 'friendly_blue'
          },
          food_service: {
            english: 'entry-food-service-en',
            french: 'entry-service-alimentaire-fr',
            description: 'Professional yet approachable for food service roles',
            features: ['trust_building', 'clean_layout', 'safety_emphasis'],
            color_scheme: 'warm_orange'
          },
          general: {
            english: 'entry-general-fresh-en',
            french: 'entry-general-frais-fr',
            description: 'Fresh, modern design for any entry-level position',
            features: ['modern_typography', 'optimistic_feel', 'skill_focus'],
            color_scheme: 'fresh_green'
          }
        },
        professional: {
          retail: {
            english: 'entry-retail-pro-en',
            french: 'entry-retail-pro-fr',
            description: 'Enhanced retail template with professional touch',
            features: ['customer_focus', 'team_oriented', 'growth_minded'],
            color_scheme: 'professional_purple'
          }
        },
        executive: {
          general: {
            english: 'entry-executive-track-en',
            french: 'entry-executif-parcours-fr',
            description: 'Entry-level template for management track positions',
            features: ['leadership_potential', 'career_focused', 'ambitious_design'],
            color_scheme: 'ambitious_navy'
          }
        }
      },

      // Professional level templates
      professional: {
        basic: {
          technology: {
            english: 'prof-tech-modern-en',
            french: 'prof-tech-moderne-fr',
            description: 'Modern tech-focused professional template',
            features: ['tech_icons', 'clean_code_aesthetics', 'innovation_focused'],
            color_scheme: 'tech_blue'
          },
          finance: {
            english: 'prof-finance-trust-en',
            french: 'prof-finance-confiance-fr',
            description: 'Professional finance template emphasizing trust',
            features: ['trustworthy_design', 'data_focused', 'precision_layout'],
            color_scheme: 'finance_navy'
          },
          healthcare: {
            english: 'prof-health-care-en',
            french: 'prof-sante-soin-fr',
            description: 'Healthcare professional template with caring design',
            features: ['caring_colors', 'professional_medical', 'trust_building'],
            color_scheme: 'medical_green'
          },
          marketing: {
            english: 'prof-marketing-creative-en',
            french: 'prof-marketing-creatif-fr',
            description: 'Creative marketing professional template',
            features: ['brand_focused', 'creative_elements', 'results_oriented'],
            color_scheme: 'marketing_orange'
          }
        },
        professional: {
          technology: {
            english: 'prof-tech-advanced-en',
            french: 'prof-tech-avance-fr',
            description: 'Advanced tech template with sophisticated design',
            features: ['advanced_layouts', 'tech_graphics', 'innovation_showcase'],
            color_scheme: 'advanced_tech'
          },
          finance: {
            english: 'prof-finance-premium-en',
            french: 'prof-finance-premium-fr',
            description: 'Premium finance template for senior professionals',
            features: ['premium_design', 'data_visualization', 'executive_ready'],
            color_scheme: 'premium_gold'
          }
        }
      },

      // Executive level templates (luxury, sophisticated)
      executive: {
        basic: {
          general: {
            english: 'exec-leadership-classic-en',
            french: 'exec-leadership-classique-fr',
            description: 'Classic executive template emphasizing leadership',
            features: ['executive_presence', 'leadership_focus', 'sophisticated_design'],
            color_scheme: 'executive_charcoal'
          },
          technology: {
            english: 'exec-tech-visionary-en',
            french: 'exec-tech-visionnaire-fr',
            description: 'Visionary tech executive template',
            features: ['innovation_leadership', 'digital_transformation', 'future_focused'],
            color_scheme: 'tech_executive'
          }
        },
        professional: {
          general: {
            english: 'exec-premium-leadership-en',
            french: 'exec-premium-leadership-fr',
            description: 'Premium executive template with gold accents',
            features: ['luxury_design', 'gold_accents', 'board_ready'],
            color_scheme: 'luxury_gold'
          },
          finance: {
            english: 'exec-finance-cfo-en',
            french: 'exec-finance-directeur-fr',
            description: 'CFO-level executive template',
            features: ['financial_leadership', 'strategic_focus', 'board_presentation'],
            color_scheme: 'financial_executive'
          }
        },
        executive: {
          ceo: {
            english: 'exec-ceo-platinum-en',
            french: 'exec-pdg-platine-fr',
            description: 'Ultra-premium CEO template',
            features: ['platinum_design', 'visionary_leadership', 'transformation_focus'],
            color_scheme: 'platinum_executive'
          }
        }
      },

      // Creative industry templates
      creative: {
        basic: {
          design: {
            english: 'creative-design-portfolio-en',
            french: 'creative-design-portfolio-fr',
            description: 'Portfolio-focused creative design template',
            features: ['portfolio_showcase', 'creative_layout', 'visual_impact'],
            color_scheme: 'creative_rainbow'
          },
          marketing: {
            english: 'creative-marketing-brand-en',
            french: 'creative-marketing-marque-fr',
            description: 'Brand-focused creative marketing template',
            features: ['brand_storytelling', 'creative_elements', 'campaign_showcase'],
            color_scheme: 'brand_vibrant'
          }
        },
        professional: {
          design: {
            english: 'creative-design-senior-en',
            french: 'creative-design-senior-fr',
            description: 'Senior creative professional template',
            features: ['sophisticated_creativity', 'leadership_showcase', 'award_focus'],
            color_scheme: 'sophisticated_creative'
          }
        }
      },

      // Technical/Engineering templates
      technical: {
        basic: {
          software: {
            english: 'tech-software-dev-en',
            french: 'tech-developpeur-logiciel-fr',
            description: 'Software developer focused template',
            features: ['code_aesthetics', 'project_showcase', 'tech_stack_display'],
            color_scheme: 'developer_blue'
          },
          data: {
            english: 'tech-data-scientist-en',
            french: 'tech-data-scientist-fr',
            description: 'Data science template with analytics focus',
            features: ['data_visualization', 'analytics_focus', 'insight_driven'],
            color_scheme: 'data_purple'
          },
          devops: {
            english: 'tech-devops-infrastructure-en',
            french: 'tech-devops-infrastructure-fr',
            description: 'DevOps/Infrastructure template',
            features: ['system_focus', 'automation_emphasis', 'scalability_showcase'],
            color_scheme: 'infrastructure_orange'
          }
        },
        professional: {
          architect: {
            english: 'tech-architect-senior-en',
            french: 'tech-architecte-senior-fr',
            description: 'Senior technical architect template',
            features: ['architecture_focus', 'system_design', 'technical_leadership'],
            color_scheme: 'architect_navy'
          }
        }
      },

      // Sales templates
      sales: {
        basic: {
          b2b: {
            english: 'sales-b2b-relationship-en',
            french: 'sales-b2b-relation-fr',
            description: 'B2B sales focused on relationships',
            features: ['relationship_building', 'quota_achievement', 'client_focus'],
            color_scheme: 'sales_red'
          },
          retail: {
            english: 'sales-retail-performance-en',
            french: 'sales-retail-performance-fr',
            description: 'Retail sales performance template',
            features: ['performance_metrics', 'customer_service', 'team_collaboration'],
            color_scheme: 'retail_blue'
          }
        },
        professional: {
          enterprise: {
            english: 'sales-enterprise-strategic-en',
            french: 'sales-enterprise-strategique-fr',
            description: 'Enterprise sales strategic template',
            features: ['strategic_selling', 'enterprise_focus', 'complex_deals'],
            color_scheme: 'enterprise_gold'
          }
        }
      },

      // Government/Public Service templates
      government: {
        basic: {
          federal: {
            english: 'gov-federal-service-en',
            french: 'gov-federal-service-fr',
            description: 'Federal government service template',
            features: ['formal_design', 'service_focus', 'compliance_ready'],
            color_scheme: 'government_blue'
          },
          municipal: {
            english: 'gov-municipal-community-en',
            french: 'gov-municipal-communaute-fr',
            description: 'Municipal government template',
            features: ['community_focus', 'public_service', 'local_impact'],
            color_scheme: 'municipal_green'
          }
        }
      }
    };

    // Color scheme definitions
    this.colorSchemes = {
      // Entry-level friendly colors
      friendly_blue: { primary: '#4A90E2', secondary: '#F0F8FF', accent: '#2E7BC6' },
      warm_orange: { primary: '#FF8C42', secondary: '#FFF8F0', accent: '#E6742F' },
      fresh_green: { primary: '#27AE60', secondary: '#F0FFF0', accent: '#1E8B48' },
      
      // Professional colors
      tech_blue: { primary: '#2C3E50', secondary: '#ECF0F1', accent: '#3498DB' },
      finance_navy: { primary: '#1B2951', secondary: '#F8F9FA', accent: '#C0392B' },
      medical_green: { primary: '#16A085', secondary: '#E8F8F5', accent: '#138D75' },
      
      // Executive luxury colors
      luxury_gold: { primary: '#2C2C2C', secondary: '#F5F5F5', accent: '#D4AF37' },
      platinum_executive: { primary: '#1C1C1C', secondary: '#F8F8F8', accent: '#E5E4E2' },
      
      // Creative vibrant colors
      creative_rainbow: { primary: '#E74C3C', secondary: '#FDF2E9', accent: '#8E44AD' },
      sophisticated_creative: { primary: '#34495E', secondary: '#FDEAA7', accent: '#E67E22' }
    };

    // Template features and capabilities
    this.templateFeatures = {
      ats_optimized: 'Applicant Tracking System optimized formatting',
      modern_typography: 'Contemporary font choices and spacing',
      professional_layout: 'Clean, professional section organization',
      visual_hierarchy: 'Clear information hierarchy and flow',
      industry_icons: 'Relevant industry-specific iconography',
      color_customization: 'Customizable color schemes',
      multi_format_export: 'PDF, PNG, JPG, DOCX export options',
      print_optimized: 'Optimized for both digital and print',
      mobile_friendly: 'Responsive design for mobile viewing',
      brand_consistency: 'Consistent branding throughout'
    };
  }

  getTemplateForJob(jobAnalysis, packageType = 'professional', language = 'english') {
    const category = jobAnalysis.primary_category;
    const industry = jobAnalysis.industry || 'general';
    const templates = this.templateLibrary[category];

    if (!templates) {
      // Fallback to professional templates
      return this.getTemplate('professional', packageType, industry, language);
    }

    // Try to get specific template for package type and industry
    const packageTemplates = templates[packageType];
    if (packageTemplates && packageTemplates[industry]) {
      return {
        template_id: packageTemplates[industry][language],
        template_info: packageTemplates[industry],
        category: category,
        package: packageType,
        industry: industry,
        language: language,
        color_scheme: this.colorSchemes[packageTemplates[industry].color_scheme],
        features: packageTemplates[industry].features,
        description: packageTemplates[industry].description
      };
    }

    // Fallback to general template in same category
    if (packageTemplates && packageTemplates.general) {
      return {
        template_id: packageTemplates.general[language],
        template_info: packageTemplates.general,
        category: category,
        package: packageType,
        industry: 'general',
        language: language,
        color_scheme: this.colorSchemes[packageTemplates.general.color_scheme],
        features: packageTemplates.general.features,
        description: packageTemplates.general.description
      };
    }

    // Ultimate fallback
    return this.getTemplate('professional', 'professional', 'general', language);
  }

  getTemplate(category, packageType, industry, language) {
    const templates = this.templateLibrary[category]?.[packageType]?.[industry];
    
    if (templates) {
      return {
        template_id: templates[language] || templates.english,
        template_info: templates,
        category: category,
        package: packageType,
        industry: industry,
        language: language,
        color_scheme: this.colorSchemes[templates.color_scheme],
        features: templates.features,
        description: templates.description
      };
    }

    // Return default professional template
    return {
      template_id: 'prof-general-standard-en',
      template_info: {
        description: 'Standard professional template',
        features: ['professional_layout', 'ats_optimized', 'clean_design'],
        color_scheme: 'professional_blue'
      },
      category: 'professional',
      package: 'professional',
      industry: 'general',
      language: language,
      color_scheme: this.colorSchemes.tech_blue,
      features: ['professional_layout', 'ats_optimized', 'clean_design'],
      description: 'Standard professional template'
    };
  }

  getAvailableTemplates(category = null, packageType = null) {
    if (category && packageType) {
      return this.templateLibrary[category]?.[packageType] || {};
    }
    
    if (category) {
      return this.templateLibrary[category] || {};
    }

    return this.templateLibrary;
  }

  getTemplateRecommendations(jobAnalysis) {
    const category = jobAnalysis.primary_category;
    const industry = jobAnalysis.industry;
    const seniority = jobAnalysis.seniority_level;

    // Get recommended package type based on seniority
    const packageMap = {
      entry: 'basic',
      mid: 'professional',
      senior: 'professional',
      executive: 'executive'
    };

    const recommendedPackage = packageMap[seniority] || 'professional';

    return {
      primary_recommendation: this.getTemplateForJob(jobAnalysis, recommendedPackage),
      alternative_options: this.getAlternativeTemplates(category, industry, recommendedPackage),
      customization_suggestions: this.getCustomizationSuggestions(jobAnalysis),
      design_reasoning: this.getDesignReasoning(jobAnalysis)
    };
  }

  getAlternativeTemplates(category, industry, packageType) {
    const alternatives = [];
    
    // Get other package types in same category
    const categoryTemplates = this.templateLibrary[category];
    if (categoryTemplates) {
      Object.keys(categoryTemplates).forEach(pkg => {
        if (pkg !== packageType) {
          const template = categoryTemplates[pkg]?.[industry] || categoryTemplates[pkg]?.general;
          if (template) {
            alternatives.push({
              package: pkg,
              template: template,
              reason: `${pkg} package alternative`
            });
          }
        }
      });
    }

    return alternatives.slice(0, 3); // Return top 3 alternatives
  }

  getCustomizationSuggestions(jobAnalysis) {
    const suggestions = [];
    
    if (jobAnalysis.primary_category === 'creative') {
      suggestions.push('Consider adding portfolio section highlights');
      suggestions.push('Use vibrant colors to showcase creativity');
    }
    
    if (jobAnalysis.seniority_level === 'executive') {
      suggestions.push('Emphasize leadership achievements prominently');
      suggestions.push('Include board positions or strategic initiatives');
    }
    
    if (jobAnalysis.industry === 'technology') {
      suggestions.push('Highlight technical certifications');
      suggestions.push('Include links to GitHub or technical portfolios');
    }

    return suggestions;
  }

  getDesignReasoning(jobAnalysis) {
    const category = jobAnalysis.primary_category;
    const industry = jobAnalysis.industry;
    
    const reasoningMap = {
      entry_level: `Clean, approachable design to highlight potential and enthusiasm for ${industry} roles`,
      professional: `Professional design that balances experience showcase with industry-specific ${industry} elements`,
      executive: `Sophisticated, luxury design emphasizing leadership and strategic impact in ${industry}`,
      creative: `Dynamic, visually engaging design that demonstrates creative abilities for ${industry} positions`,
      technical: `Clean, precise design with tech-focused elements suitable for ${industry} roles`,
      sales: `Results-focused design that emphasizes achievements and performance in ${industry} sales`,
      government: `Formal, traditional design appropriate for ${industry} public service positions`
    };

    return reasoningMap[category] || `Professional design tailored for ${industry} industry standards`;
  }

  // Generate Canva-compatible design specifications
  generateCanvaSpecs(templateInfo, jobAnalysis, candidateInfo) {
    return {
      template_id: templateInfo.template_id,
      design_specifications: {
        layout: this.getLayoutSpecs(templateInfo, jobAnalysis),
        colors: templateInfo.color_scheme,
        typography: this.getTypographySpecs(jobAnalysis),
        sections: this.getSectionLayout(jobAnalysis),
        branding: this.getBrandingSpecs(candidateInfo),
        export_settings: this.getExportSettings(templateInfo.package)
      },
      customization_options: {
        color_variations: this.getColorVariations(templateInfo.color_scheme),
        font_alternatives: this.getFontAlternatives(jobAnalysis),
        layout_modifications: this.getLayoutModifications(templateInfo)
      }
    };
  }

  getLayoutSpecs(templateInfo, jobAnalysis) {
    return {
      page_count: jobAnalysis.seniority_level === 'executive' ? 2 : 1,
      margin_style: 'professional',
      section_spacing: 'balanced',
      header_style: templateInfo.features.includes('modern_typography') ? 'modern' : 'classic',
      footer_style: 'minimal'
    };
  }

  getTypographySpecs(jobAnalysis) {
    const fontMap = {
      entry_level: { primary: 'Open Sans', secondary: 'Roboto' },
      professional: { primary: 'Montserrat', secondary: 'Source Sans Pro' },
      executive: { primary: 'Playfair Display', secondary: 'Lato' },
      creative: { primary: 'Nunito', secondary: 'Poppins' },
      technical: { primary: 'Roboto Mono', secondary: 'Inter' }
    };

    return fontMap[jobAnalysis.primary_category] || fontMap.professional;
  }

  getSectionLayout(jobAnalysis) {
    const layoutMap = {
      entry_level: ['header', 'summary', 'education', 'skills', 'experience'],
      professional: ['header', 'summary', 'experience', 'skills', 'education', 'certifications'],
      executive: ['header', 'executive_summary', 'leadership_experience', 'achievements', 'education', 'board_positions'],
      creative: ['header', 'creative_summary', 'portfolio_highlights', 'experience', 'skills', 'awards']
    };

    return layoutMap[jobAnalysis.primary_category] || layoutMap.professional;
  }

  getBrandingSpecs(candidateInfo) {
    return {
      personal_brand_colors: 'auto_generate',
      logo_placement: 'header_right',
      contact_style: 'modern_icons',
      social_links: 'professional_only'
    };
  }

  getExportSettings(packageType) {
    const settingsMap = {
      basic: { quality: 'standard', formats: ['PDF'] },
      professional: { quality: 'high', formats: ['PDF', 'PNG'] },
      executive: { quality: 'ultra', formats: ['PDF', 'PNG', 'JPG', 'DOCX'] }
    };

    return settingsMap[packageType] || settingsMap.professional;
  }

  getColorVariations(baseScheme) {
    // Generate 3-5 color variations of the base scheme
    return [
      baseScheme,
      { ...baseScheme, accent: '#E74C3C' }, // Red variation
      { ...baseScheme, accent: '#27AE60' }, // Green variation
      { ...baseScheme, accent: '#8E44AD' }  // Purple variation
    ];
  }

  getFontAlternatives(jobAnalysis) {
    // Return font alternatives based on job category
    const alternatives = {
      conservative: ['Times New Roman', 'Georgia', 'Garamond'],
      modern: ['Helvetica', 'Arial', 'Calibri'],
      creative: ['Futura', 'Avenir', 'Proxima Nova'],
      technical: ['Monaco', 'Consolas', 'Source Code Pro']
    };

    return alternatives.modern; // Default to modern
  }

  getLayoutModifications(templateInfo) {
    return [
      'single_column',
      'two_column',
      'sidebar_layout',
      'minimal_spacing',
      'expanded_sections'
    ];
  }
}

module.exports = CanvaTemplateLibrary;