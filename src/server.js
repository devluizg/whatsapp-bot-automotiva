/**
 * ============================================
 * SERVIDOR WEB - PAINEL ADMINISTRATIVO
 * ============================================
 * 
 * Servidor Express com APIs REST e Socket.IO
 * para o painel administrativo da loja.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

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

// Configurações
const PORT = process.env.SERVER_PORT || 3000;
const HOST = process.env.SERVER_HOST || 'localhost';

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

// Segurança
app.use(helmet({
    contentSecurityPolicy: false, // Desabilita para permitir inline scripts no frontend
    crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
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
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Disponibiliza io para as rotas
app.set('io', io);

// Log de requisições
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'debug';
        
        logger[logLevel](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    
    next();
});

// ============================================
// ROTAS DA API
// ============================================

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const dbConnected = await db.isConnected();
        
        res.json({
            success: true,
            status: 'online',
            timestamp: new Date().toISOString(),
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
    res.sendFile(path.join(__dirname, '../public/index.html'));
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
    logger.error('Erro no servidor:', err.message);
    logger.error(err.stack);

    // Erro de validação do Multer
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'Arquivo muito grande. Tamanho máximo: 10MB'
        });
    }

    // Erro de JSON inválido
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

// Armazena conexões de admins
const adminSockets = new Map();

io.on('connection', (socket) => {
    logger.debug(`Socket conectado: ${socket.id}`);

    // Admin se identifica
    socket.on('admin:join', (data) => {
        const { userId, userName } = data;
        adminSockets.set(socket.id, { userId, userName, socket });
        socket.join('admins');
        logger.info(`Admin conectado: ${userName} (${socket.id})`);
        
        // Notifica outros admins
        socket.to('admins').emit('admin:online', { userId, userName });
    });

    // Admin solicita lista de admins online
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

    // Admin envia mensagem para cliente WhatsApp
    socket.on('whatsapp:send', async (data) => {
        const { phone, message } = data;
        
        try {
            const whatsappService = require('./services/whatsappService');
            await whatsappService.sendMessage(phone, message);
            
            // Salva mensagem no histórico
            const customerService = require('./services/customerService');
            await customerService.saveMessage(phone, message, 'saida', 'humano');
            
            socket.emit('whatsapp:sent', { success: true, phone, message });
            
            // Notifica outros admins
            socket.to('admins').emit('conversation:update', { phone, message, type: 'sent' });
        } catch (error) {
            socket.emit('whatsapp:error', { phone, error: error.message });
        }
    });

    // Admin assume atendimento
    socket.on('attendance:start', async (data) => {
        const { phone, userId, userName } = data;
        
        try {
            const customerService = require('./services/customerService');
            await customerService.startAttendance(phone, userId, userName);
            
            // Notifica todos os admins
            io.to('admins').emit('attendance:started', { phone, userId, userName });
        } catch (error) {
            socket.emit('attendance:error', { error: error.message });
        }
    });

    // Admin finaliza atendimento
    socket.on('attendance:finish', async (data) => {
        const { phone, observacoes } = data;
        
        try {
            const customerService = require('./services/customerService');
            await customerService.finishAttendance(phone, observacoes);
            
            // Notifica cliente
            const whatsappService = require('./services/whatsappService');
            await whatsappService.sendMessage(phone, 
                '✅ *Atendimento finalizado*\n\nObrigado pelo contato! Se precisar de algo mais, é só chamar. 😊'
            );
            
            // Notifica admins
            io.to('admins').emit('attendance:finished', { phone });
        } catch (error) {
            socket.emit('attendance:error', { error: error.message });
        }
    });

    // Desconexão
    socket.on('disconnect', () => {
        const admin = adminSockets.get(socket.id);
        if (admin) {
            logger.info(`Admin desconectado: ${admin.userName}`);
            socket.to('admins').emit('admin:offline', { 
                userId: admin.userId, 
                userName: admin.userName 
            });
            adminSockets.delete(socket.id);
        }
        logger.debug(`Socket desconectado: ${socket.id}`);
    });
});

// ============================================
// FUNÇÕES DE NOTIFICAÇÃO
// ============================================

/**
 * Notifica admins sobre nova mensagem
 * @param {string} phone - Telefone do cliente
 * @param {string} message - Mensagem recebida
 * @param {object} customer - Dados do cliente
 */
function notifyNewMessage(phone, message, customer = null) {
    io.to('admins').emit('message:new', {
        phone,
        message,
        customer,
        timestamp: new Date().toISOString()
    });
}

/**
 * Notifica admins sobre novo cliente na fila
 * @param {object} attendance - Dados do atendimento
 */
function notifyNewAttendance(attendance) {
    io.to('admins').emit('attendance:new', attendance);
}

