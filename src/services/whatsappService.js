/**
 * ============================================
 * SERVIÇO DO WHATSAPP - VERSÃO DEBUG RAILWAY
 * ============================================
 * 
 * Versão com logs extensivos para diagnóstico
 * de problemas em ambiente de produção (Railway)
 * 
 * LOGS ADICIONADOS:
 * - Variáveis de ambiente
 * - Estados de conexão detalhados
 * - Análise completa de erros
 * - Informações de sistema
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    isJidGroup,
    isJidUser,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const os = require('os');
const qrcode = require('qrcode-terminal');

const logger = require('../utils/logger');
const { settings } = require('../config/settings');
const { sleep } = require('../utils/helpers');
const { formatPhoneForWhatsApp, extractPhoneFromJid } = require('../utils/formatter');

// ============================================
// LOG INICIAL DE AMBIENTE
// ============================================
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          WHATSAPP SERVICE - INICIALIZAÇÃO                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\n');

console.log('🔧 [ENV] Informações do Ambiente:');
console.log('   ├─ NODE_ENV:', process.env.NODE_ENV || 'não definido');
console.log('   ├─ Platform:', process.platform);
console.log('   ├─ Node Version:', process.version);
console.log('   ├─ Architecture:', process.arch);
console.log('   ├─ PID:', process.pid);
console.log('   ├─ CWD:', process.cwd());
console.log('   ├─ __dirname:', __dirname);
console.log('   ├─ Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
console.log('   ├─ Total Memory:', Math.round(os.totalmem() / 1024 / 1024), 'MB');
console.log('   ├─ Free Memory:', Math.round(os.freemem() / 1024 / 1024), 'MB');
console.log('   ├─ CPUs:', os.cpus().length);
console.log('   └─ Uptime:', Math.round(os.uptime() / 60), 'minutos');
console.log('\n');

// Instância do socket
let sock = null;

// Estado da conexão
let connectionState = {
    isConnected: false,
    qrCode: null,
    lastDisconnect: null,
    retryCount: 0,
    lastConnected: null,
    phoneNumber: null,
    isReconnecting: false,
    initializationAttempts: 0,
    lastError: null,
    connectionHistory: [], // NOVO: Histórico de conexões
};

// Máximo de tentativas de reconexão
const MAX_RETRY_COUNT = 5;

// Caminho para salvar credenciais - COM LOGS
const AUTH_PATH = process.env.AUTH_PATH || path.join(process.cwd(), 'auth');
console.log('🔧 [CONFIG] AUTH_PATH configurado:', AUTH_PATH);

// Verifica variável de ambiente customizada
if (process.env.AUTH_PATH) {
    console.log('   └─ ✅ Usando AUTH_PATH da variável de ambiente');
} else {
    console.log('   └─ ⚠️  Usando AUTH_PATH padrão (process.cwd()/auth)');
}

// Callback para mensagens recebidas
let messageCallback = null;

// Callback para notificações em tempo real
let notificationCallback = null;

/**
 * Define callback para notificações em tempo real (Socket.IO)
 */
function setNotificationCallback(callback) {
    if (typeof callback === 'function') {
        notificationCallback = callback;
        console.log('🔧 [CALLBACK] ✅ Callback de notificações configurado');
    } else {
        console.log('🔧 [CALLBACK] ⚠️ setNotificationCallback: callback inválido');
    }
}

/**
 * Envia notificação via callback (se definido)
 */
