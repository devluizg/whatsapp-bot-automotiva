/**
 * ============================================
 * SERVIÇO DO WHATSAPP
 * ============================================
 * 
 * Gerencia conexão com WhatsApp via Baileys,
 * envio e recebimento de mensagens.
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
const qrcode = require('qrcode-terminal');

const logger = require('../utils/logger');
const { settings } = require('../config/settings');
const { sleep } = require('../utils/helpers');
const { formatPhoneForWhatsApp, extractPhoneFromJid } = require('../utils/formatter');

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
};

// Máximo de tentativas de reconexão
const MAX_RETRY_COUNT = 5;

// Caminho para salvar credenciais
const AUTH_PATH = path.join(process.cwd(), 'auth');

// Callback para mensagens recebidas
let messageCallback = null;

// ============================================
// NOVO: Callback para notificações em tempo real
// ============================================
let notificationCallback = null;

/**
 * NOVO: Define callback para notificações em tempo real (Socket.IO)
 * @param {Function} callback - Função de callback (event, data)
 */
function setNotificationCallback(callback) {
    if (typeof callback === 'function') {
        notificationCallback = callback;
        logger.debug('✅ Callback de notificações configurado');
    } else {
        logger.warn('⚠️ setNotificationCallback: callback inválido');
    }
}

/**
 * NOVO: Envia notificação via callback (se definido)
 * @param {string} event - Nome do evento
 * @param {object} data - Dados do evento
 */
function sendNotification(event, data = {}) {
    if (notificationCallback && typeof notificationCallback === 'function') {
        try {
            notificationCallback(event, {
                ...data,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Erro ao enviar notificação:', error.message);
        }
    }
}

/**
 * Garante que a pasta de autenticação existe
 */
function ensureAuthDirectory() {
    if (!fs.existsSync(AUTH_PATH)) {
        fs.mkdirSync(AUTH_PATH, { recursive: true });
        logger.info(`📁 Pasta de autenticação criada: ${AUTH_PATH}`);
    }
}

/**
 * Inicializa a conexão com o WhatsApp
 * @param {function} onMessage - Callback para mensagens recebidas
 * @returns {object} Socket do WhatsApp
 */
async function initialize(onMessage = null) {
    try {
        ensureAuthDirectory();
        
        // Salva callback de mensagens
        if (onMessage) {
            messageCallback = onMessage;
        }

        // Busca versão mais recente do Baileys
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`📱 Baileys versão: ${version.join('.')} (${isLatest ? 'atualizado' : 'desatualizado'})`);

        // Carrega credenciais salvas
        const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

        // Cria socket do WhatsApp
        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            logger: pino({ level: 'silent' }),
            browser: ['Bot Loja Automotiva', 'Chrome', '120.0.0'],
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            emitOwnEvents: false,
            fireInitQueries: false,
        });

        // Configura handlers de eventos
        setupEventHandlers(sock, saveCreds);

        logger.info('🚀 Inicializando conexão com WhatsApp...');
        
        return sock;
    } catch (error) {
        logger.error('❌ Erro ao inicializar WhatsApp:', error.message);
        throw error;
    }
}

/**
 * Configura handlers de eventos do socket
 * @param {object} socket - Socket do WhatsApp
 * @param {function} saveCreds - Função para salvar credenciais
 */
