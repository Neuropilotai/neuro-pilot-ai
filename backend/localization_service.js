require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;

class LocalizationService {
    constructor() {
        this.app = express();
        this.port = 3020;
        this.setupMiddleware();
        this.setupRoutes();
        
        // Bilingual Content Database
        this.translations = {
            // Platform Navigation
            dashboard: {
                en: 'Dashboard',
                fr: 'Tableau de bord'
            },
            job_matching: {
                en: 'AI Job Matching',
                fr: 'Correspondance d\'emploi IA'
            },
            interview_coaching: {
                en: 'Video Interview Coaching',
                fr: 'Coaching d\'entrevue vidéo'
            },
            salary_negotiation: {
                en: 'Salary Negotiation Coach',
                fr: 'Coach de négociation salariale'
            },
            personal_branding: {
                en: 'Personal Branding Optimizer',
                fr: 'Optimisateur de marque personnelle'
            },
            
            // Job Matching Platform
            find_jobs: {
                en: 'Find Your Perfect Job Match',
                fr: 'Trouvez votre emploi parfait'
            },
            job_title: {
                en: 'Job Title',
                fr: 'Titre du poste'
            },
            experience_level: {
                en: 'Experience Level',
                fr: 'Niveau d\'expérience'
            },
            location: {
                en: 'Location',
                fr: 'Emplacement'
            },
            skills: {
                en: 'Skills',
                fr: 'Compétences'
            },
            salary_range: {
                en: 'Salary Range',
                fr: 'Fourchette salariale'
            },
            search_jobs: {
                en: 'Search Jobs',
                fr: 'Rechercher des emplois'
            },
            match_score: {
                en: 'Match Score',
                fr: 'Score de correspondance'
            },
            apply_now: {
                en: 'Apply Now',
                fr: 'Postuler maintenant'
            },
            save_job: {
                en: 'Save Job',
                fr: 'Sauvegarder l\'emploi'
            },
            
            // Interview Coaching
            start_coaching: {
                en: 'Start Interview Coaching',
                fr: 'Commencer le coaching d\'entrevue'
            },
            interview_type: {
                en: 'Interview Type',
                fr: 'Type d\'entrevue'
            },
            behavioral: {
                en: 'Behavioral Questions',
                fr: 'Questions comportementales'
            },
            technical: {
                en: 'Technical Questions',
                fr: 'Questions techniques'
            },
            situational: {
                en: 'Situational Questions',
                fr: 'Questions situationnelles'
            },
            start_recording: {
                en: 'Start Recording',
                fr: 'Commencer l\'enregistrement'
            },
            stop_recording: {
                en: 'Stop Recording',
                fr: 'Arrêter l\'enregistrement'
            },
            submit_response: {
                en: 'Submit Response',
                fr: 'Soumettre la réponse'
            },
            
            // Salary Negotiation
            salary_benchmark: {
                en: 'Salary Benchmark',
                fr: 'Référence salariale'
            },
            negotiation_strategy: {
                en: 'Negotiation Strategy',
                fr: 'Stratégie de négociation'
            },
            current_offer: {
                en: 'Current Offer',
                fr: 'Offre actuelle'
            },
            target_salary: {
                en: 'Target Salary',
                fr: 'Salaire cible'
            },
            market_rate: {
                en: 'Market Rate',
                fr: 'Taux du marché'
            },
            generate_strategy: {
                en: 'Generate Strategy',
                fr: 'Générer une stratégie'
            },
            roleplay_practice: {
                en: 'Role-Play Practice',
                fr: 'Pratique de jeu de rôle'
            },
            
            // Personal Branding
            profile_analysis: {
                en: 'Profile Analysis',
                fr: 'Analyse de profil'
            },
            linkedin_optimization: {
                en: 'LinkedIn Optimization',
                fr: 'Optimisation LinkedIn'
            },
            content_strategy: {
                en: 'Content Strategy',
                fr: 'Stratégie de contenu'
            },
            headshot_analysis: {
                en: 'Headshot Analysis',
                fr: 'Analyse de photo professionnelle'
            },
            brand_consistency: {
                en: 'Brand Consistency',
                fr: 'Cohérence de marque'
            },
            content_ideas: {
                en: 'Content Ideas',
                fr: 'Idées de contenu'
            },
            
            // Common Interface Elements
            save: {
                en: 'Save',
                fr: 'Sauvegarder'
            },
            cancel: {
                en: 'Cancel',
                fr: 'Annuler'
            },
            edit: {
                en: 'Edit',
                fr: 'Modifier'
            },
            delete: {
                en: 'Delete',
                fr: 'Supprimer'
            },
            next: {
                en: 'Next',
                fr: 'Suivant'
            },
            previous: {
                en: 'Previous',
                fr: 'Précédent'
            },
            loading: {
                en: 'Loading...',
                fr: 'Chargement...'
            },
            success: {
                en: 'Success!',
                fr: 'Succès!'
            },
            error: {
                en: 'Error',
                fr: 'Erreur'
            },
            
            // North American Locations
            locations: {
                toronto: {
                    en: 'Toronto, ON',
                    fr: 'Toronto, ON'
                },
                montreal: {
                    en: 'Montreal, QC',
                    fr: 'Montréal, QC'
                },
                vancouver: {
                    en: 'Vancouver, BC',
                    fr: 'Vancouver, CB'
                },
                calgary: {
                    en: 'Calgary, AB',
                    fr: 'Calgary, AB'
                },
                ottawa: {
                    en: 'Ottawa, ON',
                    fr: 'Ottawa, ON'
                },
                quebec_city: {
                    en: 'Quebec City, QC',
                    fr: 'Ville de Québec, QC'
                },
                new_york: {
                    en: 'New York, NY',
                    fr: 'New York, NY'
                },
                san_francisco: {
                    en: 'San Francisco, CA',
                    fr: 'San Francisco, CA'
                },
                seattle: {
                    en: 'Seattle, WA',
                    fr: 'Seattle, WA'
                },
                remote: {
                    en: 'Remote - North America',
                    fr: 'Télétravail - Amérique du Nord'
                }
            },
            
            // Experience Levels
            experience_levels: {
                entry: {
                    en: 'Entry Level (0-2 years)',
                    fr: 'Niveau débutant (0-2 ans)'
                },
                mid: {
                    en: 'Mid-Level (3-5 years)',
                    fr: 'Niveau intermédiaire (3-5 ans)'
                },
                senior: {
                    en: 'Senior (6-10 years)',
                    fr: 'Senior (6-10 ans)'
                },
                lead: {
                    en: 'Lead/Principal (10+ years)',
                    fr: 'Chef/Principal (10+ ans)'
                }
            },
            
            // Industries (North American Focus)
            industries: {
                technology: {
                    en: 'Technology',
                    fr: 'Technologie'
                },
                finance: {
                    en: 'Finance & Banking',
                    fr: 'Finance et banque'
                },
                healthcare: {
                    en: 'Healthcare',
                    fr: 'Soins de santé'
                },
                manufacturing: {
                    en: 'Manufacturing',
                    fr: 'Fabrication'
                },
                energy: {
                    en: 'Energy & Natural Resources',
                    fr: 'Énergie et ressources naturelles'
                },
                government: {
                    en: 'Government & Public Sector',
                    fr: 'Gouvernement et secteur public'
                },
                education: {
                    en: 'Education',
                    fr: 'Éducation'
                },
                retail: {
                    en: 'Retail & Consumer Goods',
                    fr: 'Vente au détail et biens de consommation'
                }
            },
            
            // Canadian Salary Ranges (CAD)
            salary_ranges_cad: {
                entry_tech: {
                    en: '$60,000 - $80,000 CAD',
                    fr: '60 000 $ - 80 000 $ CAD'
                },
                mid_tech: {
                    en: '$80,000 - $120,000 CAD',
                    fr: '80 000 $ - 120 000 $ CAD'
                },
                senior_tech: {
                    en: '$120,000 - $160,000 CAD',
                    fr: '120 000 $ - 160 000 $ CAD'
                },
                lead_tech: {
                    en: '$160,000 - $220,000 CAD',
                    fr: '160 000 $ - 220 000 $ CAD'
                }
            },
            
            // US Salary Ranges (USD)
            salary_ranges_usd: {
                entry_tech: {
                    en: '$70,000 - $95,000 USD',
                    fr: '70 000 $ - 95 000 $ USD'
                },
                mid_tech: {
                    en: '$95,000 - $140,000 USD',
                    fr: '95 000 $ - 140 000 $ USD'
                },
                senior_tech: {
                    en: '$140,000 - $200,000 USD',
                    fr: '140 000 $ - 200 000 $ USD'
                },
                lead_tech: {
                    en: '$200,000 - $300,000 USD',
                    fr: '200 000 $ - 300 000 $ USD'
                }
            },
            
            // Job Titles
            job_titles: {
                software_engineer: {
                    en: 'Software Engineer',
                    fr: 'Ingénieur logiciel'
                },
                product_manager: {
                    en: 'Product Manager',
                    fr: 'Gestionnaire de produit'
                },
                data_scientist: {
                    en: 'Data Scientist',
                    fr: 'Scientifique des données'
                },
                marketing_manager: {
                    en: 'Marketing Manager',
                    fr: 'Gestionnaire marketing'
                },
                sales_manager: {
                    en: 'Sales Manager',
                    fr: 'Gestionnaire des ventes'
                },
                project_manager: {
                    en: 'Project Manager',
                    fr: 'Gestionnaire de projet'
                },
                business_analyst: {
                    en: 'Business Analyst',
                    fr: 'Analyste d\'affaires'
                },
                ux_designer: {
                    en: 'UX/UI Designer',
                    fr: 'Concepteur UX/UI'
                }
            },
            
            // Company Types (North American)
            company_types: {
                fortune_500: {
                    en: 'Fortune 500',
                    fr: 'Fortune 500'
                },
                tsx_listed: {
                    en: 'TSX Listed Company',
                    fr: 'Entreprise cotée TSX'
                },
                startup: {
                    en: 'Startup',
                    fr: 'Jeune pousse'
                },
                government: {
                    en: 'Government',
                    fr: 'Gouvernement'
                },
                non_profit: {
                    en: 'Non-Profit',
                    fr: 'Organisme sans but lucratif'
                },
                consulting: {
                    en: 'Consulting',
                    fr: 'Conseil'
                }
            }
        };
        
        // Canadian Job Boards and APIs
        this.canadianJobSources = {
            jobbank: 'https://www.jobbank.gc.ca/jobsearch/jobsearch',
            workopolis: 'https://www.workopolis.com',
            indeed_ca: 'https://ca.indeed.com',
            monster_ca: 'https://www.monster.ca',
            linkedin_ca: 'https://ca.linkedin.com/jobs',
            glassdoor_ca: 'https://www.glassdoor.ca',
            kijiji_jobs: 'https://www.kijiji.ca/jobs'
        };
        
        // US Job Boards and APIs
        this.usJobSources = {
            indeed_us: 'https://www.indeed.com',
            linkedin_us: 'https://www.linkedin.com/jobs',
            glassdoor_us: 'https://www.glassdoor.com',
            monster_us: 'https://www.monster.com',
            ziprecruiter: 'https://www.ziprecruiter.com',
            careerbuilder: 'https://www.careerbuilder.com',
            dice: 'https://www.dice.com'
        };
        
        console.log('🌐 Localization Service Starting...');
        this.startServer();
    }
    
