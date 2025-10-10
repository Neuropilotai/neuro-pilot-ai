const speakeasy = require('speakeasy');

// The secret from your setup
const secret = 'HA3SUQSJGYZWWVCHGR5G4ILEFFETUMJEGJDCC4LLKR4FW3ZJIZ4A';

console.log('🔐 2FA Code Validator\n');
console.log('Secret:', secret);
console.log('Time:', new Date().toISOString());

// Generate what the server expects right now
const serverToken = speakeasy.totp({
  secret: secret,
  encoding: 'base32',
  time: Math.floor(Date.now() / 1000), // Current time
  window: 0
});

console.log('Expected code right now:', serverToken);

// Test with different time windows
console.log('\nValid codes in the next 60 seconds:');
for (let i = -1; i <= 2; i++) {
  const time = Math.floor(Date.now() / 1000) + (i * 30);
  const token = speakeasy.totp({
    secret: secret,
    encoding: 'base32',
    time: time,
    window: 0
  });
  const timeStr = new Date(time * 1000).toLocaleTimeString();
  console.log(`${timeStr}: ${token}`);
}

// Test function to verify a code
function testCode(inputCode) {
  const isValid = speakeasy.totp.verify({
    secret: secret,
    encoding: 'base32',
    token: inputCode,
    window: 2 // Allow 2 time steps (60 seconds) of drift
  });

  console.log(`\nTesting code "${inputCode}": ${isValid ? '✅ VALID' : '❌ INVALID'}`);
  return isValid;
}

// Test if there's a command line argument
if (process.argv[2]) {
  testCode(process.argv[2]);
} else {
  console.log('\nTo test your code: node test-2fa-code.js YOUR_6_DIGIT_CODE');
}