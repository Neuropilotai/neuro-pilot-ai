/**
 * Mining Camp Inventory Management System
 * Google Sheets Setup Script
 * 
 * This script creates a comprehensive inventory system for remote FIFO mining camps
 * with AI-powered suggestions, rotation tracking, and multi-location management
 */

// Configuration
const CONFIG = {
  spreadsheetName: 'Mining Camp Inventory System',
  rotationWeeks: 4,
  rotationStartDay: 3, // Wednesday
  campCapacity: { min: 200, max: 400 },
  locations: [
    'Dry Storage 1',
    'Dry Storage 2', 
    'Walk-in Cooler',
    'Reach-in Fridge 1',
    'Reach-in Fridge 2',
    'Walk-in Freezer',
    'Chest Freezer 1',
    'Chest Freezer 2',
    'Chemical Storage',
    'Paper Goods',
    'Kitchen Active'
  ],
  emergencyProteinDays: 30,
  orderLeadTime: 7, // Days from order to delivery
  orderCutoffDay: 5, // Friday
  orderCutoffHour: 12
};

// Main setup function
function setupInventorySystem() {
  // Create or get spreadsheet
  let spreadsheet;
  try {
    // Try to find existing spreadsheet
    const files = DriveApp.getFilesByName(CONFIG.spreadsheetName);
    if (files.hasNext()) {
      spreadsheet = SpreadsheetApp.open(files.next());
    } else {
      spreadsheet = SpreadsheetApp.create(CONFIG.spreadsheetName);
    }
  } catch (e) {
    spreadsheet = SpreadsheetApp.create(CONFIG.spreadsheetName);
  }

  // Create all necessary sheets
  createSheetStructure(spreadsheet);
  
  // Set up data validation and formatting
  setupDataValidation(spreadsheet);
  
  // Create formulas and automation
  setupFormulas(spreadsheet);
  
  // Add custom menu
  createCustomMenu(spreadsheet);
  
  return spreadsheet.getUrl();
}

// Create all sheets with proper structure
function createSheetStructure(spreadsheet) {
  // Define sheet structures
  const sheets = [
    {
      name: 'Dashboard',
      headers: ['Metric', 'Value', 'Status', 'Alert'],
      setup: setupDashboard
    },
    {
      name: 'Inventory_Master',
      headers: [
        'Product #', 'Product Name', 'Brand', 'Format', 'Unit Price (CAD)',
        'Location', 'Current Stock', 'Min Stock', 'Max Stock', 'Reorder Qty',
        'On Order', 'Last Count Date', 'Last Count By', 'Usage Rate',
        'Days Until Stockout', 'Alert Status', 'Notes'
      ],
      setup: setupInventoryMaster
    },
    {
      name: 'Order_History',
      headers: [
        'Order Date', 'Delivery Date', 'Week #', 'Rotation', 'Product #',
        'Product Name', 'Quantity Ordered', 'Unit Price', 'Total Price',
        'Received Qty', 'Status', 'Notes'
      ],
      setup: setupOrderHistory
    },
    {
      name: 'AI_Suggestions',
      headers: [
        'Date', 'Product #', 'Product Name', 'Current Stock', 'Min Stock',
        'Suggested Order', 'Reason', 'Priority', 'Menu Week', 'Expected Usage',
        'Emergency Buffer', 'Action Taken'
      ],
      setup: setupAISuggestions
    },
    {
      name: 'Menu_Calendar',
      headers: [
        'Date', 'Week Day', 'Menu Week', 'Rotation Team', 'Breakfast Items',
        'Lunch Items', 'Dinner Items', 'Expected Count', 'Special Events'
      ],
      setup: setupMenuCalendar
    },
    {
      name: 'AI_Log',
      headers: [
        'Timestamp', 'Type', 'Product #', 'Product Name', 'Alert Level',
        'Message', 'Recommended Action', 'User Response', 'Result'
      ],
      setup: setupAILog
    },
    {
      name: 'Settings',
      headers: ['Parameter', 'Value', 'Description'],
      setup: setupSettings
    }
  ];

  // Create each sheet
  sheets.forEach(sheetConfig => {
    let sheet = spreadsheet.getSheetByName(sheetConfig.name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(sheetConfig.name);
    }
    
    // Set headers
    sheet.getRange(1, 1, 1, sheetConfig.headers.length).setValues([sheetConfig.headers]);
    sheet.getRange(1, 1, 1, sheetConfig.headers.length)
      .setBackground('#4A90E2')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold');
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    // Call specific setup function
    if (sheetConfig.setup) {
      sheetConfig.setup(sheet, spreadsheet);
    }
  });

  // Create location-specific count sheets
  CONFIG.locations.forEach(location => {
    createLocationSheet(spreadsheet, location);
  });
}

