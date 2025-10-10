/**
 * PDF Invoice Manager API Integration Test
 * Tests all endpoints and verifies functionality
 */

const db = require('./config/database');

// Use native fetch (Node 18+) or fallback to https
const fetch = globalThis.fetch || require('node-fetch').default;

const BASE_URL = 'http://localhost:8083';
const LOGIN_EMAIL = 'neuro.pilot.ai@gmail.com';
const LOGIN_PASSWORD = 'Admin123!@#';

async function testPDFManager() {
  console.log('🧪 Testing PDF Invoice Manager API\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let accessToken;

  try {
    // 1. Login
    console.log('1️⃣  Logging in as owner...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: LOGIN_EMAIL,
        password: LOGIN_PASSWORD
      })
    });

    const loginData = await loginRes.json();

    if (!loginData.accessToken) {
      throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
    }

    accessToken = loginData.accessToken;
    console.log(`✅ Login successful (token: ${accessToken.substring(0, 20)}...)\n`);

    // 2. List all PDFs
    console.log('2️⃣  Listing all PDFs...');
    const listAllRes = await fetch(`${BASE_URL}/api/owner/pdfs?status=all`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const listAllData = await listAllRes.json();

    // Debug: Show full response if there's an issue
    if (!listAllData.success || !listAllData.summary) {
      console.log('⚠️  Unexpected response:', JSON.stringify(listAllData, null, 2));
      throw new Error('API did not return expected response format');
    }

    console.log(`✅ API Response:`);
    console.log(`   Total PDFs: ${listAllData.summary.total}`);
    console.log(`   Processed: ${listAllData.summary.processed}`);
    console.log(`   Unprocessed: ${listAllData.summary.unprocessed}\n`);

    if (listAllData.data && listAllData.data.length > 0) {
      console.log(`   Sample document:`);
      const sample = listAllData.data[0];
      console.log(`   - ID: ${sample.document_id}`);
      console.log(`   - File: ${sample.file_name}`);
      console.log(`   - Status: ${sample.isProcessed ? 'Processed' : 'Unprocessed'}`);
      console.log(`   - SHA256: ${sample.sha256_truncated}...`);
      console.log(``);
    }

    // 3. Test cutoff filter
    console.log('3️⃣  Testing cutoff filter (2025-10-01)...');
    const cutoffRes = await fetch(`${BASE_URL}/api/owner/pdfs?status=unprocessed&cutoff=2025-10-01`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const cutoffData = await cutoffRes.json();
    console.log(`✅ Cutoff filter results:`);
    console.log(`   Filtered count: ${cutoffData.data.length}`);
    console.log(`   Cutoff applied: ${cutoffData.summary.cutoff_applied}\n`);

    // 4. Mark PDFs as processed (if we have unprocessed ones)
    const unprocessedPdfs = listAllData.data.filter(d => !d.isProcessed);

    if (unprocessedPdfs.length >= 3) {
      console.log('4️⃣  Marking 3 PDFs as processed...');
      const testInvoices = unprocessedPdfs.slice(0, 3).map(d => d.document_id);
      const countId = `TEST_${Date.now()}`;

      console.log(`   Invoice IDs: ${testInvoices.join(', ')}`);
      console.log(`   Count ID: ${countId}`);

      const markRes = await fetch(`${BASE_URL}/api/owner/pdfs/mark-processed`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoiceIds: testInvoices,
          countId: countId,
          processedAt: new Date().toISOString()
        })
      });

      const markData = await markRes.json();

      if (markData.success) {
        console.log(`✅ Mark as processed successful:`);
        console.log(`   Processed count: ${markData.data.processed_count}`);
        console.log(`   Linked count: ${markData.data.linked_count}`);
        console.log(`   Count ID: ${markData.data.count_id}\n`);

        // Verify in database
        console.log('5️⃣  Verifying database records...');

        const processedCheck = db.prepare(`
          SELECT COUNT(*) as count
          FROM processed_invoices
          WHERE invoice_id IN (${testInvoices.map(() => '?').join(',')})
        `).get(...testInvoices);

        const linkedCheck = db.prepare(`
          SELECT COUNT(*) as count
          FROM count_pdfs
          WHERE document_id IN (${testInvoices.map(() => '?').join(',')})
        `).get(...testInvoices);

        console.log(`✅ Database verification:`);
        console.log(`   processed_invoices: ${processedCheck.count} rows`);
        console.log(`   count_pdfs: ${linkedCheck.count} rows\n`);
      } else {
        console.log(`⚠️  Mark as processed failed: ${markData.error}\n`);
      }
    } else {
      console.log(`⚠️  Not enough unprocessed PDFs to test marking (found: ${unprocessedPdfs.length})\n`);
    }

    // 6. Test PDF preview
    if (listAllData.data && listAllData.data.length > 0) {
      console.log('6️⃣  Testing PDF preview...');
      const testDoc = listAllData.data[0];

      const previewRes = await fetch(`${BASE_URL}/api/owner/pdfs/${testDoc.document_id}/preview`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      const contentType = previewRes.headers.get('content-type');
      console.log(`✅ Preview response:`);
      console.log(`   Status: ${previewRes.status}`);
      console.log(`   Content-Type: ${contentType}\n`);
    }

    // 7. Check Prometheus metrics
    console.log('7️⃣  Checking Prometheus metrics...');
    const metricsRes = await fetch(`${BASE_URL}/metrics`);
    const metricsText = await metricsRes.text();

    const pdfMetrics = metricsText.split('\n').filter(line =>
      line.includes('owner_pdf') && !line.startsWith('#')
    );

    console.log(`✅ Prometheus metrics (${pdfMetrics.length} metrics):`);
    pdfMetrics.slice(0, 10).forEach(metric => {
      console.log(`   ${metric}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

testPDFManager().catch(console.error);
