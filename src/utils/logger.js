/**
 * ============================================
 * SISTEMA DE LOGS
 * ============================================
 * 
 * Logger centralizado para toda a aplicação.
 * Salva logs em arquivo e exibe no console.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configurações
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE || 'logs/bot.log';

// Níveis de log (ordem de prioridade)
const LOG_LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

// Cores para o console
const COLORS = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

// Emojis para cada nível
const EMOJIS = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    debug: '🔍',
};

/**
 * Garante que a pasta de logs existe
 */
function ensureLogDirectory() {
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
}

/**
 * Formata a data/hora atual
 * @returns {string} Data formatada
 */
function getTimestamp() {
    const now = new Date();
    return now.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/**
 * Formata a data para o arquivo de log
 * @returns {string} Data formatada ISO
 */
function getFileTimestamp() {
    return new Date().toISOString();
}

/**
 * Verifica se o nível deve ser logado
 * @param {string} level - Nível do log
 * @returns {boolean} Se deve logar
 */
function shouldLog(level) {
    const configuredLevel = LOG_LEVELS[LOG_LEVEL] ?? LOG_LEVELS.info;
    const messageLevel = LOG_LEVELS[level] ?? LOG_LEVELS.info;
    return messageLevel <= configuredLevel;
}

/**
 * Formata argumentos para string
 * @param {array} args - Argumentos
 * @returns {string} String formatada
 */
function formatArgs(args) {
    return args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg, null, 2);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

/**
 * Escreve log no arquivo
 * @param {string} level - Nível do log
 * @param {string} message - Mensagem
 */
function writeToFile(level, message) {
    try {
        ensureLogDirectory();
        const logEntry = `[${getFileTimestamp()}] [${level.toUpperCase()}] ${message}\n`;
        fs.appendFileSync(LOG_FILE, logEntry);
    } catch (error) {
        console.error('Erro ao escrever log:', error.message);
    }
}

/**
 * Exibe log no console com cores
 * @param {string} level - Nível do log
 * @param {string} message - Mensagem
 */
function writeToConsole(level, message) {
    const timestamp = getTimestamp();
    const emoji = EMOJIS[level] || '';
    
    let color;
    switch (level) {
        case 'error':
            color = COLORS.red;
            break;
        case 'warn':
            color = COLORS.yellow;
            break;
        case 'info':
            color = COLORS.green;
            break;
        case 'debug':
            color = COLORS.gray;
            break;
        default:
            color = COLORS.reset;
    }

    console.log(
        `${COLORS.gray}[${timestamp}]${COLORS.reset} ${color}${emoji} ${message}${COLORS.reset}`
    );
}

/**
 * Função principal de log
 * @param {string} level - Nível do log
 * @param  {...any} args - Argumentos
 */
function log(level, ...args) {
    if (!shouldLog(level)) {
        return;
    }

    const message = formatArgs(args);
    
    writeToConsole(level, message);
    writeToFile(level, message);
}

/**
 * Log de erro
 * @param  {...any} args - Argumentos
 */
function error(...args) {
    log('error', ...args);
}

/**
 * Log de aviso
 * @param  {...any} args - Argumentos
 */
function warn(...args) {
    log('warn', ...args);
}

/**
 * Log de informação
 * @param  {...any} args - Argumentos
 */
function info(...args) {
    log('info', ...args);
}

/**
 * Log de debug
 * @param  {...any} args - Argumentos
 */
function debug(...args) {
    log('debug', ...args);
}

/**
 * Log de mensagem recebida
 * @param {string} phone - Telefone
 * @param {string} message - Mensagem
 */
function messageReceived(phone, message) {
    const truncated = message.length > 50 ? message.substring(0, 50) + '...' : message;
    info(`📩 [${phone}] Recebida: "${truncated}"`);
}

/**
 * Log de mensagem enviada
 * @param {string} phone - Telefone
 * @param {string} message - Mensagem
 */
function messageSent(phone, message) {
    const truncated = message.length > 50 ? message.substring(0, 50) + '...' : message;
    info(`📤 [${phone}] Enviada: "${truncated}"`);
}

/**
 * Log de conexão WhatsApp
 * @param {string} status - Status da conexão
 */
function whatsappStatus(status) {
    info(`📱 WhatsApp: ${status}`);
}

/**
 * Log de erro com stack trace
 * @param {string} context - Contexto do erro
 * @param {Error} err - Objeto de erro
 */
function errorWithStack(context, err) {
    error(`${context}: ${err.message}`);
    if (err.stack) {
        debug('Stack trace:', err.stack);
    }
}

/**
 * Limpa logs antigos (mantém últimos X dias)
 * @param {number} days - Dias para manter
 */
function cleanOldLogs(days = 7) {
    try {
        const logDir = path.dirname(LOG_FILE);
        const files = fs.readdirSync(logDir);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        files.forEach(file => {
            const filePath = path.join(logDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime < cutoffDate && file.endsWith('.log')) {
                fs.unlinkSync(filePath);
                info(`🗑️ Log antigo removido: ${file}`);
            }
        });
    } catch (err) {
        error('Erro ao limpar logs:', err.message);
    }
}

/**
 * Retorna o caminho do arquivo de log
 * @returns {string} Caminho do arquivo
 */
function getLogFilePath() {
    return path.resolve(LOG_FILE);
}

// Exporta o logger
module.exports = {
    log,
    error,
    warn,
    info,
    debug,
    messageReceived,
    messageSent,
    whatsappStatus,
    errorWithStack,
    cleanOldLogs,
    getLogFilePath,
    LOG_LEVELS,
};