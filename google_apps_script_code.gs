/**
 * Complete Google Apps Script for Mining Camp Inventory System
 * Copy this entire code and paste it into your Google Sheet's Script Editor
 * 
 * Instructions:
 * 1. Open your Google Sheet with the GFS order data
 * 2. Go to Extensions → Apps Script
 * 3. Delete any existing code
 * 4. Paste this entire script
 * 5. Click Save (disk icon)
 * 6. Click Run → setupInventorySystem
 * 7. Grant permissions when prompted
 */

// ===== MAIN SETUP FUNCTION =====
function onOpen() {
  createCustomMenu();
}

function setupInventorySystem() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create all sheets
  createAllSheets(spreadsheet);
  
  // Import existing GFS data
  importGFSData(spreadsheet);
  
  // Set up formulas and formatting
  setupAllFormulas(spreadsheet);
  
  // Create custom menu
  createCustomMenu();
  
  // Show completion message
  SpreadsheetApp.getUi().alert(
    '✅ Setup Complete!', 
    'Mining Camp Inventory System has been set up successfully.\n\nNext steps:\n1. Review imported products in Inventory_Master\n2. Assign storage locations\n3. Set min/max levels\n4. Generate AI suggestions',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ===== SHEET CREATION =====
function createAllSheets(spreadsheet) {
  // List of all sheets to create
  const sheetsToCreate = [
    'Dashboard',
    'Inventory_Master', 
    'Order_History',
    'AI_Suggestions',
    'Menu_Calendar',
    'AI_Log',
    'Settings',
    'Count_Dry_Storage_1',
    'Count_Dry_Storage_2',
    'Count_Walk_in_Cooler',
    'Count_Reach_in_Fridge_1',
    'Count_Reach_in_Fridge_2',
    'Count_Walk_in_Freezer',
    'Count_Chest_Freezer_1',
    'Count_Chest_Freezer_2',
    'Count_Chemical_Storage',
    'Count_Paper_Goods',
    'Count_Kitchen_Active'
  ];
  
  sheetsToCreate.forEach(sheetName => {
    try {
      let sheet = spreadsheet.getSheetByName(sheetName);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(sheetName);
      }
      
      // Set up each sheet
      if (sheetName === 'Dashboard') setupDashboard(sheet);
      else if (sheetName === 'Inventory_Master') setupInventoryMaster(sheet);
      else if (sheetName === 'Order_History') setupOrderHistory(sheet);
      else if (sheetName === 'AI_Suggestions') setupAISuggestions(sheet);
      else if (sheetName === 'Menu_Calendar') setupMenuCalendar(sheet);
      else if (sheetName === 'AI_Log') setupAILog(sheet);
      else if (sheetName === 'Settings') setupSettings(sheet);
      else if (sheetName.startsWith('Count_')) setupCountSheet(sheet, sheetName.replace('Count_', '').replace(/_/g, ' '));
      
    } catch (e) {
      console.error('Error creating sheet ' + sheetName + ': ' + e.toString());
    }
  });
}

// ===== DASHBOARD SETUP =====
function setupDashboard(sheet) {
  // Clear existing content
  sheet.clear();
  
  // Set up header
  sheet.getRange('A1:D1').merge();
  sheet.getRange('A1').setValue('🏔️ Mining Camp Inventory Dashboard');
  sheet.getRange('A1').setFontSize(20).setFontWeight('bold');
  
  // Headers
  const headers = ['Metric', 'Value', 'Status', 'Alert'];
  sheet.getRange(3, 1, 1, 4).setValues([headers]);
  sheet.getRange(3, 1, 1, 4).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Dashboard metrics
  const metrics = [
    ['Current Date', '=TODAY()', '', ''],
    ['Days Until Next Order', '=IF(WEEKDAY(TODAY())=1,6,IF(WEEKDAY(TODAY())=7,7,6-WEEKDAY(TODAY())))', '', ''],
    ['Total Inventory Value', '=SUMPRODUCT(Inventory_Master!E2:E,Inventory_Master!G2:G)', '', ''],
    ['Total Items in Stock', '=COUNTA(Inventory_Master!A2:A)', '', ''],
    ['Low Stock Items', '=COUNTIF(Inventory_Master!P2:P,"LOW")+COUNTIF(Inventory_Master!P2:P,"CRITICAL")', '=IF(E8>10,"⚠️ CHECK","✅ OK")', ''],
    ['Out of Stock Items', '=COUNTIF(Inventory_Master!P2:P,"OUT OF STOCK")', '=IF(E9>0,"🚨 CRITICAL","✅ OK")', ''],
    ['Items to Reorder', '=COUNTIF(Inventory_Master!J2:J,">0")', '', ''],
    ['Emergency Protein Days', '=IFERROR(AVERAGE(FILTER(Inventory_Master!O2:O,ISNUMBER(SEARCH("protein",Inventory_Master!Q2:Q)))),0)', '=IF(E11<30,"⚠️ LOW","✅ OK")', ''],
    ['Last Inventory Update', '=IFERROR(MAX(Inventory_Master!L2:L),"No updates")', '', ''],
    ['Active Orders', '=COUNTIF(Order_History!K2:K,"PENDING")+COUNTIF(Order_History!K2:K,"ORDERED")', '', '']
  ];
  
  sheet.getRange(4, 1, metrics.length, 4).setValues(metrics);
  
  // Format
  sheet.getRange('B4').setNumberFormat('mmmm dd, yyyy');
  sheet.getRange('B6').setNumberFormat('$#,##0.00');
  sheet.getRange('B11').setNumberFormat('0.0');
  sheet.getRange('B12').setNumberFormat('mmmm dd, yyyy');
  
  // Column widths
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 100);
  
  // Freeze header
  sheet.setFrozenRows(3);
}

