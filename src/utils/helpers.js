/**
 * ============================================
 * FUNÇÕES AUXILIARES
 * ============================================
 * 
 * Funções utilitárias diversas para uso
 * em toda a aplicação.
 */

const { settings } = require('../config/settings');

/**
 * Aguarda um tempo determinado (sleep)
 * @param {number} ms - Milissegundos para aguardar
 * @returns {Promise} Promise que resolve após o tempo
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Gera um ID único
 * @param {number} length - Tamanho do ID
 * @returns {string} ID gerado
 */
function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
}

/**
 * Gera código de produto
 * @param {string} prefix - Prefixo do código
 * @returns {string} Código gerado (ex: PRD001)
 */
function generateProductCode(prefix = 'PRD') {
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${random}`;
}

/**
 * Verifica se está dentro do horário de funcionamento
 * @returns {boolean} Se está no horário
 */
function isWithinBusinessHours() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Mapeia dia da semana para abreviação
    const dayMap = {
        0: 'dom',
        1: 'seg',
        2: 'ter',
        3: 'qua',
        4: 'qui',
        5: 'sex',
        6: 'sab',
    };

    const currentDay = dayMap[dayOfWeek];
    const workDays = settings.schedule.workDays;

    // Verifica se é dia de funcionamento
    if (!workDays.includes(currentDay)) {
        return false;
    }

    // Converte horários para minutos
    const [startHour, startMin] = settings.schedule.startTime.split(':').map(Number);
    const [endHour, endMin] = settings.schedule.endTime.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Verifica se está dentro do horário
    return currentTime >= startTime && currentTime <= endTime;
}

/**
 * Retorna saudação baseada na hora do dia
 * @returns {string} Saudação apropriada
 */
function getGreeting() {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 12) {
        return 'Bom dia';
    }

    if (hour >= 12 && hour < 18) {
        return 'Boa tarde';
    }

    return 'Boa noite';
}

/**
 * Verifica se uma string contém palavras-chave
 * @param {string} text - Texto para verificar
 * @param {array} keywords - Lista de palavras-chave
 * @returns {boolean} Se contém alguma palavra-chave
 */
function containsKeyword(text, keywords) {
    if (!text || !keywords || !Array.isArray(keywords)) {
        return false;
    }

    const normalizedText = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    return keywords.some(keyword => {
        const normalizedKeyword = keyword
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
        
        return normalizedText.includes(normalizedKeyword);
    });
}

/**
 * Extrai números de uma string
 * @param {string} text - Texto com números
 * @returns {array} Array de números encontrados
 */
function extractNumbers(text) {
    if (!text) return [];
    
    const matches = text.match(/\d+/g);
    return matches ? matches.map(Number) : [];
}

/**
 * Extrai o primeiro número de uma string
 * @param {string} text - Texto com números
 * @returns {number|null} Primeiro número ou null
 */
function extractFirstNumber(text) {
    const numbers = extractNumbers(text);
    return numbers.length > 0 ? numbers[0] : null;
}

/**
 * Verifica se é um número de telefone válido
 * @param {string} phone - Número de telefone
 * @returns {boolean} Se é válido
 */
function isValidPhone(phone) {
    if (!phone) return false;
    
    const numbers = phone.replace(/\D/g, '');
    
    // Aceita formatos: 11999999999 ou 5511999999999
    return numbers.length === 11 || numbers.length === 13;
}

/**
 * Verifica se é um email válido
 * @param {string} email - Endereço de email
 * @returns {boolean} Se é válido
 */
function isValidEmail(email) {
    if (!email) return false;
    
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

/**
 * Verifica se a mensagem é de um grupo
 * @param {string} jid - JID do remetente
 * @returns {boolean} Se é grupo
 */
function isGroupMessage(jid) {
    if (!jid) return false;
    return jid.endsWith('@g.us');
}

/**
 * Verifica se a mensagem é de um contato individual
 * @param {string} jid - JID do remetente
 * @returns {boolean} Se é contato individual
 */
function isPrivateMessage(jid) {
    if (!jid) return false;
    return jid.endsWith('@s.whatsapp.net');
}

/**
 * Retorna a opção do menu baseada na mensagem
 * @param {string} text - Texto da mensagem
 * @returns {number|null} Número da opção ou null
 */
function getMenuOption(text) {
    if (!text) return null;

    const trimmed = text.trim();

    // Verifica se é apenas um número
    if (/^\d+$/.test(trimmed)) {
        return parseInt(trimmed);
    }

    // Verifica emojis de números
    const emojiMap = {
        '1️⃣': 1,
        '2️⃣': 2,
        '3️⃣': 3,
        '4️⃣': 4,
        '5️⃣': 5,
        '6️⃣': 6,
        '7️⃣': 7,
        '8️⃣': 8,
        '9️⃣': 9,
        '0️⃣': 0,
    };

    if (emojiMap[trimmed]) {
        return emojiMap[trimmed];
    }

    return null;
}

/**
 * Detecta a intenção da mensagem
 * @param {string} text - Texto da mensagem
 * @returns {string} Tipo de intenção detectada
 */
function detectIntent(text) {
    if (!text) return 'unknown';

    const normalizedText = text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const { triggers } = settings;

    // Verifica saudações
    if (containsKeyword(normalizedText, triggers.greetings)) {
        return 'greeting';
    }

    // Verifica pedido de menu
    if (containsKeyword(normalizedText, triggers.menu)) {
        return 'menu';
    }

    // Verifica agradecimentos
    if (containsKeyword(normalizedText, triggers.thanks)) {
        return 'thanks';
    }

    // Verifica despedidas
    if (containsKeyword(normalizedText, triggers.goodbye)) {
        return 'goodbye';
    }

    // Verifica pedido de atendente humano
    if (containsKeyword(normalizedText, triggers.human)) {
        return 'human';
    }

    // Verifica se é opção de menu (número)
    const menuOption = getMenuOption(normalizedText);
    if (menuOption !== null) {
        return 'menu_option';
    }

    // Verifica se é busca
    if (normalizedText.startsWith('buscar ') || normalizedText.startsWith('procurar ')) {
        return 'search';
    }

    // Verifica se é busca por veículo
    if (normalizedText.startsWith('veiculo ') || normalizedText.startsWith('carro ')) {
        return 'vehicle_search';
    }

    // Verifica se é navegação de página
    if (normalizedText.startsWith('pagina ') || normalizedText.startsWith('pag ')) {
        return 'pagination';
    }

    // Assume que é uma busca genérica
    return 'generic_search';
}

/**
 * Extrai termo de busca da mensagem
 * @param {string} text - Texto da mensagem
 * @returns {string} Termo de busca
 */
function extractSearchTerm(text) {
    if (!text) return '';

    const normalizedText = text.toLowerCase().trim();

    // Remove prefixos comuns
    const prefixes = ['buscar ', 'procurar ', 'quero ', 'preciso de ', 'tem ', 'veiculo ', 'carro '];
    
    for (const prefix of prefixes) {
        if (normalizedText.startsWith(prefix)) {
            return normalizedText.substring(prefix.length).trim();
        }
    }

    return normalizedText;
}

/**
 * Calcula porcentagem
 * @param {number} value - Valor
 * @param {number} total - Total
 * @returns {number} Porcentagem
 */
function calculatePercentage(value, total) {
    if (!total || total === 0) return 0;
    return Math.round((value / total) * 100);
}

/**
 * Aplica desconto ao preço
 * @param {number} price - Preço original
 * @param {number} discountPercent - Porcentagem de desconto
 * @returns {number} Preço com desconto
 */
function applyDiscount(price, discountPercent) {
    if (!price || !discountPercent) return price;
    return price - (price * discountPercent / 100);
}

/**
 * Ordena array de objetos por propriedade
 * @param {array} array - Array para ordenar
 * @param {string} property - Propriedade para ordenar
 * @param {string} order - Ordem ('asc' ou 'desc')
 * @returns {array} Array ordenado
 */
function sortBy(array, property, order = 'asc') {
    if (!Array.isArray(array)) return [];

    return [...array].sort((a, b) => {
        const valueA = a[property];
        const valueB = b[property];

        if (valueA < valueB) return order === 'asc' ? -1 : 1;
        if (valueA > valueB) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

/**
 * Agrupa array de objetos por propriedade
 * @param {array} array - Array para agrupar
 * @param {string} property - Propriedade para agrupar
 * @returns {object} Objeto com grupos
 */
function groupBy(array, property) {
    if (!Array.isArray(array)) return {};

    return array.reduce((groups, item) => {
        const key = item[property] || 'outros';
        
        if (!groups[key]) {
            groups[key] = [];
        }
        
        groups[key].push(item);
        return groups;
    }, {});
}

/**
 * Retorna data/hora atual formatada
 * @returns {string} Data/hora formatada
 */
function getCurrentDateTime() {
    return new Date().toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/**
 * Verifica se um objeto está vazio
 * @param {object} obj - Objeto para verificar
 * @returns {boolean} Se está vazio
 */
function isEmpty(obj) {
    if (!obj) return true;
    
    if (Array.isArray(obj)) {
        return obj.length === 0;
    }
    
    if (typeof obj === 'object') {
        return Object.keys(obj).length === 0;
    }
    
    if (typeof obj === 'string') {
        return obj.trim().length === 0;
    }
    
    return false;
}

/**
 * Retry de função com exponential backoff
 * @param {function} fn - Função para executar
 * @param {number} maxRetries - Máximo de tentativas
 * @param {number} delay - Delay inicial em ms
 * @returns {any} Resultado da função
 */
async function retry(fn, maxRetries = 3, delay = 1000) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            if (i < maxRetries - 1) {
                await sleep(delay * Math.pow(2, i));
            }
        }
    }

    throw lastError;
}

/**
 * Debounce de função
 * @param {function} fn - Função para executar
 * @param {number} wait - Tempo de espera em ms
 * @returns {function} Função com debounce
 */
function debounce(fn, wait = 300) {
    let timeout;

    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            fn(...args);
        };

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

module.exports = {
    sleep,
    generateId,
    generateProductCode,
    isWithinBusinessHours,
    getGreeting,
    containsKeyword,
    extractNumbers,
    extractFirstNumber,
    isValidPhone,
    isValidEmail,
    isGroupMessage,
    isPrivateMessage,
    getMenuOption,
    detectIntent,
    extractSearchTerm,
    calculatePercentage,
    applyDiscount,
    sortBy,
    groupBy,
    getCurrentDateTime,
    isEmpty,
    retry,
    debounce,
};