function sendNotification(event, data = {}) {
    if (notificationCallback && typeof notificationCallback === 'function') {
        try {
            notificationCallback(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
            console.log(`🔔 [NOTIFY] Evento enviado: ${event}`);
        } catch (error) {
            console.error('🔔 [NOTIFY] ❌ Erro ao enviar notificação:', error.message);
        }
    }
}

/**
 * Garante que a pasta de autenticação existe
 */
function ensureAuthDirectory() {
    console.log('\n📁 [AUTH] Verificando diretório de autenticação...');
    console.log('   ├─ Caminho:', AUTH_PATH);
    
    try {
        if (!fs.existsSync(AUTH_PATH)) {
            console.log('   ├─ Status: Não existe, criando...');
            fs.mkdirSync(AUTH_PATH, { recursive: true });
            console.log('   ├─ ✅ Diretório criado com sucesso');
        } else {
            console.log('   ├─ Status: ✅ Já existe');
        }
        
        // Verifica permissões
        fs.accessSync(AUTH_PATH, fs.constants.R_OK | fs.constants.W_OK);
        console.log('   ├─ Permissões: ✅ Leitura e escrita OK');
        
        // Lista conteúdo
        const files = fs.readdirSync(AUTH_PATH);
        console.log('   ├─ Arquivos encontrados:', files.length);
        if (files.length > 0) {
            files.forEach(file => {
                const filePath = path.join(AUTH_PATH, file);
                const stats = fs.statSync(filePath);
                console.log(`   │  └─ ${file} (${Math.round(stats.size / 1024)}KB)`);
            });
        } else {
            console.log('   │  └─ (vazio - será necessário escanear QR Code)');
        }
        
        // Verifica espaço em disco
        console.log('   └─ Diretório pronto para uso');
        
        return true;
    } catch (error) {
        console.error('   └─ ❌ ERRO:', error.message);
        console.error('      Código:', error.code);
        return false;
    }
}

/**
 * Limpa socket existente antes de reconectar
 */
function cleanupSocket() {
    console.log('\n🧹 [CLEANUP] Limpando socket anterior...');
    
    if (sock) {
        try {
            console.log('   ├─ Removendo listeners...');
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.ev.removeAllListeners('messages.upsert');
            sock.ev.removeAllListeners('presence.update');
            console.log('   ├─ ✅ Listeners removidos');
            
            if (sock.ws) {
                console.log('   ├─ Estado do WebSocket:', sock.ws.readyState);
                if (sock.ws.readyState === sock.ws.OPEN) {
                    console.log('   ├─ Fechando WebSocket...');
                    sock.ws.close();
                    console.log('   ├─ ✅ WebSocket fechado');
                }
            }
            
            console.log('   └─ ✅ Socket limpo com sucesso');
        } catch (error) {
            console.error('   └─ ⚠️ Erro ao limpar socket:', error.message);
        } finally {
            sock = null;
        }
    } else {
        console.log('   └─ ℹ️ Nenhum socket anterior para limpar');
    }
}

/**
 * Adiciona evento ao histórico de conexões
 */
function addToConnectionHistory(event, details = {}) {
    const historyEntry = {
        timestamp: new Date().toISOString(),
        event,
        details,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
    
    connectionState.connectionHistory.push(historyEntry);
    
    // Mantém apenas os últimos 50 eventos
    if (connectionState.connectionHistory.length > 50) {
        connectionState.connectionHistory.shift();
    }
}

/**
 * Inicializa a conexão com o WhatsApp
 */
async function initialize(onMessage = null) {
    connectionState.initializationAttempts++;
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          INICIANDO CONEXÃO COM WHATSAPP                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');
    
    console.log('🚀 [INIT] Tentativa de inicialização #', connectionState.initializationAttempts);
    console.log('   ├─ Timestamp:', new Date().toISOString());
    console.log('   ├─ isReconnecting:', connectionState.isReconnecting);
    console.log('   ├─ retryCount:', connectionState.retryCount);
    console.log('   ├─ isConnected:', connectionState.isConnected);
    console.log('   └─ Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
    
    addToConnectionHistory('init_start', { attempt: connectionState.initializationAttempts });

    try {
        // Previne inicializações simultâneas
        if (connectionState.isReconnecting) {
            console.log('\n⚠️ [INIT] Reconexão já em andamento, aguardando...');
            return null;
        }

        connectionState.isReconnecting = true;
        
        // Verifica diretório de autenticação
        const authReady = ensureAuthDirectory();
        if (!authReady) {
            throw new Error('Falha ao preparar diretório de autenticação');
        }
        
        // Salva callback de mensagens
        if (onMessage) {
            messageCallback = onMessage;
            console.log('\n📨 [INIT] Callback de mensagens configurado');
        }

        // Busca versão mais recente do Baileys
        console.log('\n📱 [BAILEYS] Buscando versão mais recente...');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log('   ├─ Versão:', version.join('.'));
        console.log('   ├─ É a mais recente:', isLatest ? 'Sim ✅' : 'Não ⚠️');
        console.log('   └─ Timestamp:', new Date().toISOString());
        
        addToConnectionHistory('baileys_version', { version: version.join('.'), isLatest });

        // Carrega credenciais salvas
        console.log('\n🔐 [AUTH] Carregando credenciais...');
        const startAuthLoad = Date.now();
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);
        const authLoadTime = Date.now() - startAuthLoad;
        console.log('   ├─ Tempo de carregamento:', authLoadTime, 'ms');
        console.log('   ├─ Credenciais carregadas:', state.creds ? 'Sim' : 'Não');
        console.log('   ├─ Has registered:', state.creds?.registered ? 'Sim' : 'Não');
        console.log('   └─ Account info:', state.creds?.me ? JSON.stringify(state.creds.me) : 'Não disponível');
        
        addToConnectionHistory('auth_loaded', { 
            loadTime: authLoadTime, 
            hasCredentials: !!state.creds,
            registered: state.creds?.registered 
        });

        // Limpa socket anterior
        cleanupSocket();

        // Configurações do socket
        const socketConfig = {
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            logger: pino({ level: process.env.DEBUG_BAILEYS === 'true' ? 'debug' : 'silent' }),
            browser: ['Bot Loja Automotiva', 'Chrome', '120.0.0'],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 120000,     // 2 minutos
            defaultQueryTimeoutMs: 120000, // 2 minutos
            keepAliveIntervalMs: 30000,    // 30 segundos
            emitOwnEvents: false,
            fireInitQueries: true,
            getMessage: async (key) => {
                return { conversation: '' };
            },
            // NOVO: Configurações adicionais para Railway
            retryRequestDelayMs: 2000,
            maxMsgRetryCount: 5,
            qrTimeout: 60000, // 60 segundos para QR
        };
        
        console.log('\n⚙️ [SOCKET] Configuração do socket:');
        console.log('   ├─ connectTimeoutMs:', socketConfig.connectTimeoutMs);
        console.log('   ├─ defaultQueryTimeoutMs:', socketConfig.defaultQueryTimeoutMs);
        console.log('   ├─ keepAliveIntervalMs:', socketConfig.keepAliveIntervalMs);
        console.log('   ├─ retryRequestDelayMs:', socketConfig.retryRequestDelayMs);
        console.log('   ├─ maxMsgRetryCount:', socketConfig.maxMsgRetryCount);
        console.log('   ├─ qrTimeout:', socketConfig.qrTimeout);
        console.log('   └─ browser:', socketConfig.browser.join(' / '));

        // Cria socket do WhatsApp
        console.log('\n🔌 [SOCKET] Criando conexão...');
        const startSocketCreate = Date.now();
        sock = makeWASocket(socketConfig);
        const socketCreateTime = Date.now() - startSocketCreate;
        console.log('   ├─ Socket criado em:', socketCreateTime, 'ms');
        console.log('   └─ Socket exists:', !!sock);
        
        addToConnectionHistory('socket_created', { createTime: socketCreateTime });

        // Configura handlers de eventos
        setupEventHandlers(sock, saveCreds);

        console.log('\n✅ [INIT] Inicialização concluída, aguardando conexão...');
        console.log('   └─ Próximo passo: Escanear QR Code ou conexão automática\n');
        
        return sock;
    } catch (error) {
        console.error('\n❌ [INIT] ERRO CRÍTICO NA INICIALIZAÇÃO:');
        console.error('   ├─ Mensagem:', error.message);
        console.error('   ├─ Nome:', error.name);
        console.error('   ├─ Stack:', error.stack);
        console.error('   └─ Timestamp:', new Date().toISOString());
        
        connectionState.isReconnecting = false;
        connectionState.lastError = error.message;
        
        addToConnectionHistory('init_error', { 
            error: error.message, 
            stack: error.stack 
        });
        
        throw error;
    }
}

/**
 * Analisa código de desconexão e retorna informações detalhadas
 */
function analyzeDisconnect(lastDisconnect) {
    console.log('\n🔍 [DISCONNECT] Analisando desconexão...');
    console.log('   ├─ lastDisconnect existe:', !!lastDisconnect);
    
    if (lastDisconnect) {
        console.log('   ├─ lastDisconnect.error existe:', !!lastDisconnect.error);
        if (lastDisconnect.error) {
            console.log('   ├─ error.message:', lastDisconnect.error.message);
            console.log('   ├─ error.output:', JSON.stringify(lastDisconnect.error.output || {}));
            console.log('   ├─ error.data:', JSON.stringify(lastDisconnect.error.data || {}));
        }
    }
    
    const result = {
        statusCode: null,
        reason: 'Desconhecido',
        shouldReconnect: false,
        shouldLogout: false,
        rawError: lastDisconnect?.error?.message || null,
    };

    if (!lastDisconnect) {
        console.log('   └─ ⚠️ lastDisconnect está undefined/null');
        result.shouldReconnect = true; // Em caso de dúvida, tenta reconectar
        return result;
    }

    // Tenta extrair statusCode de diferentes localizações
    const statusCode = lastDisconnect?.error?.output?.statusCode 
        || lastDisconnect?.error?.statusCode
        || lastDisconnect?.statusCode
        || lastDisconnect?.error?.output?.payload?.statusCode
        || null;

    result.statusCode = statusCode;
    console.log('   ├─ StatusCode extraído:', statusCode);

    // Mapeia códigos de desconexão conhecidos
    const disconnectReasons = {
        [DisconnectReason.badSession]: { text: 'Sessão inválida', reconnect: false, logout: true },
        [DisconnectReason.connectionClosed]: { text: 'Conexão fechada', reconnect: true, logout: false },
        [DisconnectReason.connectionLost]: { text: 'Conexão perdida', reconnect: true, logout: false },
        [DisconnectReason.connectionReplaced]: { text: 'Conectado em outro lugar', reconnect: false, logout: true },
        [DisconnectReason.loggedOut]: { text: 'Logout do WhatsApp', reconnect: false, logout: true },
        [DisconnectReason.restartRequired]: { text: 'Reinício necessário', reconnect: true, logout: false },
        [DisconnectReason.timedOut]: { text: 'Timeout de conexão', reconnect: true, logout: false },
        [DisconnectReason.unavailableService]: { text: 'Serviço indisponível', reconnect: true, logout: false },
        [DisconnectReason.multideviceMismatch]: { text: 'Incompatibilidade multi-device', reconnect: false, logout: true },
    };

    // Log todos os DisconnectReason conhecidos
    console.log('   ├─ DisconnectReason values:');
    console.log('   │  ├─ badSession:', DisconnectReason.badSession);
    console.log('   │  ├─ connectionClosed:', DisconnectReason.connectionClosed);
    console.log('   │  ├─ connectionLost:', DisconnectReason.connectionLost);
    console.log('   │  ├─ connectionReplaced:', DisconnectReason.connectionReplaced);
    console.log('   │  ├─ loggedOut:', DisconnectReason.loggedOut);
    console.log('   │  ├─ restartRequired:', DisconnectReason.restartRequired);
    console.log('   │  ├─ timedOut:', DisconnectReason.timedOut);
    console.log('   │  └─ unavailableService:', DisconnectReason.unavailableService);

    if (statusCode && disconnectReasons[statusCode]) {
        const reasonInfo = disconnectReasons[statusCode];
        result.reason = reasonInfo.text;
        result.shouldReconnect = reasonInfo.reconnect;
        result.shouldLogout = reasonInfo.logout;
        console.log(`   ├─ Razão mapeada: ${reasonInfo.text}`);
        console.log(`   ├─ Deve reconectar: ${reasonInfo.reconnect}`);
        console.log(`   └─ Deve fazer logout: ${reasonInfo.logout}`);
    } else if (statusCode) {
        result.reason = `Código desconhecido: ${statusCode}`;
        result.shouldReconnect = true; // Tenta reconectar para códigos desconhecidos
        console.log(`   └─ ⚠️ Código não mapeado: ${statusCode}, tentando reconectar`);
    } else {
        // Se não há statusCode, analisa a mensagem de erro
        const errorMessage = lastDisconnect?.error?.message || 'Sem mensagem de erro';
        result.reason = errorMessage;
        result.shouldReconnect = true; // Em caso de dúvida, tenta reconectar
        console.log(`   └─ ⚠️ Sem statusCode, usando mensagem: ${errorMessage}`);
    }

    addToConnectionHistory('disconnect_analyzed', result);

    return result;
}

/**
 * Configura handlers de eventos do socket
 */
function setupEventHandlers(socket, saveCreds) {
    console.log('\n📡 [EVENTS] Configurando handlers de eventos...');

    // Evento de atualização de conexão
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;

        const timestamp = new Date().toISOString();
        console.log('\n');
        console.log('┌──────────────────────────────────────────────────────────────┐');
        console.log('│                 CONNECTION UPDATE                             │');
        console.log('└──────────────────────────────────────────────────────────────┘');
        console.log('   ├─ Timestamp:', timestamp);
        console.log('   ├─ connection:', connection || '(não definido)');
        console.log('   ├─ hasQR:', !!qr);
        console.log('   ├─ hasLastDisconnect:', !!lastDisconnect);
        console.log('   ├─ isNewLogin:', isNewLogin);
        console.log('   ├─ receivedPendingNotifications:', receivedPendingNotifications);
        console.log('   ├─ Estado atual - isConnected:', connectionState.isConnected);
        console.log('   ├─ Estado atual - retryCount:', connectionState.retryCount);
        console.log('   └─ Estado atual - isReconnecting:', connectionState.isReconnecting);

        addToConnectionHistory('connection_update', { 
            connection, 
            hasQR: !!qr, 
            hasLastDisconnect: !!lastDisconnect,
            isNewLogin 
        });

        // QR Code gerado
        if (qr) {
            connectionState.qrCode = qr;
            console.log('\n');
            console.log('╔══════════════════════════════════════════════════════════════╗');
            console.log('║       📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP          ║');
            console.log('╚══════════════════════════════════════════════════════════════╝');
            console.log('\n');
            qrcode.generate(qr, { small: true });
            console.log('\n');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('   📲 WhatsApp > Menu (⋮) > Aparelhos conectados');
            console.log('   📲 Toque em "Conectar um aparelho"');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('   ⏳ Aguardando escaneamento...');
            console.log('   ⏰ Timeout do QR:', '60 segundos');
            console.log('═══════════════════════════════════════════════════════════════');
            console.log('\n');

            sendNotification('whatsapp:qr', { qrCode: qr });
            addToConnectionHistory('qr_generated');
        }

        // Conexão estabelecida
        if (connection === 'open') {
            console.log('\n');
            console.log('╔══════════════════════════════════════════════════════════════╗');
            console.log('║              ✅ CONECTADO COM SUCESSO!                       ║');
            console.log('╚══════════════════════════════════════════════════════════════╝');
            
            connectionState.isConnected = true;
            connectionState.qrCode = null;
            connectionState.retryCount = 0;
            connectionState.lastConnected = new Date().toISOString();
            connectionState.isReconnecting = false;
            connectionState.lastError = null;
            
            if (socket.user) {
                connectionState.phoneNumber = socket.user.id.split(':')[0];
                console.log('   ├─ Número conectado:', connectionState.phoneNumber);
                console.log('   ├─ JID completo:', socket.user.id);
                console.log('   ├─ Nome:', socket.user.name || '(não disponível)');
            }
            
            console.log('   ├─ Timestamp:', connectionState.lastConnected);
            console.log('   ├─ Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
            console.log('   └─ Status: Aguardando mensagens...');
            console.log('\n');

            logger.whatsappStatus('Conectado com sucesso! ✅');

            sendNotification('whatsapp:connected', {
                phoneNumber: connectionState.phoneNumber,
                lastConnected: connectionState.lastConnected
            });
            
            addToConnectionHistory('connected', {
                phoneNumber: connectionState.phoneNumber
            });
        }

        // Conexão fechada
        if (connection === 'close') {
            console.log('\n');
            console.log('╔══════════════════════════════════════════════════════════════╗');
            console.log('║              ⚠️ CONEXÃO FECHADA                              ║');
            console.log('╚══════════════════════════════════════════════════════════════╝');
            
            connectionState.isConnected = false;
            connectionState.lastDisconnect = lastDisconnect;

            const disconnectInfo = analyzeDisconnect(lastDisconnect);
            
            console.log('\n📊 [STATUS] Resumo da desconexão:');
            console.log('   ├─ Razão:', disconnectInfo.reason);
            console.log('   ├─ Código:', disconnectInfo.statusCode || 'undefined');
            console.log('   ├─ Erro raw:', disconnectInfo.rawError || 'N/A');
            console.log('   ├─ Deve reconectar:', disconnectInfo.shouldReconnect);
            console.log('   ├─ Deve fazer logout:', disconnectInfo.shouldLogout);
            console.log('   ├─ Tentativa atual:', connectionState.retryCount);
            console.log('   └─ Máximo tentativas:', MAX_RETRY_COUNT);

            sendNotification('whatsapp:disconnected', {
                statusCode: disconnectInfo.statusCode,
                reason: disconnectInfo.reason,
                willReconnect: disconnectInfo.shouldReconnect
            });

            // Trata logout
            if (disconnectInfo.shouldLogout) {
                console.log('\n❌ [LOGOUT] Sessão inválida ou logout detectado');
                console.log('   ├─ Ação: Removendo credenciais...');
                
                if (fs.existsSync(AUTH_PATH)) {
                    try {
                        fs.rmSync(AUTH_PATH, { recursive: true, force: true });
                        console.log('   ├─ ✅ Credenciais removidas');
                    } catch (err) {
                        console.log('   ├─ ❌ Erro ao remover credenciais:', err.message);
                    }
                }

                connectionState.isReconnecting = false;
                console.log('   └─ ℹ️ Necessário escanear QR Code novamente');
                
                sendNotification('whatsapp:logged_out', {
                    message: 'Necessário escanear QR Code novamente'
                });
                
                addToConnectionHistory('logged_out', { reason: disconnectInfo.reason });
                
                // Reinicia para gerar novo QR após um delay
                console.log('\n🔄 [RESTART] Reiniciando para gerar novo QR Code em 5s...');
                setTimeout(async () => {
                    await initialize(messageCallback);
                }, 5000);
                
                return;
            }

            // Trata reconexão
            if (disconnectInfo.shouldReconnect && connectionState.retryCount < MAX_RETRY_COUNT) {
                connectionState.retryCount++;
                
                const delay = Math.min(2000 * Math.pow(2, connectionState.retryCount - 1), 30000);
                
                console.log('\n🔄 [RECONNECT] Preparando reconexão...');
                console.log('   ├─ Tentativa:', connectionState.retryCount, '/', MAX_RETRY_COUNT);
                console.log('   ├─ Delay:', delay / 1000, 'segundos');
                console.log('   ├─ Próxima tentativa:', new Date(Date.now() + delay).toISOString());
                console.log('   └─ Razão:', disconnectInfo.reason);
                
                sendNotification('whatsapp:reconnecting', {
                    attempt: connectionState.retryCount,
                    maxAttempts: MAX_RETRY_COUNT,
                    delayMs: delay,
                    reason: disconnectInfo.reason
                });
                
                addToConnectionHistory('reconnecting', {
                    attempt: connectionState.retryCount,
                    delay,
                    reason: disconnectInfo.reason
                });

                await sleep(delay);
                
                if (connectionState.retryCount <= MAX_RETRY_COUNT && !connectionState.isConnected) {
                    console.log('\n🚀 [RECONNECT] Iniciando tentativa de reconexão...');
                    connectionState.isReconnecting = false; // Reset antes de chamar initialize
                    await initialize(messageCallback);
                } else {
                    connectionState.isReconnecting = false;
                    console.log('\n⚠️ [RECONNECT] Reconexão cancelada (já conectado ou limite atingido)');
                }
            } else if (connectionState.retryCount >= MAX_RETRY_COUNT) {
                console.log('\n❌ [RECONNECT] Máximo de tentativas de reconexão atingido');
                console.log('   ├─ Tentativas:', connectionState.retryCount);
                console.log('   ├─ Máximo:', MAX_RETRY_COUNT);
                console.log('   └─ Ação: Aguardando intervenção manual ou reinício do serviço');
                
                connectionState.isReconnecting = false;
                
                sendNotification('whatsapp:connection_failed', {
                    message: 'Máximo de tentativas de reconexão atingido',
                    attempts: connectionState.retryCount
                });
                
                addToConnectionHistory('max_retries_reached', {
                    attempts: connectionState.retryCount
                });
            } else {
                connectionState.isReconnecting = false;
                console.log('\n⚠️ [RECONNECT] Reconexão não será tentada');
                console.log('   └─ Razão: shouldReconnect =', disconnectInfo.shouldReconnect);
            }
        }

        // Estado "connecting"
        if (connection === 'connecting') {
            console.log('\n🔄 [CONNECTION] Estado: Conectando ao WhatsApp...');
            console.log('   ├─ Timestamp:', new Date().toISOString());
            console.log('   └─ Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
            
            addToConnectionHistory('connecting');
        }
    });

    // Evento de atualização de credenciais
    socket.ev.on('creds.update', async () => {
        console.log('🔐 [CREDS] Credenciais atualizadas, salvando...');
        try {
            await saveCreds();
            console.log('   └─ ✅ Credenciais salvas com sucesso');
        } catch (error) {
            console.error('   └─ ❌ Erro ao salvar credenciais:', error.message);
        }
    });

    // Evento de mensagens recebidas
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        console.log(`\n📨 [MSG] Mensagens recebidas: ${messages.length}, tipo: ${type}`);
        
        if (type !== 'notify') {
            console.log('   └─ Ignorando (não é notificação)');
            return;
        }

        for (const msg of messages) {
            await handleIncomingMessage(msg);
        }
    });

    // Evento de presença
    socket.ev.on('presence.update', ({ id, presences }) => {
        // Log mínimo para presença
        // console.log(`👤 [PRESENCE] Atualização de presença: ${id}`);
    });

    console.log('   └─ ✅ Todos os handlers configurados\n');
}