// ===== INVENTORY MASTER SETUP =====
function setupInventoryMaster(sheet) {
  // Clear and set headers
  sheet.clear();
  
  const headers = [
    'Product #', 'Product Name', 'Brand', 'Format', 'Unit Price (CAD)',
    'Location', 'Current Stock', 'Min Stock', 'Max Stock', 'Reorder Qty',
    'On Order', 'Last Count Date', 'Last Count By', 'Usage Rate (per day)',
    'Days Until Stockout', 'Alert Status', 'Notes'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Data validation for Location column
  const locations = [
    'Dry Storage 1', 'Dry Storage 2', 'Walk-in Cooler',
    'Reach-in Fridge 1', 'Reach-in Fridge 2', 'Walk-in Freezer',
    'Chest Freezer 1', 'Chest Freezer 2', 'Chemical Storage',
    'Paper Goods', 'Kitchen Active'
  ];
  
  const locationRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(locations)
    .setAllowInvalid(false)
    .build();
  
  sheet.getRange('F2:F1000').setDataValidation(locationRule);
  
  // Formulas for row 2 (will be copied down)
  sheet.getRange('J2').setFormula('=IF(G2<H2,I2-G2-K2,0)'); // Reorder Qty
  sheet.getRange('N2').setFormula('=IFERROR(AVERAGE(OFFSET(Order_History!$G$2,MATCH(A2,Order_History!$E$2:$E$1000,0)-1,0,COUNTIF(Order_History!$E$2:$E$1000,A2),1))/14,1)'); // Usage Rate
  sheet.getRange('O2').setFormula('=IF(N2>0,G2/N2,999)'); // Days Until Stockout
  sheet.getRange('P2').setFormula('=IF(G2=0,"OUT OF STOCK",IF(G2<H2*0.5,"CRITICAL",IF(G2<H2,"LOW","OK")))'); // Alert Status
  
  // Conditional formatting for Alert Status
  const rules = sheet.getConditionalFormatRules();
  
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OUT OF STOCK')
    .setBackground('#FF0000')
    .setFontColor('#FFFFFF')
    .setRanges([sheet.getRange('P2:P1000')])
    .build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('CRITICAL')
    .setBackground('#FFA500')
    .setRanges([sheet.getRange('P2:P1000')])
    .build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('LOW')
    .setBackground('#FFFF00')
    .setRanges([sheet.getRange('P2:P1000')])
    .build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK')
    .setBackground('#90EE90')
    .setRanges([sheet.getRange('P2:P1000')])
    .build());
  
  sheet.setConditionalFormatRules(rules);
  
  // Format columns
  sheet.getRange('E2:E1000').setNumberFormat('$#,##0.00');
  sheet.getRange('L2:L1000').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('N2:N1000').setNumberFormat('0.0');
  sheet.getRange('O2:O1000').setNumberFormat('0');
  
  // Column widths
  sheet.setColumnWidth(2, 300); // Product Name
  sheet.setColumnWidth(4, 100); // Format
  sheet.setColumnWidth(6, 150); // Location
  
  // Freeze header
  sheet.setFrozenRows(1);
}

// ===== ORDER HISTORY SETUP =====
function setupOrderHistory(sheet) {
  sheet.clear();
  
  const headers = [
    'Order Date', 'Delivery Date', 'Week #', 'Rotation', 'Product #',
    'Product Name', 'Quantity Ordered', 'Unit Price', 'Total Price',
    'Received Qty', 'Status', 'Notes'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Data validation for Status
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['PENDING', 'ORDERED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
    .setAllowInvalid(false)
    .build();
  
  sheet.getRange('K2:K1000').setDataValidation(statusRule);
  
  // Formulas
  sheet.getRange('C2').setFormula('=IF(A2="","",WEEKNUM(A2))'); // Week #
  sheet.getRange('D2').setFormula('=IF(A2="","",IF(MOD(WEEKNUM(A2),2)=1,"Team A","Team B"))'); // Rotation
  sheet.getRange('I2').setFormula('=G2*H2'); // Total Price
  
  // Format columns
  sheet.getRange('A2:B1000').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('H2:I1000').setNumberFormat('$#,##0.00');
  
  // Conditional formatting for Status
  const rules = sheet.getConditionalFormatRules();
  
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('DELIVERED')
    .setBackground('#90EE90')
    .setRanges([sheet.getRange('K2:K1000')])
    .build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('PENDING')
    .setBackground('#FFFF00')
    .setRanges([sheet.getRange('K2:K1000')])
    .build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('CANCELLED')
    .setBackground('#FF0000')
    .setFontColor('#FFFFFF')
    .setRanges([sheet.getRange('K2:K1000')])
    .build());
  
  sheet.setConditionalFormatRules(rules);
  
  sheet.setColumnWidth(6, 300); // Product Name
  sheet.setFrozenRows(1);
}

// ===== AI SUGGESTIONS SETUP =====
function setupAISuggestions(sheet) {
  sheet.clear();
  
  const headers = [
    'Date', 'Product #', 'Product Name', 'Current Stock', 'Min Stock',
    'Suggested Order', 'Reason', 'Priority', 'Menu Week', 'Expected Usage',
    'Emergency Buffer', 'Action Taken'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Data validation for Priority
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    .setAllowInvalid(false)
    .build();
  
  sheet.getRange('H2:H1000').setDataValidation(priorityRule);
  
  // Conditional formatting for Priority
  const rules = sheet.getConditionalFormatRules();
  
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('CRITICAL')
    .setBackground('#FF0000')
    .setFontColor('#FFFFFF')
    .setRanges([sheet.getRange('H2:H1000')])
    .build());
    
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('HIGH')
    .setBackground('#FFA500')
    .setRanges([sheet.getRange('H2:H1000')])
    .build());
  
  sheet.setConditionalFormatRules(rules);
  
  sheet.getRange('A2:A1000').setNumberFormat('yyyy-mm-dd');
  sheet.setColumnWidth(3, 300); // Product Name
  sheet.setColumnWidth(7, 300); // Reason
  sheet.setFrozenRows(1);
}