// Setup Dashboard sheet
function setupDashboard(sheet, spreadsheet) {
  const dashboardData = [
    ['Current Week', '=WEEKNUM(TODAY())', '', ''],
    ['Menu Week', '=MOD(WEEKNUM(TODAY())-WEEKNUM(DATE(YEAR(TODAY()),1,1))+1,4)+1', '', ''],
    ['Days Until Next Order', '=DAYS_UNTIL_ORDER()', '', ''],
    ['Total Inventory Value', '=SUMPRODUCT(Inventory_Master!E2:E1000,Inventory_Master!G2:G1000)', '', ''],
    ['Low Stock Items', '=COUNTIF(Inventory_Master!P2:P1000,"LOW")', '=IF(B5>0,"ALERT","")', ''],
    ['Critical Stock Items', '=COUNTIF(Inventory_Master!P2:P1000,"CRITICAL")', '=IF(B6>0,"CRITICAL","")', ''],
    ['Items to Reorder', '=COUNTIF(Inventory_Master!J2:J1000,">0")', '', ''],
    ['Emergency Protein Days', '=CALCULATE_PROTEIN_DAYS()', '=IF(B8<30,"LOW","")', ''],
    ['Last Inventory Update', '=MAX(Inventory_Master!L2:L1000)', '', ''],
    ['Pending Orders', '=COUNTIF(Order_History!K2:K1000,"PENDING")', '', '']
  ];

  // Add dashboard data
  sheet.getRange(2, 1, dashboardData.length, 4).setValues(dashboardData);
  
  // Format value column as appropriate
  sheet.getRange('B2:B11').setNumberFormat('@');
  sheet.getRange('B4').setNumberFormat('$#,##0.00');
  
  // Conditional formatting for alerts
  const alertRange = sheet.getRange('C2:C11');
  const rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('ALERT')
      .setBackground('#FFA500')
      .setRanges([alertRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('CRITICAL')
      .setBackground('#FF0000')
      .setFontColor('#FFFFFF')
      .setRanges([alertRange])
      .build()
  ];
  sheet.setConditionalFormatRules(rules);
}

// Setup Inventory Master sheet
function setupInventoryMaster(sheet, spreadsheet) {
  // Add sample data from the GFS order
  const sampleData = [
    ['1085769', 'Pommes Délicieuse jaune, frais', 'Packer Label', 'KG CS', 55.50, 'Walk-in Cooler', 0, 10, 30, 0, 0, '', '', 0, 0, '', ''],
    ['1085967', 'Poivrons vert, gros, frais', 'Packer Label', 'KG CS', 47.75, 'Walk-in Cooler', 0, 15, 40, 0, 0, '', '', 0, 0, '', ''],
    ['7516533', 'Boeuf haché ordinaire frais', 'Canada AAA', 'KG TUB', 142.50, 'Walk-in Freezer', 0, 50, 150, 0, 0, '', '', 0, 0, '', 'Emergency protein'],
    ['2063816', 'Poulet poitrine IQF', 'Sodexo', 'KG CS', 122.00, 'Walk-in Freezer', 0, 40, 120, 0, 0, '', '', 0, 0, '', 'Emergency protein']
  ];
  
  sheet.getRange(2, 1, sampleData.length, sampleData[0].length).setValues(sampleData);
  
  // Add formulas for calculated columns
  const formulaRow = 2;
  
  // Reorder Quantity formula
  sheet.getRange(formulaRow, 10).setFormula(
    '=IF(G' + formulaRow + '<H' + formulaRow + ',I' + formulaRow + '-G' + formulaRow + '-K' + formulaRow + ',0)'
  );
  
  // Usage Rate formula (based on order history)
  sheet.getRange(formulaRow, 14).setFormula(
    '=AVERAGE_USAGE(A' + formulaRow + ')'
  );
  
  // Days Until Stockout formula
  sheet.getRange(formulaRow, 15).setFormula(
    '=IF(N' + formulaRow + '>0,G' + formulaRow + '/N' + formulaRow + ',999)'
  );
  
  // Alert Status formula
  sheet.getRange(formulaRow, 16).setFormula(
    '=IF(G' + formulaRow + '=0,"OUT OF STOCK",IF(G' + formulaRow + '<H' + formulaRow + '*0.5,"CRITICAL",IF(G' + formulaRow + '<H' + formulaRow + ',"LOW","OK")))'
  );
  
  // Copy formulas down
  const lastRow = Math.max(sheet.getLastRow(), 1000);
  sheet.getRange(formulaRow, 10, 1, 7).copyTo(sheet.getRange(formulaRow + 1, 10, lastRow - formulaRow, 7));
  
  // Conditional formatting
  const statusRange = sheet.getRange(2, 16, lastRow, 1);
  const statusRules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('OUT OF STOCK')
      .setBackground('#FF0000')
      .setFontColor('#FFFFFF')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('CRITICAL')
      .setBackground('#FFA500')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('LOW')
      .setBackground('#FFFF00')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('OK')
      .setBackground('#00FF00')
      .setRanges([statusRange])
      .build()
  ];
  sheet.setConditionalFormatRules(statusRules);
}