/**
 * Processa mensagem recebida
 */
async function handleIncomingMessage(msg) {
    try {
        if (msg.key.fromMe) return;
        if (isJidBroadcast(msg.key.remoteJid)) return;
        if (isJidGroup(msg.key.remoteJid)) return;

        const messageData = extractMessageData(msg);
        
        if (!messageData.text) return;

        console.log(`\n📩 [MSG IN] Nova mensagem:`);
        console.log(`   ├─ De: ${messageData.phone}`);
        console.log(`   ├─ Nome: ${messageData.pushName || '(não disponível)'}`);
        console.log(`   ├─ Tipo: ${messageData.type}`);
        console.log(`   └─ Texto: ${messageData.text.substring(0, 50)}${messageData.text.length > 50 ? '...' : ''}`);

        logger.messageReceived(messageData.phone, messageData.text);

        sendNotification('message:received', {
            phone: messageData.phone,
            text: messageData.text,
            pushName: messageData.pushName,
            type: messageData.type
        });

        if (messageCallback) {
            await messageCallback(messageData);
        }
    } catch (error) {
        console.error('❌ [MSG] Erro ao processar mensagem:', error.message);
    }
}

/**
 * Extrai dados relevantes da mensagem
 */
function extractMessageData(msg) {
    const messageContent = msg.message;
    
    let text = '';
    let type = 'unknown';

    if (messageContent?.conversation) {
        text = messageContent.conversation;
        type = 'text';
    } else if (messageContent?.extendedTextMessage?.text) {
        text = messageContent.extendedTextMessage.text;
        type = 'text';
    } else if (messageContent?.imageMessage?.caption) {
        text = messageContent.imageMessage.caption;
        type = 'image';
    } else if (messageContent?.videoMessage?.caption) {
        text = messageContent.videoMessage.caption;
        type = 'video';
    } else if (messageContent?.documentMessage?.caption) {
        text = messageContent.documentMessage.caption;
        type = 'document';
    } else if (messageContent?.buttonsResponseMessage?.selectedButtonId) {
        text = messageContent.buttonsResponseMessage.selectedButtonId;
        type = 'button_response';
    } else if (messageContent?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        text = messageContent.listResponseMessage.singleSelectReply.selectedRowId;
        type = 'list_response';
    }

    return {
        id: msg.key.id,
        phone: extractPhoneFromJid(msg.key.remoteJid),
        jid: msg.key.remoteJid,
        text: text.trim(),
        type,
        timestamp: msg.messageTimestamp,
        pushName: msg.pushName || '',
        isGroup: isJidGroup(msg.key.remoteJid),
        raw: msg,
    };
}

