/**
 * Bilingual Translation System
 * Complete English/French translations for NeuroPilot AI Resume Generator
 */

const translations = {
    english: {
        // Header & Navigation
        siteName: "NeuroPilot AI",
        siteSubtitle: "Resume Generator",
        nav: {
            pricing: "Pricing",
            howItWorks: "How It Works",
            aiStatus: "AI Status",
            examples: "Examples",
            language: "Language"
        },

        // Hero Section
        hero: {
            title: "Professional AI Resumes",
            subtitle: "From McDonald's to CEO",
            description: "Our intelligent AI creates job-specific resumes that adapt to any position level. Get hired faster with ATS-optimized, beautifully designed resumes.",
            ctaPrimary: "🚀 Create My Resume Now",
            ctaSecondary: "💰 View Pricing",
            features: {
                atsOptimized: "ATS-Optimized",
                jobSpecific: "Job-Specific Content",
                canvaDesign: "Beautiful Canva Design",
                quickDelivery: "2-Minute Delivery"
            }
        },

        // How It Works
        howItWorks: {
            title: "How Our AI Creates Perfect Resumes",
            steps: {
                analysis: {
                    title: "Smart Job Analysis",
                    description: "Our AI analyzes your job description to determine the perfect content style, from entry-level friendly to executive authority."
                },
                adaptive: {
                    title: "Adaptive Content",
                    description: "Content automatically adapts - simple and enthusiastic for McDonald's, strategic and authoritative for CEO positions."
                },
                design: {
                    title: "Beautiful Design",
                    description: "Professional Canva templates selected based on job level - clean for entry-level, luxury for executives."
                }
            }
        },

        // Pricing
        pricing: {
            title: "Choose Your Package",
            subtitle: "Our AI automatically recommends the best package based on your job level",
            packages: {
                basic: {
                    name: "Basic",
                    price: "$39",
                    description: "Perfect for entry-level positions",
                    features: [
                        "AI-generated content",
                        "ATS-optimized formatting",
                        "Clean, professional design",
                        "PDF download",
                        "2-minute delivery"
                    ],
                    button: "Choose Basic",
                    goodFor: "Great for McDonald's, retail, entry-level"
                },
                professional: {
                    name: "Professional",
                    price: "$79",
                    description: "Perfect for professional roles",
                    popular: "MOST POPULAR",
                    features: [
                        "Everything in Basic",
                        "Advanced job-specific content",
                        "Premium Canva design",
                        "Multiple export formats",
                        "Editable template access"
                    ],
                    button: "Choose Professional",
                    goodFor: "Great for tech, healthcare, management"
                },
                executive: {
                    name: "Executive",
                    price: "$149",
                    description: "Perfect for leadership positions",
                    features: [
                        "Everything in Professional",
                        "Executive-level content",
                        "Luxury gold-accent design",
                        "Strategic leadership focus",
                        "Board-ready presentation"
                    ],
                    button: "Choose Executive",
                    goodFor: "Great for CEO, Director, VP positions"
                }
            }
        },

        // AI Status
        aiStatus: {
            title: "🤖 AI Super Agents Status",
            subtitle: "Real-time view of our autonomous AI agents working behind the scenes",
            agents: {
                resume: {
                    name: "🚀 Resume Agent",
                    status: "ENHANCED",
                    fields: {
                        status: "Status:",
                        qualityScore: "Quality Score:",
                        features: "Features:",
                        statusValue: "Enhanced AI Active",
                        qualityValue: "98%+ Accuracy",
                        featuresValue: "NLP + Semantic"
                    }
                },
                trading: {
                    name: "📈 Trading Agent",
                    status: "LEARNING",
                    fields: {
                        status: "Status:",
                        accuracy: "Accuracy:",
                        dataPoints: "Data Points:",
                        statusValue: "Paper Trading",
                        accuracyValue: "95.0%",
                        dataValue: "32,000+"
                    }
                },
                learning: {
                    name: "🧠 Learning Agent",
                    status: "ACTIVE",
                    fields: {
                        status: "Status:",
                        models: "Models:",
                        quality: "Quality:",
                        statusValue: "Analyzing",
                        modelsValue: "40 Trained",
                        qualityValue: "Premium"
                    }
                },
                orchestrator: {
                    name: "🎭 Orchestrator",
                    status: "ACTIVE",
                    fields: {
                        status: "Status:",
                        agents: "Agents:",
                        efficiency: "Efficiency:",
                        statusValue: "Coordinating",
                        agentsValue: "4 Managed",
                        efficiencyValue: "98%"
                    }
                }
            },
            comingNext: {
                title: "🚀 Coming Next",
                approved: "✅ Approved & Ready",
                future: "🔮 Future Vision",
                items: {
                    enhancedAI: {
                        title: "Enhanced AI Algorithm",
                        status: "DEPLOYED ✅",
                        description: "NOW LIVE: 98%+ accuracy with advanced NLP, semantic matching, and industry optimization",
                        ready: "Ready: 100% ✅",
                        boost: "Quality Boost: +8%"
                    },
                    jobMatching: {
                        title: "Real-Time Job Matching",
                        status: "RESEARCH",
                        description: "AI agent scans job boards and optimizes resumes in real-time",
                        ready: "Ready: 60%",
                        time: "Time: 3-4 weeks"
                    },
                    multiLanguage: {
                        title: "Multi-Language AI Agent",
                        status: "APPROVED",
                        description: "Expand beyond English/French to support 15+ languages with native AI optimization",
                        ready: "Ready: 40%",
                        time: "Time: 2-3 weeks"
                    },
                    interviewCoach: {
                        title: "AI Interview Coach",
                        description: "Practice interviews with AI that adapts to your industry"
                    },
                    salaryNegotiation: {
                        title: "Salary Negotiation AI",
                        description: "AI agent that helps negotiate better job offers"
                    },
                    careerPath: {
                        title: "Career Path Optimizer",
                        description: "Long-term career planning with AI insights"
                    }
                }
            }
        },

        // Examples
        examples: {
            title: "Real Examples",
            mcdonalds: {
                title: "🍔 McDonald's Crew Member",
                analysis: "AI detected: Entry-level position → Used enthusiastic, friendly tone with education focus",
                quote: "Enthusiastic and reliable team member with strong customer service skills and recent high school graduation. Eager to contribute to team success while developing professional skills...",
                package: "✅ Basic Package ($39) • Clean design • ATS-optimized"
            },
            ceo: {
                title: "🚂 CN Rail CEO",
                analysis: "AI detected: Executive position → Used authoritative, strategic tone with leadership focus",
                quote: "Visionary executive leader with 20+ years driving organizational transformation and sustainable growth. Proven expertise in strategic planning, P&L management...",
                package: "✅ Executive Package ($149) • Luxury design • Board-ready"
            }
        },

        // Order Form
        orderForm: {
            title: "Create Your AI Resume",
            selectedPackage: "Selected Package",
            packageDescription: "Our AI will automatically recommend the best package based on your job",
            fields: {
                jobDescription: {
                    label: "Job Description *",
                    placeholder: "Paste the job description here. Our AI will analyze it to create the perfect resume content and design..."
                },
                companyName: {
                    label: "Company Name (Optional)",
                    placeholder: "e.g., McDonald's, Google, Tesla"
                },
                fullName: {
                    label: "Full Name *",
                    placeholder: "Your full name"
                },
                email: {
                    label: "Email Address *",
                    placeholder: "your.email@example.com"
                },
                phone: {
                    label: "Phone Number",
                    placeholder: "+1 (555) 123-4567"
                },
                location: {
                    label: "Location",
                    placeholder: "City, State/Province"
                },
                experience: {
                    label: "Experience Summary *",
                    placeholder: "Brief summary of your work experience (e.g., '5 years software development', 'Recent graduate', '15 years management')"
                },
                skills: {
                    label: "Key Skills *",
                    placeholder: "List your key skills separated by commas (e.g., 'Customer service, teamwork, communication' or 'Python, React, AWS, leadership')"
                },
                language: {
                    label: "Resume Language"
                }
            },
            summary: {
                title: "Order Summary",
                features: "✅ AI job analysis ✅ Custom content ✅ Beautiful design ✅ 2-minute delivery"
            },
            submit: "🚀 Generate My Resume - Pay",
            security: "💳 Secure payment via Stripe • 🔒 Your data is protected • ⚡ Instant delivery",
            processing: "🤖 Analyzing job and generating resume..."
        },

        // Footer
        footer: {
            subtitle: "Intelligent Resume Generator",
            copyright: "© 2025 NeuroPilot AI. Powered by advanced AI technology."
        },

        // Messages
        messages: {
            success: "🎉 Resume generated successfully! Redirecting to payment...",
            error: "❌ Error:",
            networkError: "❌ Network error. Please try again."
        }
    },

    french: {
        // Header & Navigation
        siteName: "NeuroPilot IA",
        siteSubtitle: "Générateur de CV",
        nav: {
            pricing: "Tarifs",
            howItWorks: "Comment ça marche",
            aiStatus: "Statut IA",
            examples: "Exemples",
            language: "Langue"
        },

        // Hero Section
        hero: {
            title: "CV Professionnels IA",
            subtitle: "De McDonald's à PDG",
            description: "Notre IA intelligente crée des CV spécifiques à l'emploi qui s'adaptent à tout niveau de poste. Soyez embauché plus rapidement avec des CV optimisés ATS et magnifiquement conçus.",
            ctaPrimary: "🚀 Créer Mon CV Maintenant",
            ctaSecondary: "💰 Voir les Tarifs",
            features: {
                atsOptimized: "Optimisé ATS",
                jobSpecific: "Contenu Spécifique à l'Emploi",
                canvaDesign: "Magnifique Design Canva",
                quickDelivery: "Livraison en 2 Minutes"
            }
        },

        // How It Works
        howItWorks: {
            title: "Comment Notre IA Crée des CV Parfaits",
            steps: {
                analysis: {
                    title: "Analyse Intelligente d'Emploi",
                    description: "Notre IA analyse votre description d'emploi pour déterminer le style de contenu parfait, de l'approche conviviale débutant à l'autorité exécutive."
                },
                adaptive: {
                    title: "Contenu Adaptatif",
                    description: "Le contenu s'adapte automatiquement - simple et enthousiaste pour McDonald's, stratégique et autoritaire pour les postes de PDG."
                },
                design: {
                    title: "Design Magnifique",
                    description: "Modèles Canva professionnels sélectionnés selon le niveau d'emploi - épuré pour débutant, luxueux pour dirigeants."
                }
            }
        },

        // Pricing
        pricing: {
            title: "Choisissez Votre Forfait",
            subtitle: "Notre IA recommande automatiquement le meilleur forfait selon votre niveau d'emploi",
            packages: {
                basic: {
                    name: "Basique",
                    price: "39$",
                    description: "Parfait pour les postes débutants",
                    features: [
                        "Contenu généré par IA",
                        "Formatage optimisé ATS",
                        "Design propre et professionnel",
                        "Téléchargement PDF",
                        "Livraison en 2 minutes"
                    ],
                    button: "Choisir Basique",
                    goodFor: "Idéal pour McDonald's, vente au détail, débutant"
                },
                professional: {
                    name: "Professionnel",
                    price: "79$",
                    description: "Parfait pour les rôles professionnels",
                    popular: "PLUS POPULAIRE",
                    features: [
                        "Tout du Basique",
                        "Contenu avancé spécifique à l'emploi",
                        "Design Canva premium",
                        "Formats d'export multiples",
                        "Accès aux modèles éditables"
                    ],
                    button: "Choisir Professionnel",
                    goodFor: "Idéal pour tech, santé, gestion"
                },
                executive: {
                    name: "Exécutif",
                    price: "149$",
                    description: "Parfait pour les postes de direction",
                    features: [
                        "Tout du Professionnel",
                        "Contenu niveau exécutif",
                        "Design luxueux avec accents dorés",
                        "Focus leadership stratégique",
                        "Présentation prête pour conseil"
                    ],
                    button: "Choisir Exécutif",
                    goodFor: "Idéal pour PDG, Directeur, VP"
                }
            }
        },

        // AI Status
        aiStatus: {
            title: "🤖 Statut des Super Agents IA",
            subtitle: "Vue en temps réel de nos agents IA autonomes travaillant en arrière-plan",
            agents: {
                resume: {
                    name: "🚀 Agent CV",
                    status: "AMÉLIORÉ",
                    fields: {
                        status: "Statut:",
                        qualityScore: "Score Qualité:",
                        features: "Fonctionnalités:",
                        statusValue: "IA Améliorée Active",
                        qualityValue: "98%+ Précision",
                        featuresValue: "NLP + Sémantique"
                    }
                },
                trading: {
                    name: "📈 Agent Trading",
                    status: "APPRENTISSAGE",
                    fields: {
                        status: "Statut:",
                        accuracy: "Précision:",
                        dataPoints: "Points de Données:",
                        statusValue: "Trading Papier",
                        accuracyValue: "95.0%",
                        dataValue: "32,000+"
                    }
                },
                learning: {
                    name: "🧠 Agent Apprentissage",
                    status: "ACTIF",
                    fields: {
                        status: "Statut:",
                        models: "Modèles:",
                        quality: "Qualité:",
                        statusValue: "En Analyse",
                        modelsValue: "40 Entraînés",
                        qualityValue: "Premium"
                    }
                },
                orchestrator: {
                    name: "🎭 Orchestrateur",
                    status: "ACTIF",
                    fields: {
                        status: "Statut:",
                        agents: "Agents:",
                        efficiency: "Efficacité:",
                        statusValue: "Coordination",
                        agentsValue: "4 Gérés",
                        efficiencyValue: "98%"
                    }
                }
            },
            comingNext: {
                title: "🚀 Prochainement",
                approved: "✅ Approuvé et Prêt",
                future: "🔮 Vision Future",
                items: {
                    enhancedAI: {
                        title: "Algorithme IA Amélioré",
                        status: "DÉPLOYÉ ✅",
                        description: "MAINTENANT LIVE: 98%+ précision avec NLP avancé, correspondance sémantique et optimisation industrielle",
                        ready: "Prêt: 100% ✅",
                        boost: "Boost Qualité: +8%"
                    },
                    jobMatching: {
                        title: "Correspondance d'Emploi Temps Réel",
                        status: "RECHERCHE",
                        description: "Agent IA scanne les sites d'emploi et optimise les CV en temps réel",
                        ready: "Prêt: 60%",
                        time: "Délai: 3-4 semaines"
                    },
                    multiLanguage: {
                        title: "Agent IA Multi-Langues",
                        status: "APPROUVÉ",
                        description: "Étendre au-delà de l'anglais/français pour supporter 15+ langues avec optimisation IA native",
                        ready: "Prêt: 40%",
                        time: "Délai: 2-3 semaines"
                    },
                    interviewCoach: {
                        title: "Coach Entrevue IA",
                        description: "Pratiquez les entrevues avec une IA qui s'adapte à votre industrie"
                    },
                    salaryNegotiation: {
                        title: "IA Négociation Salaire",
                        description: "Agent IA qui aide à négocier de meilleures offres d'emploi"
                    },
                    careerPath: {
                        title: "Optimiseur Parcours Carrière",
                        description: "Planification carrière long terme avec insights IA"
                    }
                }
            }
        },

        // Examples
        examples: {
            title: "Exemples Réels",
            mcdonalds: {
                title: "🍔 Équipier McDonald's",
                analysis: "IA détectée: Poste débutant → Utilisé ton enthousiaste et amical avec focus éducation",
                quote: "Membre d'équipe enthousiaste et fiable avec de solides compétences en service client et récent diplôme d'études secondaires. Désireux de contribuer au succès de l'équipe tout en développant des compétences professionnelles...",
                package: "✅ Forfait Basique (39$) • Design épuré • Optimisé ATS"
            },
            ceo: {
                title: "🚂 PDG CN Rail",
                analysis: "IA détectée: Poste exécutif → Utilisé ton autoritaire et stratégique avec focus leadership",
                quote: "Leader exécutif visionnaire avec 20+ années conduisant la transformation organisationnelle et croissance durable. Expertise prouvée en planification stratégique, gestion P&L...",
                package: "✅ Forfait Exécutif (149$) • Design luxueux • Prêt pour conseil"
            }
        },

        // Order Form
        orderForm: {
            title: "Créez Votre CV IA",
            selectedPackage: "Forfait Sélectionné",
            packageDescription: "Notre IA recommandera automatiquement le meilleur forfait selon votre emploi",
            fields: {
                jobDescription: {
                    label: "Description d'Emploi *",
                    placeholder: "Collez la description d'emploi ici. Notre IA l'analysera pour créer le contenu et design parfait du CV..."
                },
                companyName: {
                    label: "Nom de l'Entreprise (Optionnel)",
                    placeholder: "ex: McDonald's, Google, Tesla"
                },
                fullName: {
                    label: "Nom Complet *",
                    placeholder: "Votre nom complet"
                },
                email: {
                    label: "Adresse Courriel *",
                    placeholder: "votre.courriel@exemple.com"
                },
                phone: {
                    label: "Numéro de Téléphone",
                    placeholder: "+1 (555) 123-4567"
                },
                location: {
                    label: "Localisation",
                    placeholder: "Ville, Province/État"
                },
                experience: {
                    label: "Résumé d'Expérience *",
                    placeholder: "Bref résumé de votre expérience de travail (ex: '5 ans développement logiciel', 'Récent diplômé', '15 ans gestion')"
                },
                skills: {
                    label: "Compétences Clés *",
                    placeholder: "Listez vos compétences clés séparées par virgules (ex: 'Service client, travail équipe, communication' ou 'Python, React, AWS, leadership')"
                },
                language: {
                    label: "Langue du CV"
                }
            },
            summary: {
                title: "Résumé de Commande",
                features: "✅ Analyse IA emploi ✅ Contenu personnalisé ✅ Design magnifique ✅ Livraison 2 minutes"
            },
            submit: "🚀 Générer Mon CV - Payer",
            security: "💳 Paiement sécurisé via Stripe • 🔒 Vos données sont protégées • ⚡ Livraison instantanée",
            processing: "🤖 Analyse de l'emploi et génération du CV..."
        },

        // Footer
        footer: {
            subtitle: "Générateur de CV Intelligent",
            copyright: "© 2025 NeuroPilot IA. Alimenté par technologie IA avancée."
        },

        // Messages
        messages: {
            success: "🎉 CV généré avec succès! Redirection vers le paiement...",
            error: "❌ Erreur:",
            networkError: "❌ Erreur réseau. Veuillez réessayer."
        }
    }
};

