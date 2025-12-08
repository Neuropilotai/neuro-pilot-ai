// Script de test pour vérifier la configuration email
const EmailOrderSystem = require('./backend/email_order_system');

async function testEmail() {
    console.log('🧪 Test de configuration email...');
    
    // Afficher les variables d'environnement
    console.log('EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
    console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET (16 chars)' : 'NOT SET');
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('❌ Variables EMAIL_USER ou EMAIL_PASS non configurées');
        console.log('Usage: EMAIL_USER=email@gmail.com EMAIL_PASS=your_app_password node test-email.js');
        return;
    }
    
    try {
        const emailSystem = new EmailOrderSystem();
        
        const testOrder = {
            email: 'davidmikulis66@gmail.com',
            orderId: 'test_' + Date.now(),
            packageType: 'professional',
            firstName: 'David',
            lastName: 'Mikulis',
            finalPrice: 0,
            originalPrice: 45,
            promoCode: 'FAMILY2025',
            discountAmount: 45
        };
        
        console.log('📧 Envoi d\'email de test...');
        await emailSystem.sendOrderConfirmation(testOrder);
        console.log('✅ Email envoyé avec succès !');
        
    } catch (error) {
        console.error('❌ Erreur d\'envoi d\'email:', error.message);
        if (error.code) {
            console.error('Code d\'erreur:', error.code);
        }
    }
}

testEmail();