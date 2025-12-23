/**
 * ============================================
 * BOT WHATSAPP - LOJA AUTOMOTIVA
 * ============================================
 * 
 * Arquivo principal de inicialização.
 * Conecta todos os módulos e inicia o bot.
 * 
 * IMPORTANTE: O polyfill de crypto DEVE ser
 * a primeira coisa a executar no arquivo!
 */

// ============================================
// POLYFILL CRYPTO - PRIMEIRA COISA!
// ============================================
// Necessário para Railway e outros ambientes
// de produção onde globalThis.crypto não existe
// ============================================

const cryptoNode = require('crypto');

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          INICIALIZANDO POLYFILL DE CRYPTO                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// Verifica e aplica polyfill para globalThis.crypto
if (typeof globalThis.crypto === 'undefined') {
    console.log('🔐 [CRYPTO] globalThis.crypto não definido, aplicando polyfill...');
    
    // Para Node.js 16+, preferir webcrypto
    if (cryptoNode.webcrypto) {
        globalThis.crypto = cryptoNode.webcrypto;
        console.log('   ├─ ✅ Usando crypto.webcrypto (Node.js 16+)');
    } else {
        // Fallback para versões mais antigas do Node.js
        globalThis.crypto = {
            getRandomValues: (buffer) => {
                return cryptoNode.randomFillSync(buffer);
            },
            randomUUID: () => {
                if (cryptoNode.randomUUID) {
                    return cryptoNode.randomUUID();
                }
                // Fallback manual para randomUUID
                return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
                    (c ^ cryptoNode.randomBytes(1)[0] & 15 >> c / 4).toString(16)
                );
            },
            subtle: cryptoNode.subtle || null,
        };
        console.log('   ├─ ✅ Usando polyfill customizado');
    }
} else {
    console.log('🔐 [CRYPTO] globalThis.crypto já existe');
}

// Polyfill para global.crypto (compatibilidade adicional)
if (typeof global.crypto === 'undefined') {
    global.crypto = globalThis.crypto;
    console.log('🔐 [CRYPTO] global.crypto definido via polyfill');
} else {
    console.log('🔐 [CRYPTO] global.crypto já existe');
}

// Log de verificação final
console.log('');
console.log('🔐 [CRYPTO] Status final:');
console.log('   ├─ globalThis.crypto:', typeof globalThis.crypto !== 'undefined' ? '✅ Definido' : '❌ Indefinido');
console.log('   ├─ global.crypto:', typeof global.crypto !== 'undefined' ? '✅ Definido' : '❌ Indefinido');
console.log('   ├─ getRandomValues:', typeof globalThis.crypto?.getRandomValues === 'function' ? '✅ Disponível' : '❌ Indisponível');
console.log('   ├─ randomUUID:', typeof globalThis.crypto?.randomUUID === 'function' ? '✅ Disponível' : '❌ Indisponível');
console.log('   ├─ subtle:', globalThis.crypto?.subtle ? '✅ Disponível' : '⚠️ Indisponível (pode não ser necessário)');
console.log('   └─ Node.js version:', process.version);
console.log('');