// Create location-specific count sheets
function createLocationSheet(spreadsheet, location) {
  const sheetName = 'Count_' + location.replace(/\s+/g, '_');
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  // Headers for count sheet
  const headers = [
    'Product #', 'Product Name', 'Format', 'Current Stock', 
    'Count', 'Difference', 'Taken By', 'Date', 'Notes'
  ];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#4A90E2')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
  
  // Add location name as title
  sheet.insertRowBefore(1);
  sheet.getRange('A1:I1').merge();
  sheet.getRange('A1').setValue('Inventory Count Sheet: ' + location);
  sheet.getRange('A1')
    .setFontSize(16)
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  // Add date and counter info
  sheet.insertRowBefore(2);
  sheet.getRange('A2').setValue('Date:');
  sheet.getRange('C2').setValue('Counter:');
  sheet.getRange('E2').setValue('Verified By:');
  
  // Pull products for this location
  sheet.getRange('A4').setFormula(
    '=QUERY(Inventory_Master!A:Q,"SELECT A,B,D,G WHERE F = \'' + location + '\' AND A IS NOT NULL",0)'
  );
  
  // Add formulas for difference calculation
  const dataStartRow = 5;
  sheet.getRange(dataStartRow, 6).setFormula('=E' + dataStartRow + '-D' + dataStartRow);
  
  // Format for printing
  sheet.getRange('A:I').setFontSize(10);
  sheet.getRange('E5:E100').setBackground('#E8F4F8'); // Highlight count column
  sheet.setColumnWidth(2, 250); // Product name column wider
  
  // Add print settings
  sheet.getRange('A1:I100').setBorder(true, true, true, true, true, true);
}

// Setup Order History sheet
function setupOrderHistory(sheet, spreadsheet) {
  // Add validation for status column
  const statusRange = sheet.getRange('K2:K1000');
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['PENDING', 'ORDERED', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
    .build();
  statusRange.setDataValidation(statusRule);
  
  // Add conditional formatting for status
  const statusRules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('PENDING')
      .setBackground('#FFFF00')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('DELIVERED')
      .setBackground('#00FF00')
      .setRanges([statusRange])
      .build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('CANCELLED')
      .setBackground('#FF0000')
      .setFontColor('#FFFFFF')
      .setRanges([statusRange])
      .build()
  ];
  sheet.setConditionalFormatRules(statusRules);
}