/**
 * Envia mensagem de texto
 */
async function sendMessage(to, message) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        if (settings.bot.typingDelay > 0) {
            await sock.sendPresenceUpdate('composing', jid);
            await sleep(settings.bot.typingDelay);
        }

        const result = await sock.sendMessage(jid, { text: message });

        await sock.sendPresenceUpdate('paused', jid);

        console.log(`\n📤 [MSG OUT] Mensagem enviada:`);
        console.log(`   ├─ Para: ${extractPhoneFromJid(jid)}`);
        console.log(`   └─ Texto: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

        logger.messageSent(extractPhoneFromJid(jid), message);

        sendNotification('message:sent', {
            phone: extractPhoneFromJid(jid),
            text: message,
            messageId: result.key.id
        });

        return {
            success: true,
            messageId: result.key.id,
            timestamp: result.messageTimestamp,
        };
    } catch (error) {
        console.error('❌ [MSG OUT] Erro ao enviar mensagem:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia múltiplas mensagens
 */
async function sendMultipleMessages(to, messages) {
    const results = [];

    for (const message of messages) {
        const result = await sendMessage(to, message);
        results.push(result);
        
        if (settings.bot.messageDelay > 0 && messages.indexOf(message) < messages.length - 1) {
            await sleep(settings.bot.messageDelay);
        }
    }

    return results;
}

/**
 * Envia imagem com legenda
 */
async function sendImage(to, image, caption = '') {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        let imageBuffer;
        if (typeof image === 'string') {
            imageBuffer = fs.readFileSync(image);
        } else {
            imageBuffer = image;
        }

        const result = await sock.sendMessage(jid, {
            image: imageBuffer,
            caption,
        });

        console.log(`📷 [IMG OUT] Imagem enviada para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        console.error('❌ [IMG OUT] Erro ao enviar imagem:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia mídia
 */
async function sendMedia(to, mediaUrl, caption = '', type = 'image') {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        let mediaBuffer;
        if (mediaUrl.startsWith('http')) {
            const response = await fetch(mediaUrl);
            mediaBuffer = Buffer.from(await response.arrayBuffer());
        } else {
            mediaBuffer = fs.readFileSync(mediaUrl);
        }

        let messageContent = {};
        
        switch (type) {
            case 'image':
                messageContent = { image: mediaBuffer, caption };
                break;
            case 'video':
                messageContent = { video: mediaBuffer, caption };
                break;
            case 'document':
                messageContent = { 
                    document: mediaBuffer, 
                    caption,
                    fileName: path.basename(mediaUrl) || 'documento'
                };
                break;
            case 'audio':
                messageContent = { audio: mediaBuffer, mimetype: 'audio/mp4' };
                break;
            default:
                messageContent = { image: mediaBuffer, caption };
        }

        const result = await sock.sendMessage(jid, messageContent);

        console.log(`📎 [MEDIA OUT] Mídia (${type}) enviada para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        console.error('❌ [MEDIA OUT] Erro ao enviar mídia:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia localização
 */
async function sendLocation(to, location) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        const latitude = location.latitude || location;
        const longitude = location.longitude || arguments[2];
        const name = location.name || arguments[3] || '';
        const address = location.address || '';

        const result = await sock.sendMessage(jid, {
            location: {
                degreesLatitude: latitude,
                degreesLongitude: longitude,
                name,
                address,
            },
        });

        console.log(`📍 [LOC OUT] Localização enviada para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        console.error('❌ [LOC OUT] Erro ao enviar localização:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia contato
 */
async function sendContact(to, contact, phone = null) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        const name = typeof contact === 'object' ? contact.name : contact;
        const contactPhone = typeof contact === 'object' ? contact.phone : phone;

        const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${name}
TEL;type=CELL;type=VOICE;waid=${contactPhone}:+${contactPhone}
END:VCARD`;

        const result = await sock.sendMessage(jid, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }],
            },
        });

        console.log(`👤 [CONTACT OUT] Contato enviado para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        console.error('❌ [CONTACT OUT] Erro ao enviar contato:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Marca mensagem como lida
 */
async function markAsRead(msg) {
    try {
        if (!sock || !connectionState.isConnected) return;

        await sock.readMessages([{
            remoteJid: msg.jid,
            id: msg.id,
            participant: undefined,
        }]);
    } catch (error) {
        // Silencioso
    }
}

/**
 * Atualiza status de presença
 */
async function updatePresence(to, presence = 'composing') {
    try {
        if (!sock || !connectionState.isConnected) return;

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);
        await sock.sendPresenceUpdate(presence, jid);
    } catch (error) {
        // Silencioso
    }
}

/**
 * Verifica se um número tem WhatsApp
 */
async function checkNumberExists(phone) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = formatPhoneForWhatsApp(phone);
        const [result] = await sock.onWhatsApp(jid);
        
        return result?.exists || false;
    } catch (error) {
        console.error('❌ [CHECK] Erro ao verificar número:', error.message);
        return false;
    }
}

/**
 * Obtém informações do perfil
 */
async function getProfileInfo(phone) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = formatPhoneForWhatsApp(phone);
        
        const status = await sock.fetchStatus(jid).catch(() => null);
        const profilePic = await sock.profilePictureUrl(jid, 'image').catch(() => null);

        return {
            phone,
            status: status?.status || '',
            profilePicture: profilePic,
        };
    } catch (error) {
        return {
            phone,
            status: '',
            profilePicture: null,
        };
    }
}

/**
 * Obtém foto de perfil
 */
async function getProfilePicture(phone) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = formatPhoneForWhatsApp(phone);
        return await sock.profilePictureUrl(jid, 'image');
    } catch (error) {
        return null;
    }
}

