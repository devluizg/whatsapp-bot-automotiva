/**
 * ============================================
 * SERVIÇO DO WHATSAPP - VERSÃO CORRIGIDA
 * ============================================
 * 
 * Correções aplicadas:
 * - Locking para evitar múltiplas conexões
 * - Melhor persistência de credenciais
 * - Tratamento de conflito/device_removed
 * - Delay inicial para evitar race conditions
 * - Singleton pattern mais robusto
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
// CONFIGURAÇÕES E CONSTANTES
// ============================================

const AUTH_PATH = process.env.AUTH_PATH || path.join(process.cwd(), 'auth');
const MAX_RETRY_COUNT = 5;
const INIT_DELAY = 3000; // Delay antes de inicializar (evita race conditions)
const RECONNECT_BASE_DELAY = 5000;
const QR_TIMEOUT = 60000;
const CONNECTION_TIMEOUT = 120000;

// ============================================
// ESTADO GLOBAL (SINGLETON)
// ============================================

let sock = null;
let saveCreds = null; // Referência global para salvar credenciais
let initializationLock = false; // Lock para evitar múltiplas inicializações
let initializationPromise = null; // Promise da inicialização atual

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
    credsUpdateCount: 0, // Contador de atualizações de credenciais
};

// Callbacks
let messageCallback = null;
let notificationCallback = null;

// ============================================
// LOG INICIAL
// ============================================

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║          WHATSAPP SERVICE - INICIALIZAÇÃO                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('   ├─ NODE_ENV:', process.env.NODE_ENV || 'não definido');
console.log('   ├─ AUTH_PATH:', AUTH_PATH);
console.log('   ├─ Platform:', process.platform);
console.log('   └─ PID:', process.pid);

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Define callback para notificações
 */
function setNotificationCallback(callback) {
    if (typeof callback === 'function') {
        notificationCallback = callback;
        console.log('🔧 [CALLBACK] ✅ Callback de notificações configurado');
    }
}

/**
 * Envia notificação
 */
function sendNotification(event, data = {}) {
    if (notificationCallback) {
        try {
            notificationCallback(event, { ...data, timestamp: new Date().toISOString() });
            console.log(`🔔 [NOTIFY] Evento: ${event}`);
        } catch (error) {
            console.error('🔔 [NOTIFY] ❌ Erro:', error.message);
        }
    }
}

/**
 * Adiciona ao histórico de conexões
 */