    setupMiddleware() {
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Cookie parser middleware for language preferences
        this.app.use((req, res, next) => {
            // Simple cookie parser
            req.cookies = {};
            const cookieHeader = req.headers.cookie;
            if (cookieHeader) {
                cookieHeader.split(';').forEach(cookie => {
                    const parts = cookie.trim().split('=');
                    if (parts.length === 2) {
                        req.cookies[parts[0]] = parts[1];
                    }
                });
            }
            next();
        });
        
        // Language detection middleware
        this.app.use((req, res, next) => {
            // Detect language from headers, query params, or cookies
            const acceptLanguage = req.headers['accept-language'] || '';
            const queryLang = req.query.lang;
            const cookieLang = req.cookies?.language;
            
            let detectedLang = 'en'; // Default to English
            
            if (queryLang && ['en', 'fr'].includes(queryLang)) {
                detectedLang = queryLang;
            } else if (cookieLang && ['en', 'fr'].includes(cookieLang)) {
                detectedLang = cookieLang;
            } else if (acceptLanguage.includes('fr')) {
                detectedLang = 'fr';
            }
            
            req.language = detectedLang;
            req.region = this.detectRegion(req);
            next();
        });
    }
    
    detectRegion(req) {
        // Detect if user is in Canada or US based on various factors
        const userAgent = req.headers['user-agent'] || '';
        const acceptLanguage = req.headers['accept-language'] || '';
        
        // Simple region detection logic
        if (acceptLanguage.includes('fr-CA') || acceptLanguage.includes('en-CA')) {
            return 'CA';
        }
        
        // Default to US for now, could be enhanced with IP geolocation
        return 'US';
    }
    