// ===== COUNT SHEET SETUP =====
function setupCountSheet(sheet, location) {
  sheet.clear();
  
  // Title
  sheet.getRange('A1:I1').merge();
  sheet.getRange('A1').setValue('📋 Inventory Count Sheet: ' + location);
  sheet.getRange('A1').setFontSize(16).setFontWeight('bold').setHorizontalAlignment('center');
  
  // Date and info row
  sheet.getRange('A2').setValue('Date:');
  sheet.getRange('B2').setValue(new Date()).setNumberFormat('yyyy-mm-dd');
  sheet.getRange('D2').setValue('Counter:');
  sheet.getRange('F2').setValue('Verified By:');
  
  // Headers
  const headers = [
    'Product #', 'Product Name', 'Format', 'System Stock', 
    'Physical Count', 'Difference', 'Taken By', 'Time', 'Notes'
  ];
  
  sheet.getRange(4, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(4, 1, 1, headers.length).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Pull products for this location using QUERY
  const formula = `=IFERROR(QUERY(Inventory_Master!A:G,"SELECT A,B,D,G WHERE F = '${location}' AND A IS NOT NULL",0),"No products in this location")`;
  sheet.getRange('A5').setFormula(formula);
  
  // Difference formula
  sheet.getRange('F5').setFormula('=IF(E5="","",E5-D5)');
  
  // Time formula
  sheet.getRange('H5').setFormula('=IF(E5="","",NOW())');
  sheet.getRange('H5:H100').setNumberFormat('hh:mm');
  
  // Formatting for print
  sheet.getRange('E5:E100').setBackground('#E8F4F8'); // Highlight count column
  sheet.getRange('A1:I100').setBorder(true, true, true, true, true, true);
  
  // Column widths
  sheet.setColumnWidth(2, 250); // Product Name
  sheet.setColumnWidth(3, 100); // Format
  sheet.setColumnWidth(7, 100); // Taken By
  sheet.setColumnWidth(9, 200); // Notes
  
  // Protection - protect formulas but allow input in count columns
  const protection = sheet.protect().setDescription('Count Sheet Protection');
  protection.setUnprotectedRanges([
    sheet.getRange('E5:E100'), // Physical Count
    sheet.getRange('G5:G100'), // Taken By
    sheet.getRange('I5:I100')  // Notes
  ]);
}

// ===== MENU CALENDAR SETUP =====
function setupMenuCalendar(sheet) {
  sheet.clear();
  
  const headers = [
    'Date', 'Week Day', 'Menu Week', 'Rotation Team', 'Breakfast Items',
    'Lunch Items', 'Dinner Items', 'Expected Count', 'Special Events'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  // Generate 8 weeks of calendar
  const startDate = new Date();
  const dayOfWeek = startDate.getDay();
  const daysToWednesday = (3 - dayOfWeek + 7) % 7;
  startDate.setDate(startDate.getDate() + daysToWednesday);
  
  const calendarData = [];
  for (let i = 0; i < 56; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    const weekNum = Math.floor(i / 7) + 1;
    const menuWeek = ((weekNum - 1) % 4) + 1;
    const rotation = weekNum % 2 === 1 ? 'Team A' : 'Team B';
    const weekDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentDate.getDay()];
    
    calendarData.push([
      currentDate,
      weekDay,
      menuWeek,
      rotation,
      '', '', '', // Menu items
      250, // Default count
      '' // Special events
    ]);
  }
  
  sheet.getRange(2, 1, calendarData.length, calendarData[0].length).setValues(calendarData);
  sheet.getRange('A2:A57').setNumberFormat('yyyy-mm-dd');
  
  // Conditional formatting for weekends
  const rules = sheet.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="Saturday"')
    .setBackground('#E8F4F8')
    .setRanges([sheet.getRange('A2:I57')])
    .build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="Sunday"')
    .setBackground('#E8F4F8')
    .setRanges([sheet.getRange('A2:I57')])
    .build());
  sheet.setConditionalFormatRules(rules);
  
  sheet.setFrozenRows(1);
}