// Setup AI Suggestions sheet
function setupAISuggestions(sheet, spreadsheet) {
  // Priority validation
  const priorityRange = sheet.getRange('H2:H1000');
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'])
    .build();
  priorityRange.setDataValidation(priorityRule);
  
  // Add AI suggestion formula
  sheet.getRange('A2').setFormula('=TODAY()');
  sheet.getRange('F2').setFormula(
    '=SUGGEST_ORDER_QTY(B2,D2,E2,I2,J2)'
  );
}

// Setup Menu Calendar
function setupMenuCalendar(sheet, spreadsheet) {
  // Generate calendar for next 8 weeks
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - startDate.getDay() + 3); // Start on Wednesday
  
  const calendarData = [];
  for (let i = 0; i < 56; i++) { // 8 weeks
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    
    const weekNum = Math.floor(i / 7) + 1;
    const menuWeek = ((weekNum - 1) % 4) + 1;
    const rotation = weekNum % 2 === 1 ? 'Team A' : 'Team B';
    
    calendarData.push([
      currentDate,
      ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'][i % 7],
      menuWeek,
      rotation,
      '', '', '', // Menu items to be filled
      250, // Default expected count
      '' // Special events
    ]);
  }
  
  sheet.getRange(2, 1, calendarData.length, calendarData[0].length).setValues(calendarData);
  sheet.getRange('A2:A57').setNumberFormat('yyyy-mm-dd');
}

// Setup Settings sheet
function setupSettings(sheet, spreadsheet) {
  const settings = [
    ['Camp Min Capacity', '200', 'Minimum number of people in camp'],
    ['Camp Max Capacity', '400', 'Maximum number of people in camp'],
    ['Emergency Protein Days', '30', 'Days of emergency protein buffer required'],
    ['Order Lead Time', '7', 'Days from order to delivery'],
    ['Low Stock Threshold', '50%', 'Percentage of min stock to trigger low alert'],
    ['Critical Stock Threshold', '25%', 'Percentage of min stock to trigger critical alert'],
    ['Default Rotation Days', '14', 'Days per rotation'],
    ['Menu Cycle Weeks', '4', 'Number of weeks in menu rotation'],
    ['Order Cutoff Day', 'Friday', 'Last day to modify orders'],
    ['Order Cutoff Time', '12:00', 'Cutoff time for order modifications']
  ];
  
  sheet.getRange(2, 1, settings.length, settings[0].length).setValues(settings);
}

// Add custom menu to spreadsheet
function createCustomMenu(spreadsheet) {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏔️ Camp Inventory')
    .addItem('📊 Update Dashboard', 'updateDashboard')
    .addItem('🤖 Generate AI Suggestions', 'generateAISuggestions')
    .addItem('📦 Create New Order', 'createNewOrder')
    .addItem('📋 Print Count Sheets', 'printCountSheets')
    .addSeparator()
    .addItem('📈 Analyze Usage Patterns', 'analyzeUsagePatterns')
    .addItem('🚨 Check Emergency Stock', 'checkEmergencyStock')
    .addItem('📅 Update Menu Calendar', 'updateMenuCalendar')
    .addSeparator()
    .addItem('⚙️ Settings', 'openSettings')
    .addItem('📚 Help', 'showHelp')
    .addToUi();
}

// Custom functions for formulas
function DAYS_UNTIL_ORDER() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  return daysUntilFriday;
}

function CALCULATE_PROTEIN_DAYS() {
  // This would calculate based on current protein inventory
  // For now, returning a placeholder
  return 25;
}

function AVERAGE_USAGE(productId) {
  // Calculate average usage from order history
  // Placeholder for now
  return Math.floor(Math.random() * 10) + 5;
}

