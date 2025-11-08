/**
 * PDF Generation Routes
 * Generates downloadable PDF reports
 */

const express = require('express');
const router = express.Router();
const { generatePDF } = require('../services/pdfkit');

// POST /api/pdfs/generate - Generate PDF
router.post('/generate', async (req, res) => {
  try {
    const { type, params } = req.body;
    const org_id = req.user?.org_id || 1;
    const site_id = req.user?.site_id || null;

    if (!type) {
      return res.status(400).json({ success: false, error: 'type required' });
    }

    // Inject org_id and site_id into params
    const enrichedParams = {
      ...params,
      org_id,
      site_id
    };

    // Generate PDF
    const pdf = await generatePDF(type, enrichedParams);

    // Set headers for download
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.content);

  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