// ===== AI LOG SETUP =====
function setupAILog(sheet) {
  sheet.clear();
  
  const headers = [
    'Timestamp', 'Type', 'Product #', 'Product Name', 'Alert Level',
    'Message', 'Recommended Action', 'User Response', 'Result'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  sheet.getRange('A2:A1000').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.setColumnWidth(6, 300); // Message
  sheet.setColumnWidth(7, 250); // Recommended Action
  sheet.setFrozenRows(1);
}

// ===== SETTINGS SETUP =====
function setupSettings(sheet) {
  sheet.clear();
  
  const headers = ['Parameter', 'Value', 'Description'];
  sheet.getRange(1, 1, 1, 3).setValues([headers]);
  sheet.getRange(1, 1, 1, 3).setBackground('#4A90E2').setFontColor('#FFFFFF').setFontWeight('bold');
  
  const settings = [
    ['Camp Min Capacity', '200', 'Minimum number of people in camp'],
    ['Camp Max Capacity', '400', 'Maximum number of people in camp'],
    ['Emergency Protein Days', '30', 'Days of emergency protein buffer required'],
    ['Order Lead Time', '7', 'Days from order placement to delivery'],
    ['Low Stock Threshold', '100%', 'Percentage of min stock to trigger low alert'],
    ['Critical Stock Threshold', '50%', 'Percentage of min stock to trigger critical alert'],
    ['Rotation Days', '14', 'Days per rotation cycle'],
    ['Menu Weeks', '4', 'Number of weeks in menu rotation'],
    ['Order Cutoff Day', 'Friday', 'Last day to modify orders'],
    ['Order Cutoff Time', '12:00 PM', 'Cutoff time for order modifications']
  ];
  
  sheet.getRange(2, 1, settings.length, 3).setValues(settings);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(3, 400);
  sheet.setFrozenRows(1);
}

// ===== IMPORT GFS DATA =====
function importGFSData(spreadsheet) {
  const sourceSheet = spreadsheet.getSheetByName('Sheet1') || spreadsheet.getSheets()[0];
  const targetSheet = spreadsheet.getSheetByName('Inventory_Master');
  
  if (!sourceSheet || !targetSheet) return;
  
  // Get data from source sheet
  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) return;
  
  const sourceData = sourceSheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  // Prepare data for inventory master
  const inventoryData = sourceData.map(row => {
    if (row[0]) { // If product # exists
      // Determine storage location based on product name
      let location = 'Dry Storage 1'; // Default
      const productName = row[1].toLowerCase();
      
      if (productName.includes('frais') || productName.includes('fresh')) {
        location = 'Walk-in Cooler';
      } else if (productName.includes('congel') || productName.includes('frozen') || productName.includes('iqf')) {
        location = 'Walk-in Freezer';
      } else if (productName.includes('boeuf') || productName.includes('poulet') || productName.includes('porc')) {
        if (!productName.includes('congel')) {
          location = 'Walk-in Cooler';
        } else {
          location = 'Walk-in Freezer';
        }
      } else if (productName.includes('papier') || productName.includes('serviette')) {
        location = 'Paper Goods';
      } else if (productName.includes('nettoy') || productName.includes('clean')) {
        location = 'Chemical Storage';
      }
      
      // Calculate min/max based on order quantity
      const orderQty = parseFloat(row[5]) || 1;
      const minStock = Math.ceil(orderQty * 0.5); // 50% of typical order
      const maxStock = Math.ceil(orderQty * 2); // 200% of typical order
      
      // Check if emergency protein
      let notes = '';
      if (productName.includes('boeuf') || productName.includes('poulet') || 
          productName.includes('porc') || productName.includes('beef') || 
          productName.includes('chicken') || productName.includes('pork')) {
        notes = 'Emergency protein';
      }
      
      return [
        row[0], // Product #
        row[1], // Product Name
        row[2], // Brand
        row[3], // Format
        parseFloat(row[4]) || 0, // Unit Price
        location, // Location
        0, // Current Stock (start at 0)
        minStock, // Min Stock
        maxStock, // Max Stock
        0, // Reorder Qty (formula)
        0, // On Order
        '', // Last Count Date
        '', // Last Count By
        0, // Usage Rate (formula)
        0, // Days Until Stockout (formula)
        '', // Alert Status (formula)
        notes // Notes
      ];
    }
    return null;
  }).filter(row => row !== null);
  
  // Write to inventory master
  if (inventoryData.length > 0) {
    targetSheet.getRange(2, 1, inventoryData.length, inventoryData[0].length).setValues(inventoryData);
    
    // Copy formulas down
    const formulaRow = 2;
    const lastDataRow = inventoryData.length + 1;
    
    // Copy formulas from row 2 to all data rows
    targetSheet.getRange(formulaRow, 10, 1, 7).copyTo(
      targetSheet.getRange(formulaRow, 10, lastDataRow - formulaRow + 1, 7)
    );
  }
  
  // Log import
  logAIAction('DATA_IMPORT', '', '', 'INFO', 
    `Imported ${inventoryData.length} products from GFS order`, '', '', 'Success');
}

// ===== SETUP ALL FORMULAS =====
function setupAllFormulas(spreadsheet) {
  // This function ensures all formulas are properly set up across sheets
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  const lastRow = inventorySheet.getLastRow();
  
  if (lastRow > 1) {
    // Ensure formulas are copied to all rows
    inventorySheet.getRange('J2:P2').copyTo(
      inventorySheet.getRange(2, 10, lastRow - 1, 7)
    );
  }
  
  // Set up order history formulas
  const orderSheet = spreadsheet.getSheetByName('Order_History');
  if (orderSheet.getLastRow() > 1) {
    orderSheet.getRange('C2:D2').copyTo(
      orderSheet.getRange(2, 3, orderSheet.getLastRow() - 1, 2)
    );
    orderSheet.getRange('I2').copyTo(
      orderSheet.getRange(2, 9, orderSheet.getLastRow() - 1, 1)
    );
  }
}

// ===== CUSTOM MENU =====
function createCustomMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏔️ Camp Inventory')
    .addItem('📊 Refresh Dashboard', 'refreshDashboard')
    .addItem('🤖 Generate AI Suggestions', 'generateAISuggestions')
    .addItem('📦 Create New Order', 'createNewOrder')
    .addItem('✅ Process Delivery', 'processDelivery')
    .addSeparator()
    .addItem('📋 Update Count Sheets', 'updateCountSheets')
    .addItem('🖨️ Prepare Sheets for Printing', 'prepareForPrinting')
    .addSeparator()
    .addItem('🚨 Check Emergency Stock', 'checkEmergencyStock')
    .addItem('📈 Usage Analysis', 'analyzeUsage')
    .addSeparator()
    .addItem('⚙️ System Setup', 'setupInventorySystem')
    .addItem('❓ Help', 'showHelp')
    .addToUi();
}