/**
 * Notifica admins sobre alerta de estoque baixo
 * @param {array} products - Produtos com estoque baixo
 */
function notifyLowStock(products) {
    io.to('admins').emit('stock:low', {
        count: products.length,
        products
    });
}

/**
 * Notifica sobre mudança de status do WhatsApp
 * @param {string} status - Status da conexão
 * @param {object} data - Dados adicionais
 */
function notifyWhatsAppStatus(status, data = {}) {
    io.to('admins').emit('whatsapp:status', { status, ...data });
}

// Exporta funções de notificação para uso em outros módulos
const notifications = {
    newMessage: notifyNewMessage,
    newAttendance: notifyNewAttendance,
    lowStock: notifyLowStock,
    whatsappStatus: notifyWhatsAppStatus
};

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

/**
 * Inicia o servidor
 * @returns {object} Instância do servidor HTTP
 */
async function startServer() {
    try {
        // Inicializa banco de dados
        await db.initPool();
        logger.info('✅ Banco de dados conectado');

        // Cria diretórios necessários
        const fs = require('fs');
        const dirs = ['uploads', 'public', 'logs'];
        for (const dir of dirs) {
            const dirPath = path.join(__dirname, '..', dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                logger.info(`📁 Diretório criado: ${dir}`);
            }
        }

        // Cria arquivo index.html básico se não existir
        const indexPath = path.join(__dirname, '../public/index.html');
        if (!fs.existsSync(indexPath)) {
            fs.writeFileSync(indexPath, getDefaultHtml());
            logger.info('📄 index.html padrão criado');
        }

        // Inicia servidor
        return new Promise((resolve, reject) => {
            httpServer.listen(PORT, HOST, () => {
                logger.info(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
                logger.info(`📡 Socket.IO disponível`);
                logger.info(`📁 Frontend servido de /public`);
                resolve(httpServer);
            });

            httpServer.on('error', (error) => {
                if (error.code === 'EADDRINUSE') {
                    logger.error(`❌ Porta ${PORT} já está em uso`);
                } else {
                    logger.error('❌ Erro ao iniciar servidor:', error.message);
                }
                reject(error);
            });
        });
    } catch (error) {
        logger.error('❌ Erro na inicialização do servidor:', error.message);
        throw error;
    }
}

/**
 * Para o servidor
 */
async function stopServer() {
    return new Promise((resolve) => {
        httpServer.close(() => {
            logger.info('🛑 Servidor encerrado');
            resolve();
        });
    });
}

/**
 * Retorna instância do Socket.IO
 * @returns {object} Instância do Socket.IO
 */
function getIO() {
    return io;
}

/**
 * Retorna HTML padrão do frontend
 * @returns {string} HTML
 */
function getDefaultHtml() {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel Admin - Loja Automotiva</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
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
            max-width: 500px;
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .emoji {
            font-size: 4em;
            margin-bottom: 20px;
        }
        p {
            color: rgba(255,255,255,0.8);
            margin-bottom: 30px;
            line-height: 1.6;
        }
        .status {
            display: inline-block;
            padding: 10px 20px;
            background: #00d26a;
            color: #fff;
            border-radius: 50px;
            font-weight: bold;
            margin-bottom: 20px;
        }
        .info {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 10px;
            text-align: left;
            font-size: 0.9em;
        }
        .info h3 {
            margin-bottom: 10px;
            color: #00d26a;
        }
        .info ul {
            list-style: none;
        }
        .info li {
            padding: 5px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .info li:last-child {
            border-bottom: none;
        }
        a {
            color: #00d26a;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
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
            <h3>📡 API Endpoints</h3>
            <ul>
                <li><strong>GET</strong> <a href="/api/health">/api/health</a> - Status do servidor</li>
                <li><strong>POST</strong> /api/auth/login - Autenticação</li>
                <li><strong>GET</strong> /api/dashboard/stats - Estatísticas</li>
                <li><strong>GET</strong> /api/products - Listar produtos</li>
                <li><strong>GET</strong> /api/services - Listar serviços</li>
                <li><strong>GET</strong> /api/customers - Listar clientes</li>
            </ul>
        </div>
        
        <p style="margin-top: 20px; font-size: 0.8em; opacity: 0.7;">
            Frontend completo em desenvolvimento...<br>
            Por enquanto, use a API diretamente.
        </p>
    </div>
</body>
</html>`;
}

// ============================================
// EXECUÇÃO STANDALONE
// ============================================

// Se executado diretamente (não importado)
if (require.main === module) {
    startServer()
        .then(() => {
            logger.info('✅ Servidor iniciado em modo standalone');
        })
        .catch((error) => {
            logger.error('❌ Falha ao iniciar servidor:', error.message);
            process.exit(1);
        });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        logger.info('Encerrando servidor...');
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