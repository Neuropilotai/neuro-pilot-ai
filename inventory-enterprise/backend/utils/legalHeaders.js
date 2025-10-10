/**
 * Legal Headers Utility
 * Automatically adds copyright and ownership declarations to all generated reports
 * © 2025 David Mikulis. All Rights Reserved.
 */

const getLegalHeader = (format = 'markdown', options = {}) => {
  const currentYear = new Date().getFullYear();
  const version = options.version || 'v2.7.0';
  const reportType = options.reportType || 'System Report';
  const language = options.language || 'en';

  const headers = {
    markdown: {
      en: `# ${reportType}

---

**Proprietary Information — NeuroInnovate Inventory Enterprise ${version}**
© ${currentYear} David Mikulis. All Rights Reserved.
Unauthorized access or redistribution is prohibited.

**Contact:** Neuro.Pilot.AI@gmail.com
**Owner:** David Mikulis
**Company:** NeuroInnovate

---

`,
      fr: `# ${reportType}

---

**Information Propriétaire — NeuroInnovate Inventory Enterprise ${version}**
© ${currentYear} David Mikulis. Tous droits réservés.
L'accès non autorisé ou la redistribution est interdit.

**Contact:** Neuro.Pilot.AI@gmail.com
**Propriétaire:** David Mikulis
**Entreprise:** NeuroInnovate

---

`
    },

    html: {
      en: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportType} - NeuroInnovate</title>
  <style>
    .legal-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 8px;
    }
    .legal-header h1 {
      margin: 0 0 15px 0;
      font-size: 24px;
    }
    .legal-notice {
      font-size: 12px;
      opacity: 0.95;
      line-height: 1.6;
    }
    .legal-footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #667eea;
      text-align: center;
      font-size: 11px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="legal-header">
    <h1>${reportType}</h1>
    <div class="legal-notice">
      <strong>Proprietary Information — NeuroInnovate Inventory Enterprise ${version}</strong><br>
      © ${currentYear} David Mikulis. All Rights Reserved.<br>
      Unauthorized access or redistribution is prohibited.
      <br><br>
      <strong>Contact:</strong> Neuro.Pilot.AI@gmail.com<br>
      <strong>Owner:</strong> David Mikulis<br>
      <strong>Company:</strong> NeuroInnovate
    </div>
  </div>
`,
      fr: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${reportType} - NeuroInnovate</title>
  <style>
    .legal-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      margin-bottom: 30px;
      border-radius: 8px;
    }
    .legal-header h1 {
      margin: 0 0 15px 0;
      font-size: 24px;
    }
    .legal-notice {
      font-size: 12px;
      opacity: 0.95;
      line-height: 1.6;
    }
    .legal-footer {
      margin-top: 50px;
      padding-top: 20px;
      border-top: 2px solid #667eea;
      text-align: center;
      font-size: 11px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="legal-header">
    <h1>${reportType}</h1>
    <div class="legal-notice">
      <strong>Information Propriétaire — NeuroInnovate Inventory Enterprise ${version}</strong><br>
      © ${currentYear} David Mikulis. Tous droits réservés.<br>
      L'accès non autorisé ou la redistribution est interdit.
      <br><br>
      <strong>Contact:</strong> Neuro.Pilot.AI@gmail.com<br>
      <strong>Propriétaire:</strong> David Mikulis<br>
      <strong>Entreprise:</strong> NeuroInnovate
    </div>
  </div>
`
    },

    pdf: {
      en: `Proprietary Information — NeuroInnovate Inventory Enterprise ${version}
© ${currentYear} David Mikulis. All Rights Reserved.
Unauthorized access or redistribution is prohibited.

Contact: Neuro.Pilot.AI@gmail.com
Owner: David Mikulis
Company: NeuroInnovate

${'='.repeat(80)}

`,
      fr: `Information Propriétaire — NeuroInnovate Inventory Enterprise ${version}
© ${currentYear} David Mikulis. Tous droits réservés.
L'accès non autorisé ou la redistribution est interdit.

Contact: Neuro.Pilot.AI@gmail.com
Propriétaire: David Mikulis
Entreprise: NeuroInnovate

${'='.repeat(80)}

`
    },

    text: {
      en: `${'='.repeat(80)}
PROPRIETARY INFORMATION — NEUROINNOVATE INVENTORY ENTERPRISE ${version}
© ${currentYear} David Mikulis. All Rights Reserved.
Unauthorized access or redistribution is prohibited.
${'='.repeat(80)}

Contact: Neuro.Pilot.AI@gmail.com
Owner: David Mikulis
Company: NeuroInnovate

${'='.repeat(80)}

`,
      fr: `${'='.repeat(80)}
INFORMATION PROPRIÉTAIRE — NEUROINNOVATE INVENTORY ENTERPRISE ${version}
© ${currentYear} David Mikulis. Tous droits réservés.
L'accès non autorisé ou la redistribution est interdit.
${'='.repeat(80)}

Contact: Neuro.Pilot.AI@gmail.com
Propriétaire: David Mikulis
Entreprise: NeuroInnovate

${'='.repeat(80)}

`
    }
  };

  return headers[format]?.[language] || headers[format]?.en || headers.text.en;
};

