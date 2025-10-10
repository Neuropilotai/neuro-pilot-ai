/**
 * Example: Report Generation with Legal Headers
 * Demonstrates how to use the legalHeaders utility
 */

const fs = require('fs').promises;
const path = require('path');
const { generateLegalReport, getLegalHeader, getLegalFooter } = require('../utils/legalHeaders');

/**
 * Example 1: Generate Markdown Report
 */
async function generateMarkdownReport() {
  const reportContent = `
## System Status

**Overall Health:** ✅ Operational
**Uptime:** 99.98%
**Active Users:** 47
**Inventory Items:** 1,247

### Performance Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Response Time | 145ms | ✅ Good |
| CPU Usage | 34% | ✅ Normal |
| Memory | 2.1GB | ✅ Normal |
| Disk I/O | 12 MB/s | ✅ Normal |

### Recent Activity

- 15 inventory updates in the last hour
- 3 new orders processed
- 2 forecast models retrained
- 0 security alerts

`;

  const completeReport = generateLegalReport(reportContent, {
    format: 'markdown',
    reportType: 'Daily System Status Report',
    language: 'en'
  });

  const outputPath = path.join(__dirname, '../docs/daily-status-report.md');
  await fs.writeFile(outputPath, completeReport, 'utf8');

  console.log(`✅ Markdown report generated: ${outputPath}`);
  return outputPath;
}

/**
 * Example 2: Generate HTML Report
 */
async function generateHTMLReport() {
  const reportContent = `
  <div class="report-content">
    <h2>Inventory Analytics Report</h2>

    <div class="summary-cards">
      <div class="card">
        <h3>Total Items</h3>
        <div class="value">1,247</div>
        <div class="change">+12% from last month</div>
      </div>

      <div class="card">
        <h3>Low Stock Items</h3>
        <div class="value">23</div>
        <div class="change alert">Requires attention</div>
      </div>

      <div class="card">
        <h3>Forecast Accuracy</h3>
        <div class="value">94.2%</div>
        <div class="change">+2.1% improvement</div>
      </div>
    </div>

    <h3>Top Items by Turnover</h3>
    <table>
      <thead>
        <tr>
          <th>Item Code</th>
          <th>Name</th>
          <th>Quantity</th>
          <th>Turnover</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>SKU-001</td>
          <td>Product A</td>
          <td>450</td>
          <td>High</td>
        </tr>
        <tr>
          <td>SKU-042</td>
          <td>Product B</td>
          <td>320</td>
          <td>High</td>
        </tr>
      </tbody>
    </table>
  </div>
`;

  const completeReport = generateLegalReport(reportContent, {
    format: 'html',
    reportType: 'Inventory Analytics Report',
    language: 'en'
  });

  const outputPath = path.join(__dirname, '../docs/analytics-report.html');
  await fs.writeFile(outputPath, completeReport, 'utf8');

  console.log(`✅ HTML report generated: ${outputPath}`);
  return outputPath;
}

/**
 * Example 3: Generate Bilingual Report (English + French)
 */
async function generateBilingualReport() {
  const reportContent = `
## Compliance Audit Results

**Audit Date:** ${new Date().toLocaleDateString('en-US')}
**Frameworks:** ISO27001, SOC2, OWASP

### Summary

- Total Checks: 45
- Passed: 41
- Failed: 4
- Compliance Score: 91.1%

### Recommendations

1. Enable additional logging for API endpoints
2. Implement rate limiting on public endpoints
3. Update SSL certificates (expiring in 30 days)
4. Review user access permissions quarterly

`;

  // English version
  const englishReport = generateLegalReport(reportContent, {
    format: 'markdown',
    reportType: 'Compliance Audit Report',
    language: 'en'
  });

  // French version
  const reportContentFR = `
## Résultats de l'Audit de Conformité

**Date de l'audit:** ${new Date().toLocaleDateString('fr-FR')}
**Cadres:** ISO27001, SOC2, OWASP

### Résumé

- Vérifications totales: 45
- Réussies: 41
- Échouées: 4
- Score de conformité: 91.1%

### Recommandations

1. Activer la journalisation supplémentaire pour les points de terminaison API
2. Implémenter la limitation du débit sur les points de terminaison publics
3. Mettre à jour les certificats SSL (expirant dans 30 jours)
4. Examiner les autorisations d'accès utilisateur trimestriellement

`;

  const frenchReport = generateLegalReport(reportContentFR, {
    format: 'markdown',
    reportType: 'Rapport d\'Audit de Conformité',
    language: 'fr'
  });

  const outputPathEN = path.join(__dirname, '../docs/compliance-audit-en.md');
  const outputPathFR = path.join(__dirname, '../docs/compliance-audit-fr.md');

  await fs.writeFile(outputPathEN, englishReport, 'utf8');
  await fs.writeFile(outputPathFR, frenchReport, 'utf8');

  console.log(`✅ Bilingual reports generated:`);
  console.log(`   - English: ${outputPathEN}`);
  console.log(`   - French: ${outputPathFR}`);

  return [outputPathEN, outputPathFR];
}

/**
 * Example 4: Manual Header/Footer Usage
 */
async function generateCustomReport() {
  const header = getLegalHeader('text', {
    reportType: 'Security Incident Report',
    version: 'v2.7.0',
    language: 'en'
  });

  const content = `
INCIDENT DETAILS
================

Incident ID: INC-2025-001
Severity: Medium
Status: Resolved
Date: ${new Date().toISOString()}

DESCRIPTION:
Unusual login attempts detected from IP 192.168.1.100

RESOLUTION:
IP added to monitoring list. User account verified. No breach detected.

ACTIONS TAKEN:
- Enhanced monitoring enabled
- User notified via email
- Security team alerted

`;

  const footer = getLegalFooter('text', { language: 'en' });

  const completeReport = header + content + footer;

  const outputPath = path.join(__dirname, '../logs/security-incident-report.txt');
  await fs.writeFile(outputPath, completeReport, 'utf8');

  console.log(`✅ Security report generated: ${outputPath}`);
  return outputPath;
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('\n🚀 Generating example reports with legal headers...\n');

  try {
    await generateMarkdownReport();
    await generateHTMLReport();
    await generateBilingualReport();
    await generateCustomReport();

    console.log('\n✅ All example reports generated successfully!');
    console.log('\n📁 Check the following directories:');
    console.log('   - /docs/ for documentation reports');
    console.log('   - /logs/ for operational logs');
    console.log('\n💡 All reports include:');
    console.log('   ✓ Legal ownership header');
    console.log('   ✓ Copyright notice with dynamic year');
    console.log('   ✓ Contact information');
    console.log('   ✓ Legal footer with timestamp\n');
  } catch (error) {
    console.error('❌ Error generating reports:', error);
    throw error;
  }
}

// Run examples if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  generateMarkdownReport,
  generateHTMLReport,
  generateBilingualReport,
  generateCustomReport,
  runExamples
};
