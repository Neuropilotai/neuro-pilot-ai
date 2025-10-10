const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFYING ONEDRIVE GFS ORDER PDF MONITORING\n');

async function verifyOneDriveMonitoring() {
  const onedriveFolder = '/Users/davidmikulis/Library/CloudStorage/OneDrive-Personal/GFS Order PDF';
  const gfsOrdersDir = './data/gfs_orders';
  
  console.log('📂 Checking OneDrive folder...');
  console.log(`   Path: ${onedriveFolder}\n`);
  
  // Check OneDrive folder
  try {
    const onedrivePdfs = fs.readdirSync(onedriveFolder)
      .filter(file => file.endsWith('.pdf'))
      .map(file => file.replace('.pdf', ''));
    
    console.log(`✅ OneDrive folder found with ${onedrivePdfs.length} PDF files`);
    console.log('📋 Sample PDFs found:');
    onedrivePdfs.slice(0, 5).forEach(pdf => console.log(`   • ${pdf}.pdf`));
    
    // Check which orders have corresponding PDFs
    const orderFiles = fs.readdirSync(gfsOrdersDir)
      .filter(file => file.endsWith('.json') && file.includes('gfs_order_'))
      .filter(file => !file.includes('corrupted') && !file.includes('deleted_'));
    
    console.log(`\n📊 Order Analysis:`);
    console.log(`   • Total orders: ${orderFiles.length}`);
    
    let ordersWithPdfs = 0;
    let ordersWithoutPdfs = 0;
    let sampleOrdersWithPdfs = [];
    let sampleOrdersWithoutPdfs = [];
    
    for (const file of orderFiles) {
      try {
        const filePath = path.join(gfsOrdersDir, file);
        const order = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (order.invoiceNumber && onedrivePdfs.includes(order.invoiceNumber)) {
          ordersWithPdfs++;
          if (sampleOrdersWithPdfs.length < 5) {
            sampleOrdersWithPdfs.push(order.invoiceNumber);
          }
        } else {
          ordersWithoutPdfs++;
          if (sampleOrdersWithoutPdfs.length < 5) {
            sampleOrdersWithoutPdfs.push(order.invoiceNumber || 'unknown');
          }
        }
      } catch (error) {
        console.log(`   ⚠️ Error reading ${file}`);
      }
    }
    
    console.log(`   • Orders with OneDrive PDFs: ${ordersWithPdfs}`);
    console.log(`   • Orders without OneDrive PDFs: ${ordersWithoutPdfs}`);
    
    if (sampleOrdersWithPdfs.length > 0) {
      console.log(`\n✅ Sample orders WITH OneDrive PDFs:`);
      sampleOrdersWithPdfs.forEach(invoice => console.log(`   • ${invoice}`));
    }
    
    if (sampleOrdersWithoutPdfs.length > 0) {
      console.log(`\n❌ Sample orders WITHOUT OneDrive PDFs:`);
      sampleOrdersWithoutPdfs.forEach(invoice => console.log(`   • ${invoice}`));
    }
    
    const coveragePercent = Math.round((ordersWithPdfs / orderFiles.length) * 100);
    console.log(`\n📈 OneDrive PDF Coverage: ${coveragePercent}%`);
    
    if (coveragePercent >= 50) {
      console.log('🟢 GOOD: OneDrive folder has good coverage of order PDFs');
    } else {
      console.log('🟡 MODERATE: OneDrive folder has moderate coverage. You may want to add more PDFs.');
    }
    
  } catch (error) {
    console.error('❌ Error accessing OneDrive folder:', error.message);
    console.log('\n📋 TROUBLESHOOTING:');
    console.log('   1. Check if OneDrive is synced');
    console.log('   2. Verify folder path is correct');
    console.log('   3. Ensure folder permissions allow reading');
  }
  
  console.log('\n🎉 OneDrive monitoring verification completed!');
}

verifyOneDriveMonitoring().catch(console.error);