// ===== AI SUGGESTIONS =====
function generateAISuggestions() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  const suggestionsSheet = spreadsheet.getSheetByName('AI_Suggestions');
  
  // Clear existing suggestions
  const lastRow = suggestionsSheet.getLastRow();
  if (lastRow > 1) {
    suggestionsSheet.getRange(2, 1, lastRow - 1, 12).clearContent();
  }
  
  // Get inventory data
  const inventoryData = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 17).getValues();
  
  const suggestions = [];
  const today = new Date();
  const menuWeek = ((Math.floor((today - new Date('2025-01-01')) / (7 * 24 * 60 * 60 * 1000)) % 4) + 1);
  
  inventoryData.forEach(row => {
    if (row[0]) { // If product ID exists
      const [productId, productName, brand, format, unitPrice, location, 
             currentStock, minStock, maxStock, reorderQty, onOrder, 
             lastCount, countBy, usageRate, daysUntilOut, alertStatus, notes] = row;
      
      let suggestedOrder = 0;
      let reason = '';
      let priority = 'LOW';
      let emergencyBuffer = notes && notes.toLowerCase().includes('protein') ? 'YES' : 'NO';
      
      // Calculate suggested order based on various factors
      if (alertStatus === 'OUT OF STOCK') {
        suggestedOrder = maxStock - onOrder;
        reason = '🚨 Out of stock - immediate order required';
        priority = 'CRITICAL';
      } else if (alertStatus === 'CRITICAL') {
        suggestedOrder = maxStock - currentStock - onOrder;
        reason = '⚠️ Critical low stock level';
        priority = 'HIGH';
      } else if (alertStatus === 'LOW') {
        suggestedOrder = maxStock - currentStock - onOrder;
        reason = '📉 Below minimum stock level';
        priority = 'MEDIUM';
      } else if (daysUntilOut < 14) {
        suggestedOrder = (usageRate * 28) - currentStock - onOrder; // 4 weeks supply
        reason = `📅 Only ${Math.floor(daysUntilOut)} days of stock remaining`;
        priority = 'HIGH';
      }
      
      // Check emergency protein buffer
      if (emergencyBuffer === 'YES' && daysUntilOut < 30) {
        const needed = (usageRate * 30) - currentStock - onOrder;
        if (needed > suggestedOrder) {
          suggestedOrder = needed;
          reason = '🥩 Emergency protein buffer below 30 days';
          priority = 'HIGH';
        }
      }
      
      // Round up to case size if needed
      if (suggestedOrder > 0) {
        suggestedOrder = Math.ceil(suggestedOrder);
        
        suggestions.push([
          today,
          productId,
          productName,
          currentStock,
          minStock,
          suggestedOrder,
          reason,
          priority,
          menuWeek,
          Math.round(usageRate * 14), // Expected usage for 2-week rotation
          emergencyBuffer,
          '' // Action taken
        ]);
      }
    }
  });
  
  // Sort by priority
  const priorityOrder = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3};
  suggestions.sort((a, b) => priorityOrder[a[7]] - priorityOrder[b[7]]);
  
  // Write suggestions
  if (suggestions.length > 0) {
    suggestionsSheet.getRange(2, 1, suggestions.length, suggestions[0].length).setValues(suggestions);
    
    // Format date column
    suggestionsSheet.getRange(2, 1, suggestions.length, 1).setNumberFormat('yyyy-mm-dd');
  }
  
  // Log action
  logAIAction('SUGGESTIONS_GENERATED', '', '', 'INFO', 
    `Generated ${suggestions.length} order suggestions for menu week ${menuWeek}`, 
    'Review and create order', '', '');
  
  // Show summary
  const ui = SpreadsheetApp.getUi();
  const criticalCount = suggestions.filter(s => s[7] === 'CRITICAL').length;
  const highCount = suggestions.filter(s => s[7] === 'HIGH').length;
  
  let message = `✅ Generated ${suggestions.length} order suggestions:\n\n`;
  if (criticalCount > 0) message += `🚨 ${criticalCount} CRITICAL items\n`;
  if (highCount > 0) message += `⚠️ ${highCount} HIGH priority items\n`;
  message += `\nMenu Week: ${menuWeek}\n`;
  message += `\nReview suggestions in the AI_Suggestions sheet.`;
  
  ui.alert('AI Order Suggestions', message, ui.ButtonSet.OK);
}

