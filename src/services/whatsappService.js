/**
 * ============================================
 * SERVIÇO DO WHATSAPP - VERSÃO ANTI-CONFLITO
 * ============================================
 * 
 * CORREÇÕES APLICADAS:
 * - Tratamento do erro 515 (Stream Error)
 * - Timeouts aumentados para conexão
 * - Melhor gestão de reconexão
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    isJidGroup,
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
// CONFIGURAÇÕES - OTIMIZADAS PARA RAILWAY
// ============================================

const AUTH_PATH = process.env.AUTH_PATH || path.join(process.cwd(), 'auth');
const MAX_RETRY_COUNT = 5; // Aumentado para dar mais chances
const INIT_DELAY = 5000; // 5 segundos
const RECONNECT_DELAY = 15000; // 15 segundos (reduzido para erro 515)
const STREAM_ERROR_DELAY = 10000; // 10 segundos para erro 515
const QR_TIMEOUT = 90000; // 90 segundos (aumentado)
const CONNECTION_TIMEOUT = 180000; // 3 minutos (aumentado)
const CONFLICT_COOLDOWN = 120000; // 2 minutos de espera após conflito

// ============================================
// ESTADO GLOBAL
// ============================================

let sock = null;
let saveCreds = null;
let initializationLock = false;
let initializationPromise = null;
let lastConflictTime = 0;
let streamErrorCount = 0; // Contador de erros 515

const connectionState = {
    isConnected: false,
    qrCode: null,
    lastDisconnect: null,
    retryCount: 0,
    lastConnected: null,
    phoneNumber: null,
    isReconnecting: false,
    initializationAttempts: 0,
    lastError: null,
    connectionHistory: [],
    conflictCount: 0,
    lastQRTime: null,
    credsUpdateCount: 0,
};

let messageCallback = null;
let notificationCallback = null;

// ============================================
// LOG INICIAL
// ============================================

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   WHATSAPP SERVICE - VERSÃO ANTI-CONFLITO + FIX 515          ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('   ├─ AUTH_PATH:', AUTH_PATH);
console.log('   ├─ MAX_RETRY:', MAX_RETRY_COUNT);
console.log('   ├─ RECONNECT_DELAY:', RECONNECT_DELAY/1000, 'segundos');
console.log('   ├─ STREAM_ERROR_DELAY:', STREAM_ERROR_DELAY/1000, 'segundos');
console.log('   ├─ CONNECTION_TIMEOUT:', CONNECTION_TIMEOUT/1000, 'segundos');
console.log('   ├─ QR_TIMEOUT:', QR_TIMEOUT/1000, 'segundos');
console.log('   ├─ CONFLICT_COOLDOWN:', CONFLICT_COOLDOWN/1000, 'segundos');
console.log('   └─ Timestamp:', new Date().toISOString());
console.log('\n');

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

function setNotificationCallback(callback) {
    if (typeof callback === 'function') {
        notificationCallback = callback;
        console.log('🔧 [CALLBACK] ✅ Notificações configuradas');
    }
}

function sendNotification(event, data = {}) {
    if (notificationCallback) {
        try {
            notificationCallback(event, { ...data, timestamp: new Date().toISOString() });
            console.log(`🔔 [NOTIFY] ${event}`);
        } catch (error) {
            console.error('🔔 [NOTIFY] ❌ Erro:', error.message);
        }
    }
}

function addToHistory(event, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        event,
        details,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };
    connectionState.connectionHistory.push(entry);
    if (connectionState.connectionHistory.length > 100) {
        connectionState.connectionHistory.shift();
    }
    
    console.log(`📝 [HISTORY] ${event}:`, JSON.stringify(details));
}

function ensureAuthDirectory() {
    console.log('\n📁 [AUTH] Verificando diretório:', AUTH_PATH);
    
    try {
        if (!fs.existsSync(AUTH_PATH)) {
            fs.mkdirSync(AUTH_PATH, { recursive: true, mode: 0o755 });
            console.log('   ├─ ✅ Diretório criado');
        }
        
        const files = fs.readdirSync(AUTH_PATH);
        const credFiles = files.filter(f => f.endsWith('.json'));
        const hasCredsFile = files.includes('creds.json');
        
        console.log('   ├─ Total arquivos:', files.length);
        console.log('   ├─ Arquivos JSON:', credFiles.length);
        console.log('   ├─ Tem creds.json:', hasCredsFile ? 'SIM ✅' : 'NÃO ❌');
        
        if (hasCredsFile) {
            try {
                const credsPath = path.join(AUTH_PATH, 'creds.json');
                const credsContent = fs.readFileSync(credsPath, 'utf8');
                const creds = JSON.parse(credsContent);
                console.log('   ├─ Creds registrado:', creds.registered ? 'SIM' : 'NÃO');
                console.log('   ├─ Creds me.id:', creds.me?.id || 'N/A');
            } catch (e) {
                console.log('   ├─ ⚠️ Erro ao ler creds.json:', e.message);
            }
        }
        
        console.log('   └─ ✅ Diretório pronto');
        
        return { success: true, hasCredentials: hasCredsFile };
    } catch (error) {
        console.error('   └─ ❌ ERRO:', error.message);
        return { success: false, hasCredentials: false };
    }
}

/**
 * Limpa credenciais (versão segura)
 */