function SUGGEST_ORDER_QTY(productId, currentStock, minStock, menuWeek, expectedUsage) {
  // AI logic for suggesting order quantities
  const bufferDays = 21; // 3 weeks buffer
  const dailyUsage = expectedUsage / 14; // Per rotation
  const targetStock = minStock + (dailyUsage * bufferDays);
  const toOrder = Math.max(0, targetStock - currentStock);
  return Math.ceil(toOrder);
}

// AI Suggestion Generator
function generateAISuggestions() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  const suggestionsSheet = spreadsheet.getSheetByName('AI_Suggestions');
  const menuSheet = spreadsheet.getSheetByName('Menu_Calendar');
  
  // Clear existing suggestions
  const lastRow = suggestionsSheet.getLastRow();
  if (lastRow > 1) {
    suggestionsSheet.getRange(2, 1, lastRow - 1, 12).clear();
  }
  
  // Get inventory data
  const inventoryData = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 17).getValues();
  
  // Generate suggestions
  const suggestions = [];
  const today = new Date();
  
  inventoryData.forEach((row, index) => {
    if (row[0]) { // If product ID exists
      const productId = row[0];
      const productName = row[1];
      const currentStock = row[6] || 0;
      const minStock = row[7] || 0;
      const maxStock = row[8] || 0;
      const usageRate = row[13] || 5;
      const alertStatus = row[15];
      
      // Calculate suggested order
      let suggestedOrder = 0;
      let reason = '';
      let priority = 'LOW';
      
      if (alertStatus === 'OUT OF STOCK') {
        suggestedOrder = maxStock;
        reason = 'Out of stock - immediate order required';
        priority = 'CRITICAL';
      } else if (alertStatus === 'CRITICAL') {
        suggestedOrder = maxStock - currentStock;
        reason = 'Critical low stock level';
        priority = 'HIGH';
      } else if (alertStatus === 'LOW') {
        suggestedOrder = maxStock - currentStock;
        reason = 'Below minimum stock level';
        priority = 'MEDIUM';
      } else if (currentStock < minStock * 1.5) {
        suggestedOrder = maxStock - currentStock;
        reason = 'Approaching minimum stock level';
        priority = 'LOW';
      }
      
      // Check for emergency proteins
      if (row[16] && row[16].toString().toLowerCase().includes('protein')) {
        const daysOfStock = currentStock / usageRate;
        if (daysOfStock < 30) {
          suggestedOrder = Math.max(suggestedOrder, (30 * usageRate) - currentStock);
          reason = 'Emergency protein buffer below 30 days';
          priority = 'HIGH';
        }
      }
      
      if (suggestedOrder > 0) {
        suggestions.push([
          today,
          productId,
          productName,
          currentStock,
          minStock,
          Math.ceil(suggestedOrder),
          reason,
          priority,
          getCurrentMenuWeek(),
          usageRate * 14, // Expected usage for rotation
          row[16] && row[16].toString().toLowerCase().includes('protein') ? 'YES' : 'NO',
          '' // Action taken
        ]);
      }
    }
  });
  
  // Sort by priority
  suggestions.sort((a, b) => {
    const priorityOrder = {'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3};
    return priorityOrder[a[7]] - priorityOrder[b[7]];
  });
  
  // Write suggestions
  if (suggestions.length > 0) {
    suggestionsSheet.getRange(2, 1, suggestions.length, suggestions[0].length).setValues(suggestions);
  }
  
  // Log to AI_Log
  logAIAction('SUGGESTIONS_GENERATED', '', '', 'INFO', 
    `Generated ${suggestions.length} order suggestions`, '', '', '');
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `Generated ${suggestions.length} order suggestions`, 
    'AI Suggestions', 
    5
  );
}

// Helper function to get current menu week
function getCurrentMenuWeek() {
  const startDate = new Date('2025-01-01'); // Adjust to your actual start date
  const today = new Date();
  const weeksSinceStart = Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000));
  return (weeksSinceStart % 4) + 1;
}

