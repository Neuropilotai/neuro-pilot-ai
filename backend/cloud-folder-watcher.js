#!/usr/bin/env node

/**
 * Cloud Folder Watcher - Automatically processes new inventory/order files
 * Watches Google Drive, Dropbox, or OneDrive folders for new files
 */

const fs = require("fs");
const path = require("path");
const chokidar = require("chokidar");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

// Configuration - EDIT THESE PATHS
const WATCH_FOLDERS = {
  // Google Drive (Mac)
  googleDrive: path.join(
    process.env.HOME,
    "Google Drive",
    "My Drive",
    "CampInventory",
    "inbox",
  ),

  // Dropbox
  dropbox: path.join(process.env.HOME, "Dropbox", "CampInventory", "inbox"),

  // OneDrive (Mac)
  oneDrive: path.join(
    process.env.HOME,
    "Library",
    "CloudStorage",
    "OneDrive-Personal",
    "CampInventory",
    "inbox",
  ),

  // Local watch folder
  local: path.join(__dirname, "watch-folder"),
};

// Report output folder
const REPORTS_FOLDER = path.join(__dirname, "automated-reports");

// Ensure folders exist
Object.values(WATCH_FOLDERS).forEach((folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
    console.log(`📁 Created watch folder: ${folder}`);
  }
});

if (!fs.existsSync(REPORTS_FOLDER)) {
  fs.mkdirSync(REPORTS_FOLDER, { recursive: true });
}

console.log("🔍 Cloud Folder Watcher Started");
console.log("📁 Watching folders:");
Object.entries(WATCH_FOLDERS).forEach(([name, folder]) => {
  if (fs.existsSync(folder)) {
    console.log(`   ✅ ${name}: ${folder}`);
  } else {
    console.log(`   ❌ ${name}: ${folder} (not found)`);
  }
});

// Process different file types
async function processFile(filePath) {
  const fileName = path.basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  console.log(`\n📄 Processing new file: ${fileName}`);

  try {
    // Determine file type
    if (fileName.includes("gfs_order") || fileName.includes("GFS")) {
      await processGFSOrder(filePath, timestamp);
    } else if (fileName.includes("inventory")) {
      await processInventory(filePath, timestamp);
    } else if (fileName.endsWith(".csv")) {
      await processCSV(filePath, timestamp);
    } else if (fileName.endsWith(".pdf")) {
      await processPDF(filePath, timestamp);
    } else if (fileName.endsWith(".json")) {
      await processJSON(filePath, timestamp);
    } else {
      console.log("❓ Unknown file type, skipping...");
      return;
    }

    // Move processed file to archive
    const archiveFolder = path.join(path.dirname(filePath), "processed");
    if (!fs.existsSync(archiveFolder)) {
      fs.mkdirSync(archiveFolder, { recursive: true });
    }

    const archivePath = path.join(archiveFolder, `${timestamp}_${fileName}`);
    fs.renameSync(filePath, archivePath);
    console.log(`✅ File archived to: ${archivePath}`);
  } catch (error) {
    console.error(`❌ Error processing file: ${error.message}`);
  }
}