function setupEventHandlers(socket, saveCreds) {
    // Evento de atualização de conexão
    socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR Code gerado
        if (qr) {
            connectionState.qrCode = qr;
            console.log('\n');
            console.log('═══════════════════════════════════════════════════════');
            console.log('   📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP');
            console.log('═══════════════════════════════════════════════════════');
            console.log('\n');
            qrcode.generate(qr, { small: true });
            console.log('\n');
            console.log('═══════════════════════════════════════════════════════');
            console.log('   📲 WhatsApp > Menu (⋮) > Aparelhos conectados');
            console.log('   📲 Toque em "Conectar um aparelho"');
            console.log('═══════════════════════════════════════════════════════');
            console.log('\n');

            // NOVO: Notifica painel web sobre QR Code
            sendNotification('whatsapp:qr', { qrCode: qr });
        }

        // Conexão estabelecida
        if (connection === 'open') {
            connectionState.isConnected = true;
            connectionState.qrCode = null;
            connectionState.retryCount = 0;
            connectionState.lastConnected = new Date().toISOString();
            
            // Tenta obter número do telefone conectado
            if (socket.user) {
                connectionState.phoneNumber = socket.user.id.split(':')[0];
            }
            
            logger.whatsappStatus('Conectado com sucesso! ✅');

            // NOVO: Notifica painel web sobre conexão
            sendNotification('whatsapp:connected', {
                phoneNumber: connectionState.phoneNumber,
                lastConnected: connectionState.lastConnected
            });
        }

        // Conexão fechada
        if (connection === 'close') {
            connectionState.isConnected = false;
            connectionState.lastDisconnect = lastDisconnect;

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            logger.warn(`⚠️ Conexão fechada. Código: ${statusCode}`);

            // NOVO: Notifica painel web sobre desconexão
            sendNotification('whatsapp:disconnected', {
                statusCode,
                willReconnect: shouldReconnect
            });

            if (shouldReconnect && connectionState.retryCount < MAX_RETRY_COUNT) {
                connectionState.retryCount++;
                const delay = Math.min(1000 * Math.pow(2, connectionState.retryCount), 30000);
                
                logger.info(`🔄 Reconectando em ${delay/1000}s... (tentativa ${connectionState.retryCount}/${MAX_RETRY_COUNT})`);
                
                // NOVO: Notifica painel web sobre reconexão
                sendNotification('whatsapp:reconnecting', {
                    attempt: connectionState.retryCount,
                    maxAttempts: MAX_RETRY_COUNT,
                    delayMs: delay
                });

                await sleep(delay);
                await initialize(messageCallback);
            } else if (statusCode === DisconnectReason.loggedOut) {
                logger.error('❌ Deslogado do WhatsApp. Delete a pasta auth/ e escaneie o QR novamente.');
                
                // Remove credenciais inválidas
                if (fs.existsSync(AUTH_PATH)) {
                    fs.rmSync(AUTH_PATH, { recursive: true, force: true });
                    logger.info('🗑️ Credenciais removidas');
                }

                // NOVO: Notifica painel web sobre logout
                sendNotification('whatsapp:logged_out', {
                    message: 'Necessário escanear QR Code novamente'
                });
            } else {
                logger.error('❌ Máximo de tentativas de reconexão atingido');
                
                // NOVO: Notifica painel web sobre falha
                sendNotification('whatsapp:connection_failed', {
                    message: 'Máximo de tentativas de reconexão atingido'
                });
            }
        }
    });

    // Evento de atualização de credenciais
    socket.ev.on('creds.update', saveCreds);

    // Evento de mensagens recebidas
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
        // Ignora atualizações de histórico
        if (type !== 'notify') return;

        for (const msg of messages) {
            await handleIncomingMessage(msg);
        }
    });

    // Evento de presença (online/offline/digitando)
    socket.ev.on('presence.update', ({ id, presences }) => {
        // Pode ser usado para detectar quando usuário está online
        logger.debug(`Presença atualizada: ${id}`);
    });
}

/**
 * Processa mensagem recebida
 * @param {object} msg - Objeto da mensagem
 */
async function handleIncomingMessage(msg) {
    try {
        // Ignora mensagens enviadas pelo próprio bot
        if (msg.key.fromMe) return;

        // Ignora mensagens de broadcast
        if (isJidBroadcast(msg.key.remoteJid)) return;

        // Ignora mensagens de grupo (opcional)
        if (isJidGroup(msg.key.remoteJid)) {
            logger.debug('Mensagem de grupo ignorada');
            return;
        }

        // Extrai informações da mensagem
        const messageData = extractMessageData(msg);
        
        if (!messageData.text) {
            logger.debug('Mensagem sem texto ignorada');
            return;
        }

        logger.messageReceived(messageData.phone, messageData.text);

        // NOVO: Notifica painel web sobre nova mensagem
        sendNotification('message:received', {
            phone: messageData.phone,
            text: messageData.text,
            pushName: messageData.pushName,
            type: messageData.type
        });

        // Envia para o callback de processamento
        if (messageCallback) {
            await messageCallback(messageData);
        }
    } catch (error) {
        logger.error('Erro ao processar mensagem:', error.message);
    }
}

