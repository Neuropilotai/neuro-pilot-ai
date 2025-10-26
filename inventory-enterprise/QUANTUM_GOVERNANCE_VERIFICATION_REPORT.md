<file name=backend/routes/owner-ops.js>
'use strict';

const express = require('express');
const router = express.Router();
const LearningSignals = require('../src/ai/LearningSignals');
// v15.3 Financial Accuracy
const { getFinancialAccuracyMetric } = require('../src/ai/FinancialAccuracy');

// Owner Ops Status
router.get('/api/owner/ops/status', async (req, res, next) => {
  try {
    // v15.3: Financial Accuracy metric
    let financialAccuracyResult = { financial_accuracy: null, color: 'gray' };
    try {
      financialAccuracyResult = await getFinancialAccuracyMetric(req.app.locals.db);
    } catch (e) {
      console.error('FinancialAccuracy metric error:', e.message || e);
    }

    // existing health stats building here
    const status = {
      // ... other health stats ...
      // === v15.3: Financial Accuracy ===
      financial_accuracy: financialAccuracyResult.financial_accuracy,
      financial_accuracy_color: financialAccuracyResult.color,
    };
    res.json(status);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
</file>

<file name=backend/server.js>
'use strict';

const express = require('express');
const app = express();

// ... other requires and setup ...

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', 'text/plain; version=0.0.4');

  const lines = [
    // existing metrics lines here
  ];

  // v15.3 Financial metrics
  try {
    const db = app.locals.db || require('./db');
    const row = await new Promise((resolve, reject) => {
      db.get(
        "SELECT value, as_of FROM ai_ops_health_metrics WHERE metric='financial_accuracy' ORDER BY as_of DESC LIMIT 1",
        (err, r) => err ? reject(err) : resolve(r)
      );
    });
    const accuracy = row ? Number(row.value) : 0;
    lines.push(`financial_usage_accuracy_pct ${accuracy}`);
  } catch (e) {
    lines.push(`financial_usage_accuracy_pct 0`);
  }
  // expose import counter if present (defaults to 0)
  const finImportTotal = (app.locals.metrics && app.locals.metrics.financial_import_total) || 0;
  lines.push(`financial_import_total{period="2025H1"} ${finImportTotal}`);

  res.send(lines.join('\n') + '\n');
});

// ... rest of server.js ...
</file>

<file name=backend/routes/inventory-reconcile.js>
'use strict';

const express = require('express');
const router = express.Router();

// ... other requires and code ...

router.post('/api/inventory/reconcile/import-pdfs', async (req, res, next) => {
  try {
    // ... import logic ...

    // Assuming here the response object is built like this:
    const responseObj = { importedCount, vendors, totalValue, importId, financialData };

    // v15.3 metrics: bump import total
    if (!req.app.locals.metrics) req.app.locals.metrics = {};
    req.app.locals.metrics.financial_import_total = (req.app.locals.metrics.financial_import_total || 0) + 1;

    res.json(responseObj);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
</file>

<file name=scripts/verify_financial_import.sh>
#!/usr/bin/env bash
set -euo pipefail

# chmod +x scripts/verify_financial_import.sh

BASE="http://127.0.0.1:8083"
TOKEN="${TOKEN:-}"

if [[ -z "${TOKEN}" ]]; then
  echo "ERROR: Set TOKEN env var with a valid bearer token."
  exit 2
fi

hdr=(-H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json")

echo "== Step 1: Monthly summary Jan–Jun 2025 =="
curl -s "${hdr[@]}" \
  "${BASE}/api/inventory/reconcile/financial-summary?group=month&from=2025-01-01&to=2025-06-30" | jq '.summaries | length'

echo "== Step 2: Latest financial accuracy metric =="
curl -s "${BASE}/api/owner/ops/status" -H "Authorization: Bearer ${TOKEN}" | jq '.financial_accuracy, .financial_accuracy_color'

echo "== Step 3: Metrics exposure =="
curl -s "${BASE}/metrics" | grep -E "financial_import_total|financial_usage_accuracy_pct" || {
  echo "Missing metrics lines"; exit 3;
}

echo "All checks passed."
</file>

<file name=frontend/owner-super-console.html>
<!-- ... existing tabs ... -->
<button id="tab-usage-financials" class="np-tab-btn" data-tab="usage-financials">📊 Usage &amp; Financials</button>

<!-- ... existing tab content ... -->

<section id="tabview-usage-financials" class="np-tabview u-hide">
  <div class="u-flex u-gap-12 u-items-center u-mb-12">
    <label for="uf-period">Period</label>
    <select id="uf-period" class="np-input">
      <option value="2025H1">H1 2025 (Jan–Jun)</option>
    </select>
    <label for="uf-group">Group by</label>
    <select id="uf-group" class="np-input">
      <option value="month">Month</option>
      <option value="week">Week</option>
    </select>
    <button id="uf-refresh" class="np-btn">Refresh</button>
    <button id="uf-export" class="np-btn">Export CSV</button>
    <button id="uf-gen-pdf" class="np-btn">Generate Client PDF</button>
  </div>
  <div class="u-grid u-gap-12 u-mb-12">
    <div class="stat-card">
      <div class="stat-label">Financial Accuracy</div>
      <div id="uf-accuracy" class="stat-value">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Food+Freight Reimb.</div>
      <div id="uf-reimb" class="stat-value">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Other Costs</div>
      <div id="uf-other" class="stat-value">—</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">GST / QST</div>
      <div id="uf-tax" class="stat-value">—</div>
    </div>
  </div>
  <div class="table-wrap">
    <table class="np-table" id="uf-table" aria-label="Usage and Financials">
      <thead>
        <tr>
          <th>Vendor</th><th>Date</th><th>Invoice #</th>
          <th>BAKE</th><th>BEV+ECO</th><th>MILK</th><th>GROC+MISC</th>
          <th>MEAT</th><th>PROD</th><th>CLEAN</th><th>PAPER</th><th>FREIGHT</th>
          <th>GST</th><th>QST</th><th>Total</th>
        </tr>
      </thead>
      <tbody id="uf-tbody"></tbody>
    </table>
  </div>
</section>
</file>

<file name=frontend/owner-super-console.js>
// ===== v15.3 Usage & Financials =====
(function(){
  const $ = (sel) => document.querySelector(sel);
  const fmt = (n) => (n==null? '—' : Number(n).toLocaleString('en-CA', {minimumFractionDigits:2, maximumFractionDigits:2}));
  async function fetchJSON(url){
    const res = await fetch(H.route(url), { headers: authHeaders() });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  function authHeaders(){
    const t = localStorage.getItem('authToken') || window.authToken;
    const h = { 'Accept':'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }
  async function loadFinancialSummary(){
    const group = $('#uf-group').value;
    const url = group === 'month'
      ? '/api/inventory/reconcile/financial-summary?group=month&from=2025-01-01&to=2025-06-30'
      : '/api/inventory/reconcile/financial-summary?group=week&month=2025-09';
    const data = await fetchJSON(url);
    renderFinancials(data);
    await refreshFinancialAccuracy();
  }
  async function refreshFinancialAccuracy(){
    try{
      const st = await fetchJSON('/api/owner/ops/status');
      $('#uf-accuracy').textContent = st.financial_accuracy != null ? `${fmt(st.financial_accuracy)} %` : '—';
    }catch(e){
      console.warn('financial accuracy fetch failed', e);
      $('#uf-accuracy').textContent = '—';
    }
  }
  function renderFinancials(data){
    const tb = $('#uf-tbody');
    tb.innerHTML = '';
    let reimb = 0, other = 0, gst = 0, qst = 0;
    const rows = (data.rows || data.summaries || []);
    for (const r of rows){
      const cat = r.category_totals || r.categories || {};
      const row = document.createElement('tr');
      const d = (r.invoice_date || r.date || '').slice(0,10);
      row.innerHTML = `
        <td>${r.vendor || r.vendor_name || '—'}</td>
        <td>${d}</td>
        <td>${r.invoice_number || r.invoice_no || '—'}</td>
        <td class="ar">${fmt(cat.BAKE)}</td>
        <td class="ar">${fmt(cat['BEV+ECO'] || cat.BEV_ECO)}</td>
        <td class="ar">${fmt(cat.MILK)}</td>
        <td class="ar">${fmt(cat['GROC+MISC'] || cat.GROC_MISC)}</td>
        <td class="ar">${fmt(cat.MEAT)}</td>
        <td class="ar">${fmt(cat.PROD)}</td>
        <td class="ar">${fmt(cat.CLEAN)}</td>
        <td class="ar">${fmt(cat.PAPER)}</td>
        <td class="ar">${fmt(cat.FREIGHT)}</td>
        <td class="ar">${fmt(r.gst)}</td>
        <td class="ar">${fmt(r.qst)}</td>
        <td class="ar">${fmt(r.total_amount || r.total)}</td>`;
      tb.appendChild(row);
      const food = (cat.BAKE||0)+(cat['BEV+ECO']||cat.BEV_ECO||0)+(cat.MILK||0)+(cat['GROC+MISC']||cat.GROC_MISC||0)+(cat.MEAT||0)+(cat.PROD||0);
      reimb += food + (cat.FREIGHT||0);
      other += (cat.CLEAN||0)+(cat.PAPER||0);
      gst += Number(r.gst||0);
      qst += Number(r.qst||0);
    }
    $('#uf-reimb').textContent = fmt(reimb);
    $('#uf-other').textContent = fmt(other);
    $('#uf-tax').textContent = `${fmt(gst)} / ${fmt(qst)}`;
  }
  function exportCSV(){
    const rows = [['Vendor','Date','Invoice #','BAKE','BEV+ECO','MILK','GROC+MISC','MEAT','PROD','CLEAN','PAPER','FREIGHT','GST','QST','Total']];
    document.querySelectorAll('#uf-tbody tr').forEach(tr => {
      const cells=[...tr.children].map(td=> td.textContent);
      rows.push(cells);
    });
    const csv = rows.map(r=> r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'usage_financials_2025H1.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function generatePDF(){
    const body = { period:{type:'month', value:'2025-06'}, locale: 'en' };
    const res = await fetch(H.route('/api/inventory/reconcile/client-report'), {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    if(!res.ok){ toastError('PDF generation failed'); return; }
    const j = await res.json();
    if (j.url) window.open(H.asset(j.url), '_blank');
  }
  function bindUF(){
    const tabBtn = document.getElementById('tab-usage-financials');
    if (tabBtn) tabBtn.addEventListener('click', () => {
      switchTab('usage-financials');
      loadFinancialSummary().catch(console.error);
    });
    const refresh = document.getElementById('uf-refresh');
    refresh && refresh.addEventListener('click', () => loadFinancialSummary().catch(console.error));
    const exp = document.getElementById('uf-export');
    exp && exp.addEventListener('click', exportCSV);
    const gen = document.getElementById('uf-gen-pdf');
    gen && gen.addEventListener('click', () => generatePDF().catch(console.error));
  }
  document.addEventListener('DOMContentLoaded', bindUF);
})();
</file>

<file name=CHANGELOG.md>
## v15.3.0 — Financial Accuracy & Usage (2025-10-13)
- feat: wire FinancialAccuracy into Owner Ops status (weight 0.15, G/Y/R thresholds)
- feat: new “Usage & Financials” tab (H1 2025, CSV export, accuracy chip)
- feat: Prometheus metrics: financial_import_total, financial_usage_accuracy_pct
- chore: add verification script scripts/verify_financial_import.sh
- note: PDF generator endpoint stubbed; UI button present (EN/FR wiring next)

<!-- existing changelog entries below -->
</file>