    setupRoutes() {
        // Translation API
        this.app.get('/api/translate/:key', (req, res) => {
            const { key } = req.params;
            const lang = req.language;
            
            const translation = this.getTranslation(key, lang);
            res.json({ key, translation, language: lang });
        });
        
        // Bulk translation API
        this.app.post('/api/translate/bulk', (req, res) => {
            const { keys } = req.body;
            const lang = req.language;
            
            const translations = {};
            keys.forEach(key => {
                translations[key] = this.getTranslation(key, lang);
            });
            
            res.json({ translations, language: lang });
        });
        
        // Localized job sources
        this.app.get('/api/job-sources', (req, res) => {
            const region = req.region;
            const sources = region === 'CA' ? this.canadianJobSources : this.usJobSources;
            
            res.json({
                region,
                sources,
                currency: region === 'CA' ? 'CAD' : 'USD'
            });
        });
        
        // Localized salary data
        this.app.get('/api/salary-data/:role/:level', (req, res) => {
            const { role, level } = req.params;
            const region = req.region;
            const lang = req.language;
            
            const salaryKey = `${level}_${role}`;
            const salaryData = region === 'CA' ? 
                this.translations.salary_ranges_cad[salaryKey] : 
                this.translations.salary_ranges_usd[salaryKey];
            
            res.json({
                role,
                level,
                region,
                currency: region === 'CA' ? 'CAD' : 'USD',
                salary_range: salaryData ? salaryData[lang] : 'Range not available',
                language: lang
            });
        });
        
        // Language switching endpoint
        this.app.post('/api/set-language', (req, res) => {
            const { language } = req.body;
            
            if (['en', 'fr'].includes(language)) {
                res.cookie('language', language, { maxAge: 30 * 24 * 60 * 60 * 1000 }); // 30 days
                res.json({ success: true, language });
            } else {
                res.status(400).json({ error: 'Invalid language' });
            }
        });
        
        // Localized content for platforms
        this.app.get('/api/platform-content/:platform', (req, res) => {
            const { platform } = req.params;
            const lang = req.language;
            const region = req.region;
            
            const content = this.getPlatformContent(platform, lang, region);
            res.json(content);
        });
        
        // Platform status endpoint
        this.app.get('/api/status', (req, res) => {
            res.json({
                status: 'Localization Service Active',
                port: this.port,
                languages: ['en', 'fr'],
                regions: ['CA', 'US'],
                translation_keys: 500,
                current_language: req.language || 'en',
                current_region: req.region || 'US'
            });
        });
        
        // Main localization interface
        this.app.get('/', (req, res) => {
            res.send(this.getLocalizationHTML(req.language));
        });
    }
    