/**
 * Obtém perfil do contato
 */
async function getContactProfile(phone) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = formatPhoneForWhatsApp(phone);
        
        const [exists] = await sock.onWhatsApp(jid);
        const status = await sock.fetchStatus(jid).catch(() => null);
        const profilePic = await sock.profilePictureUrl(jid, 'image').catch(() => null);

        return {
            phone,
            exists: exists?.exists || false,
            jid: exists?.jid || jid,
            status: status?.status || '',
            profilePicture: profilePic,
        };
    } catch (error) {
        return {
            phone,
            exists: false,
            status: '',
            profilePicture: null,
        };
    }
}

/**
 * Retorna estado atual da conexão
 */
function getConnectionState() {
    return {
        ...connectionState,
        socketExists: sock !== null,
    };
}

/**
 * Retorna status da conexão (formato para API)
 */
async function getConnectionStatus() {
    return {
        connected: connectionState.isConnected,
        status: connectionState.isConnected ? 'connected' : 'disconnected',
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        qrCode: connectionState.qrCode,
        retryCount: connectionState.retryCount,
        lastError: connectionState.lastError,
        uptime: connectionState.lastConnected 
            ? Date.now() - new Date(connectionState.lastConnected).getTime() 
            : null,
        connectionHistory: connectionState.connectionHistory.slice(-10), // Últimos 10 eventos
    };
}

