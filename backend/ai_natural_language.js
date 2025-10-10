#!/usr/bin/env node

/**
 * Natural Language Query Interface
 * Bilingual (English/French) interface for inventory queries
 * Answers questions like "What caused frozen veg shortage last week?"
 */

const sqlite3 = require('sqlite3').verbose();
const AdaptiveInventoryAgent = require('./ai_adaptive_agent');

class NaturalLanguageInterface {
  constructor(dbPath = './data/enterprise_inventory.db') {
    this.db = new sqlite3.Database(dbPath);
    this.agent = new AdaptiveInventoryAgent(dbPath);

    // Intent patterns (regex-based NLU)
    this.intentPatterns = {
      en: {
        variance_analysis: /what caused|why (is|was) there|explain.*variance|discrepancy/i,
        shortage_cause: /shortage|out of stock|missing|pourquoi.*manque/i,
        forecast: /predict|forecast|estimate|how much.*need/i,
        recommendation: /should I|recommend|suggest|what.*order/i,
        inventory_status: /how much|how many|stock level|inventory.*of/i,
        trend_analysis: /trend|pattern|increasing|decreasing/i
      },
      fr: {
        variance_analysis: /quelle.*cause|pourquoi.*variance|expliquer.*écart/i,
        shortage_cause: /pénurie|manque|rupture.*stock|manquant/i,
        forecast: /prévoir|prévision|estimer|combien.*besoin/i,
        recommendation: /devrais.*commander|recommander|suggérer/i,
        inventory_status: /combien|niveau.*stock|inventaire.*de/i,
        trend_analysis: /tendance|modèle|augmentation|diminution/i
      }
    };

    // Entity extraction patterns
    this.entityPatterns = {
      item_code: /#?(\d{8})/g,
      date: /(\d{4}-\d{2}-\d{2})|yesterday|last week|ce.*semaine/gi,
      location: /(freezer|cooler|pantry|storage|congélateur|réfrigérateur)/gi
    };
  }