const getLegalFooter = (format = 'markdown', options = {}) => {
  const currentYear = new Date().getFullYear();
  const language = options.language || 'en';

  const footers = {
    markdown: {
      en: `

---

**© ${currentYear} NeuroInnovate · Proprietary System · Owned and operated by David Mikulis**

*This document contains proprietary information. Unauthorized distribution is prohibited.*

*For inquiries: Neuro.Pilot.AI@gmail.com*

---

*Generated: ${new Date().toISOString()}*
`,
      fr: `

---

**© ${currentYear} NeuroInnovate · Système Propriétaire · Détenu et exploité par David Mikulis**

*Ce document contient des informations propriétaires. La distribution non autorisée est interdite.*

*Pour les demandes: Neuro.Pilot.AI@gmail.com*

---

*Généré: ${new Date().toISOString()}*
`
    },

    html: {
      en: `
  <div class="legal-footer">
    <p><strong>© ${currentYear} NeuroInnovate · Proprietary System · Owned and operated by David Mikulis</strong></p>
    <p>This document contains proprietary information. Unauthorized distribution is prohibited.</p>
    <p>For inquiries: Neuro.Pilot.AI@gmail.com</p>
    <p style="margin-top: 10px; font-size: 10px;">Generated: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`,
      fr: `
  <div class="legal-footer">
    <p><strong>© ${currentYear} NeuroInnovate · Système Propriétaire · Détenu et exploité par David Mikulis</strong></p>
    <p>Ce document contient des informations propriétaires. La distribution non autorisée est interdite.</p>
    <p>Pour les demandes: Neuro.Pilot.AI@gmail.com</p>
    <p style="margin-top: 10px; font-size: 10px;">Généré: ${new Date().toISOString()}</p>
  </div>
</body>
</html>`
    },

    text: {
      en: `
${'='.repeat(80)}
© ${currentYear} NeuroInnovate · Proprietary System · Owned and operated by David Mikulis

This document contains proprietary information.
Unauthorized distribution is prohibited.

For inquiries: Neuro.Pilot.AI@gmail.com
Generated: ${new Date().toISOString()}
${'='.repeat(80)}
`,
      fr: `
${'='.repeat(80)}
© ${currentYear} NeuroInnovate · Système Propriétaire · Détenu et exploité par David Mikulis

Ce document contient des informations propriétaires.
La distribution non autorisée est interdite.

Pour les demandes: Neuro.Pilot.AI@gmail.com
Généré: ${new Date().toISOString()}
${'='.repeat(80)}
`
    }
  };

  return footers[format]?.[language] || footers[format]?.en || footers.text.en;
};

/**
 * Wrap report content with legal headers and footers
 */
const wrapWithLegalNotices = (content, format = 'markdown', options = {}) => {
  const header = getLegalHeader(format, options);
  const footer = getLegalFooter(format, options);

  return header + content + footer;
};

/**
 * Generate a complete report with legal compliance
 */
const generateLegalReport = (reportContent, options = {}) => {
  const {
    format = 'markdown',
    reportType = 'System Report',
    language = 'en',
    version = 'v2.7.0',
    includeHeader = true,
    includeFooter = true
  } = options;

  let output = '';

  if (includeHeader) {
    output += getLegalHeader(format, { reportType, language, version });
  }

  output += reportContent;

  if (includeFooter) {
    output += getLegalFooter(format, { language });
  }

  return output;
};

module.exports = {
  getLegalHeader,
  getLegalFooter,
  wrapWithLegalNotices,
  generateLegalReport
};