// ===== CREATE NEW ORDER =====
function createNewOrder() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const suggestionsSheet = spreadsheet.getSheetByName('AI_Suggestions');
  const orderHistorySheet = spreadsheet.getSheetByName('Order_History');
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  
  // Get suggestions
  const lastRow = suggestionsSheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('No suggestions available. Please generate AI suggestions first.');
    return;
  }
  
  const suggestions = suggestionsSheet.getRange(2, 1, lastRow - 1, 12).getValues()
    .filter(row => row[0] && row[5] > 0); // Has data and suggested qty > 0
  
  if (suggestions.length === 0) {
    SpreadsheetApp.getUi().alert('No items to order based on current suggestions.');
    return;
  }
  
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Create New Order',
    `Found ${suggestions.length} items to order.\n\nCritical items: ${suggestions.filter(s => s[7] === 'CRITICAL').length}\nHigh priority: ${suggestions.filter(s => s[7] === 'HIGH').length}\n\nCreate order now?`,
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    const orderDate = new Date();
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7); // Add lead time
    
    const weekNum = Math.ceil((orderDate - new Date(orderDate.getFullYear(), 0, 1)) / (7 * 24 * 60 * 60 * 1000));
    const rotation = weekNum % 2 === 1 ? 'Team A' : 'Team B';
    
    const orderRows = [];
    let totalValue = 0;
    
    // Get product prices from inventory
    const inventoryData = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 5).getValues();
    const priceMap = {};
    inventoryData.forEach(row => {
      if (row[0]) priceMap[row[0]] = { name: row[1], price: row[4] };
    });
    
    suggestions.forEach((suggestion, index) => {
      const productId = suggestion[1];
      const quantity = suggestion[5];
      const productInfo = priceMap[productId];
      
      if (productInfo) {
        const lineTotal = quantity * productInfo.price;
        totalValue += lineTotal;
        
        orderRows.push([
          orderDate,
          deliveryDate,
          weekNum,
          rotation,
          productId,
          productInfo.name,
          quantity,
          productInfo.price,
          lineTotal,
          0, // Received qty
          'PENDING',
          `Priority: ${suggestion[7]} - ${suggestion[6]}` // Include priority and reason
        ]);
        
        // Update "On Order" in inventory
        updateOnOrderQuantity(inventorySheet, productId, quantity);
        
        // Mark suggestion as actioned
        suggestionsSheet.getRange(index + 2, 12).setValue('ORDERED');
      }
    });
    
    // Add to order history
    if (orderRows.length > 0) {
      const startRow = orderHistorySheet.getLastRow() + 1;
      orderHistorySheet.getRange(startRow, 1, orderRows.length, orderRows[0].length).setValues(orderRows);
      
      // Apply formulas to new rows
      orderHistorySheet.getRange(startRow, 3, orderRows.length, 1).setFormula('=WEEKNUM(A' + startRow + ')');
      orderHistorySheet.getRange(startRow, 4, orderRows.length, 1).setFormula('=IF(MOD(WEEKNUM(A' + startRow + '),2)=1,"Team A","Team B")');
      orderHistorySheet.getRange(startRow, 9, orderRows.length, 1).setFormula('=G' + startRow + '*H' + startRow);
      
      // Log action
      logAIAction('ORDER_CREATED', '', '', 'INFO',
        `Created order #${orderDate.getTime()} with ${orderRows.length} items`,
        `Total value: $${totalValue.toFixed(2)}`, 'Confirmed', 'Success');
      
      // Show confirmation
      ui.alert(
        'Order Created Successfully',
        `Order Details:\n\nOrder Date: ${orderDate.toLocaleDateString()}\nDelivery Date: ${deliveryDate.toLocaleDateString()}\nItems: ${orderRows.length}\nTotal Value: $${totalValue.toFixed(2)}\n\nThe order has been added to Order History with PENDING status.`,
        ui.ButtonSet.OK
      );
    }
  }
}

// ===== HELPER FUNCTIONS =====
function updateOnOrderQuantity(inventorySheet, productId, quantity) {
  const data = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 11).getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === productId) {
      const currentOnOrder = data[i][10] || 0;
      inventorySheet.getRange(i + 2, 11).setValue(currentOnOrder + quantity);
      break;
    }
  }
}

function logAIAction(type, productId, productName, alertLevel, message, recommendedAction, userResponse, result) {
  const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AI_Log');
  
  logSheet.appendRow([
    new Date(),
    type,
    productId || '',
    productName || '',
    alertLevel || '',
    message || '',
    recommendedAction || '',
    userResponse || '',
    result || ''
  ]);
}

// ===== CHECK EMERGENCY STOCK =====
function checkEmergencyStock() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  
  const data = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 17).getValues();
  
  const proteinItems = [];
  let totalProteinDays = 0;
  let proteinCount = 0;
  
  data.forEach(row => {
    if (row[0] && row[16] && row[16].toString().toLowerCase().includes('protein')) {
      const productName = row[1];
      const currentStock = row[6] || 0;
      const usageRate = row[13] || 1;
      const daysOfStock = currentStock / usageRate;
      
      proteinItems.push({
        name: productName,
        stock: currentStock,
        days: daysOfStock,
        status: daysOfStock < 30 ? '🚨 LOW' : '✅ OK'
      });
      
      totalProteinDays += daysOfStock;
      proteinCount++;
    }
  });
  
  const avgDays = proteinCount > 0 ? totalProteinDays / proteinCount : 0;
  
  // Sort by days remaining
  proteinItems.sort((a, b) => a.days - b.days);
  
  // Create report
  let report = '🥩 EMERGENCY PROTEIN STOCK REPORT\n';
  report += '================================\n\n';
  report += `Average Days of Stock: ${Math.round(avgDays)} days ${avgDays < 30 ? '⚠️' : '✅'}\n`;
  report += `Total Protein Items: ${proteinCount}\n\n`;
  
  if (proteinItems.length > 0) {
    report += 'ITEM STATUS:\n';
    proteinItems.forEach(item => {
      report += `\n${item.status} ${item.name}\n`;
      report += `   Stock: ${item.stock} units | Days: ${Math.round(item.days)}\n`;
    });
  }
  
  // Log check
  logAIAction('EMERGENCY_STOCK_CHECK', '', '', 
    avgDays < 30 ? 'CRITICAL' : 'INFO',
    `Emergency protein check: ${Math.round(avgDays)} days average`,
    avgDays < 30 ? 'Order protein items immediately' : 'Stock levels adequate',
    '', '');
  
  // Show report
  const ui = SpreadsheetApp.getUi();
  const htmlReport = report.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
  
  const htmlOutput = HtmlService
    .createHtmlOutput(`<pre style="font-family: monospace;">${htmlReport}</pre>`)
    .setWidth(600)
    .setHeight(400);
  
  ui.showModalDialog(htmlOutput, 'Emergency Protein Stock Report');
}