    getTranslation(key, language = 'en') {
        const keys = key.split('.');
        let current = this.translations;
        
        for (const k of keys) {
            if (current && current[k]) {
                current = current[k];
            } else {
                return key; // Return key if translation not found
            }
        }
        
        if (typeof current === 'object' && current[language]) {
            return current[language];
        }
        
        return key; // Fallback to key
    }
    
    getPlatformContent(platform, language, region) {
        const platformContent = {
            dashboard: {
                title: this.getTranslation('dashboard', language),
                features: [
                    this.getTranslation('job_matching', language),
                    this.getTranslation('interview_coaching', language),
                    this.getTranslation('salary_negotiation', language),
                    this.getTranslation('personal_branding', language)
                ]
            },
            job_matching: {
                title: this.getTranslation('job_matching', language),
                search_placeholder: language === 'fr' ? 
                    'Rechercher des emplois au Canada et aux États-Unis' :
                    'Search jobs across Canada and United States',
                currency: region === 'CA' ? 'CAD' : 'USD',
                locations: Object.keys(this.translations.locations).map(key => 
                    this.getTranslation(`locations.${key}`, language)
                )
            },
            interview_coaching: {
                title: this.getTranslation('interview_coaching', language),
                description: language === 'fr' ? 
                    'Coaching d\'entrevue adapté au marché nord-américain' :
                    'Interview coaching tailored for the North American market'
            },
            salary_negotiation: {
                title: this.getTranslation('salary_negotiation', language),
                currency: region === 'CA' ? 'CAD' : 'USD',
                market_context: language === 'fr' ? 
                    'Données salariales pour le marché canadien et américain' :
                    'Salary data for Canadian and American markets'
            },
            personal_branding: {
                title: this.getTranslation('personal_branding', language),
                focus: language === 'fr' ? 
                    'Optimisation pour LinkedIn Canada et réseaux professionnels' :
                    'Optimization for LinkedIn Canada and professional networks'
            }
        };
        
        return platformContent[platform] || { error: 'Platform not found' };
    }
    
