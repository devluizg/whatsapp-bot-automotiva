/**
 * Script para verificar qual rota está causando o erro
 * Execute: node verify-routes.js
 */

const path = require('path');

const routeFiles = [
    'auth.js',
    'conversations.js',
    'customers.js',
    'dashboard.js',
    'import.js',
    'products.js',
    'services.js',
    'settings.js',
    'whatsapp.js'
];

console.log('🔍 Verificando rotas...\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

let hasError = false;

routeFiles.forEach(file => {
    const filePath = path.join(__dirname, 'src', 'routes', file);
    
    try {
        // Limpa o cache do require
        delete require.cache[require.resolve(filePath)];
        
        // Tenta carregar a rota
        const route = require(filePath);
        
        // Verifica o tipo do export
        const type = typeof route;
        
        if (type === 'function') {
            console.log(`✅ ${file.padEnd(20)} - OK (Router)`);
        } else if (type === 'object' && route !== null) {
            console.log(`❌ ${file.padEnd(20)} - ERRO: Exporta OBJECT ao invés de Router`);
            console.log(`   Corrija o export para: module.exports = router;`);
            console.log(`   Ao invés de: module.exports = { router };`);
            hasError = true;
        } else {
            console.log(`❌ ${file.padEnd(20)} - ERRO: Exporta ${type.toUpperCase()}`);
            hasError = true;
        }
        
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            console.log(`⚠️  ${file.padEnd(20)} - NÃO ENCONTRADO (pode não existir ainda)`);
        } else {
            console.log(`❌ ${file.padEnd(20)} - ERRO: ${error.message}`);
            hasError = true;
        }
    }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (hasError) {
    console.log('❌ Foram encontrados erros!\n');
    console.log('📝 Para corrigir, certifique-se que cada arquivo tem:\n');
    console.log('const express = require(\'express\');');
    console.log('const router = express.Router();');
    console.log('// ... suas rotas ...');
    console.log('module.exports = router; // ← Esta linha no FINAL\n');
} else {
    console.log('✅ Todas as rotas estão corretas!\n');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');