// ===== PROCESS DELIVERY =====
function processDelivery() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const orderHistorySheet = spreadsheet.getSheetByName('Order_History');
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  
  // Get pending orders
  const orders = orderHistorySheet.getRange(2, 1, orderHistorySheet.getLastRow() - 1, 12).getValues()
    .filter(row => row[10] === 'PENDING' || row[10] === 'ORDERED');
  
  if (orders.length === 0) {
    SpreadsheetApp.getUi().alert('No pending orders to process.');
    return;
  }
  
  // Show list of pending orders
  let orderList = 'Select order to process:\n\n';
  orders.forEach((order, index) => {
    orderList += `${index + 1}. Order from ${order[0].toLocaleDateString()} - ${order[5]}\n`;
  });
  
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Process Delivery', orderList + '\nEnter order number:', ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const orderIndex = parseInt(response.getResponseText()) - 1;
    
    if (orderIndex >= 0 && orderIndex < orders.length) {
      const selectedOrder = orders[orderIndex];
      const productId = selectedOrder[4];
      const orderedQty = selectedOrder[6];
      
      // Ask for received quantity
      const qtyResponse = ui.prompt(
        'Received Quantity',
        `Ordered: ${orderedQty} units\nEnter received quantity:`,
        ui.ButtonSet.OK_CANCEL
      );
      
      if (qtyResponse.getSelectedButton() === ui.Button.OK) {
        const receivedQty = parseInt(qtyResponse.getResponseText());
        
        // Update order history
        const orderRow = findOrderRow(orderHistorySheet, selectedOrder);
        if (orderRow > 0) {
          orderHistorySheet.getRange(orderRow, 10).setValue(receivedQty); // Received Qty
          orderHistorySheet.getRange(orderRow, 11).setValue('DELIVERED'); // Status
          
          // Update inventory
          updateInventoryFromDelivery(inventorySheet, productId, receivedQty, orderedQty);
          
          ui.alert('Delivery processed successfully!');
        }
      }
    }
  }
}

function findOrderRow(sheet, orderData) {
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (data[i][0].getTime() === orderData[0].getTime() && 
        data[i][4] === orderData[4]) {
      return i + 2; // Row number (1-indexed)
    }
  }
  return 0;
}

function updateInventoryFromDelivery(inventorySheet, productId, receivedQty, orderedQty) {
  const data = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 11).getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === productId) {
      const row = i + 2;
      const currentStock = data[i][6] || 0;
      const onOrder = data[i][10] || 0;
      
      // Update current stock
      inventorySheet.getRange(row, 7).setValue(currentStock + receivedQty);
      
      // Update on order (reduce by ordered amount, not received)
      inventorySheet.getRange(row, 11).setValue(Math.max(0, onOrder - orderedQty));
      
      // Update last count
      inventorySheet.getRange(row, 12).setValue(new Date());
      inventorySheet.getRange(row, 13).setValue('Delivery Processing');
      
      break;
    }
  }
}

// ===== ANALYZE USAGE =====
function analyzeUsage() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const orderHistory = spreadsheet.getSheetByName('Order_History');
  
  // Get delivered orders from last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  
  const orders = orderHistory.getRange(2, 1, orderHistory.getLastRow() - 1, 10).getValues()
    .filter(row => row[0] && row[10] === 'DELIVERED' && row[0] > ninetyDaysAgo);
  
  // Analyze by product
  const productUsage = {};
  
  orders.forEach(order => {
    const productId = order[4];
    const productName = order[5];
    const quantity = order[9] || order[6]; // Use received qty if available
    
    if (!productUsage[productId]) {
      productUsage[productId] = {
        name: productName,
        totalQty: 0,
        orderCount: 0,
        dates: []
      };
    }
    
    productUsage[productId].totalQty += quantity;
    productUsage[productId].orderCount++;
    productUsage[productId].dates.push(order[0]);
  });
  
  // Calculate averages and create report
  let report = '📊 90-DAY USAGE ANALYSIS REPORT\n';
  report += '==============================\n\n';
  report += `Analysis Period: ${ninetyDaysAgo.toLocaleDateString()} to ${new Date().toLocaleDateString()}\n`;
  report += `Total Orders Analyzed: ${orders.length}\n\n`;
  
  // Sort by total quantity used
  const sortedProducts = Object.entries(productUsage)
    .sort((a, b) => b[1].totalQty - a[1].totalQty)
    .slice(0, 20); // Top 20 products
  
  report += 'TOP 20 PRODUCTS BY USAGE:\n\n';
  
  sortedProducts.forEach(([productId, data], index) => {
    const avgPerOrder = data.totalQty / data.orderCount;
    const daysSpan = (data.dates[data.dates.length - 1] - data.dates[0]) / (24 * 60 * 60 * 1000);
    const avgPerDay = daysSpan > 0 ? data.totalQty / daysSpan : 0;
    
    report += `${index + 1}. ${data.name}\n`;
    report += `   Total Used: ${data.totalQty} units\n`;
    report += `   Orders: ${data.orderCount}\n`;
    report += `   Avg per Order: ${avgPerOrder.toFixed(1)} units\n`;
    report += `   Avg per Day: ${avgPerDay.toFixed(2)} units\n\n`;
  });
  
  // Show report
  const htmlReport = report.replace(/\n/g, '<br>').replace(/ /g, '&nbsp;');
  const htmlOutput = HtmlService
    .createHtmlOutput(`<pre style="font-family: monospace;">${htmlReport}</pre>`)
    .setWidth(700)
    .setHeight(500);
  
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Usage Analysis Report');
}

// ===== UPDATE COUNT SHEETS =====
function updateCountSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const locations = [
    'Dry Storage 1', 'Dry Storage 2', 'Walk-in Cooler',
    'Reach-in Fridge 1', 'Reach-in Fridge 2', 'Walk-in Freezer',
    'Chest Freezer 1', 'Chest Freezer 2', 'Chemical Storage',
    'Paper Goods', 'Kitchen Active'
  ];
  
  locations.forEach(location => {
    const sheetName = 'Count_' + location.replace(/\s+/g, '_');
    const sheet = spreadsheet.getSheetByName(sheetName);
    
    if (sheet) {
      // Update date
      sheet.getRange('B2').setValue(new Date());
      
      // Clear old physical counts
      const lastRow = sheet.getLastRow();
      if (lastRow > 4) {
        sheet.getRange(5, 5, lastRow - 4, 5).clearContent();
      }
    }
  });
  
  SpreadsheetApp.getUi().alert('Count sheets updated with current date. Ready for inventory counts.');
}