/**
 * Extrai dados relevantes da mensagem
 * @param {object} msg - Objeto da mensagem
 * @returns {object} Dados extraídos
 */
function extractMessageData(msg) {
    const messageContent = msg.message;
    
    // Extrai texto de diferentes tipos de mensagem
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
 * @param {string} to - Destinatário (telefone ou JID)
 * @param {string} message - Mensagem a enviar
 * @returns {object} Resultado do envio
 */
async function sendMessage(to, message) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        // Formata JID se necessário
        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        // Simula digitação
        if (settings.bot.typingDelay > 0) {
            await sock.sendPresenceUpdate('composing', jid);
            await sleep(settings.bot.typingDelay);
        }

        // Envia mensagem
        const result = await sock.sendMessage(jid, { text: message });

        // Para de "digitar"
        await sock.sendPresenceUpdate('paused', jid);

        logger.messageSent(extractPhoneFromJid(jid), message);

        // NOVO: Notifica painel web sobre mensagem enviada
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
        logger.error('Erro ao enviar mensagem:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia mensagem com delay entre múltiplas mensagens
 * @param {string} to - Destinatário
 * @param {array} messages - Array de mensagens
 * @returns {array} Resultados dos envios
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
 * @param {string} to - Destinatário
 * @param {string|Buffer} image - Caminho ou buffer da imagem
 * @param {string} caption - Legenda
 * @returns {object} Resultado do envio
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

        logger.info(`📷 Imagem enviada para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        logger.error('Erro ao enviar imagem:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia mídia (imagem, vídeo, documento)
 * @param {string} to - Destinatário
 * @param {string} mediaUrl - URL ou caminho da mídia
 * @param {string} caption - Legenda
 * @param {string} type - Tipo de mídia (image, video, document)
 * @returns {object} Resultado do envio
 */
async function sendMedia(to, mediaUrl, caption = '', type = 'image') {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        let mediaBuffer;
        if (mediaUrl.startsWith('http')) {
            // Baixa mídia da URL
            const response = await fetch(mediaUrl);
            mediaBuffer = Buffer.from(await response.arrayBuffer());
        } else {
            // Lê do arquivo local
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

        logger.info(`📎 Mídia (${type}) enviada para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        logger.error('Erro ao enviar mídia:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia localização
 * @param {string} to - Destinatário
 * @param {object} location - Dados da localização
 * @returns {object} Resultado do envio
 */
async function sendLocation(to, location) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        // Suporta tanto objeto quanto parâmetros separados
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

        logger.info(`📍 Localização enviada para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        logger.error('Erro ao enviar localização:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Envia contato
 * @param {string} to - Destinatário
 * @param {object|string} contact - Dados do contato ou nome
 * @param {string} phone - Telefone (se contact for string)
 * @returns {object} Resultado do envio
 */
async function sendContact(to, contact, phone = null) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);

        // Suporta tanto objeto quanto parâmetros separados
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

        logger.info(`👤 Contato enviado para ${extractPhoneFromJid(jid)}`);

        return {
            success: true,
            messageId: result.key.id,
        };
    } catch (error) {
        logger.error('Erro ao enviar contato:', error.message);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Marca mensagem como lida
 * @param {object} msg - Dados da mensagem
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
        logger.debug('Erro ao marcar como lida:', error.message);
    }
}

/**
 * Atualiza status de presença
 * @param {string} to - Destinatário
 * @param {string} presence - Tipo de presença (composing, recording, paused)
 */
async function updatePresence(to, presence = 'composing') {
    try {
        if (!sock || !connectionState.isConnected) return;

        const jid = to.includes('@') ? to : formatPhoneForWhatsApp(to);
        await sock.sendPresenceUpdate(presence, jid);
    } catch (error) {
        logger.debug('Erro ao atualizar presença:', error.message);
    }
}

/**
 * Verifica se um número tem WhatsApp
 * @param {string} phone - Número de telefone
 * @returns {boolean} Se tem WhatsApp
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
        logger.error('Erro ao verificar número:', error.message);
        return false;
    }
}

/**
 * Obtém informações do perfil
 * @param {string} phone - Número de telefone
 * @returns {object} Dados do perfil
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
        logger.debug('Erro ao obter perfil:', error.message);
        return {
            phone,
            status: '',
            profilePicture: null,
        };
    }
}

/**
 * Obtém foto de perfil de um contato
 * @param {string} phone - Número de telefone
 * @returns {string|null} URL da foto
 */
async function getProfilePicture(phone) {
    try {
        if (!sock || !connectionState.isConnected) {
            throw new Error('WhatsApp não conectado');
        }

        const jid = formatPhoneForWhatsApp(phone);
        return await sock.profilePictureUrl(jid, 'image');
    } catch (error) {
        logger.debug('Erro ao obter foto de perfil:', error.message);
        return null;
    }
}

/**
 * Obtém informações do perfil de um contato
 * @param {string} phone - Número de telefone
 * @returns {object} Dados do perfil
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
        logger.debug('Erro ao obter perfil do contato:', error.message);
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
 * @returns {object} Estado da conexão
 */
function getConnectionState() {
    return {
        ...connectionState,
        socketExists: sock !== null,
    };
}

/**
 * Retorna status da conexão (formato para API)
 * @returns {object} Status da conexão
 */
async function getConnectionStatus() {
    return {
        connected: connectionState.isConnected,
        status: connectionState.isConnected ? 'connected' : 'disconnected',
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        qrCode: connectionState.qrCode,
        uptime: connectionState.lastConnected 
            ? Date.now() - new Date(connectionState.lastConnected).getTime() 
            : null,
    };
}

/**
 * Retorna o QR Code atual
 * @returns {string|null} QR Code em base64
 */
async function getQRCode() {
    return connectionState.qrCode;
}

/**
 * Retorna informações do dispositivo conectado
 * @returns {object|null} Informações do dispositivo
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
 * @returns {boolean} Status de conexão
 */
function isConnected() {
    return connectionState.isConnected && sock !== null;
}

/**
 * Inicia conexão com WhatsApp
 */
async function connect() {
    if (connectionState.isConnected) {
        logger.warn('WhatsApp já está conectado');
        return;
    }
    
    await initialize(messageCallback);
}

/**
 * Desconecta do WhatsApp
 */
async function disconnect() {
    try {
        if (sock) {
            await sock.logout();
            sock = null;
            connectionState.isConnected = false;
            logger.info('👋 Desconectado do WhatsApp');
            
            sendNotification('whatsapp:disconnected', {
                reason: 'manual'
            });
        }
    } catch (error) {
        logger.error('Erro ao desconectar:', error.message);
    }
}

/**
 * Faz logout do WhatsApp (remove sessão)
 */
async function logout() {
    try {
        if (sock) {
            await sock.logout();
        }
        
        // Remove credenciais
        if (fs.existsSync(AUTH_PATH)) {
            fs.rmSync(AUTH_PATH, { recursive: true, force: true });
            logger.info('🗑️ Credenciais removidas');
        }

        sock = null;
        connectionState.isConnected = false;
        connectionState.qrCode = null;
        connectionState.phoneNumber = null;

        sendNotification('whatsapp:logged_out', {
            message: 'Sessão encerrada'
        });

        logger.info('👋 Logout realizado do WhatsApp');
    } catch (error) {
        logger.error('Erro ao fazer logout:', error.message);
        throw error;
    }
}

/**
 * Reinicia a conexão
 */
async function restart() {
    logger.info('🔄 Reiniciando conexão...');
    
    sendNotification('whatsapp:restarting', {});

    if (sock) {
        sock.end();
        sock = null;
    }
    
    connectionState.isConnected = false;
    connectionState.retryCount = 0;
    
    await sleep(2000);
    await initialize(messageCallback);
}

/**
 * Obtém o socket atual
 * @returns {object} Socket do WhatsApp
 */
function getSocket() {
    return sock;
}

/**
 * Formata número de telefone para WhatsApp
 * @param {string} phone - Número de telefone
 * @returns {string} Número formatado
 */
function formatPhoneNumber(phone) {
    return formatPhoneForWhatsApp(phone);
}

/**
 * Obtém estatísticas do WhatsApp
 * @returns {object} Estatísticas
 */
async function getStats() {
    return {
        connected: connectionState.isConnected,
        phoneNumber: connectionState.phoneNumber,
        lastConnected: connectionState.lastConnected,
        retryCount: connectionState.retryCount,
        uptime: connectionState.lastConnected 
            ? Math.floor((Date.now() - new Date(connectionState.lastConnected).getTime()) / 1000)
            : 0,
    };
}

/**
 * Obtém estatísticas de mensagens
 * @param {string} period - Período (today, week, month)
 * @returns {object} Estatísticas
 */
async function getMessageStats(period = 'today') {
    // Esta função pode ser expandida para buscar do banco de dados
    return {
        period,
        sent: 0,
        received: 0,
        failed: 0,
    };
}

/**
 * Lista grupos do WhatsApp
 * @returns {array} Lista de grupos
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
        logger.error('Erro ao listar grupos:', error.message);
        return [];
    }
}

/**
 * Obtém informações de um grupo
 * @param {string} groupId - ID do grupo
 * @returns {object|null} Informações do grupo
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
        logger.error('Erro ao obter informações do grupo:', error.message);
        return null;
    }
}

// ============================================
// FUNÇÕES DE TEMPLATES (PLACEHOLDER)
// ============================================

/**
 * Lista templates de mensagem
 * @returns {array} Lista de templates
 */
async function getMessageTemplates() {
    // Pode ser expandido para buscar do banco de dados
    return [];
}

/**
 * Cria template de mensagem
 * @param {object} template - Dados do template
 * @returns {number} ID do template
 */
async function createMessageTemplate(template) {
    // Pode ser expandido para salvar no banco de dados
    logger.info(`Template criado: ${template.name}`);
    return Date.now();
}

/**
 * Atualiza template de mensagem
 * @param {number} id - ID do template
 * @param {object} data - Dados para atualizar
 * @returns {boolean} Sucesso
 */
async function updateMessageTemplate(id, data) {
    // Pode ser expandido para atualizar no banco de dados
    logger.info(`Template atualizado: ${id}`);
    return true;
}

/**
 * Remove template de mensagem
 * @param {number} id - ID do template
 * @returns {boolean} Sucesso
 */
async function deleteMessageTemplate(id) {
    // Pode ser expandido para remover do banco de dados
    logger.info(`Template removido: ${id}`);
    return true;
}

// ============================================
// FUNÇÕES DE CONFIGURAÇÃO (PLACEHOLDER)
// ============================================

/**
 * Obtém configurações do WhatsApp
 * @returns {object} Configurações
 */
async function getConfig() {
    return {
        typingDelay: settings.bot.typingDelay,
        messageDelay: settings.bot.messageDelay,
        autoReconnect: true,
        maxRetries: MAX_RETRY_COUNT,
    };
}

/**
 * Atualiza configurações do WhatsApp
 * @param {object} config - Novas configurações
 */
async function updateConfig(config) {
    // Pode ser expandido para salvar configurações
    logger.info('Configurações do WhatsApp atualizadas');
}

// ============================================
// FUNÇÕES DE WEBHOOK (PLACEHOLDER)
// ============================================

/**
 * Processa mensagem recebida via webhook
 * @param {object} data - Dados da mensagem
 */
async function processWebhookMessage(data) {
    logger.debug('Processando mensagem de webhook:', data);
}

/**
 * Processa status de mensagem via webhook
 * @param {object} data - Dados do status
 */
async function processMessageStatus(data) {
    logger.debug('Processando status de mensagem:', data);
}

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
    // NOVO: Funções de notificação
    setNotificationCallback,
    sendNotification,
};