// Process GFS Order
async function processGFSOrder(filePath, timestamp) {
  console.log("📋 Processing GFS Order...");

  const reportPath = path.join(
    REPORTS_FOLDER,
    `gfs_order_report_${timestamp}.html`,
  );

  // Generate report HTML
  const orderData = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const reportHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>GFS Order Report - ${orderData.orderNumber || "Unknown"}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #2c3e50; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #3498db; color: white; }
        .summary { background-color: #ecf0f1; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>GFS Order Report</h1>
    <div class="summary">
        <h2>Order Summary</h2>
        <p><strong>Order Number:</strong> ${orderData.orderNumber || "N/A"}</p>
        <p><strong>Date:</strong> ${orderData.orderDate || new Date().toISOString()}</p>
        <p><strong>Total Items:</strong> ${orderData.items?.length || 0}</p>
        <p><strong>Total Value:</strong> $${calculateTotal(orderData.items)}</p>
    </div>
    
    <h2>Order Details</h2>
    <table>
        <thead>
            <tr>
                <th>Item</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Price</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
            ${generateOrderRows(orderData.items)}
        </tbody>
    </table>
    
    <p style="margin-top: 30px; color: #7f8c8d;">
        Report generated: ${new Date().toLocaleString()}<br>
        Processed by: Camp Inventory System
    </p>
</body>
</html>`;

  fs.writeFileSync(reportPath, reportHTML);
  console.log(`📊 Report generated: ${reportPath}`);

  // Also add to inventory system
  await addToInventorySystem(orderData);
}

// Process Inventory File
async function processInventory(filePath, timestamp) {
  console.log("📦 Processing Inventory Update...");

  const reportPath = path.join(
    REPORTS_FOLDER,
    `inventory_report_${timestamp}.txt`,
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Generate inventory report
  let report = `INVENTORY UPDATE REPORT\n`;
  report += `Generated: ${new Date().toLocaleString()}\n`;
  report += `${"=".repeat(50)}\n\n`;

  if (Array.isArray(data)) {
    report += `Total Items: ${data.length}\n\n`;

    // Group by category
    const categories = {};
    data.forEach((item) => {
      const cat = item.category || "Uncategorized";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(item);
    });

    Object.entries(categories).forEach(([category, items]) => {
      report += `\n${category.toUpperCase()} (${items.length} items)\n`;
      report += `${"-".repeat(30)}\n`;
      items.forEach((item) => {
        report += `- ${item.name}: ${item.quantity} ${item.unit}\n`;
      });
    });
  }

  fs.writeFileSync(reportPath, report);
  console.log(`📊 Report generated: ${reportPath}`);
}

// Process PDF files
async function processPDF(filePath, timestamp) {
  console.log("📄 Processing PDF order file...");

  try {
    // Extract text from PDF using pdfparse
    const { stdout: pdfText } = await execAsync(`pdftotext "${filePath}" -`);

    // Create a text report
    const reportPath = path.join(REPORTS_FOLDER, `pdf_order_${timestamp}.txt`);

    let report = `PDF ORDER PROCESSING REPORT\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `Original File: ${path.basename(filePath)}\n`;
    report += `${"=".repeat(60)}\n\n`;
    report += `EXTRACTED TEXT:\n`;
    report += `${"-".repeat(30)}\n`;
    report += pdfText;
    report += `\n\n${"=".repeat(60)}\n`;
    report += `PROCESSING NOTES:\n`;
    report += `- PDF text successfully extracted\n`;
    report += `- Review extracted text for order details\n`;
    report += `- Consider converting to JSON format for inventory system\n`;

    fs.writeFileSync(reportPath, report);
    console.log(`📊 PDF report generated: ${reportPath}`);

    // Also try to parse order information
    await tryParseOrderFromText(pdfText, timestamp);
  } catch (error) {
    console.log("⚠️  PDF processing failed, trying alternative method...");

    // Fallback: Create a basic report noting the PDF was received
    const reportPath = path.join(
      REPORTS_FOLDER,
      `pdf_received_${timestamp}.txt`,
    );

    let report = `PDF ORDER RECEIVED\n`;
    report += `Generated: ${new Date().toLocaleString()}\n`;
    report += `File: ${path.basename(filePath)}\n`;
    report += `${"=".repeat(40)}\n\n`;
    report += `A PDF order file was received but text extraction failed.\n`;
    report += `Manual review required.\n\n`;
    report += `File location: ${filePath}\n`;
    report += `Error: ${error.message}\n`;

    fs.writeFileSync(reportPath, report);
    console.log(`📋 PDF receipt logged: ${reportPath}`);
  }
}