// Teste rápido do crypto
try {
    const testBuffer = new Uint8Array(16);
    globalThis.crypto.getRandomValues(testBuffer);
    console.log('🔐 [CRYPTO] Teste getRandomValues: ✅ Funcionando');
    
    if (globalThis.crypto.randomUUID) {
        const testUUID = globalThis.crypto.randomUUID();
        console.log('🔐 [CRYPTO] Teste randomUUID: ✅ Funcionando -', testUUID);
    }
    
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('   ✅ POLYFILL DE CRYPTO APLICADO COM SUCESSO!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
} catch (cryptoTestError) {
    console.error('🔐 [CRYPTO] ❌ ERRO no teste do crypto:', cryptoTestError.message);
    console.error('   O bot pode não funcionar corretamente!');
    console.log('');
}

// ============================================
// IMPORTS (DEPOIS DO POLYFILL!)
// ============================================

require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./database/connection');
const whatsappService = require('./services/whatsappService');
const customerService = require('./services/customerService');
const messageHandler = require('./handlers/messageHandler');
const { settings } = require('./config/settings');

// Variável para controlar estado da aplicação
let isShuttingDown = false;

// Servidor web (opcional - para rodar junto com o bot)
let webServer = null;

/**
 * Exibe banner de inicialização
 */
function showBanner() {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚗  BOT WHATSAPP - LOJA AUTOMOTIVA  🚗                 ║
║                                                           ║
║   Atendimento automatizado via WhatsApp                   ║
║   Consulta de produtos e estoque em tempo real            ║
║   Agora com Inteligência Artificial! 🤖                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
}

/**
 * Exibe informações de configuração
 */
function showConfig() {
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`📌 Loja: ${settings.store.name}`);
    logger.info(`🤖 Bot: ${settings.bot.name}`);
    logger.info(`⏰ Horário: ${settings.schedule.startTime} às ${settings.schedule.endTime}`);
    logger.info(`📅 Dias: ${settings.schedule.workDays.join(', ')}`);
    logger.info(`🧠 IA: ${process.env.OPENAI_API_KEY ? 'Configurada ✅' : 'Não configurada ⚠️'}`);
    logger.info(`🌐 Servidor Web: ${process.env.START_WEB_SERVER === 'true' ? 'Habilitado' : 'Desabilitado'}`);
    logger.info(`🔐 Crypto: ${typeof globalThis.crypto !== 'undefined' ? 'Polyfill ativo ✅' : 'Nativo ✅'}`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Inicializa conexão com banco de dados
 */
async function initDatabase() {
    try {
        logger.info('🗄️  Conectando ao banco de dados...');
        await db.initPool();
        
        // Verifica se as tabelas existem
        const stats = await db.getStats();
        logger.info('✅ Banco de dados conectado!');
        logger.info(`   📦 Produtos: ${stats.produtos || 0}`);
        logger.info(`   🔧 Serviços: ${stats.servicos || 0}`);
        logger.info(`   👤 Clientes: ${stats.clientes || 0}`);
        
        return true;
    } catch (error) {
        logger.error('❌ Erro ao conectar ao banco de dados:', error.message);
        logger.error('Verifique as configurações no arquivo .env');
        return false;
    }
}

/**
 * Inicializa conexão com WhatsApp
 */
async function initWhatsApp() {
    try {
        logger.info('📱 Iniciando conexão com WhatsApp...');
        
        // Callback para processar mensagens recebidas
        const onMessage = async (messageData) => {
            await messageHandler.handleMessage(messageData);
        };

        await whatsappService.initialize(onMessage);
        
        return true;
    } catch (error) {
        logger.error('❌ Erro ao conectar ao WhatsApp:', error.message);
        return false;
    }
}

/**
 * Inicializa servidor web (opcional)
 */
async function initWebServer() {
    // Só inicia se configurado para rodar junto
    if (process.env.START_WEB_SERVER !== 'true') {
        return true;
    }

    try {
        logger.info('🌐 Iniciando servidor web...');
        
        // Importa e inicia o servidor
        const { startServer, getIO } = require('./server');
        webServer = await startServer();
        
        // Configura notificações em tempo real do WhatsApp para o painel
        whatsappService.setNotificationCallback((event, data) => {
            const io = getIO();
            if (io) {
                io.emit(event, data);
            }
        });
        
        logger.info(`✅ Servidor web rodando na porta ${process.env.SERVER_PORT || 3000}`);
        return true;
    } catch (error) {
        logger.error('❌ Erro ao iniciar servidor web:', error.message);
        logger.warn('⚠️  O bot continuará funcionando sem a interface web');
        return true; // Não bloqueia o bot se o servidor falhar
    }
}

/**
 * Verifica configuração da IA
 */
async function checkAIConfiguration() {
    if (!process.env.OPENAI_API_KEY) {
        logger.warn('⚠️  OPENAI_API_KEY não configurada');
        logger.warn('   O bot funcionará sem IA inteligente (modo básico)');
        logger.warn('   Configure a chave no arquivo .env para habilitar a IA');
        return false;
    }

    // Testa conexão com OpenAI
    try {
        const aiService = require('./services/aiService');
        const testResult = await aiService.testConnection();
        
        if (testResult.success) {
            logger.info('✅ Conexão com OpenAI verificada!');
            logger.info(`   Modelo: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
            return true;
        } else {
            logger.warn(`⚠️  Erro ao conectar com OpenAI: ${testResult.error}`);
            logger.warn('   O bot funcionará em modo básico');
            return false;
        }
    } catch (error) {
        logger.warn('⚠️  Não foi possível verificar a IA:', error.message);
        return false;
    }
}

/**
 * Configura limpeza periódica
 */
function setupPeriodicTasks() {
    // Limpa sessões expiradas a cada 5 minutos
    setInterval(async () => {
        if (!isShuttingDown) {
            try {
                await customerService.cleanExpiredSessions();
            } catch (error) {
                logger.error('Erro na limpeza de sessões:', error.message);
            }
        }
    }, 5 * 60 * 1000);

    // Verifica fila de atendimento a cada minuto
    setInterval(async () => {
        if (!isShuttingDown) {
            try {
                await messageHandler.checkPendingAttendances();
            } catch (error) {
                logger.error('Erro na verificação de atendimentos:', error.message);
            }
        }
    }, 60 * 1000);

    // Verifica estoque baixo a cada hora
    setInterval(async () => {
        if (!isShuttingDown) {
            try {
                await checkLowStock();
            } catch (error) {
                logger.error('Erro na verificação de estoque:', error.message);
            }
        }
    }, 60 * 60 * 1000);

    // Limpa logs antigos uma vez por dia (à meia-noite)
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
        if (logger.cleanOldLogs) {
            logger.cleanOldLogs(7); // Mantém últimos 7 dias
        }
        
        // Depois repete a cada 24 horas
        setInterval(() => {
            if (!isShuttingDown && logger.cleanOldLogs) {
                logger.cleanOldLogs(7);
            }
        }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    logger.info('⏰ Tarefas periódicas configuradas');
}

/**
 * Verifica produtos com estoque baixo
 */
async function checkLowStock() {
    try {
        const productService = require('./services/productService');
        const lowStockProducts = await productService.getLowStock();
        
        if (lowStockProducts.length > 0) {
            logger.warn(`⚠️  ${lowStockProducts.length} produto(s) com estoque baixo`);
            
            // Emite notificação para o painel web se estiver rodando
            if (webServer) {
                const { getIO } = require('./server');
                const io = getIO();
                if (io) {
                    io.emit('low_stock_alert', {
                        count: lowStockProducts.length,
                        products: lowStockProducts.slice(0, 5) // Envia os 5 primeiros
                    });
                }
            }
        }
    } catch (error) {
        // Silencioso se o serviço não existir ainda
    }
}

/**
 * Configura handlers para encerramento gracioso
 */
function setupShutdownHandlers() {
    const shutdown = async (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.info(`\n🛑 Recebido sinal ${signal}. Encerrando...`);

        try {
            // Fecha servidor web se estiver rodando
            if (webServer) {
                logger.info('🌐 Fechando servidor web...');
                await new Promise((resolve) => {
                    webServer.close(resolve);
                });
            }

            // Desconecta do WhatsApp
            logger.info('📱 Desconectando do WhatsApp...');
            await whatsappService.disconnect();

            // Fecha conexão com banco de dados
            logger.info('🗄️  Fechando conexão com banco de dados...');
            await db.closePool();

            logger.info('👋 Bot encerrado com sucesso!');
            process.exit(0);
        } catch (error) {
            logger.error('Erro ao encerrar:', error.message);
            process.exit(1);
        }
    };

    // Captura sinais de encerramento
    process.on('SIGINT', () => shutdown('SIGINT'));   // Ctrl+C
    process.on('SIGTERM', () => shutdown('SIGTERM')); // kill
    process.on('SIGHUP', () => shutdown('SIGHUP'));   // terminal fechado

    // Captura erros não tratados
    process.on('uncaughtException', (error) => {
        logger.error('❌ Erro não tratado:', error.message);
        logger.error(error.stack);
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('❌ Promise rejeitada não tratada:', reason);
        // Não encerra, apenas loga
    });
}

/**
 * Verifica requisitos do sistema
 */
function checkRequirements() {
    const nodeVersion = process.versions.node;
    const majorVersion = parseInt(nodeVersion.split('.')[0]);

    logger.info(`📋 Node.js versão: ${nodeVersion}`);

    if (majorVersion < 16) {
        logger.error(`❌ Node.js versão ${nodeVersion} não suportada.`);
        logger.error('   Versão mínima requerida: 16.0.0');
        logger.error('   Recomendado: 18.0.0 ou superior');
        logger.error('   Atualize o Node.js: https://nodejs.org/');
        return false;
    }

    if (majorVersion < 18) {
        logger.warn(`⚠️  Node.js ${nodeVersion} - Recomendado atualizar para 18+`);
    }

    // Verifica se crypto está funcionando
    if (typeof globalThis.crypto === 'undefined') {
        logger.error('❌ Crypto não está disponível!');
        logger.error('   O polyfill falhou. Verifique a configuração.');
        return false;
    }

    // Verifica variáveis de ambiente obrigatórias
    const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        logger.error('❌ Variáveis de ambiente faltando:');
        missing.forEach(key => logger.error(`   - ${key}`));
        logger.error('   Configure no arquivo .env');
        return false;
    }

    return true;
}

/**
 * Função principal de inicialização
 */
async function main() {
    try {
        // Exibe banner
        showBanner();

        // Verifica requisitos
        logger.info('🔍 Verificando requisitos...');
        if (!checkRequirements()) {
            process.exit(1);
        }
        logger.info('✅ Requisitos atendidos!');

        // Exibe configurações
        showConfig();

        // Configura handlers de encerramento
        setupShutdownHandlers();

        // Inicializa banco de dados
        const dbOk = await initDatabase();
        if (!dbOk) {
            logger.error('💀 Não foi possível conectar ao banco de dados.');
            logger.error('   Verifique se o MySQL está rodando e as credenciais estão corretas.');
            process.exit(1);
        }

        // Verifica configuração da IA
        await checkAIConfiguration();

        // Inicializa WhatsApp
        const whatsappOk = await initWhatsApp();
        if (!whatsappOk) {
            logger.error('💀 Não foi possível inicializar o WhatsApp.');
            process.exit(1);
        }

        // Inicializa servidor web (se configurado)
        await initWebServer();

        // Configura tarefas periódicas
        setupPeriodicTasks();

        // Exibe instruções
        logger.info('');
        logger.info('═══════════════════════════════════════════════════════════');
        logger.info('  🎉 BOT INICIADO COM SUCESSO!');
        logger.info('═══════════════════════════════════════════════════════════');
        logger.info('');
        logger.info('📱 Escaneie o QR Code acima com seu WhatsApp');
        logger.info('   (se ainda não estiver conectado)');
        logger.info('');
        
        if (process.env.START_WEB_SERVER === 'true') {
            logger.info(`🌐 Painel Admin: http://localhost:${process.env.SERVER_PORT || 3000}`);
            logger.info('');
        }
        
        logger.info('📋 Comandos do terminal:');
        logger.info('   Ctrl+C  - Encerrar o bot');
        logger.info('');
        
        if (logger.getLogFilePath) {
            logger.info('📝 Logs salvos em: ' + logger.getLogFilePath());
            logger.info('');
        }
        
        logger.info('💡 Aguardando mensagens...');
        logger.info('');

    } catch (error) {
        logger.error('❌ Erro fatal na inicialização:', error.message);
        logger.error(error.stack);
        process.exit(1);
    }
}

// Inicia a aplicação
main();

// Exporta para testes
module.exports = { main };