function clearCredentials() {
    console.log('\n🗑️ [CLEAR] Limpando credenciais...');
    
    try {
        if (fs.existsSync(AUTH_PATH)) {
            const files = fs.readdirSync(AUTH_PATH);
            let removed = 0;
            let skipped = 0;
            
            files.forEach(file => {
                if (file === 'lost+found' || file.startsWith('.')) {
                    console.log(`   ├─ [SKIP] ${file} (sistema)`);
                    skipped++;
                    return;
                }
                
                const filePath = path.join(AUTH_PATH, file);
                
                try {
                    const stats = fs.statSync(filePath);
                    
                    if (stats.isFile()) {
                        fs.unlinkSync(filePath);
                        console.log(`   ├─ [DEL] ${file}`);
                        removed++;
                    } else {
                        console.log(`   ├─ [SKIP] ${file} (diretório)`);
                        skipped++;
                    }
                } catch (err) {
                    console.log(`   ├─ [ERR] ${file}: ${err.message}`);
                }
            });
            
            console.log(`   └─ ✅ Removidos: ${removed}, Ignorados: ${skipped}`);
        }
        return true;
    } catch (error) {
        console.error('   └─ ❌ Erro:', error.message);
        return false;
    }
}

function cleanupSocket() {
    console.log('\n🧹 [CLEANUP] Limpando socket...');
    
    if (sock) {
        try {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.ev.removeAllListeners('messages.upsert');
            
            if (sock.ws) {
                console.log('   ├─ WebSocket state:', sock.ws.readyState);
                if (sock.ws.readyState === sock.ws.OPEN) {
                    sock.ws.close();
                    console.log('   ├─ WebSocket fechado');
                }
            }
            
            console.log('   └─ ✅ Socket limpo');
        } catch (error) {
            console.error('   └─ ⚠️ Erro:', error.message);
        } finally {
            sock = null;
        }
    } else {
        console.log('   └─ ℹ️ Nenhum socket para limpar');
    }
}

function resetState() {
    connectionState.isConnected = false;
    connectionState.qrCode = null;
    connectionState.isReconnecting = false;
    connectionState.lastError = null;
}

// ============================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================

async function initialize(onMessage = null) {
    // Verifica cooldown de conflito
    const timeSinceLastConflict = Date.now() - lastConflictTime;
    if (lastConflictTime > 0 && timeSinceLastConflict < CONFLICT_COOLDOWN) {
        const waitTime = Math.ceil((CONFLICT_COOLDOWN - timeSinceLastConflict) / 1000);
        console.log(`\n⏳ [COOLDOWN] Aguardando ${waitTime}s após conflito anterior...`);
        console.log('   └─ Motivo: Evitar rate limiting do WhatsApp');
        
        sendNotification('whatsapp:cooldown', { waitSeconds: waitTime });
        
        await sleep(CONFLICT_COOLDOWN - timeSinceLastConflict);
    }
    
    // Lock para evitar inicializações simultâneas
    if (initializationLock && initializationPromise) {
        console.log('\n⏳ [INIT] Já há uma inicialização em andamento...');
        return initializationPromise;
    }
    
    if (connectionState.isConnected && sock) {
        console.log('\n✅ [INIT] WhatsApp já está conectado');
        return sock;
    }
    
    initializationLock = true;
    initializationPromise = _doInitialize(onMessage);
    
    try {
        return await initializationPromise;
    } finally {
        initializationLock = false;
        initializationPromise = null;
    }
}