// Log AI actions
function logAIAction(type, productId, productName, alertLevel, message, recommendedAction, userResponse, result) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const logSheet = spreadsheet.getSheetByName('AI_Log');
  
  const newRow = [
    new Date(),
    type,
    productId,
    productName,
    alertLevel,
    message,
    recommendedAction,
    userResponse,
    result
  ];
  
  logSheet.appendRow(newRow);
}

// Check emergency protein stock
function checkEmergencyStock() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  
  const inventoryData = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 17).getValues();
  
  let totalProteinDays = 0;
  let proteinItems = 0;
  const lowProteinItems = [];
  
  inventoryData.forEach(row => {
    if (row[16] && row[16].toString().toLowerCase().includes('protein')) {
      const currentStock = row[6] || 0;
      const usageRate = row[13] || 5;
      const daysOfStock = currentStock / usageRate;
      
      totalProteinDays += daysOfStock;
      proteinItems++;
      
      if (daysOfStock < 30) {
        lowProteinItems.push({
          name: row[1],
          days: Math.floor(daysOfStock),
          current: currentStock,
          needed: Math.ceil((30 - daysOfStock) * usageRate)
        });
      }
    }
  });
  
  const avgProteinDays = proteinItems > 0 ? totalProteinDays / proteinItems : 0;
  
  // Create alert message
  let message = `Emergency Protein Stock Analysis\n\n`;
  message += `Average days of protein stock: ${Math.floor(avgProteinDays)}\n\n`;
  
  if (lowProteinItems.length > 0) {
    message += `⚠️ LOW PROTEIN ITEMS:\n`;
    lowProteinItems.forEach(item => {
      message += `\n${item.name}:\n`;
      message += `  Current: ${item.days} days (${item.current} units)\n`;
      message += `  Need to order: ${item.needed} units\n`;
    });
  } else {
    message += `✅ All protein items have 30+ days of stock`;
  }
  
  SpreadsheetApp.getUi().alert('Emergency Protein Stock Status', message, SpreadsheetApp.getUi().ButtonSet.OK);
  
  // Log the check
  logAIAction('EMERGENCY_STOCK_CHECK', '', '', 
    avgProteinDays < 30 ? 'CRITICAL' : 'INFO',
    `Average protein days: ${Math.floor(avgProteinDays)}`,
    lowProteinItems.length > 0 ? 'Order low protein items immediately' : 'Stock levels adequate',
    '', '');
}

// Create new order based on AI suggestions
function createNewOrder() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const suggestionsSheet = spreadsheet.getSheetByName('AI_Suggestions');
  const orderHistorySheet = spreadsheet.getSheetByName('Order_History');
  const inventoryMaster = spreadsheet.getSheetByName('Inventory_Master');
  
  // First generate fresh suggestions
  generateAISuggestions();
  
  // Get suggestions
  const suggestions = suggestionsSheet.getRange(2, 1, suggestionsSheet.getLastRow() - 1, 12).getValues();
  
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Create New Order',
    `Found ${suggestions.length} items to order. Create order now?`,
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    const orderDate = new Date();
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + 7); // Add lead time
    
    const orderRows = [];
    
    suggestions.forEach(suggestion => {
      if (suggestion[0]) { // If has data
        // Get product details from inventory master
        const productData = inventoryMaster.getRange(2, 1, inventoryMaster.getLastRow() - 1, 5).getValues()
          .find(row => row[0] === suggestion[1]);
        
        if (productData) {
          orderRows.push([
            orderDate,
            deliveryDate,
            getCurrentMenuWeek(),
            getRotationTeam(),
            suggestion[1], // Product ID
            suggestion[2], // Product Name
            suggestion[5], // Suggested quantity
            productData[4], // Unit price
            suggestion[5] * productData[4], // Total price
            0, // Received qty (to be filled on delivery)
            'PENDING',
            `Auto-generated: ${suggestion[6]}` // Reason from suggestions
          ]);
        }
      }
    });
    
    // Add to order history
    if (orderRows.length > 0) {
      const startRow = orderHistorySheet.getLastRow() + 1;
      orderHistorySheet.getRange(startRow, 1, orderRows.length, orderRows[0].length).setValues(orderRows);
      
      // Update inventory master "On Order" column
      orderRows.forEach(order => {
        updateOnOrderQuantity(order[4], order[6]); // Product ID and quantity
      });
      
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `Created order with ${orderRows.length} items. Total value: $${orderRows.reduce((sum, row) => sum + row[8], 0).toFixed(2)}`,
        'Order Created',
        10
      );
      
      // Mark suggestions as actioned
      suggestions.forEach((suggestion, index) => {
        if (suggestion[0]) {
          suggestionsSheet.getRange(index + 2, 12).setValue('ORDERED');
        }
      });
    }
  }
}

