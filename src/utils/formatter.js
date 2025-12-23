/**
 * ============================================
 * FORMATADOR DE MENSAGENS
 * ============================================
 * 
 * Funções para formatar textos, preços e
 * mensagens para exibição no WhatsApp.
 */

/**
 * Formata valor para moeda brasileira
 * @param {number} value - Valor numérico
 * @returns {string} Valor formatado (R$ 0,00)
 */
function formatCurrency(value) {
    if (value === null || value === undefined) {
        return 'R$ 0,00';
    }

    const number = parseFloat(value);
    
    if (isNaN(number)) {
        return 'R$ 0,00';
    }

    return number.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    });
}

/**
 * Formata número de telefone
 * @param {string} phone - Telefone (apenas números)
 * @returns {string} Telefone formatado
 */
function formatPhone(phone) {
    if (!phone) return '';

    // Remove caracteres não numéricos
    const numbers = phone.replace(/\D/g, '');

    // Formato: +55 (11) 99999-9999
    if (numbers.length === 13) {
        return `+${numbers.slice(0, 2)} (${numbers.slice(2, 4)}) ${numbers.slice(4, 9)}-${numbers.slice(9)}`;
    }

    // Formato: (11) 99999-9999
    if (numbers.length === 11) {
        return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    }

    // Formato: (11) 9999-9999
    if (numbers.length === 10) {
        return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    }

    return phone;
}

/**
 * Extrai apenas números do telefone
 * @param {string} phone - Telefone com formatação
 * @returns {string} Apenas números
 */
function cleanPhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

/**
 * Formata telefone para padrão WhatsApp
 * @param {string} phone - Telefone
 * @returns {string} Formato WhatsApp (5511999999999@s.whatsapp.net)
 */
function formatPhoneForWhatsApp(phone) {
    let numbers = cleanPhone(phone);

    // Adiciona código do país se não tiver
    if (numbers.length === 11) {
        numbers = '55' + numbers;
    }

    return `${numbers}@s.whatsapp.net`;
}

/**
 * Extrai telefone do JID do WhatsApp
 * @param {string} jid - JID do WhatsApp
 * @returns {string} Telefone limpo
 */
function extractPhoneFromJid(jid) {
    if (!jid) return '';
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
}

/**
 * Formata data para exibição
 * @param {Date|string} date - Data
 * @param {boolean} includeTime - Incluir hora
 * @returns {string} Data formatada
 */
function formatDate(date, includeTime = false) {
    if (!date) return '';

    const d = new Date(date);
    
    if (isNaN(d.getTime())) {
        return '';
    }

    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    };

    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }

    return d.toLocaleString('pt-BR', options);
}

/**
 * Formata quantidade com unidade
 * @param {number} quantity - Quantidade
 * @param {string} unit - Unidade (un, pç, kg, etc)
 * @returns {string} Quantidade formatada
 */
function formatQuantity(quantity, unit = 'un') {
    if (quantity === null || quantity === undefined) {
        return '0 ' + unit;
    }

    const num = parseInt(quantity);
    
    if (num === 0) {
        return 'Indisponível';
    }

    if (num === 1) {
        return `${num} ${unit}`;
    }

    return `${num} ${unit}s`;
}

/**
 * Formata status do estoque
 * @param {number} quantity - Quantidade em estoque
 * @param {number} minimum - Quantidade mínima
 * @returns {string} Status formatado com emoji
 */
function formatStockStatus(quantity, minimum = 5) {
    if (quantity <= 0) {
        return '🔴 Esgotado';
    }

    if (quantity <= minimum) {
        return '🟡 Últimas unidades';
    }

    if (quantity <= minimum * 2) {
        return '🟢 Em estoque';
    }

    return '🟢 Disponível';
}

/**
 * Formata produto para exibição no WhatsApp
 * @param {object} product - Dados do produto
 * @returns {string} Produto formatado
 */
function formatProduct(product) {
    const price = formatCurrency(product.preco);
    const promoPrice = product.preco_promocional 
        ? formatCurrency(product.preco_promocional) 
        : null;
    
    const stockStatus = formatStockStatus(product.quantidade, product.quantidade_minima);

    let text = `━━━━━━━━━━━━━━━━━━\n`;
    text += `📌 *${product.nome}*\n`;
    
    if (product.codigo) {
        text += `🏷️ Código: ${product.codigo}\n`;
    }

    if (promoPrice) {
        text += `💰 ~${price}~ *${promoPrice}*\n`;
    } else {
        text += `💰 Preço: *${price}*\n`;
    }

    text += `📊 ${stockStatus} (${product.quantidade} un)\n`;

    if (product.marca) {
        text += `🏭 Marca: ${product.marca}\n`;
    }

    if (product.veiculo_compativel) {
        text += `🚗 Compatível: ${product.veiculo_compativel}\n`;
    }

    if (product.descricao) {
        text += `📝 ${product.descricao}\n`;
    }

    return text;
}