async function _doInitialize(onMessage) {
    connectionState.initializationAttempts++;
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          INICIANDO CONEXÃO COM WHATSAPP                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('   ├─ Tentativa:', connectionState.initializationAttempts);
    console.log('   ├─ Conflitos anteriores:', connectionState.conflictCount);
    console.log('   ├─ Erros 515 anteriores:', streamErrorCount);
    console.log('   ├─ Retry count:', connectionState.retryCount);
    console.log('   ├─ Timestamp:', new Date().toISOString());
    console.log('   └─ Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
    
    addToHistory('init_start', { 
        attempt: connectionState.initializationAttempts,
        conflictCount: connectionState.conflictCount,
        streamErrorCount: streamErrorCount
    });

    try {
        if (onMessage) {
            messageCallback = onMessage;
        }

        // Delay inicial maior para primeira tentativa
        if (connectionState.initializationAttempts === 1) {
            console.log(`\n⏳ [INIT] Delay inicial de ${INIT_DELAY/1000}s...`);
            await sleep(INIT_DELAY);
        }

        cleanupSocket();
        resetState();

        const authCheck = ensureAuthDirectory();
        if (!authCheck.success) {
            throw new Error('Falha no diretório de autenticação');
        }

        console.log('\n📱 [BAILEYS] Buscando versão...');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log('   ├─ Versão:', version.join('.'));
        console.log('   └─ Mais recente:', isLatest ? 'Sim ✅' : 'Não ⚠️');

        console.log('\n🔐 [AUTH] Carregando credenciais...');
        const authState = await useMultiFileAuthState(AUTH_PATH);
        saveCreds = authState.saveCreds;
        
        console.log('   ├─ State existe:', !!authState.state);
        console.log('   ├─ Creds existe:', !!authState.state.creds);
        console.log('   ├─ Registrado:', authState.state.creds?.registered || false);
        console.log('   ├─ Me.id:', authState.state.creds?.me?.id || 'N/A');
        console.log('   └─ Keys exist:', !!authState.state.keys);

        // ============================================
        // CONFIGURAÇÃO DO SOCKET - OTIMIZADA
        // ============================================
        const socketConfig = {
            version,
            auth: {
                creds: authState.state.creds,
                keys: makeCacheableSignalKeyStore(
                    authState.state.keys, 
                    pino({ level: 'silent' })
                ),
            },
            logger: pino({ level: 'silent' }),
            browser: ['AutoBot Loja', 'Chrome', '120.0.0'],
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            
            // TIMEOUTS AUMENTADOS PARA RAILWAY
            connectTimeoutMs: CONNECTION_TIMEOUT,
            defaultQueryTimeoutMs: CONNECTION_TIMEOUT,
            keepAliveIntervalMs: 25000,
            retryRequestDelayMs: 3000,
            
            maxMsgRetryCount: 5,
            qrTimeout: QR_TIMEOUT,
            printQRInTerminal: false,
            
            // Configurações adicionais para estabilidade
            emitOwnEvents: true,
            fireInitQueries: true,
            
            getMessage: async () => ({ conversation: '' }),
        };

        console.log('\n🔌 [SOCKET] Criando conexão...');
        console.log('   ├─ Browser:', socketConfig.browser.join(' / '));
        console.log('   ├─ connectTimeoutMs:', socketConfig.connectTimeoutMs);
        console.log('   ├─ qrTimeout:', socketConfig.qrTimeout);
        console.log('   ├─ keepAliveIntervalMs:', socketConfig.keepAliveIntervalMs);
        console.log('   └─ markOnlineOnConnect:', socketConfig.markOnlineOnConnect);
        
        sock = makeWASocket(socketConfig);
        
        setupEventHandlers(sock, authState.saveCreds);

        console.log('\n✅ [INIT] Socket criado, aguardando eventos...\n');
        
        return sock;
    } catch (error) {
        console.error('\n❌ [INIT] ERRO:', error.message);
        console.error('   Stack:', error.stack);
        connectionState.lastError = error.message;
        addToHistory('init_error', { error: error.message });
        throw error;
    }
}

// ============================================
// HANDLERS DE EVENTOS
// ============================================

function setupEventHandlers(socket, saveCredsFunc) {
    console.log('📡 [EVENTS] Configurando handlers...');

    // ========== CONNECTION UPDATE ==========
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update;
        
        const timestamp = new Date().toISOString();
        
        console.log('\n┌─────────────────────────────────────────────────────────┐');
        console.log('│              CONNECTION UPDATE                          │');
        console.log('├─────────────────────────────────────────────────────────┤');
        console.log('│ Timestamp:', timestamp);
        console.log('│ connection:', connection || '(undefined)');
        console.log('│ hasQR:', !!qr);
        console.log('│ isNewLogin:', isNewLogin);
        console.log('│ receivedPendingNotifications:', receivedPendingNotifications);
        console.log('│ Estado atual:');
        console.log('│   ├─ isConnected:', connectionState.isConnected);
        console.log('│   ├─ retryCount:', connectionState.retryCount);
        console.log('│   ├─ streamErrorCount:', streamErrorCount);
        console.log('│   └─ conflictCount:', connectionState.conflictCount);
        console.log('└─────────────────────────────────────────────────────────┘');

        addToHistory('connection_update', { 
            connection, 
            hasQR: !!qr, 
            isNewLogin,
            hasLastDisconnect: !!lastDisconnect
        });

        // ===== QR CODE =====
        if (qr) {
            connectionState.qrCode = qr;
            connectionState.lastQRTime = Date.now();
            connectionState.isConnected = false;
            
            // Reset contadores quando novo QR é gerado
            streamErrorCount = 0;
            
            console.log('\n');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║     📱 NOVO QR CODE - ESCANEIE COM SEU WHATSAPP       ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            console.log('\n');
            qrcode.generate(qr, { small: true });
            console.log('\n');
            console.log('   ⚠️  IMPORTANTE:');
            console.log('   1. Abra o WhatsApp no celular');
            console.log('   2. Vá em Configurações > Dispositivos Vinculados');
            console.log('   3. Toque em "Conectar um dispositivo"');
            console.log('   4. Escaneie este QR Code');
            console.log('   5. AGUARDE até aparecer "Conectado" (pode demorar 30-60s)');
            console.log('   6. NÃO FECHE o WhatsApp durante a conexão!');
            console.log('\n');
            console.log(`   ⏰ QR expira em ${QR_TIMEOUT/1000} segundos`);
            console.log('═══════════════════════════════════════════════════════\n');

            sendNotification('whatsapp:qr', { qrCode: qr });
            addToHistory('qr_generated', { qrTimeout: QR_TIMEOUT });
        }

        // ===== CONECTADO =====
        if (connection === 'open') {
            console.log('\n');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║              ✅ CONEXÃO ABERTA!                       ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            
            connectionState.isConnected = true;
            connectionState.qrCode = null;
            connectionState.retryCount = 0;
            connectionState.lastConnected = new Date().toISOString();
            connectionState.isReconnecting = false;
            connectionState.lastError = null;
            streamErrorCount = 0; // Reset contador de erro 515
            
            if (socket.user) {
                connectionState.phoneNumber = socket.user.id.split(':')[0];
                console.log('   ├─ Número:', connectionState.phoneNumber);
                console.log('   ├─ JID:', socket.user.id);
                console.log('   ├─ Nome:', socket.user.name || '(N/A)');
            }
            
            console.log('   ├─ Timestamp:', connectionState.lastConnected);
            console.log('   └─ Status: Aguardando estabilização...');
            
            console.log('\n⏳ [STABILITY] Verificando estabilidade da conexão (5s)...');
            
            setTimeout(() => {
                if (connectionState.isConnected) {
                    console.log('✅ [STABILITY] Conexão estável!');
                    logger.whatsappStatus('Conectado com sucesso! ✅');
                    sendNotification('whatsapp:connected', {
                        phoneNumber: connectionState.phoneNumber,
                        lastConnected: connectionState.lastConnected,
                        stable: true
                    });
                } else {
                    console.log('⚠️ [STABILITY] Conexão instável - foi fechada');
                }
            }, 5000);

            addToHistory('connected', { phoneNumber: connectionState.phoneNumber });
        }

        // ===== DESCONECTADO =====
        if (connection === 'close') {
            console.log('\n');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║              ⚠️ CONEXÃO FECHADA                       ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            
            connectionState.isConnected = false;
            
            await handleDisconnect(lastDisconnect);
        }

        // ===== CONECTANDO =====
        if (connection === 'connecting') {
            console.log('\n🔄 [CONNECTION] Estado: CONECTANDO...');
            console.log('   └─ Aguarde, estabelecendo conexão com o servidor do WhatsApp');
            addToHistory('connecting');
        }
    });

    // ========== CREDENTIALS UPDATE ==========
    socket.ev.on('creds.update', async () => {
        connectionState.credsUpdateCount++;
        const count = connectionState.credsUpdateCount;
        
        if (count <= 5 || count % 5 === 0) {
            console.log(`🔐 [CREDS] Salvando credenciais (#${count})...`);
        }
        
        try {
            await saveCredsFunc();
            if (count <= 5 || count % 5 === 0) {
                console.log('   └─ ✅ Salvo');
            }
        } catch (error) {
            console.error('   └─ ❌ Erro ao salvar:', error.message);
        }
    });

    // ========== MESSAGES ==========
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            await handleIncomingMessage(msg);
        }
    });

    console.log('   └─ ✅ Handlers configurados\n');
}