  /**
   * Process natural language query
   */
  async processQuery(queryText, language = 'en') {
    const startTime = Date.now();

    // Detect language if not specified
    if (!language) {
      language = this._detectLanguage(queryText);
    }

    // Extract intent
    const intent = this._extractIntent(queryText, language);

    // Extract entities (item codes, dates, locations)
    const entities = this._extractEntities(queryText);

    // Generate response based on intent
    let response;
    let confidence = 0;

    try {
      switch (intent) {
        case 'variance_analysis':
          response = await this._answerVarianceQuestion(entities, language);
          confidence = 0.85;
          break;

        case 'shortage_cause':
          response = await this._answerShortageQuestion(entities, language);
          confidence = 0.80;
          break;

        case 'forecast':
          response = await this._answerForecastQuestion(entities, language);
          confidence = 0.75;
          break;

        case 'recommendation':
          response = await this._answerRecommendationQuestion(entities, language);
          confidence = 0.80;
          break;

        case 'inventory_status':
          response = await this._answerInventoryStatusQuestion(entities, language);
          confidence = 0.90;
          break;

        case 'trend_analysis':
          response = await this._answerTrendQuestion(entities, language);
          confidence = 0.75;
          break;

        default:
          response = language === 'fr'
            ? "Désolé, je n'ai pas compris votre question. Pouvez-vous la reformuler?"
            : "Sorry, I didn't understand your question. Can you rephrase it?";
          confidence = 0.3;
      }

      // Log query
      this._logQuery(queryText, language, intent, entities, response, confidence);

      return {
        query: queryText,
        language,
        intent,
        entities,
        response,
        confidence,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      console.error('Error processing query:', error);
      return {
        query: queryText,
        language,
        error: error.message,
        response: language === 'fr'
          ? "Désolé, une erreur s'est produite."
          : "Sorry, an error occurred."
      };
    }
  }

  /**
   * Detect query language
   */
  _detectLanguage(text) {
    const frenchWords = /\b(le|la|les|de|du|des|et|à|pour|dans|que|qui|avec|sur|au|est|sont|pourquoi|combien|quelle)\b/gi;
    const matches = text.match(frenchWords);
    return (matches && matches.length > 2) ? 'fr' : 'en';
  }

  /**
   * Extract intent from query
   */
  _extractIntent(text, language) {
    const patterns = this.intentPatterns[language] || this.intentPatterns.en;

    for (const [intent, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return intent;
      }
    }

    return 'unknown';
  }

  /**
   * Extract entities (item codes, dates, locations)
   */
  _extractEntities(text) {
    const entities = {
      itemCodes: [],
      dates: [],
      locations: []
    };

    // Extract item codes
    const itemMatches = text.matchAll(this.entityPatterns.item_code);
    for (const match of itemMatches) {
      entities.itemCodes.push(match[1]);
    }

    // Extract dates
    const dateMatches = text.match(this.entityPatterns.date);
    if (dateMatches) {
      dateMatches.forEach(d => {
        if (d.match(/\d{4}-\d{2}-\d{2}/)) {
          entities.dates.push(d);
        } else if (d.toLowerCase().includes('yesterday') || d.includes('hier')) {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          entities.dates.push(yesterday.toISOString().split('T')[0]);
        } else if (d.toLowerCase().includes('last week') || d.includes('semaine')) {
          const lastWeek = new Date();
          lastWeek.setDate(lastWeek.getDate() - 7);
          entities.dates.push(lastWeek.toISOString().split('T')[0]);
        }
      });
    }

    // Extract locations
    const locationMatches = text.matchAll(this.entityPatterns.location);
    for (const match of locationMatches) {
      entities.locations.push(match[1].toLowerCase());
    }

    return entities;
  }

  /**
   * Answer variance analysis questions
   */
  async _answerVarianceQuestion(entities, language) {
    if (entities.itemCodes.length === 0) {
      return language === 'fr'
        ? "Veuillez spécifier un code d'article (ex: #10010421)"
        : "Please specify an item code (e.g., #10010421)";
    }

    const itemCode = entities.itemCodes[0];

    return new Promise((resolve) => {
      this.db.get(`
        SELECT avi.*, im.description
        FROM ai_variance_insights avi
        JOIN item_master im ON avi.item_code = im.item_code
        WHERE avi.item_code = ?
        ORDER BY avi.created_at DESC
        LIMIT 1
      `, [itemCode], (err, insight) => {
        if (err || !insight) {
          resolve(language === 'fr'
            ? `Aucune analyse de variance trouvée pour l'article ${itemCode}.`
            : `No variance analysis found for item ${itemCode}.`
          );
          return;
        }

        const evidence = JSON.parse(insight.evidence || '[]');
        const confidencePercent = (insight.confidence * 100).toFixed(0);

        if (language === 'fr') {
          resolve(
            `🔍 Analyse de variance pour ${insight.description} (${itemCode}):\n\n` +
            `• Écart détecté: ${insight.variance_amount} unités\n` +
            `• Cause probable: ${this._translateCause(insight.detected_cause, 'fr')}\n` +
            `• Confiance: ${confidencePercent}%\n` +
            `• Preuves: ${evidence.join(', ')}\n` +
            `• Action corrective: ${this._translateAction(insight.corrective_action, 'fr')}`
          );
        } else {
          resolve(
            `🔍 Variance Analysis for ${insight.description} (${itemCode}):\n\n` +
            `• Variance detected: ${insight.variance_amount} units\n` +
            `• Probable cause: ${insight.detected_cause.replace(/_/g, ' ')}\n` +
            `• Confidence: ${confidencePercent}%\n` +
            `• Evidence: ${evidence.join(', ')}\n` +
            `• Corrective action: ${insight.corrective_action || 'Under investigation'}`
          );
        }
      });
    });
  }

  /**
   * Answer shortage questions
   */
  async _answerShortageQuestion(entities, language) {
    return new Promise((resolve) => {
      // Find items with stockouts
      this.db.all(`
        SELECT
          im.item_code,
          im.description,
          ici.counted_quantity,
          arp.reorder_point,
          arp.avg_daily_consumption
        FROM item_master im
        LEFT JOIN inventory_count_items ici ON im.item_code = ici.item_code
          AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items)
        LEFT JOIN ai_reorder_policy arp ON im.item_code = arp.item_code
        WHERE ici.counted_quantity < arp.reorder_point
          OR ici.counted_quantity = 0
        ORDER BY ici.counted_quantity ASC
        LIMIT 10
      `, [], (err, items) => {
        if (err || items.length === 0) {
          resolve(language === 'fr'
            ? "Aucune pénurie détectée actuellement."
            : "No shortages currently detected."
          );
          return;
        }

        if (language === 'fr') {
          let response = `⚠️ Pénuries détectées (${items.length} articles):\n\n`;
          items.forEach((item, idx) => {
            response += `${idx + 1}. ${item.description} (${item.item_code})\n`;
            response += `   Stock actuel: ${item.counted_quantity || 0} | Point de réapprovisionnement: ${item.reorder_point}\n`;
          });
          resolve(response);
        } else {
          let response = `⚠️ Shortages detected (${items.length} items):\n\n`;
          items.forEach((item, idx) => {
            response += `${idx + 1}. ${item.description} (${item.item_code})\n`;
            response += `   Current stock: ${item.counted_quantity || 0} | Reorder point: ${item.reorder_point}\n`;
          });
          resolve(response);
        }
      });
    });
  }

  /**
   * Answer forecast questions
   */
  async _answerForecastQuestion(entities, language) {
    if (entities.itemCodes.length === 0) {
      return language === 'fr'
        ? "Veuillez spécifier un code d'article pour la prévision."
        : "Please specify an item code for the forecast.";
    }

    const itemCode = entities.itemCodes[0];

    return new Promise((resolve) => {
      this.db.get(`
        SELECT arp.*, im.description
        FROM ai_reorder_policy arp
        JOIN item_master im ON arp.item_code = im.item_code
        WHERE arp.item_code = ?
      `, [itemCode], (err, policy) => {
        if (err || !policy) {
          resolve(language === 'fr'
            ? "Aucune donnée de prévision disponible pour cet article."
            : "No forecast data available for this item."
          );
          return;
        }

        const weeklyForecast = policy.avg_daily_consumption * 7;
        const monthlyForecast = policy.avg_daily_consumption * 30;

        if (language === 'fr') {
          resolve(
            `📊 Prévision pour ${policy.description}:\n\n` +
            `• Consommation quotidienne moyenne: ${policy.avg_daily_consumption.toFixed(2)} unités\n` +
            `• Prévision hebdomadaire: ${weeklyForecast.toFixed(0)} unités\n` +
            `• Prévision mensuelle: ${monthlyForecast.toFixed(0)} unités\n` +
            `• Stock de sécurité recommandé: ${policy.safety_stock} unités`
          );
        } else {
          resolve(
            `📊 Forecast for ${policy.description}:\n\n` +
            `• Average daily consumption: ${policy.avg_daily_consumption.toFixed(2)} units\n` +
            `• Weekly forecast: ${weeklyForecast.toFixed(0)} units\n` +
            `• Monthly forecast: ${monthlyForecast.toFixed(0)} units\n` +
            `• Recommended safety stock: ${policy.safety_stock} units`
          );
        }
      });
    });
  }

  /**
   * Answer recommendation questions
   */
  async _answerRecommendationQuestion(entities, language) {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT
          arp.*,
          im.description,
          COALESCE(ici.counted_quantity, 0) as current_stock
        FROM ai_reorder_policy arp
        JOIN item_master im ON arp.item_code = im.item_code
        LEFT JOIN inventory_count_items ici ON arp.item_code = ici.item_code
          AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items)
        WHERE current_stock <= arp.reorder_point
        ORDER BY (arp.reorder_point - current_stock) DESC
        LIMIT 5
      `, [], (err, recommendations) => {
        if (err || recommendations.length === 0) {
          resolve(language === 'fr'
            ? "Aucune commande recommandée pour le moment."
            : "No orders recommended at this time."
          );
          return;
        }

        if (language === 'fr') {
          let response = `💡 Recommandations de commande:\n\n`;
          recommendations.forEach((item, idx) => {
            response += `${idx + 1}. ${item.description}\n`;
            response += `   Quantité recommandée: ${item.reorder_quantity} unités\n`;
            response += `   Coût estimé: $${(item.reorder_quantity * item.cost_per_unit).toFixed(2)}\n\n`;
          });
          resolve(response);
        } else {
          let response = `💡 Order Recommendations:\n\n`;
          recommendations.forEach((item, idx) => {
            response += `${idx + 1}. ${item.description}\n`;
            response += `   Recommended quantity: ${item.reorder_quantity} units\n`;
            response += `   Estimated cost: $${(item.reorder_quantity * item.cost_per_unit).toFixed(2)}\n\n`;
          });
          resolve(response);
        }
      });
    });
  }

  /**
   * Answer inventory status questions
   */
  async _answerInventoryStatusQuestion(entities, language) {
    if (entities.itemCodes.length === 0) {
      return language === 'fr'
        ? "Veuillez spécifier un code d'article."
        : "Please specify an item code.";
    }

    const itemCode = entities.itemCodes[0];

    return new Promise((resolve) => {
      this.db.get(`
        SELECT
          im.description,
          ici.counted_quantity,
          ici.location,
          ici.count_date
        FROM item_master im
        LEFT JOIN inventory_count_items ici ON im.item_code = ici.item_code
          AND ici.count_date = (SELECT MAX(count_date) FROM inventory_count_items WHERE item_code = ?)
        WHERE im.item_code = ?
      `, [itemCode, itemCode], (err, item) => {
        if (err || !item) {
          resolve(language === 'fr'
            ? "Article non trouvé."
            : "Item not found."
          );
          return;
        }

        if (language === 'fr') {
          resolve(
            `📦 Statut de l'inventaire pour ${item.description}:\n\n` +
            `• Quantité en stock: ${item.counted_quantity || 0} unités\n` +
            `• Emplacement: ${item.location || 'Non spécifié'}\n` +
            `• Dernier comptage: ${item.count_date || 'Jamais'}`
          );
        } else {
          resolve(
            `📦 Inventory Status for ${item.description}:\n\n` +
            `• Stock quantity: ${item.counted_quantity || 0} units\n` +
            `• Location: ${item.location || 'Not specified'}\n` +
            `• Last counted: ${item.count_date || 'Never'}`
          );
        }
      });
    });
  }

  /**
   * Answer trend analysis questions
   */
  async _answerTrendQuestion(entities, language) {
    return new Promise((resolve) => {
      this.db.all(`
        SELECT pattern_data, item_code, confidence_score
        FROM ai_learning_data
        WHERE pattern_type = 'consumption'
        ORDER BY last_updated DESC
        LIMIT 5
      `, [], (err, patterns) => {
        if (err || patterns.length === 0) {
          resolve(language === 'fr'
            ? "Données de tendance insuffisantes."
            : "Insufficient trend data."
          );
          return;
        }

        if (language === 'fr') {
          let response = `📈 Analyse des tendances:\n\n`;
          patterns.forEach((p, idx) => {
            const data = JSON.parse(p.pattern_data);
            response += `${idx + 1}. Article ${p.item_code}: ${data.trend}\n`;
          });
          resolve(response);
        } else {
          let response = `📈 Trend Analysis:\n\n`;
          patterns.forEach((p, idx) => {
            const data = JSON.parse(p.pattern_data);
            response += `${idx + 1}. Item ${p.item_code}: ${data.trend}\n`;
          });
          resolve(response);
        }
      });
    });
  }

  /**
   * Translate cause to French
   */
  _translateCause(cause, language) {
    if (language !== 'fr') return cause;

    const translations = {
      'theft': 'vol',
      'wrong_unit': 'erreur d\'unité',
      'over_portioning': 'sur-portionnement',
      'spoilage': 'détérioration',
      'receiving_error': 'erreur de réception',
      'unknown': 'inconnu'
    };

    return translations[cause] || cause;
  }

  /**
   * Translate action to French
   */
  _translateAction(action, language) {
    if (language !== 'fr' || !action) return action;

    return action
      .replace(/Review/g, 'Vérifier')
      .replace(/implement/g, 'mettre en œuvre')
      .replace(/training/g, 'formation')
      .replace(/Audit/g, 'Auditer');
  }

  /**
   * Log query for learning
   */
  _logQuery(queryText, language, intent, entities, response, confidence) {
    this.db.run(`
      INSERT INTO ai_query_log
      (query_text, language, intent, extracted_entities, response_text, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      queryText,
      language,
      intent,
      JSON.stringify(entities),
      response,
      confidence
    ]);
  }

  close() {
    this.db.close();
    this.agent.close();
  }
}

module.exports = NaturalLanguageInterface;

// CLI usage
if (require.main === module) {
  const nli = new NaturalLanguageInterface();

  const testQueries = [
    "What caused the variance in item #10010421?",
    "Pourquoi avons-nous une pénurie de légumes congelés?",
    "How much of item #10010421 do we need to order?",
    "Show me current stock levels"
  ];

  console.log('\n🗣️ Natural Language Interface - Testing\n');

  (async () => {
    for (const query of testQueries) {
      console.log(`\nQuery: "${query}"`);
      const result = await nli.processQuery(query);
      console.log(`Intent: ${result.intent}`);
      console.log(`Language: ${result.language}`);
      console.log(`Response: ${result.response}\n`);
      console.log('-'.repeat(80));
    }

    nli.close();
  })();
}
