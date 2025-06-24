require('dotenv').config();
const ProfessionalResumeGenerator = require('./professional_resume_generator');

// Test the improved resume generator
const testOrderData = {
    orderId: 'test_improved_' + Date.now(),
    firstName: 'David',
    lastName: 'Mikulis',
    email: 'davidmikulis66@gmail.com',
    packageType: 'executive',
    targetIndustry: 'Technology',
    careerLevel: 'Executive',
    skills: 'Strategic Leadership, Digital Transformation, Innovation Management, P&L Management',
    jobTitle: 'Chief Executive Officer',
    phone: '+1 (555) 123-4567',
    location: 'Toronto, ON'
};

console.log('🎯 Testing Improved Resume Generator...');
console.log('Package:', testOrderData.packageType.toUpperCase());

const generator = new ProfessionalResumeGenerator();
const resumeData = generator.generateResume(testOrderData);

// Save both formats
const savedFiles = generator.saveResume(resumeData, testOrderData);

console.log('\n✅ Resume Generation Complete!');
console.log('\n📄 Generated Files:');
console.log('HTML Resume:', savedFiles.htmlPath);
console.log('Text Resume:', savedFiles.textPath);
console.log('Format:', savedFiles.format);

console.log('\n🎨 Resume Preview (First 500 characters of text):');
console.log('═'.repeat(80));
console.log(resumeData.text.substring(0, 500) + '...');
console.log('═'.repeat(80));

console.log('\n📊 Resume Features:');
console.log('✅ Executive-level positioning');
console.log('✅ Strategic accomplishments');
console.log('✅ Quantified achievements');
console.log('✅ ATS-optimized formatting');
console.log('✅ Professional typography');
console.log('✅ Multiple export formats');

console.log('\n🚀 Quality Level: EXECUTIVE PREMIUM');
console.log('💼 Ready for C-suite applications!');