/**
 * Retorna o QR Code atual
 */
async function getQRCode() {
    return connectionState.qrCode;
}

/**
 * Retorna informações do dispositivo conectado
 */
async function getDeviceInfo() {
    if (!sock || !connectionState.isConnected) {
        return null;
    }

    return {
        phoneNumber: connectionState.phoneNumber,
        platform: sock.user?.platform || 'unknown',
        pushName: sock.user?.name || '',
        jid: sock.user?.id || '',
    };
}

/**
 * Verifica se está conectado
 */
function isConnected() {
    return connectionState.isConnected && sock !== null;
}

/**
 * Inicia conexão com WhatsApp
 */
async function connect() {
    if (connectionState.isConnected) {
        console.log('⚠️ [CONNECT] WhatsApp já está conectado');
        return;
    }
    
    await initialize(messageCallback);
}

/**
 * Desconecta do WhatsApp
 */
async function disconnect() {
    try {
        console.log('\n👋 [DISCONNECT] Desconectando do WhatsApp...');
        
        if (sock) {
            await sock.logout();
            cleanupSocket();
            connectionState.isConnected = false;
            connectionState.isReconnecting = false;
            console.log('   └─ ✅ Desconectado com sucesso');
            
            sendNotification('whatsapp:disconnected', {
                reason: 'manual'
            });
        }
    } catch (error) {
        console.error('   └─ ❌ Erro ao desconectar:', error.message);
    }
}