// ============================================
// TRATAMENTO DE DESCONEXÃO - COM FIX PARA 515
// ============================================

async function handleDisconnect(lastDisconnect) {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const errorMessage = lastDisconnect?.error?.message || 'Desconhecido';
    const errorData = lastDisconnect?.error?.data;
    
    console.log('\n📊 [DISCONNECT] Análise detalhada:');
    console.log('   ├─ StatusCode:', statusCode);
    console.log('   ├─ Mensagem:', errorMessage);
    console.log('   ├─ Dados:', JSON.stringify(errorData || {}));
    
    // Verifica tipos de erro
    const isConflict = errorMessage.includes('conflict') || 
                       JSON.stringify(errorData || '').includes('conflict') ||
                       JSON.stringify(errorData || '').includes('device_removed');
    
    const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
    const isBadSession = statusCode === DisconnectReason.badSession;
    const isConnectionLost = statusCode === DisconnectReason.connectionLost || 
                             statusCode === DisconnectReason.connectionClosed;
    
    // ✅ NOVO: Detecta erro 515 (Stream Error)
    const isStreamError = statusCode === 515 || 
                          errorMessage.includes('Stream Errored') ||
                          errorMessage.includes('restart required');
    
    // ✅ NOVO: Detecta erro de timeout
    const isTimeout = statusCode === DisconnectReason.timedOut ||
                      errorMessage.includes('timed out') ||
                      errorMessage.includes('timeout');
    
    console.log('   ├─ É conflito:', isConflict ? 'SIM ⚠️' : 'NÃO');
    console.log('   ├─ É logout:', isLoggedOut ? 'SIM' : 'NÃO');
    console.log('   ├─ É bad session:', isBadSession ? 'SIM' : 'NÃO');
    console.log('   ├─ É connection lost:', isConnectionLost ? 'SIM' : 'NÃO');
    console.log('   ├─ É stream error (515):', isStreamError ? 'SIM ⚠️' : 'NÃO');
    console.log('   └─ É timeout:', isTimeout ? 'SIM' : 'NÃO');

    addToHistory('disconnected', { 
        statusCode, 
        errorMessage, 
        isConflict, 
        isLoggedOut,
        isStreamError,
        isTimeout
    });

    sendNotification('whatsapp:disconnected', {
        statusCode,
        reason: errorMessage,
        isConflict,
        isStreamError
    });

    // ===== TRATAMENTO DE CONFLITO/LOGOUT =====
    if (isConflict || isLoggedOut || isBadSession) {
        connectionState.conflictCount++;
        lastConflictTime = Date.now();
        
        console.log('\n🚨 [CONFLICT] Conflito/Logout detectado!');
        console.log('   ├─ Total de conflitos:', connectionState.conflictCount);
        console.log('   ├─ Ação: Limpando credenciais');
        console.log('   └─ Cooldown:', CONFLICT_COOLDOWN/1000, 'segundos');
        
        clearCredentials();
        
        sendNotification('whatsapp:logged_out', {
            message: 'Sessão encerrada. Aguarde o cooldown e escaneie novamente.',
            conflictCount: connectionState.conflictCount,
            cooldownSeconds: CONFLICT_COOLDOWN/1000
        });
        
        const extraCooldown = connectionState.conflictCount > 3 ? 60000 : 0;
        const totalCooldown = CONFLICT_COOLDOWN + extraCooldown;
        
        console.log(`\n⏳ [COOLDOWN] Aguardando ${totalCooldown/1000}s antes de gerar novo QR...`);
        
        await sleep(totalCooldown);
        
        connectionState.retryCount = 0;
        streamErrorCount = 0;
        initializationLock = false;
        
        await initialize(messageCallback);
        return;
    }

    // ===== ✅ NOVO: TRATAMENTO DE ERRO 515 (Stream Error) =====
    if (isStreamError) {
        streamErrorCount++;
        
        console.log('\n🔄 [STREAM ERROR 515] Erro de stream detectado!');
        console.log('   ├─ Contador de erros 515:', streamErrorCount);
        console.log('   ├─ Isso é comum durante o processo de conexão');
        console.log('   ├─ Geralmente resolve com retry automático');
        
        // Se muitos erros 515 consecutivos, limpa credenciais
        if (streamErrorCount >= 5) {
            console.log('   ├─ ⚠️ Muitos erros 515! Limpando credenciais...');
            clearCredentials();
            streamErrorCount = 0;
            connectionState.retryCount = 0;
            
            console.log(`   └─ Aguardando 30s antes de gerar novo QR...`);
            await sleep(30000);
            
            initializationLock = false;
            await initialize(messageCallback);
            return;
        }
        
        // Retry normal para erro 515
        const delay = STREAM_ERROR_DELAY + (streamErrorCount * 2000); // Aumenta delay progressivamente
        console.log(`   └─ Tentando reconectar em ${delay/1000} segundos...`);
        
        sendNotification('whatsapp:reconnecting', {
            attempt: streamErrorCount,
            reason: 'Stream Error 515',
            delaySeconds: delay/1000
        });
        
        await sleep(delay);
        
        initializationLock = false;
        await initialize(messageCallback);
        return;
    }

    // ===== ✅ NOVO: TRATAMENTO DE TIMEOUT =====
    if (isTimeout) {
        connectionState.retryCount++;
        
        console.log('\n⏱️ [TIMEOUT] Timeout detectado!');
        console.log('   ├─ Retry count:', connectionState.retryCount);
        
        if (connectionState.retryCount <= MAX_RETRY_COUNT) {
            const delay = RECONNECT_DELAY + (connectionState.retryCount * 5000);
            console.log(`   └─ Tentando reconectar em ${delay/1000}s...`);
            
            sendNotification('whatsapp:reconnecting', {
                attempt: connectionState.retryCount,
                reason: 'Timeout',
                delaySeconds: delay/1000
            });
            
            await sleep(delay);
            
            initializationLock = false;
            await initialize(messageCallback);
        } else {
            console.log('   └─ Máximo de tentativas atingido. Limpando credenciais...');
            clearCredentials();
            connectionState.retryCount = 0;
            
            await sleep(30000);
            
            initializationLock = false;
            await initialize(messageCallback);
        }
        return;
    }

    // ===== RECONEXÃO NORMAL (Connection Lost) =====
    if (isConnectionLost && connectionState.retryCount < MAX_RETRY_COUNT) {
        connectionState.retryCount++;
        
        console.log(`\n🔄 [RECONNECT] Tentativa ${connectionState.retryCount}/${MAX_RETRY_COUNT}`);
        console.log(`   └─ Aguardando ${RECONNECT_DELAY/1000}s...`);
        
        sendNotification('whatsapp:reconnecting', {
            attempt: connectionState.retryCount,
            maxAttempts: MAX_RETRY_COUNT,
            delaySeconds: RECONNECT_DELAY/1000
        });

        await sleep(RECONNECT_DELAY);
        
        initializationLock = false;
        await initialize(messageCallback);
        return;
    }
    
    // ===== FALLBACK: Qualquer outro erro =====
    if (connectionState.retryCount < MAX_RETRY_COUNT) {
        connectionState.retryCount++;
        
        console.log(`\n🔄 [RECONNECT] Erro desconhecido - Tentativa ${connectionState.retryCount}/${MAX_RETRY_COUNT}`);
        console.log(`   └─ Aguardando ${RECONNECT_DELAY/1000}s...`);
        
        await sleep(RECONNECT_DELAY);
        
        initializationLock = false;
        await initialize(messageCallback);
    } else {
        console.log('\n❌ [RECONNECT] Máximo de tentativas atingido');
        console.log('   └─ Aguardando intervenção manual ou novo deploy');
        
        sendNotification('whatsapp:connection_failed', {
            message: 'Máximo de tentativas atingido',
            attempts: connectionState.retryCount
        });
    }
}