function addToHistory(event, details = {}) {
    connectionState.connectionHistory.push({
        timestamp: new Date().toISOString(),
        event,
        details,
        memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
    
    if (connectionState.connectionHistory.length > 50) {
        connectionState.connectionHistory.shift();
    }
}

/**
 * Garante que a pasta de autenticação existe
 */
function ensureAuthDirectory() {
    console.log('\n📁 [AUTH] Verificando diretório:', AUTH_PATH);
    
    try {
        if (!fs.existsSync(AUTH_PATH)) {
            fs.mkdirSync(AUTH_PATH, { recursive: true, mode: 0o755 });
            console.log('   ├─ ✅ Diretório criado');
        }
        
        // Verifica permissões
        fs.accessSync(AUTH_PATH, fs.constants.R_OK | fs.constants.W_OK);
        
        const files = fs.readdirSync(AUTH_PATH);
        console.log('   ├─ Arquivos:', files.length);
        
        // Verifica se há credenciais válidas
        const hasCredsFile = files.some(f => f.includes('creds'));
        console.log('   ├─ Tem credenciais:', hasCredsFile ? 'Sim' : 'Não');
        console.log('   └─ ✅ Diretório pronto');
        
        return { success: true, hasCredentials: hasCredsFile };
    } catch (error) {
        console.error('   └─ ❌ ERRO:', error.message);
        return { success: false, hasCredentials: false };
    }
}

/**
 * Limpa credenciais corrompidas
 */
function clearCredentials() {
    console.log('\n🗑️ [CLEAR] Limpando credenciais...');
    
    try {
        if (fs.existsSync(AUTH_PATH)) {
            const files = fs.readdirSync(AUTH_PATH);
            files.forEach(file => {
                const filePath = path.join(AUTH_PATH, file);
                fs.unlinkSync(filePath);
                console.log(`   ├─ Removido: ${file}`);
            });
            console.log('   └─ ✅ Credenciais removidas');
        }
        return true;
    } catch (error) {
        console.error('   └─ ❌ Erro:', error.message);
        return false;
    }
}

/**
 * Limpa socket existente
 */
function cleanupSocket() {
    console.log('\n🧹 [CLEANUP] Limpando socket...');
    
    if (sock) {
        try {
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('creds.update');
            sock.ev.removeAllListeners('messages.upsert');
            
            if (sock.ws && sock.ws.readyState === sock.ws.OPEN) {
                sock.ws.close();
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

/**
 * Reset completo do estado
 */
function resetState() {
    connectionState.isConnected = false;
    connectionState.qrCode = null;
    connectionState.isReconnecting = false;
    connectionState.lastError = null;
}

// ============================================
// FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO
// ============================================

/**
 * Inicializa a conexão com o WhatsApp
 * Usa locking para evitar múltiplas inicializações simultâneas
 */
async function initialize(onMessage = null) {
    // Se já há uma inicialização em andamento, aguarda
    if (initializationLock && initializationPromise) {
        console.log('\n⏳ [INIT] Inicialização já em andamento, aguardando...');
        return initializationPromise;
    }
    
    // Se já está conectado, retorna
    if (connectionState.isConnected && sock) {
        console.log('\n✅ [INIT] WhatsApp já está conectado');
        return sock;
    }
    
    // Ativa o lock
    initializationLock = true;
    
    // Cria a promise de inicialização
    initializationPromise = _doInitialize(onMessage);
    
    try {
        const result = await initializationPromise;
        return result;
    } finally {
        initializationLock = false;
        initializationPromise = null;
    }
}

/**
 * Implementação real da inicialização
 */
async function _doInitialize(onMessage) {
    connectionState.initializationAttempts++;
    
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          INICIANDO CONEXÃO COM WHATSAPP                      ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('   ├─ Tentativa #', connectionState.initializationAttempts);
    console.log('   ├─ Timestamp:', new Date().toISOString());
    console.log('   └─ Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
    
    addToHistory('init_start', { attempt: connectionState.initializationAttempts });

    try {
        // Salva callback de mensagens
        if (onMessage) {
            messageCallback = onMessage;
        }

        // Delay inicial para evitar race conditions no deploy
        if (connectionState.initializationAttempts === 1) {
            console.log(`\n⏳ [INIT] Aguardando ${INIT_DELAY/1000}s antes de conectar...`);
            await sleep(INIT_DELAY);
        }

        // Limpa socket anterior
        cleanupSocket();
        resetState();

        // Verifica diretório de autenticação
        const authCheck = ensureAuthDirectory();
        if (!authCheck.success) {
            throw new Error('Falha ao preparar diretório de autenticação');
        }

        // Busca versão do Baileys
        console.log('\n📱 [BAILEYS] Buscando versão...');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log('   ├─ Versão:', version.join('.'));
        console.log('   └─ É mais recente:', isLatest ? 'Sim ✅' : 'Não ⚠️');

        // Carrega credenciais
        console.log('\n🔐 [AUTH] Carregando credenciais...');
        const authState = await useMultiFileAuthState(AUTH_PATH);
        saveCreds = authState.saveCreds; // Salva referência global
        
        console.log('   ├─ Credenciais carregadas:', !!authState.state.creds);
        console.log('   ├─ Registrado:', authState.state.creds?.registered ? 'Sim' : 'Não');
        console.log('   └─ Conta:', authState.state.creds?.me?.id || 'N/A');

        // Configurações do socket
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
            browser: ['Bot Loja Automotiva', 'Chrome', '120.0.0'],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: CONNECTION_TIMEOUT,
            defaultQueryTimeoutMs: CONNECTION_TIMEOUT,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 2000,
            maxMsgRetryCount: 5,
            qrTimeout: QR_TIMEOUT,
            // IMPORTANTE: Evita conflitos
            printQRInTerminal: false,
            getMessage: async () => ({ conversation: '' }),
        };

        console.log('\n🔌 [SOCKET] Criando conexão...');
        sock = makeWASocket(socketConfig);
        
        // Configura handlers
        setupEventHandlers(sock, authState.saveCreds);

        console.log('\n✅ [INIT] Aguardando conexão...\n');
        
        return sock;
    } catch (error) {
        console.error('\n❌ [INIT] ERRO:', error.message);
        connectionState.lastError = error.message;
        addToHistory('init_error', { error: error.message });
        throw error;
    }
}

// ============================================
// HANDLERS DE EVENTOS
// ============================================

/**
 * Configura handlers de eventos do socket
 */
function setupEventHandlers(socket, saveCredsFunc) {
    console.log('📡 [EVENTS] Configurando handlers...');

    // ========== CONNECTION UPDATE ==========
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        console.log('\n┌─ CONNECTION UPDATE ─────────────────────────┐');
        console.log('│ connection:', connection || '(none)');
        console.log('│ hasQR:', !!qr);
        console.log('│ isConnected:', connectionState.isConnected);
        console.log('└─────────────────────────────────────────────┘');

        // ===== QR CODE =====
        if (qr) {
            connectionState.qrCode = qr;
            connectionState.isConnected = false;
            
            console.log('\n');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║     📱 ESCANEIE O QR CODE COM SEU WHATSAPP            ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            qrcode.generate(qr, { small: true });
            console.log('═══════════════════════════════════════════════════════');
            console.log('   ⏰ Tempo limite: 60 segundos');
            console.log('═══════════════════════════════════════════════════════\n');

            sendNotification('whatsapp:qr', { qrCode: qr });
            addToHistory('qr_generated');
        }

        // ===== CONECTADO =====
        if (connection === 'open') {
            console.log('\n');
            console.log('╔═══════════════════════════════════════════════════════╗');
            console.log('║              ✅ CONECTADO COM SUCESSO!                ║');
            console.log('╚═══════════════════════════════════════════════════════╝');
            
            connectionState.isConnected = true;
            connectionState.qrCode = null;
            connectionState.retryCount = 0;
            connectionState.lastConnected = new Date().toISOString();
            connectionState.isReconnecting = false;
            connectionState.lastError = null;
            
            if (socket.user) {
                connectionState.phoneNumber = socket.user.id.split(':')[0];
                console.log('   ├─ Número:', connectionState.phoneNumber);
                console.log('   ├─ Nome:', socket.user.name || '(N/A)');
            }
            console.log('   └─ Timestamp:', connectionState.lastConnected);

            logger.whatsappStatus('Conectado com sucesso! ✅');
            sendNotification('whatsapp:connected', {
                phoneNumber: connectionState.phoneNumber,
                lastConnected: connectionState.lastConnected
            });
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
            console.log('🔄 [CONNECTION] Conectando...');
            addToHistory('connecting');
        }
    });

    // ========== CREDENTIALS UPDATE ==========
    socket.ev.on('creds.update', async () => {
        connectionState.credsUpdateCount++;
        console.log(`🔐 [CREDS] Salvando credenciais (#${connectionState.credsUpdateCount})...`);
        
        try {
            await saveCredsFunc();
            console.log('   └─ ✅ Credenciais salvas');
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

/**
 * Trata desconexão
 */
async function handleDisconnect(lastDisconnect) {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const errorMessage = lastDisconnect?.error?.message || 'Desconhecido';
    const errorData = lastDisconnect?.error?.data;
    
    console.log('📊 [DISCONNECT] Análise:');
    console.log('   ├─ Código:', statusCode);
    console.log('   ├─ Mensagem:', errorMessage);
    console.log('   ├─ Dados:', JSON.stringify(errorData || {}));
    
    // Verifica se é conflict/device_removed
    const isConflict = errorMessage.includes('conflict') || 
                       errorData?.content?.some(c => c.tag === 'conflict');
    
    if (isConflict) {
        console.log('   └─ ⚠️ CONFLITO DETECTADO (device_removed)');
    }

    // Mapeia razões
    const reasons = {
        [DisconnectReason.loggedOut]: { text: 'Logout', reconnect: false, clearCreds: true },
        [DisconnectReason.badSession]: { text: 'Sessão inválida', reconnect: false, clearCreds: true },
        [DisconnectReason.connectionReplaced]: { text: 'Conectado em outro lugar', reconnect: false, clearCreds: true },
        [DisconnectReason.connectionClosed]: { text: 'Conexão fechada', reconnect: true, clearCreds: false },
        [DisconnectReason.connectionLost]: { text: 'Conexão perdida', reconnect: true, clearCreds: false },
        [DisconnectReason.timedOut]: { text: 'Timeout', reconnect: true, clearCreds: false },
        [DisconnectReason.restartRequired]: { text: 'Reinício necessário', reconnect: true, clearCreds: false },
    };

    const reason = reasons[statusCode] || { 
        text: `Desconhecido (${statusCode})`, 
        reconnect: !isConflict, // Não reconecta se for conflito
        clearCreds: isConflict 
    };

    console.log('   ├─ Razão:', reason.text);
    console.log('   ├─ Reconectar:', reason.reconnect);
    console.log('   └─ Limpar credenciais:', reason.clearCreds);

    sendNotification('whatsapp:disconnected', {
        statusCode,
        reason: reason.text,
        willReconnect: reason.reconnect
    });

    addToHistory('disconnected', { statusCode, reason: reason.text });

    // Se precisa limpar credenciais (logout, conflito, etc)
    if (reason.clearCreds || isConflict) {
        console.log('\n🗑️ [LOGOUT] Removendo sessão...');
        clearCredentials();
        
        sendNotification('whatsapp:logged_out', {
            message: 'Sessão encerrada. Escaneie o QR Code novamente.'
        });
        
        // Aguarda e reinicia para novo QR
        console.log('\n🔄 [RESTART] Gerando novo QR Code em 5s...');
        connectionState.retryCount = 0;
        
        await sleep(5000);
        
        // Reinicia
        initializationLock = false;
        await initialize(messageCallback);
        return;
    }

    // Reconexão normal
    if (reason.reconnect && connectionState.retryCount < MAX_RETRY_COUNT) {
        connectionState.retryCount++;
        
        const delay = RECONNECT_BASE_DELAY * Math.pow(1.5, connectionState.retryCount - 1);
        
        console.log(`\n🔄 [RECONNECT] Tentativa ${connectionState.retryCount}/${MAX_RETRY_COUNT}`);
        console.log(`   └─ Aguardando ${Math.round(delay/1000)}s...`);
        
        sendNotification('whatsapp:reconnecting', {
            attempt: connectionState.retryCount,
            maxAttempts: MAX_RETRY_COUNT,
            delayMs: delay
        });

        await sleep(delay);
        
        // Libera lock e reinicia
        initializationLock = false;
        await initialize(messageCallback);
    } else if (connectionState.retryCount >= MAX_RETRY_COUNT) {
        console.log('\n❌ [RECONNECT] Máximo de tentativas atingido');
        sendNotification('whatsapp:connection_failed', {
            message: 'Máximo de tentativas de reconexão atingido'
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

        console.log(`\n📩 [MSG] De: ${messageData.phone} | ${messageData.text.substring(0, 50)}...`);

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

        if (settings.bot.typingDelay > 0) {
            await sock.sendPresenceUpdate('composing', jid);
            await sleep(settings.bot.typingDelay);
        }

        const result = await sock.sendMessage(jid, { text: message });
        await sock.sendPresenceUpdate('paused', jid);

        console.log(`📤 [MSG] Para: ${extractPhoneFromJid(jid)} | ${message.substring(0, 50)}...`);

        logger.messageSent(extractPhoneFromJid(jid), message);

        sendNotification('message:sent', {
            phone: extractPhoneFromJid(jid),
            text: message,
            messageId: result.key.id
        });

        return { success: true, messageId: result.key.id };
    } catch (error) {
        console.error('❌ [MSG] Erro ao enviar:', error.message);
        return { success: false, error: error.message };
    }
}

async function sendMultipleMessages(to, messages) {
    const results = [];
    for (const message of messages) {
        const result = await sendMessage(to, message);
        results.push(result);
        if (settings.bot.messageDelay > 0) {
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
// FUNÇÕES AUXILIARES
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
    return { ...connectionState, socketExists: sock !== null };
}

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
        connectionHistory: connectionState.connectionHistory.slice(-10),
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
        
        sendNotification('whatsapp:logged_out', { message: 'Sessão encerrada' });
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
    initializationLock = false;
    
    await sleep(2000);
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
        initializationAttempts: connectionState.initializationAttempts,
        lastError: connectionState.lastError,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        credsUpdateCount: connectionState.credsUpdateCount,
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
        connection: { ...connectionState, socketExists: sock !== null },
        auth: {
            pathExists: fs.existsSync(AUTH_PATH),
            files: fs.existsSync(AUTH_PATH) ? fs.readdirSync(AUTH_PATH) : [],
        },
        locks: {
            initializationLock,
            hasInitPromise: !!initializationPromise,
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
        typingDelay: settings.bot.typingDelay,
        messageDelay: settings.bot.messageDelay,
        autoReconnect: true,
        maxRetries: MAX_RETRY_COUNT,
        authPath: AUTH_PATH,
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