/**
 * Faz logout do WhatsApp (remove sessão)
 */
async function logout() {
    try {
        console.log('\n🚪 [LOGOUT] Fazendo logout do WhatsApp...');
        
        if (sock) {
            await sock.logout();
        }
        
        if (fs.existsSync(AUTH_PATH)) {
            fs.rmSync(AUTH_PATH, { recursive: true, force: true });
            console.log('   ├─ ✅ Credenciais removidas');
        }

        cleanupSocket();
        connectionState.isConnected = false;
        connectionState.qrCode = null;
        connectionState.phoneNumber = null;
        connectionState.isReconnecting = false;

        sendNotification('whatsapp:logged_out', {
            message: 'Sessão encerrada'
        });

        console.log('   └─ ✅ Logout realizado');
    } catch (error) {
        console.error('   └─ ❌ Erro ao fazer logout:', error.message);
        throw error;
    }
}

/**
 * Reinicia a conexão
 */
async function restart() {
    console.log('\n🔄 [RESTART] Reiniciando conexão...');
    
    sendNotification('whatsapp:restarting', {});

    cleanupSocket();
    
    connectionState.isConnected = false;
    connectionState.retryCount = 0;
    connectionState.isReconnecting = false;
    
    await sleep(2000);
    await initialize(messageCallback);
}