// ============================================
// PROCESSAMENTO DE MENSAGENS
// ============================================

async function handleIncomingMessage(msg) {
    try {
        if (msg.key.fromMe) return;
        if (isJidBroadcast(msg.key.remoteJid)) return;
        if (isJidGroup(msg.key.remoteJid)) return;

        const messageData = extractMessageData(msg);
        
        if (!messageData.text) return;

        console.log(`\n📩 [MSG IN] ${messageData.phone}: "${messageData.text.substring(0, 50)}..."`);

        logger.messageReceived(messageData.phone, messageData.text);

        sendNotification('message:received', {
            phone: messageData.phone,
            text: messageData.text,
            pushName: messageData.pushName
        });

        if (messageCallback) {
            await messageCallback(messageData);
        }
    } catch (error) {
        console.error('❌ [MSG] Erro:', error.message);
    }
}

function extractMessageData(msg) {
    const content = msg.message;
    
    let text = '';
    let type = 'unknown';

    if (content?.conversation) {
        text = content.conversation;
        type = 'text';
    } else if (content?.extendedTextMessage?.text) {
        text = content.extendedTextMessage.text;
        type = 'text';
    } else if (content?.imageMessage?.caption) {
        text = content.imageMessage.caption;
        type = 'image';
    } else if (content?.videoMessage?.caption) {
        text = content.videoMessage.caption;
        type = 'video';
    } else if (content?.buttonsResponseMessage?.selectedButtonId) {
        text = content.buttonsResponseMessage.selectedButtonId;
        type = 'button';
    } else if (content?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        text = content.listResponseMessage.singleSelectReply.selectedRowId;
        type = 'list';
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

// ============================================
// FUNÇÕES DE ENVIO
// ============================================

async function sendMessage(to, message) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        if (settings.bot?.typingDelay > 0) {
            await sock.sendPresenceUpdate('composing', jid);
            await sleep(settings.bot.typingDelay);
        }

        const result = await sock.sendMessage(jid, { text: message });
        await sock.sendPresenceUpdate('paused', jid);

        console.log(`📤 [MSG OUT] ${extractPhoneFromJid(jid)}: "${message.substring(0, 50)}..."`);

        logger.messageSent(extractPhoneFromJid(jid), message);

        sendNotification('message:sent', {
            phone: extractPhoneFromJid(jid),
            text: message,
            messageId: result.key.id
        });

        return { success: true, messageId: result.key.id };
    } catch (error) {
        console.error('❌ [MSG OUT] Erro:', error.message);
        return { success: false, error: error.message };
    }
}