/**
 * Formata lista de produtos
 * @param {array} products - Lista de produtos
 * @param {number} page - Página atual
 * @param {number} perPage - Itens por página
 * @returns {string} Lista formatada
 */
function formatProductList(products, page = 1, perPage = 5) {
    if (!products || products.length === 0) {
        return '😕 Nenhum produto encontrado.';
    }

    const totalPages = Math.ceil(products.length / perPage);
    const startIndex = (page - 1) * perPage;
    const endIndex = startIndex + perPage;
    const pageProducts = products.slice(startIndex, endIndex);

    let text = `📦 *Produtos Encontrados*\n`;
    text += `📄 Página ${page} de ${totalPages} (${products.length} itens)\n\n`;

    pageProducts.forEach((product, index) => {
        text += formatProduct(product);
        text += '\n';
    });

    if (totalPages > 1) {
        text += `━━━━━━━━━━━━━━━━━━\n`;
        text += `📄 Digite *pagina [número]* para navegar\n`;
        text += `Exemplo: pagina 2`;
    }

    return text;
}

/**
 * Formata promoção para exibição
 * @param {object} promo - Dados da promoção
 * @returns {string} Promoção formatada
 */
function formatPromotion(promo) {
    let text = `🔥 *${promo.titulo}*\n`;
    
    if (promo.descricao) {
        text += `${promo.descricao}\n`;
    }

    if (promo.desconto_percentual) {
        text += `💥 *${promo.desconto_percentual}% OFF*\n`;
    }

    if (promo.desconto_valor) {
        text += `💥 *${formatCurrency(promo.desconto_valor)} de desconto*\n`;
    }

    const inicio = formatDate(promo.data_inicio);
    const fim = formatDate(promo.data_fim);
    text += `📅 Válido: ${inicio} até ${fim}\n`;

    return text;
}

/**
 * Formata lista de promoções
 * @param {array} promotions - Lista de promoções
 * @returns {string} Lista formatada
 */
function formatPromotionList(promotions) {
    if (!promotions || promotions.length === 0) {
        return '😕 Nenhuma promoção ativa no momento.';
    }

    let text = `🔥 *PROMOÇÕES DO DIA* 🔥\n\n`;

    promotions.forEach(promo => {
        text += formatPromotion(promo);
        text += '\n';
    });

    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `💬 Aproveite! Estoque limitado.`;

    return text;
}

/**
 * Trunca texto se exceder o limite
 * @param {string} text - Texto original
 * @param {number} maxLength - Tamanho máximo
 * @param {string} suffix - Sufixo quando truncado
 * @returns {string} Texto truncado
 */
function truncate(text, maxLength = 100, suffix = '...') {
    if (!text) return '';
    
    if (text.length <= maxLength) {
        return text;
    }

    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Capitaliza primeira letra de cada palavra
 * @param {string} text - Texto original
 * @returns {string} Texto capitalizado
 */
function capitalize(text) {
    if (!text) return '';

    return text
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Remove acentos do texto
 * @param {string} text - Texto com acentos
 * @returns {string} Texto sem acentos
 */
function removeAccents(text) {
    if (!text) return '';

    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normaliza texto para busca
 * @param {string} text - Texto original
 * @returns {string} Texto normalizado
 */
function normalizeForSearch(text) {
    if (!text) return '';

    return removeAccents(text)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Formata tempo de espera
 * @param {number} minutes - Minutos de espera
 * @returns {string} Tempo formatado
 */
function formatWaitTime(minutes) {
    if (minutes < 1) {
        return 'menos de 1 minuto';
    }

    if (minutes === 1) {
        return '1 minuto';
    }

    if (minutes < 60) {
        return `${minutes} minutos`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 1) {
        return mins > 0 ? `1 hora e ${mins} minutos` : '1 hora';
    }

    return mins > 0 ? `${hours} horas e ${mins} minutos` : `${hours} horas`;
}

/**
 * Gera separador visual
 * @param {string} char - Caractere do separador
 * @param {number} length - Tamanho
 * @returns {string} Separador
 */
function separator(char = '━', length = 20) {
    return char.repeat(length);
}

module.exports = {
    formatCurrency,
    formatPhone,
    cleanPhone,
    formatPhoneForWhatsApp,
    extractPhoneFromJid,
    formatDate,
    formatQuantity,
    formatStockStatus,
    formatProduct,
    formatProductList,
    formatPromotion,
    formatPromotionList,
    truncate,
    capitalize,
    removeAccents,
    normalizeForSearch,
    formatWaitTime,
    separator,
};