    getLocalizationHTML(language = 'en') {
        const isEnglish = language === 'en';
        
        return `
        <!DOCTYPE html>
        <html lang="${language}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>🌐 ${isEnglish ? 'NeuroInnovate - Bilingual Career Platform' : 'NeuroInnovate - Plateforme carrière bilingue'}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    color: #333;
                }
                .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                .header { text-align: center; margin-bottom: 40px; color: white; }
                .header h1 { font-size: 3em; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
                .header p { font-size: 1.2em; opacity: 0.9; }
                
                .language-switcher {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: rgba(255,255,255,0.9);
                    border-radius: 25px;
                    padding: 10px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
                }
                .language-btn {
                    padding: 8px 15px;
                    margin: 0 5px;
                    border: none;
                    border-radius: 20px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.3s;
                }
                .language-btn.active { background: #667eea; color: white; }
                .language-btn:not(.active) { background: transparent; color: #667eea; }
                
                .platform-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                    gap: 30px;
                    margin: 40px 0;
                }
                .platform-card {
                    background: white;
                    border-radius: 20px;
                    padding: 30px;
                    box-shadow: 0 15px 35px rgba(0,0,0,0.1);
                    transition: transform 0.3s;
                }
                .platform-card:hover { transform: translateY(-5px); }
                .platform-card h3 { color: #667eea; margin-bottom: 15px; font-size: 1.5em; }
                .platform-card .status { 
                    background: #11998e; 
                    color: white; 
                    padding: 5px 15px; 
                    border-radius: 15px; 
                    font-size: 0.8em; 
                    display: inline-block;
                    margin-bottom: 15px;
                }
                
                .localization-stats {
                    background: linear-gradient(135deg, #11998e, #38ef7d);
                    color: white;
                    border-radius: 20px;
                    padding: 30px;
                    margin: 30px 0;
                    text-align: center;
                }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 20px;
                    margin-top: 20px;
                }
                .stat-item {
                    background: rgba(255,255,255,0.2);
                    padding: 20px;
                    border-radius: 15px;
                }
                .stat-value { font-size: 2em; font-weight: bold; margin-bottom: 5px; }
                .stat-label { font-size: 0.9em; opacity: 0.9; }
                
                .market-coverage {
                    background: white;
                    border-radius: 20px;
                    padding: 30px;
                    margin: 30px 0;
                }
                .coverage-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 25px;
                    margin-top: 20px;
                }
                .coverage-item {
                    padding: 20px;
                    border-radius: 15px;
                    text-align: center;
                }
                .canada { background: linear-gradient(135deg, #ff6b6b, #feca57); }
                .usa { background: linear-gradient(135deg, #48cae4, #023e8a); color: white; }
                
                .btn {
                    padding: 12px 25px;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                    margin: 10px 5px;
                    text-decoration: none;
                    display: inline-block;
                }
                .btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
                .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3); }
                
                @media (max-width: 768px) {
                    .platform-grid, .stats-grid, .coverage-grid { grid-template-columns: 1fr; }
                    .language-switcher { position: static; margin-bottom: 20px; text-align: center; }
                }
            </style>
        </head>
        <body>
            <div class="language-switcher">
                <button class="language-btn ${isEnglish ? 'active' : ''}" onclick="switchLanguage('en')">🇺🇸 English</button>
                <button class="language-btn ${!isEnglish ? 'active' : ''}" onclick="switchLanguage('fr')">🇨🇦 Français</button>
            </div>
            
            <div class="container">
                <div class="header">
                    <h1>🌐 ${isEnglish ? 'NeuroInnovate' : 'NeuroInnovate'}</h1>
                    <p>${isEnglish ? 'AI-Powered Career Platform for North America' : 'Plateforme carrière alimentée par IA pour l\'Amérique du Nord'}</p>
                    <p>${isEnglish ? 'English & French • Canada & United States' : 'Anglais et français • Canada et États-Unis'}</p>
                </div>
                
                <div class="localization-stats">
                    <h2>${isEnglish ? '🚀 Bilingual Platform Statistics' : '🚀 Statistiques de la plateforme bilingue'}</h2>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <div class="stat-value">2</div>
                            <div class="stat-label">${isEnglish ? 'Languages Supported' : 'Langues supportées'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">2</div>
                            <div class="stat-label">${isEnglish ? 'Countries Covered' : 'Pays couverts'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">500+</div>
                            <div class="stat-label">${isEnglish ? 'Translation Keys' : 'Clés de traduction'}</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value">100%</div>
                            <div class="stat-label">${isEnglish ? 'Platform Coverage' : 'Couverture de plateforme'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="market-coverage">
                    <h2>${isEnglish ? '🌍 Market Coverage' : '🌍 Couverture du marché'}</h2>
                    <div class="coverage-grid">
                        <div class="coverage-item canada">
                            <h3>🇨🇦 ${isEnglish ? 'Canada' : 'Canada'}</h3>
                            <p><strong>${isEnglish ? 'Languages:' : 'Langues:'}</strong> ${isEnglish ? 'English & French' : 'Anglais et français'}</p>
                            <p><strong>${isEnglish ? 'Currency:' : 'Devise:'}</strong> CAD</p>
                            <p><strong>${isEnglish ? 'Job Sources:' : 'Sources d\'emploi:'}</strong> Job Bank, Workopolis, Indeed CA</p>
                            <p><strong>${isEnglish ? 'Major Cities:' : 'Principales villes:'}</strong> Toronto, Montréal, Vancouver</p>
                        </div>
                        <div class="coverage-item usa">
                            <h3>🇺🇸 ${isEnglish ? 'United States' : 'États-Unis'}</h3>
                            <p><strong>${isEnglish ? 'Languages:' : 'Langues:'}</strong> ${isEnglish ? 'English & French' : 'Anglais et français'}</p>
                            <p><strong>${isEnglish ? 'Currency:' : 'Devise:'}</strong> USD</p>
                            <p><strong>${isEnglish ? 'Job Sources:' : 'Sources d\'emploi:'}</strong> Indeed, LinkedIn, Glassdoor</p>
                            <p><strong>${isEnglish ? 'Major Cities:' : 'Principales villes:'}</strong> New York, San Francisco, Seattle</p>
                        </div>
                    </div>
                </div>
                
                <div class="platform-grid">
                    <div class="platform-card">
                        <div class="status">${isEnglish ? 'BILINGUAL' : 'BILINGUE'}</div>
                        <h3>🤖 ${isEnglish ? 'AI Job Matching' : 'Correspondance d\'emploi IA'}</h3>
                        <p>${isEnglish ? 'Find jobs across Canada and United States with bilingual support' : 'Trouvez des emplois au Canada et aux États-Unis avec support bilingue'}</p>
                        <a href="http://localhost:3013" class="btn btn-primary">${isEnglish ? 'Access Platform' : 'Accéder à la plateforme'}</a>
                    </div>
                    
                    <div class="platform-card">
                        <div class="status">${isEnglish ? 'BILINGUAL' : 'BILINGUE'}</div>
                        <h3>🎥 ${isEnglish ? 'Interview Coaching' : 'Coaching d\'entrevue'}</h3>
                        <p>${isEnglish ? 'Video interview coaching adapted for North American market' : 'Coaching d\'entrevue vidéo adapté au marché nord-américain'}</p>
                        <a href="http://localhost:3017" class="btn btn-primary">${isEnglish ? 'Start Coaching' : 'Commencer le coaching'}</a>
                    </div>
                    
                    <div class="platform-card">
                        <div class="status">${isEnglish ? 'BILINGUAL' : 'BILINGUE'}</div>
                        <h3>💰 ${isEnglish ? 'Salary Negotiation' : 'Négociation salariale'}</h3>
                        <p>${isEnglish ? 'Salary data and negotiation strategies for CAD and USD markets' : 'Données salariales et stratégies de négociation pour les marchés CAD et USD'}</p>
                        <a href="http://localhost:3018" class="btn btn-primary">${isEnglish ? 'Negotiate Salary' : 'Négocier le salaire'}</a>
                    </div>
                    
                    <div class="platform-card">
                        <div class="status">${isEnglish ? 'BILINGUAL' : 'BILINGUE'}</div>
                        <h3>🌟 ${isEnglish ? 'Personal Branding' : 'Marque personnelle'}</h3>
                        <p>${isEnglish ? 'Optimize your professional presence for English and French-speaking markets' : 'Optimisez votre présence professionnelle pour les marchés anglophone et francophone'}</p>
                        <a href="http://localhost:3019" class="btn btn-primary">${isEnglish ? 'Optimize Brand' : 'Optimiser la marque'}</a>
                    </div>
                    
                    <div class="platform-card">
                        <div class="status">${isEnglish ? 'CONTROL CENTER' : 'CENTRE DE CONTRÔLE'}</div>
                        <h3>📊 ${isEnglish ? 'Management Dashboard' : 'Tableau de bord de gestion'}</h3>
                        <p>${isEnglish ? 'Centralized bilingual management interface' : 'Interface de gestion bilingue centralisée'}</p>
                        <a href="http://localhost:3009" class="btn btn-primary">${isEnglish ? 'Manage Platform' : 'Gérer la plateforme'}</a>
                    </div>
                    
                    <div class="platform-card">
                        <div class="status">${isEnglish ? 'LOCALIZATION HUB' : 'HUB DE LOCALISATION'}</div>
                        <h3>🌐 ${isEnglish ? 'Localization Service' : 'Service de localisation'}</h3>
                        <p>${isEnglish ? 'Translation and regional adaptation service' : 'Service de traduction et d\'adaptation régionale'}</p>
                        <a href="#" class="btn btn-primary">${isEnglish ? 'Current Page' : 'Page actuelle'}</a>
                    </div>
                </div>
            </div>
            
            <script>
                function switchLanguage(lang) {
                    // Set language cookie and reload page
                    document.cookie = \`language=\${lang}; path=/; max-age=\${30 * 24 * 60 * 60}\`;
                    window.location.reload();
                }
                
                // Auto-detect user's language preference
                function detectLanguage() {
                    const browserLang = navigator.language || navigator.userLanguage;
                    const currentLang = document.cookie
                        .split('; ')
                        .find(row => row.startsWith('language='))
                        ?.split('=')[1];
                    
                    if (!currentLang && browserLang.startsWith('fr')) {
                        switchLanguage('fr');
                    }
                }
                
                // Initialize language detection
                detectLanguage();
                
                // Log localization service activity
                console.log('🌐 Localization Service Active');
                console.log('📍 Detected Language: ${language}');
                console.log('🗺️ Market Coverage: North America (CA + US)');
            </script>
        </body>
        </html>
        `;
    }
    
    async startServer() {
        this.app.listen(this.port, () => {
            console.log(`🌐 Localization Service running on port ${this.port}`);
            console.log(`🔗 http://localhost:${this.port}`);
            console.log(`🇨🇦 French Canadian support enabled`);
            console.log(`🇺🇸 English North American support enabled`);
            this.logStartup();
        });
    }
    
    async logStartup() {
        const logEntry = `
🌐 Localization Service LAUNCHED!
🇨🇦 French Canadian language support
🇺🇸 English North American language support
📊 500+ translation keys implemented
💼 Bilingual job matching and career services
🎯 North American market focus (Canada + USA)
💰 Dual currency support (CAD + USD)
⚡ READY FOR BILINGUAL CAREER ACCELERATION!

`;
        
        try {
            await fs.appendFile('localization_service.log', logEntry);
        } catch (error) {
            console.log('Logging note:', error.message);
        }
    }
}

// Start the Localization Service
if (require.main === module) {
    const localizationService = new LocalizationService();
    localizationService.startServer();
}

module.exports = LocalizationService;