/**
 * Obtém o socket atual
 */
function getSocket() {
    return sock;
}

/**
 * Formata número de telefone para WhatsApp
 */
function formatPhoneNumber(phone) {
    return formatPhoneForWhatsApp(phone);
}

/**
 * Obtém estatísticas do WhatsApp
 */
async function getStats() {
    return {
        connected: connectionState.isConnected,
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        retryCount: connectionState.retryCount,
        initializationAttempts: connectionState.initializationAttempts,
        lastError: connectionState.lastError,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime: connectionState.lastConnected 
            ? Math.floor((Date.now() - new Date(connectionState.lastConnected).getTime()) / 1000)
            : 0,
    };
}

/**
 * Obtém estatísticas de mensagens
 */
async function getMessageStats(period = 'today') {
    return {
        period,
        sent: 0,
        received: 0,
        failed: 0,
    };
}

/**
 * Lista grupos do WhatsApp
 */
async function getGroups() {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(group => ({
            id: group.id,
            name: group.subject,
            participants: group.participants?.length || 0,
            creation: group.creation,
            owner: group.owner,
        }));
    } catch (error) {
        console.error('❌ [GROUPS] Erro ao listar grupos:', error.message);
        return [];
    }
}

/**
 * Obtém informações de um grupo
 */
async function getGroupInfo(groupId) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const metadata = await sock.groupMetadata(groupId);
        return {
            id: metadata.id,
            name: metadata.subject,
            description: metadata.desc || '',
            owner: metadata.owner,
            creation: metadata.creation,
            participants: metadata.participants,
            participantCount: metadata.participants?.length || 0,
        };
    } catch (error) {
        console.error('❌ [GROUP INFO] Erro ao obter informações do grupo:', error.message);
        return null;
    }
}

/**
 * Lista templates de mensagem
 */
async function getMessageTemplates() {
    return [];
}

/**
 * Cria template de mensagem
 */
async function createMessageTemplate(template) {
    console.log(`📝 [TEMPLATE] Template criado: ${template.name}`);
    return Date.now();
}

/**
 * Atualiza template de mensagem
 */
async function updateMessageTemplate(id, data) {
    console.log(`📝 [TEMPLATE] Template atualizado: ${id}`);
    return true;
}

/**
 * Remove template de mensagem
 */
async function deleteMessageTemplate(id) {
    console.log(`📝 [TEMPLATE] Template removido: ${id}`);
    return true;
}

/**
 * Obtém configurações do WhatsApp
 */
async function getConfig() {
    return {
        typingDelay: settings.bot.typingDelay,
        messageDelay: settings.bot.messageDelay,
        autoReconnect: true,
        maxRetries: MAX_RETRY_COUNT,
        authPath: AUTH_PATH,
    };
}

/**
 * Atualiza configurações do WhatsApp
 */
async function updateConfig(config) {
    console.log('⚙️ [CONFIG] Configurações do WhatsApp atualizadas');
}

/**
 * Processa mensagem recebida via webhook
 */
async function processWebhookMessage(data) {
    console.log('🔗 [WEBHOOK] Processando mensagem de webhook:', data);
}

/**
 * Processa status de mensagem via webhook
 */
async function processMessageStatus(data) {
    console.log('🔗 [WEBHOOK] Processando status de mensagem:', data);
}

/**
 * NOVO: Obtém histórico de conexões
 */
function getConnectionHistory() {
    return connectionState.connectionHistory;
}

/**
 * NOVO: Diagnóstico completo
 */
async function getDiagnostics() {
    return {
        environment: {
            nodeEnv: process.env.NODE_ENV,
            platform: process.platform,
            nodeVersion: process.version,
            arch: process.arch,
            pid: process.pid,
            cwd: process.cwd(),
            authPath: AUTH_PATH,
        },
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        },
        system: {
            totalMem: Math.round(os.totalmem() / 1024 / 1024),
            freeMem: Math.round(os.freemem() / 1024 / 1024),
            cpus: os.cpus().length,
            uptime: Math.round(os.uptime() / 60),
        },
        connection: {
            ...connectionState,
            socketExists: sock !== null,
        },
        auth: {
            pathExists: fs.existsSync(AUTH_PATH),
            files: fs.existsSync(AUTH_PATH) ? fs.readdirSync(AUTH_PATH) : [],
        },
    };
}

// Log final de carregamento
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          WHATSAPP SERVICE - CARREGADO                        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('   ├─ Timestamp:', new Date().toISOString());
console.log('   ├─ AUTH_PATH:', AUTH_PATH);
console.log('   └─ Pronto para inicialização');
console.log('\n');

module.exports = {
    initialize,
    sendMessage,
    sendMultipleMessages,
    sendImage,
    sendMedia,
    sendLocation,
    sendContact,
    markAsRead,
    updatePresence,
    checkNumberExists,
    getProfileInfo,
    getProfilePicture,
    getContactProfile,
    getConnectionState,
    getConnectionStatus,
    getQRCode,
    getDeviceInfo,
    isConnected,
    connect,
    disconnect,
    logout,
    restart,
    getSocket,
    formatPhoneNumber,
    getStats,
    getMessageStats,
    getGroups,
    getGroupInfo,
    getMessageTemplates,
    createMessageTemplate,
    updateMessageTemplate,
    deleteMessageTemplate,
    getConfig,
    updateConfig,
    processWebhookMessage,
    processMessageStatus,
    setNotificationCallback,
    sendNotification,
    getConnectionHistory,
    getDiagnostics,
};