// Try to parse order information from extracted text
async function tryParseOrderFromText(text, timestamp) {
  console.log("🔍 Analyzing extracted text for order details...");

  const analysisPath = path.join(
    REPORTS_FOLDER,
    `order_analysis_${timestamp}.txt`,
  );

  let analysis = `ORDER TEXT ANALYSIS\n`;
  analysis += `Generated: ${new Date().toLocaleString()}\n`;
  analysis += `${"=".repeat(50)}\n\n`;

  // Look for common order patterns
  const patterns = {
    orderNumber: /order[#\s]*:?\s*([A-Z0-9-]+)/i,
    date: /date[:\s]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{2,4})/i,
    total: /total[:\s]*\$?([0-9,]+\.?[0-9]*)/i,
    supplier: /(GFS|Sysco|Gordon Food Service)/i,
  };

  analysis += `DETECTED INFORMATION:\n`;
  analysis += `${"-".repeat(25)}\n`;

  Object.entries(patterns).forEach(([key, pattern]) => {
    const match = text.match(pattern);
    if (match) {
      analysis += `${key.toUpperCase()}: ${match[1] || match[0]}\n`;
    } else {
      analysis += `${key.toUpperCase()}: Not found\n`;
    }
  });

  // Look for item lines (common formats)
  analysis += `\nPOSSIBLE ITEMS:\n`;
  analysis += `${"-".repeat(15)}\n`;

  const lines = text.split("\n");
  const itemLines = lines.filter((line) => {
    // Look for lines that might contain items (have numbers and text)
    return /\d+.*[a-zA-Z].*\$/.test(line) || /[a-zA-Z].*\d+.*\$/.test(line);
  });

  if (itemLines.length > 0) {
    itemLines.slice(0, 10).forEach((line) => {
      // Show first 10 potential items
      analysis += `- ${line.trim()}\n`;
    });
    if (itemLines.length > 10) {
      analysis += `... and ${itemLines.length - 10} more lines\n`;
    }
  } else {
    analysis += `No clear item lines detected\n`;
  }

  analysis += `\n${"=".repeat(50)}\n`;
  analysis += `NEXT STEPS:\n`;
  analysis += `1. Review the analysis above\n`;
  analysis += `2. Manually verify order details\n`;
  analysis += `3. Create JSON order file if needed\n`;
  analysis += `4. Add to inventory system\n`;

  fs.writeFileSync(analysisPath, analysis);
  console.log(`🧠 Order analysis saved: ${analysisPath}`);
}

// Process CSV files
async function processCSV(filePath, timestamp) {
  console.log("📑 Processing CSV file...");

  // Convert CSV to JSON and process
  // You can add CSV parsing logic here
  console.log("CSV processing not yet implemented");
}

// Process generic JSON
async function processJSON(filePath, timestamp) {
  console.log("📄 Processing JSON file...");

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const reportPath = path.join(REPORTS_FOLDER, `json_report_${timestamp}.json`);

  // Pretty print the JSON
  fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
  console.log(`📊 Report generated: ${reportPath}`);
}

// Helper functions
function calculateTotal(items) {
  if (!items) return "0.00";
  return items
    .reduce((sum, item) => {
      return sum + (item.quantity || 0) * (item.unitPrice || 0);
    }, 0)
    .toFixed(2);
}

function generateOrderRows(items) {
  if (!items) return '<tr><td colspan="5">No items</td></tr>';

  return items
    .map(
      (item) => `
        <tr>
            <td>${item.name || "Unknown"}</td>
            <td>${item.quantity || 0}</td>
            <td>${item.unit || "EA"}</td>
            <td>$${(item.unitPrice || 0).toFixed(2)}</td>
            <td>$${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</td>
        </tr>
    `,
    )
    .join("");
}

async function addToInventorySystem(orderData) {
  // Add logic to update your inventory system
  console.log("📥 Adding to inventory system...");

  // Call your inventory API or update local files
  try {
    const response = await fetch("http://localhost:8083/api/inventory/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData),
    });

    if (response.ok) {
      console.log("✅ Added to inventory system");
    }
  } catch (error) {
    console.log("⚠️  Could not connect to inventory system");
  }
}

// Set up file watchers
const watcher = chokidar.watch(
  Object.values(WATCH_FOLDERS).filter(fs.existsSync),
  {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  },
);

// Watch for new files
watcher.on("add", (filePath) => {
  console.log(`\n🆕 New file detected: ${path.basename(filePath)}`);
  setTimeout(() => processFile(filePath), 1000); // Wait 1 second to ensure file is fully written
});

console.log("\n✅ Watcher is running...");
console.log(
  "💡 Drop files into any watched folder to process them automatically",
);
console.log("📊 Reports will be saved to:", REPORTS_FOLDER);
console.log("\nPress Ctrl+C to stop\n");