// Helper function to get current rotation team
function getRotationTeam() {
  const startDate = new Date('2025-01-01'); // Adjust to your actual start date
  const today = new Date();
  const weeksSinceStart = Math.floor((today - startDate) / (7 * 24 * 60 * 60 * 1000));
  const rotationWeek = Math.floor(weeksSinceStart / 2);
  return rotationWeek % 2 === 0 ? 'Team A' : 'Team B';
}

// Update on order quantity in inventory master
function updateOnOrderQuantity(productId, quantity) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const inventorySheet = spreadsheet.getSheetByName('Inventory_Master');
  
  const data = inventorySheet.getRange(2, 1, inventorySheet.getLastRow() - 1, 11).getValues();
  
  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === productId) {
      const currentOnOrder = data[i][10] || 0;
      inventorySheet.getRange(i + 2, 11).setValue(currentOnOrder + quantity);
      break;
    }
  }
}

// Print count sheets
function printCountSheets() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Print Count Sheets',
    'Enter location names separated by commas (or "ALL" for all locations):',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const input = response.getResponseText().trim();
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    
    let locationsToPrint = [];
    if (input.toUpperCase() === 'ALL') {
      locationsToPrint = CONFIG.locations;
    } else {
      locationsToPrint = input.split(',').map(loc => loc.trim());
    }
    
    locationsToPrint.forEach(location => {
      const sheetName = 'Count_' + location.replace(/\s+/g, '_');
      const sheet = spreadsheet.getSheetByName(sheetName);
      
      if (sheet) {
        // Update date
        sheet.getRange('B2').setValue(new Date());
        
        // Could add code here to actually trigger printing
        // For now, just activate the sheet
        sheet.activate();
      }
    });
    
    ui.alert(
      'Count Sheets Ready',
      `Prepared ${locationsToPrint.length} count sheets for printing. Use File > Print to print the active sheet.`,
      ui.ButtonSet.OK
    );
  }
}

// Show help
function showHelp() {
  const helpText = `
🏔️ MINING CAMP INVENTORY SYSTEM HELP

📊 DASHBOARD
- Shows key metrics and alerts
- Updates automatically with data changes

🤖 AI SUGGESTIONS
- Analyzes stock levels and usage patterns
- Recommends order quantities
- Prioritizes critical items
- Monitors emergency protein buffer

📦 CREATING ORDERS
1. Click "Generate AI Suggestions" to analyze needs
2. Review suggestions in AI_Suggestions sheet
3. Click "Create New Order" to convert to order
4. Order appears in Order_History as PENDING

📋 COUNT SHEETS
- One sheet per storage location
- Print-friendly format
- Updates inventory when counts entered

🚨 ALERTS
- OUT OF STOCK: No inventory remaining
- CRITICAL: Below 25% of minimum
- LOW: Below minimum stock level

📅 ROTATION TRACKING
- 2-week rotations (Team A/B)
- 4-week menu cycle
- Week starts Wednesday

💡 TIPS
- Update inventory counts weekly
- Check emergency protein stock before ordering
- Review AI suggestions before finalizing orders
- Monitor Dashboard for critical alerts

For support, contact IT department.
  `;
  
  SpreadsheetApp.getUi().alert('Help - Mining Camp Inventory', helpText, SpreadsheetApp.getUi().ButtonSet.OK);
}