// Language management system
class LanguageManager {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'english';
        this.translations = translations;
    }

    setLanguage(language) {
        this.currentLanguage = language;
        localStorage.setItem('language', language);
        this.updatePage();
    }

    getCurrentLanguage() {
        return this.currentLanguage;
    }

    getText(key) {
        const keys = key.split('.');
        let value = this.translations[this.currentLanguage];
        
        for (const k of keys) {
            value = value?.[k];
        }
        
        return value || key;
    }

    updatePage() {
        // Update all elements with data-translate attribute
        document.querySelectorAll('[data-translate]').forEach(element => {
            const key = element.getAttribute('data-translate');
            const translation = this.getText(key);
            
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                if (element.getAttribute('placeholder') !== null) {
                    element.setAttribute('placeholder', translation);
                } else {
                    element.value = translation;
                }
            } else {
                element.textContent = translation;
            }
        });

        // Update elements with data-translate-html for HTML content
        document.querySelectorAll('[data-translate-html]').forEach(element => {
            const key = element.getAttribute('data-translate-html');
            const translation = this.getText(key);
            element.innerHTML = translation;
        });

        // Update language selector
        const languageSelector = document.getElementById('language-selector');
        if (languageSelector) {
            languageSelector.value = this.currentLanguage;
        }

        // Update form language
        const resumeLanguageSelect = document.getElementById('language');
        if (resumeLanguageSelect) {
            // Keep the technical values, update display if needed
            Array.from(resumeLanguageSelect.options).forEach(option => {
                if (option.value === 'english') {
                    option.textContent = this.currentLanguage === 'french' ? 'Anglais' : 'English';
                } else if (option.value === 'french') {
                    option.textContent = this.currentLanguage === 'french' ? 'Français' : 'French';
                }
            });
        }

        // Trigger custom event for dynamic content updates
        document.dispatchEvent(new CustomEvent('languageChanged', { 
            detail: { language: this.currentLanguage } 
        }));
    }
}

// Global instance
window.languageManager = new LanguageManager();

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.languageManager.updatePage();
});