// ===== PREPARE FOR PRINTING =====
function prepareForPrinting() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Prepare Count Sheets for Printing',
    'Enter location name (or "ALL" for all locations):',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const input = response.getResponseText().trim();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    if (input.toUpperCase() === 'ALL') {
      // Create a new temporary sheet with all count sheets
      let printSheet = spreadsheet.getSheetByName('PRINT_ALL_COUNTS');
      if (printSheet) {
        spreadsheet.deleteSheet(printSheet);
      }
      printSheet = spreadsheet.insertSheet('PRINT_ALL_COUNTS');
      
      let currentRow = 1;
      
      const locations = [
        'Dry Storage 1', 'Dry Storage 2', 'Walk-in Cooler',
        'Reach-in Fridge 1', 'Reach-in Fridge 2', 'Walk-in Freezer',
        'Chest Freezer 1', 'Chest Freezer 2', 'Chemical Storage',
        'Paper Goods', 'Kitchen Active'
      ];
      
      locations.forEach((location, index) => {
        const sheetName = 'Count_' + location.replace(/\s+/g, '_');
        const sourceSheet = spreadsheet.getSheetByName(sheetName);
        
        if (sourceSheet) {
          // Copy data
          const data = sourceSheet.getRange(1, 1, 50, 9).getValues();
          printSheet.getRange(currentRow, 1, 50, 9).setValues(data);
          
          // Add page break
          if (index < locations.length - 1) {
            currentRow += 52; // Leave space for page break
          }
        }
      });
      
      spreadsheet.setActiveSheet(printSheet);
      ui.alert('All count sheets combined in PRINT_ALL_COUNTS sheet. Use File → Print to print all pages.');
      
    } else {
      // Activate single location sheet
      const sheetName = 'Count_' + input.replace(/\s+/g, '_');
      const sheet = spreadsheet.getSheetByName(sheetName);
      
      if (sheet) {
        spreadsheet.setActiveSheet(sheet);
        ui.alert(`${input} count sheet is ready. Use File → Print to print this sheet.`);
      } else {
        ui.alert(`Location "${input}" not found.`);
      }
    }
  }
}

// ===== REFRESH DASHBOARD =====
function refreshDashboard() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = spreadsheet.getSheetByName('Dashboard');
  
  // Force recalculation
  SpreadsheetApp.flush();
  
  // Activate dashboard
  spreadsheet.setActiveSheet(dashboard);
  
  SpreadsheetApp.getUi().alert('Dashboard refreshed!');
}

// ===== SHOW HELP =====
function showHelp() {
  const helpHtml = `
<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
  <h2>🏔️ Mining Camp Inventory System Help</h2>
  
  <h3>📊 Getting Started</h3>
  <ol>
    <li><strong>Review Inventory_Master:</strong> Check imported products and assign storage locations</li>
    <li><strong>Set Min/Max Levels:</strong> Adjust minimum and maximum stock levels based on your needs</li>
    <li><strong>Generate AI Suggestions:</strong> Let the system analyze and suggest orders</li>
    <li><strong>Create Orders:</strong> Convert suggestions into actual orders</li>
  </ol>
  
  <h3>🤖 AI Features</h3>
  <ul>
    <li><strong>Smart Suggestions:</strong> Analyzes stock levels, usage patterns, and lead times</li>
    <li><strong>Emergency Alerts:</strong> Monitors critical items, especially proteins</li>
    <li><strong>Usage Analysis:</strong> Learns from order history to improve predictions</li>
  </ul>
  
  <h3>📋 Daily Operations</h3>
  <ul>
    <li><strong>Count Sheets:</strong> Print location-specific sheets for physical counts</li>
    <li><strong>Process Deliveries:</strong> Update stock when orders arrive</li>
    <li><strong>Monitor Dashboard:</strong> Check alerts and metrics daily</li>
  </ul>
  
  <h3>🚨 Alert Meanings</h3>
  <ul>
    <li><strong>🔴 OUT OF STOCK:</strong> No inventory remaining</li>
    <li><strong>🟠 CRITICAL:</strong> Below 50% of minimum stock</li>
    <li><strong>🟡 LOW:</strong> Below minimum stock level</li>
    <li><strong>🟢 OK:</strong> Stock levels are adequate</li>
  </ul>
  
  <h3>📅 Rotation Schedule</h3>
  <ul>
    <li>2-week rotations (Team A / Team B)</li>
    <li>4-week menu cycle</li>
    <li>Week starts Wednesday, ends Tuesday</li>
    <li>Orders placed Sunday/Monday</li>
    <li>Order cutoff: Friday noon</li>
  </ul>
  
  <h3>💡 Pro Tips</h3>
  <ul>
    <li>Update counts before generating suggestions</li>
    <li>Check emergency protein stock weekly</li>
    <li>Review AI suggestions before creating orders</li>
    <li>Account for delivery delays in remote locations</li>
    <li>Use notes field for substitutions and special handling</li>
  </ul>
  
  <h3>❓ Support</h3>
  <p>For technical support or system issues, contact your IT department.</p>
</div>
  `;
  
  const htmlOutput = HtmlService
    .createHtmlOutput(helpHtml)
    .setWidth(600)
    .setHeight(600);
  
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'System Help');
}

// ===== INITIAL SETUP TRIGGER =====
// This function runs when the spreadsheet is first opened
function onInstall() {
  onOpen();
}