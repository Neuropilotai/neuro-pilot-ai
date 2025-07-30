#!/usr/bin/env node

const fs = require('fs');
const FormData = require('form-data');
const fetch = require('node-fetch');

async function testFileUpload() {
  console.log('🧪 Testing File Upload Functionality...\n');
  
  try {
    // Test JSON upload
    console.log('📤 Testing JSON file upload...');
    const form = new FormData();
    form.append('inventoryFile', fs.createReadStream('./sample-inventory.json'));
    
    const response = await fetch('http://localhost:3001/api/inventory/upload', {
      method: 'POST',
      body: form
    });
    
    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ JSON Upload Success:', result.message);
      console.log(`   Items processed: ${result.itemsUpdated}`);
    } else {
      console.log('❌ JSON Upload Failed:', result.error);
    }
    
    // Test export functionality
    console.log('\n📥 Testing export functionality...');
    const exportResponse = await fetch('http://localhost:3001/api/inventory/export/json');
    
    if (exportResponse.ok) {
      console.log('✅ Export functionality working');
    } else {
      console.log('❌ Export failed');
    }
    
    // Test file list
    console.log('\n📂 Testing file list...');
    const filesResponse = await fetch('http://localhost:3001/api/inventory/files');
    const filesResult = await filesResponse.json();
    
    if (filesResponse.ok) {
      console.log(`✅ Files API working - ${filesResult.totalFiles} files found`);
    } else {
      console.log('❌ Files API failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testFileUpload();