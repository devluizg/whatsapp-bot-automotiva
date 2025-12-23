/**
 * ============================================
 * SERVIDOR WEB - PAINEL ADMINISTRATIVO
 * ============================================
 * 
 * Servidor Express com APIs REST e Socket.IO
 * para o painel administrativo da loja.
 * 
 * CORREÇÕES PARA RAILWAY:
 * - Usa PORT do Railway (não SERVER_PORT)
 * - Escuta em 0.0.0.0 (não localhost)
 * - Logs detalhados de inicialização
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const logger = require('./utils/logger');
const db = require('./database/connection');

// Importa rotas
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const serviceRoutes = require('./routes/services');
const customerRoutes = require('./routes/customers');
const conversationRoutes = require('./routes/conversations');
const dashboardRoutes = require('./routes/dashboard');
const settingsRoutes = require('./routes/settings');
const importRoutes = require('./routes/import');
const whatsappRoutes = require('./routes/whatsapp');

// ============================================
// CONFIGURAÇÕES - CORRIGIDO PARA RAILWAY
// ============================================

// Railway usa a variável PORT automaticamente
// Fallback para SERVER_PORT ou 3000
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

// IMPORTANTE: Railway requer 0.0.0.0, não localhost!
const HOST = process.env.HOST || '0.0.0.0';

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          SERVIDOR WEB - CONFIGURAÇÃO                         ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log('🔧 [SERVER] Configurações:');
console.log('   ├─ PORT:', PORT);
console.log('   ├─ HOST:', HOST);
console.log('   ├─ NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   ├─ process.env.PORT:', process.env.PORT || '(não definido)');
console.log('   ├─ process.env.SERVER_PORT:', process.env.SERVER_PORT || '(não definido)');
console.log('   └─ process.env.HOST:', process.env.HOST || '(não definido, usando 0.0.0.0)');
console.log('');

// Instâncias
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true
    }
});

// ============================================
// MIDDLEWARES GLOBAIS
// ============================================

// Segurança - Configurado para funcionar com Railway
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS - Permite todas as origens em produção para funcionar com Railway
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? true : (process.env.FRONTEND_URL || '*'),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Trust proxy - Necessário para Railway
app.set('trust proxy', 1);

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: {
        success: false,
        message: 'Muitas requisições. Tente novamente em alguns minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Parse JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir arquivos estáticos (frontend)
const publicPath = path.join(__dirname, '../public');
const uploadsPath = path.join(__dirname, '../uploads');

console.log('📁 [SERVER] Caminhos:');
console.log('   ├─ Public:', publicPath);
console.log('   ├─ Uploads:', uploadsPath);
console.log('   └─ __dirname:', __dirname);
console.log('');

app.use(express.static(publicPath));
app.use('/uploads', express.static(uploadsPath));

// Disponibiliza io para as rotas
app.set('io', io);

// Log de requisições
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';
        
        // Log mais visível para debug
        if (res.statusCode >= 400 || process.env.DEBUG_REQUESTS === 'true') {
            console.log(`📨 ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
        }
        
        logger[logLevel](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    
    next();
});

// ============================================
// ROTAS DA API
// ============================================

// Health check - IMPORTANTE para Railway verificar se está online
app.get('/api/health', async (req, res) => {
    try {
        let dbConnected = false;
        try {
            dbConnected = await db.isConnected();
        } catch (e) {
            console.log('⚠️ [HEALTH] Erro ao verificar DB:', e.message);
        }
        
        res.json({
            success: true,
            status: 'online',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            port: PORT,
            host: HOST,
            services: {
                database: dbConnected ? 'connected' : 'disconnected',
                server: 'running'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'error',
            message: error.message
        });
    }
});

// Rota raiz - responde antes das rotas de API
app.get('/', (req, res, next) => {
    // Se existir index.html, serve ele
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    // Senão, serve o HTML padrão
    res.send(getDefaultHtml());
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/import', importRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Rota catch-all para o frontend SPA
app.get('*', (req, res) => {
    // Se for requisição de API, retorna 404
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'Endpoint não encontrado'
        });
    }
    
    // Senão, serve o frontend
    const indexPath = path.join(publicPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    
    // Fallback para HTML padrão
    res.send(getDefaultHtml());
});

// ============================================
// TRATAMENTO DE ERROS
// ============================================

// 404 para APIs
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint não encontrado'
    });
});

// Erro global
app.use((err, req, res, next) => {
    console.error('❌ [ERROR] Erro no servidor:', err.message);
    console.error(err.stack);

    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'Arquivo muito grande. Tamanho máximo: 10MB'
        });
    }

    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'JSON inválido no corpo da requisição'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Erro interno do servidor' 
            : err.message
    });
});

// ============================================
// SOCKET.IO - COMUNICAÇÃO EM TEMPO REAL
// ============================================

const adminSockets = new Map();

io.on('connection', (socket) => {
    console.log(`🔌 [SOCKET] Conectado: ${socket.id}`);

    socket.on('admin:join', (data) => {
        const { userId, userName } = data;
        adminSockets.set(socket.id, { userId, userName, socket });
        socket.join('admins');
        console.log(`👤 [SOCKET] Admin conectado: ${userName} (${socket.id})`);
        socket.to('admins').emit('admin:online', { userId, userName });
    });

    socket.on('admin:list', () => {
        const onlineAdmins = [];
        adminSockets.forEach((admin) => {
            onlineAdmins.push({
                id: admin.userId,
                name: admin.userName
            });
        });
        socket.emit('admin:list', onlineAdmins);
    });

    socket.on('whatsapp:send', async (data) => {
        const { phone, message } = data;
        
        try {
            const whatsappService = require('./services/whatsappService');
            await whatsappService.sendMessage(phone, message);
            
            const customerService = require('./services/customerService');
            await customerService.saveMessage(phone, message, 'saida', 'humano');
            
            socket.emit('whatsapp:sent', { success: true, phone, message });
            socket.to('admins').emit('conversation:update', { phone, message, type: 'sent' });
        } catch (error) {
            socket.emit('whatsapp:error', { phone, error: error.message });
        }
    });

    socket.on('attendance:start', async (data) => {
        const { phone, userId, userName } = data;
        
        try {
            const customerService = require('./services/customerService');
            await customerService.startAttendance(phone, userId, userName);
            io.to('admins').emit('attendance:started', { phone, userId, userName });
        } catch (error) {
            socket.emit('attendance:error', { error: error.message });
        }
    });

    socket.on('attendance:finish', async (data) => {
        const { phone, observacoes } = data;
        
        try {
            const customerService = require('./services/customerService');
            await customerService.finishAttendance(phone, observacoes);
            
            const whatsappService = require('./services/whatsappService');
            await whatsappService.sendMessage(phone, 
                '✅ *Atendimento finalizado*\n\nObrigado pelo contato! Se precisar de algo mais, é só chamar. 😊'
            );
            
            io.to('admins').emit('attendance:finished', { phone });
        } catch (error) {
            socket.emit('attendance:error', { error: error.message });
        }
    });

    socket.on('disconnect', () => {
        const admin = adminSockets.get(socket.id);
        if (admin) {
            console.log(`👤 [SOCKET] Admin desconectado: ${admin.userName}`);
            socket.to('admins').emit('admin:offline', { 
                userId: admin.userId, 
                userName: admin.userName 
            });
            adminSockets.delete(socket.id);
        }
        console.log(`🔌 [SOCKET] Desconectado: ${socket.id}`);
    });
});

// ============================================
// FUNÇÕES DE NOTIFICAÇÃO
// ============================================

function notifyNewMessage(phone, message, customer = null) {
    io.to('admins').emit('message:new', {
        phone,
        message,
        customer,
        timestamp: new Date().toISOString()
    });
}

function notifyNewAttendance(attendance) {
    io.to('admins').emit('attendance:new', attendance);
}

function notifyLowStock(products) {
    io.to('admins').emit('stock:low', {
        count: products.length,
        products
    });
}

function notifyWhatsAppStatus(status, data = {}) {
    io.to('admins').emit('whatsapp:status', { status, ...data });
}

const notifications = {
    newMessage: notifyNewMessage,
    newAttendance: notifyNewAttendance,
    lowStock: notifyLowStock,
    whatsappStatus: notifyWhatsAppStatus
};

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

async function startServer() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          INICIANDO SERVIDOR WEB                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('');

    try {
        // Inicializa banco de dados
        console.log('🗄️  [SERVER] Conectando ao banco de dados...');
        await db.initPool();
        console.log('✅ [SERVER] Banco de dados conectado');

        // Cria diretórios necessários
        const dirs = ['uploads', 'public', 'logs'];
        for (const dir of dirs) {
            const dirPath = path.join(__dirname, '..', dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`📁 [SERVER] Diretório criado: ${dir}`);
            }
        }

        // Verifica/cria index.html
        const indexPath = path.join(__dirname, '../public/index.html');
        console.log('📄 [SERVER] Verificando index.html:', indexPath);
        console.log('   └─ Existe:', fs.existsSync(indexPath));
        
        if (!fs.existsSync(indexPath)) {
            fs.writeFileSync(indexPath, getDefaultHtml());
            console.log('📄 [SERVER] index.html padrão criado');
        }

        // Inicia servidor - CORREÇÃO PRINCIPAL AQUI
        return new Promise((resolve, reject) => {
            httpServer.listen(PORT, HOST, () => {
                console.log('');
                console.log('╔══════════════════════════════════════════════════════════════╗');
                console.log('║          ✅ SERVIDOR INICIADO COM SUCESSO!                   ║');
                console.log('╚══════════════════════════════════════════════════════════════╝');
                console.log('');
                console.log(`🚀 [SERVER] Servidor rodando em http://${HOST}:${PORT}`);
                console.log(`🌐 [SERVER] URL externa: Verificar domínio no Railway`);
                console.log(`📡 [SERVER] Socket.IO disponível`);
                console.log(`📁 [SERVER] Frontend servido de /public`);
                console.log('');
                
                // Log para Railway
                logger.info(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
                
                resolve(httpServer);
            });

            httpServer.on('error', (error) => {
                console.error('');
                console.error('╔══════════════════════════════════════════════════════════════╗');
                console.error('║          ❌ ERRO AO INICIAR SERVIDOR                         ║');
                console.error('╚══════════════════════════════════════════════════════════════╝');
                console.error('');
                
                if (error.code === 'EADDRINUSE') {
                    console.error(`❌ [SERVER] Porta ${PORT} já está em uso`);
                } else if (error.code === 'EACCES') {
                    console.error(`❌ [SERVER] Sem permissão para usar porta ${PORT}`);
                } else {
                    console.error('❌ [SERVER] Erro:', error.message);
                }
                
                logger.error('❌ Erro ao iniciar servidor:', error.message);
                reject(error);
            });
        });
    } catch (error) {
        console.error('❌ [SERVER] Erro na inicialização:', error.message);
        console.error(error.stack);
        logger.error('❌ Erro na inicialização do servidor:', error.message);
        throw error;
    }
}

async function stopServer() {
    return new Promise((resolve) => {
        httpServer.close(() => {
            console.log('🛑 [SERVER] Servidor encerrado');
            logger.info('🛑 Servidor encerrado');
            resolve();
        });
    });
}

function getIO() {
    return io;
}

function getDefaultHtml() {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Admin - Loja Automotiva</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.1);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            max-width: 600px;
            margin: 20px;
        }
        h1 { font-size: 2.5em; margin-bottom: 10px; }
        .emoji { font-size: 4em; margin-bottom: 20px; }
        p { color: rgba(255,255,255,0.8); margin-bottom: 20px; line-height: 1.6; }
        .status {
            display: inline-block;
            padding: 10px 20px;
            background: #00d26a;
            color: #fff;
            border-radius: 50px;
            font-weight: bold;
            margin-bottom: 20px;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
        }
        .info {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 10px;
            text-align: left;
            font-size: 0.9em;
            margin-top: 20px;
        }
        .info h3 { margin-bottom: 15px; color: #00d26a; }
        .info ul { list-style: none; }
        .info li {
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            justify-content: space-between;
        }
        .info li:last-child { border-bottom: none; }
        a { color: #00d26a; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .method {
            background: rgba(0,210,106,0.2);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .get { background: rgba(0,210,106,0.2); color: #00d26a; }
        .post { background: rgba(255,193,7,0.2); color: #ffc107; }
        .env-info {
            margin-top: 20px;
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
            font-size: 0.8em;
            text-align: left;
        }
        .env-info code {
            background: rgba(255,255,255,0.1);
            padding: 2px 6px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🚗</div>
        <h1>Painel Admin</h1>
        <p>Loja Automotiva - Bot WhatsApp com IA</p>
        <div class="status">✅ Servidor Online</div>
        
        <div class="info">
            <h3>📡 API Endpoints Disponíveis</h3>
            <ul>
                <li>
                    <span><span class="method get">GET</span> <a href="/api/health">/api/health</a></span>
                    <span>Status do servidor</span>
                </li>
                <li>
                    <span><span class="method post">POST</span> /api/auth/login</span>
                    <span>Autenticação</span>
                </li>
                <li>
                    <span><span class="method get">GET</span> /api/dashboard/stats</span>
                    <span>Estatísticas</span>
                </li>
                <li>
                    <span><span class="method get">GET</span> /api/products</span>
                    <span>Listar produtos</span>
                </li>
                <li>
                    <span><span class="method get">GET</span> /api/services</span>
                    <span>Listar serviços</span>
                </li>
                <li>
                    <span><span class="method get">GET</span> /api/customers</span>
                    <span>Listar clientes</span>
                </li>
                <li>
                    <span><span class="method get">GET</span> /api/whatsapp/status</span>
                    <span>Status WhatsApp</span>
                </li>
            </ul>
        </div>
        
        <div class="env-info">
            <strong>🔧 Informações do Servidor:</strong><br><br>
            • Ambiente: <code>${process.env.NODE_ENV || 'development'}</code><br>
            • Porta: <code>${PORT}</code><br>
            • Host: <code>${HOST}</code><br>
            • Node: <code>${process.version}</code>
        </div>
        
        <p style="margin-top: 20px; font-size: 0.8em; opacity: 0.7;">
            O frontend completo deve estar na pasta <code>/public</code><br>
            Se você está vendo esta página, coloque seus arquivos HTML/CSS/JS lá.
        </p>
    </div>
</body>
</html>`;
}

// ============================================
// EXECUÇÃO STANDALONE
// ============================================

if (require.main === module) {
    startServer()
        .then(() => {
            console.log('✅ [SERVER] Servidor iniciado em modo standalone');
        })
        .catch((error) => {
            console.error('❌ [SERVER] Falha ao iniciar servidor:', error.message);
            process.exit(1);
        });

    process.on('SIGINT', async () => {
        console.log('\n🛑 [SERVER] Encerrando servidor...');
        await stopServer();
        await db.closePool();
        process.exit(0);
    });
}

module.exports = {
    app,
    httpServer,
    io,
    startServer,
    stopServer,
    getIO,
    notifications
};