async function sendMultipleMessages(to, messages) {
    const results = [];
    for (const message of messages) {
        const result = await sendMessage(to, message);
        results.push(result);
        if (settings.bot?.messageDelay > 0) {
            await sleep(settings.bot.messageDelay);
        }
    }
    return results;
}

async function sendImage(to, image, caption = '') {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);
        let imageBuffer = typeof image === 'string' ? fs.readFileSync(image) : image;
        const result = await sock.sendMessage(jid, { image: imageBuffer, caption });

        return { success: true, messageId: result.key.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

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

        let content = {};
        switch (type) {
            case 'image': content = { image: mediaBuffer, caption }; break;
            case 'video': content = { video: mediaBuffer, caption }; break;
            case 'document': content = { document: mediaBuffer, caption, fileName: path.basename(mediaUrl) }; break;
            case 'audio': content = { audio: mediaBuffer, mimetype: 'audio/mp4' }; break;
            default: content = { image: mediaBuffer, caption };
        }

        const result = await sock.sendMessage(jid, content);
        return { success: true, messageId: result.key.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendLocation(to, location) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);
        const result = await sock.sendMessage(jid, {
            location: {
                degreesLatitude: location.latitude,
                degreesLongitude: location.longitude,
                name: location.name || '',
                address: location.address || '',
            },
        });

        return { success: true, messageId: result.key.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function sendContact(to, contact, phone = null) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);
        const name = typeof contact === 'object' ? contact.name : contact;
        const contactPhone = typeof contact === 'object' ? contact.phone : phone;

        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;type=CELL:+${contactPhone}\nEND:VCARD`;

        const result = await sock.sendMessage(jid, {
            contacts: { displayName: name, contacts: [{ vcard }] },
        });

        return { success: true, messageId: result.key.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ============================================
// FUNÇÕES AUXILIARES DE MENSAGEM
// ============================================

async function markAsRead(msg) {
    try {
        if (!sock || !connectionState.isConnected) return;
        await sock.readMessages([{ remoteJid: msg.jid, id: msg.id }]);
    } catch (error) { }
}

async function updatePresence(to, presence = 'composing') {
    try {
        if (!sock || !connectionState.isConnected) return;
        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);
        await sock.sendPresenceUpdate(presence, jid);
    } catch (error) { }
}

async function checkNumberExists(phone) {
    try {
        if (!sock || !connectionState.isConnected) return false;
        const jid = formatPhoneForWhatsApp(phone);
        const [result] = await sock.onWhatsApp(jid);
        return result?.exists || false;
    } catch (error) {
        return false;
    }
}

async function getProfileInfo(phone) {
    try {
        if (!sock || !connectionState.isConnected) return { phone };
        const jid = formatPhoneForWhatsApp(phone);
        const status = await sock.fetchStatus(jid).catch(() => null);
        const pic = await sock.profilePictureUrl(jid, 'image').catch(() => null);
        return { phone, status: status?.status || '', profilePicture: pic };
    } catch (error) {
        return { phone };
    }
}

async function getProfilePicture(phone) {
    try {
        if (!sock || !connectionState.isConnected) return null;
        const jid = formatPhoneForWhatsApp(phone);
        return await sock.profilePictureUrl(jid, 'image');
    } catch (error) {
        return null;
    }
}

async function getContactProfile(phone) {
    try {
        if (!sock || !connectionState.isConnected) return { phone, exists: false };
        const jid = formatPhoneForWhatsApp(phone);
        const [exists] = await sock.onWhatsApp(jid);
        const status = await sock.fetchStatus(jid).catch(() => null);
        const pic = await sock.profilePictureUrl(jid, 'image').catch(() => null);
        return {
            phone,
            exists: exists?.exists || false,
            jid: exists?.jid || jid,
            status: status?.status || '',
            profilePicture: pic,
        };
    } catch (error) {
        return { phone, exists: false };
    }
}

// ============================================
// FUNÇÕES DE STATUS
// ============================================

function getConnectionState() {
    return { 
        ...connectionState, 
        socketExists: sock !== null,
        lastConflictTime: lastConflictTime > 0 ? new Date(lastConflictTime).toISOString() : null,
        streamErrorCount: streamErrorCount
    };
}

async function getConnectionStatus() {
    return {
        connected: connectionState.isConnected,
        status: connectionState.isConnected ? 'connected' : 'disconnected',
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        qrCode: connectionState.qrCode,
        retryCount: connectionState.retryCount,
        conflictCount: connectionState.conflictCount,
        streamErrorCount: streamErrorCount,
        lastError: connectionState.lastError,
        uptime: connectionState.lastConnected 
            ? Date.now() - new Date(connectionState.lastConnected).getTime() 
            : null,
        connectionHistory: connectionState.connectionHistory.slice(-20),
    };
}

async function getQRCode() {
    return connectionState.qrCode;
}

async function getDeviceInfo() {
    if (!sock || !connectionState.isConnected) return null;
    return {
        phoneNumber: connectionState.phoneNumber,
        platform: sock.user?.platform || 'unknown',
        pushName: sock.user?.name || '',
        jid: sock.user?.id || '',
    };
}

function isConnected() {
    return connectionState.isConnected && sock !== null;
}

// ============================================
// FUNÇÕES DE CONTROLE
// ============================================

async function connect() {
    if (connectionState.isConnected) {
        console.log('⚠️ [CONNECT] Já conectado');
        return;
    }
    await initialize(messageCallback);
}

async function disconnect() {
    try {
        console.log('\n👋 [DISCONNECT] Desconectando...');
        if (sock) {
            await sock.logout();
            cleanupSocket();
            resetState();
        }
        sendNotification('whatsapp:disconnected', { reason: 'manual' });
    } catch (error) {
        console.error('❌ Erro ao desconectar:', error.message);
    }
}

async function logout() {
    try {
        console.log('\n🚪 [LOGOUT] Fazendo logout...');
        
        if (sock) {
            await sock.logout();
        }
        
        clearCredentials();
        cleanupSocket();
        resetState();
        connectionState.conflictCount = 0;
        lastConflictTime = 0;
        streamErrorCount = 0;
        
        sendNotification('whatsapp:logged_out', { message: 'Sessão encerrada manualmente' });
        console.log('   └─ ✅ Logout realizado');
    } catch (error) {
        console.error('❌ Erro no logout:', error.message);
        throw error;
    }
}

async function restart() {
    console.log('\n🔄 [RESTART] Reiniciando...');
    
    sendNotification('whatsapp:restarting', {});
    
    cleanupSocket();
    resetState();
    connectionState.retryCount = 0;
    streamErrorCount = 0;
    initializationLock = false;
    
    await sleep(3000);
    await initialize(messageCallback);
}

function getSocket() {
    return sock;
}

function formatPhoneNumber(phone) {
    return formatPhoneForWhatsApp(phone);
}

// ============================================
// ESTATÍSTICAS E DIAGNÓSTICO
// ============================================

async function getStats() {
    return {
        connected: connectionState.isConnected,
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        retryCount: connectionState.retryCount,
        conflictCount: connectionState.conflictCount,
        streamErrorCount: streamErrorCount,
        initializationAttempts: connectionState.initializationAttempts,
        lastError: connectionState.lastError,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        uptime: connectionState.lastConnected 
            ? Math.floor((Date.now() - new Date(connectionState.lastConnected).getTime()) / 1000)
            : 0,
    };
}

async function getMessageStats(period = 'today') {
    return { period, sent: 0, received: 0, failed: 0 };
}

async function getGroups() {
    try {
        if (!sock || !connectionState.isConnected) return [];
        const groups = await sock.groupFetchAllParticipating();
        return Object.values(groups).map(g => ({
            id: g.id,
            name: g.subject,
            participants: g.participants?.length || 0,
        }));
    } catch (error) {
        return [];
    }
}

async function getGroupInfo(groupId) {
    try {
        if (!sock || !connectionState.isConnected) return null;
        const metadata = await sock.groupMetadata(groupId);
        return {
            id: metadata.id,
            name: metadata.subject,
            description: metadata.desc || '',
            participants: metadata.participants,
            participantCount: metadata.participants?.length || 0,
        };
    } catch (error) {
        return null;
    }
}

function getConnectionHistory() {
    return connectionState.connectionHistory;
}

async function getDiagnostics() {
    return {
        environment: {
            nodeEnv: process.env.NODE_ENV,
            platform: process.platform,
            nodeVersion: process.version,
            pid: process.pid,
            authPath: AUTH_PATH,
        },
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
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
            lastConflictTime: lastConflictTime > 0 ? new Date(lastConflictTime).toISOString() : null,
            streamErrorCount: streamErrorCount
        },
        auth: {
            pathExists: fs.existsSync(AUTH_PATH),
            files: fs.existsSync(AUTH_PATH) ? fs.readdirSync(AUTH_PATH) : [],
        },
        config: {
            maxRetryCount: MAX_RETRY_COUNT,
            reconnectDelay: RECONNECT_DELAY,
            streamErrorDelay: STREAM_ERROR_DELAY,
            conflictCooldown: CONFLICT_COOLDOWN,
            qrTimeout: QR_TIMEOUT,
            connectionTimeout: CONNECTION_TIMEOUT,
        }
    };
}

// Templates (stubs)
async function getMessageTemplates() { return []; }
async function createMessageTemplate(t) { return Date.now(); }
async function updateMessageTemplate(id, data) { return true; }
async function deleteMessageTemplate(id) { return true; }
async function getConfig() {
    return {
        typingDelay: settings.bot?.typingDelay || 0,
        messageDelay: settings.bot?.messageDelay || 0,
        autoReconnect: true,
        maxRetries: MAX_RETRY_COUNT,
        authPath: AUTH_PATH,
        conflictCooldown: CONFLICT_COOLDOWN,
    };
}
async function updateConfig(config) { }
async function processWebhookMessage(data) { }
async function processMessageStatus(data) { }

// ============================================
// EXPORTS
// ============================================

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
