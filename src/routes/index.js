/**
 * ============================================
 * ROTAS PRINCIPAIS DA API
 * ============================================
 */

const express = require('express');
const router = express.Router();

// Importa as rotas com tratamento de erro
const loadRoute = (name) => {
    try {
        return require(`./${name}`);
    } catch (error) {
        console.error(`⚠️  Não foi possível carregar rota ${name}:`, error.message);
        return null;
    }
};

const produtosRoutes = loadRoute('products');
const servicosRoutes = loadRoute('services');
const clientesRoutes = loadRoute('customers');
const conversasRoutes = loadRoute('conversations');
const atendimentosRoutes = loadRoute('atendimentos');
const pedidosRoutes = loadRoute('pedidos');
const agendamentosRoutes = loadRoute('agendamentos');
const statsRoutes = loadRoute('stats');
const configRoutes = loadRoute('config');

// Rota raiz da API
router.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API WhatsApp Bot - Loja Automotiva',
        version: '2.0.0',
        endpoints: {
            produtos: '/api/produtos',
            servicos: '/api/servicos',
            clientes: '/api/clientes',
            conversas: '/api/conversas',
            atendimentos: '/api/atendimentos',
            pedidos: '/api/pedidos',
            agendamentos: '/api/agendamentos',
            stats: '/api/stats',
            config: '/api/config'
        }
    });
});

// Rota de health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

// Registra as rotas com verificação detalhada
const routes = [
    { path: '/products', handler: produtosRoutes, name: 'products' },
    { path: '/services', handler: servicosRoutes, name: 'services' },
    { path: '/customers', handler: clientesRoutes, name: 'customers' },
    { path: '/conversations', handler: conversasRoutes, name: 'conversations' },
    { path: '/atendimentos', handler: atendimentosRoutes, name: 'atendimentos' },
    { path: '/pedidos', handler: pedidosRoutes, name: 'pedidos' },
    { path: '/agendamentos', handler: agendamentosRoutes, name: 'agendamentos' },
    { path: '/stats', handler: statsRoutes, name: 'stats' },
    { path: '/config', handler: configRoutes, name: 'config' }
];

routes.forEach(({ path, handler, name }) => {
    if (!handler) {
        console.warn(`⚠️  Rota ${name} não foi carregada (módulo não encontrado)`);
        return;
    }
    
    if (typeof handler !== 'function') {
        console.error(`❌ Rota ${name} exporta ${typeof handler} ao invés de Router`);
        console.error(`   Corrija em src/routes/${name}.js:`);
        console.error(`   module.exports = router; // ao invés de { router }`);
        return;
    }
    
    try {
        router.use(path, handler);
        console.log(`✅ Rota ${name} registrada em ${path}`);
    } catch (error) {
        console.error(`❌ Erro ao registrar rota ${name}:`, error.message);
    }
});

module.exports = router;