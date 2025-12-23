/**
 * ============================================
 * SERVIÇO DE INTELIGÊNCIA ARTIFICIAL
 * ============================================
 * 
 * Integração com OpenAI para respostas inteligentes.
 * Processa mensagens, busca no banco de dados e
 * gera respostas contextualizadas.
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');
const productService = require('./productService');

// Cliente OpenAI
let openai = null;

// Configurações
const config = {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE) || 0.7,
};

// Cache simples para evitar chamadas repetidas
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

/**
 * Inicializa o cliente OpenAI
 */
function initOpenAI() {
    if (!process.env.OPENAI_API_KEY) {
        logger.warn('⚠️  OPENAI_API_KEY não configurada');
        return false;
    }

    try {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        logger.info('✅ Cliente OpenAI inicializado');
        return true;
    } catch (error) {
        logger.error('❌ Erro ao inicializar OpenAI:', error.message);
        return false;
    }
}

// Inicializa no carregamento
initOpenAI();

/**
 * Testa conexão com a OpenAI
 * @returns {object} Resultado do teste
 */
async function testConnection() {
    if (!openai) {
        return { success: false, error: 'Cliente não inicializado' };
    }

    try {
        const response = await openai.chat.completions.create({
            model: config.model,
            messages: [{ role: 'user', content: 'Teste de conexão. Responda apenas: OK' }],
            max_tokens: 10,
        });

        return { 
            success: true, 
            model: config.model,
            response: response.choices[0]?.message?.content 
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Gera o prompt do sistema com contexto da loja
 * @returns {string} Prompt do sistema
 */
async function getSystemPrompt() {
    const storeName = process.env.STORE_NAME || 'Nossa Loja';
    const storePhone = process.env.STORE_PHONE || '';
    
    // Obtém resumo do catálogo
    let catalogInfo = '';
    try {
        const summary = await productService.getCatalogSummary();
        if (summary) {
            catalogInfo = `
INFORMAÇÕES DO CATÁLOGO:
- Total de produtos em estoque: ${summary.total_produtos}
- Categorias disponíveis: ${summary.categorias.map(c => c.nome).join(', ')}
- Marcas disponíveis: ${summary.marcas_disponiveis.join(', ')}
- Promoções ativas: ${summary.promocoes_ativas}
`;
        }
    } catch (error) {
        logger.debug('Não foi possível carregar resumo do catálogo');
    }

    return `Você é um assistente virtual da loja "${storeName}", especializada em peças e serviços automotivos.

SUAS RESPONSABILIDADES:
1. Ajudar clientes a encontrar produtos e serviços
2. Informar preços, disponibilidade e compatibilidade de peças
3. Esclarecer dúvidas sobre produtos automotivos
4. Encaminhar para atendimento humano quando necessário
5. Ser sempre educado, prestativo e profissional

${catalogInfo}

REGRAS IMPORTANTES:
- Seja conciso e direto nas respostas (máximo 3-4 parágrafos)
- Use emojis moderadamente para tornar a conversa amigável
- Sempre que mencionar preços, use o formato brasileiro (R$ X,XX)
- Se não souber uma informação específica, sugira falar com um atendente
- Nunca invente informações sobre produtos ou preços
- Para orçamentos complexos, encaminhe para atendente humano
- Identifique o veículo do cliente quando possível para dar recomendações melhores

FORMATAÇÃO (WhatsApp):
- Use *texto* para negrito
- Use _texto_ para itálico
- Use linhas em branco para separar seções
- Use emojis relevantes: 🚗 🔧 💰 ✅ ❌ 📦 ⚠️

AÇÕES QUE VOCÊ PODE SOLICITAR:
Quando identificar uma intenção clara, inclua no final da resposta uma linha especial:
[ACTION:nome_da_acao|parametro1=valor1|parametro2=valor2]

Ações disponíveis:
- search_product: buscar produto (query=termo de busca)
- search_vehicle: buscar por veículo (vehicle=modelo do veículo)  
- show_product: mostrar produto específico (code=código do produto)
- show_promotions: mostrar promoções
- show_categories: mostrar categorias
- show_services: mostrar serviços
- request_human: solicitar atendente humano
- check_availability: verificar disponibilidade (productId=id ou query=termo)
- create_quote: criar orçamento

Exemplo: Se o cliente perguntar "tem filtro de óleo pro gol?", você pode responder normalmente E adicionar:
[ACTION:search_product|query=filtro de óleo|vehicle=gol]

TELEFONE DA LOJA: ${storePhone}
`;
}

/**
 * Processa mensagem do cliente usando IA
 * @param {object} params - Parâmetros da mensagem
 * @returns {object} Resposta da IA
 */
async function processMessage(params) {
    const {
        message,
        customerName,
        customerPhone,
        customerVehicle,
        conversationHistory = [],
        sessionData = {}
    } = params;

    if (!openai) {
        throw new Error('Serviço de IA não inicializado');
    }

    try {
        // Verifica cache
        const cacheKey = `${customerPhone}:${message.toLowerCase().trim()}`;
        const cached = responseCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            logger.debug('Resposta do cache');
            return cached.response;
        }

        // Busca contexto de produtos se a mensagem mencionar busca
        const productContext = await getProductContext(message);

        // Monta mensagens para a API
        const messages = [
            { role: 'system', content: await getSystemPrompt() }
        ];

        // Adiciona contexto do cliente
        if (customerName || customerVehicle) {
            let clientContext = 'CONTEXTO DO CLIENTE:\n';
            if (customerName) clientContext += `- Nome: ${customerName}\n`;
            if (customerVehicle) clientContext += `- Veículo: ${customerVehicle}\n`;
            if (sessionData.lastSearch) clientContext += `- Última busca: ${JSON.stringify(sessionData.lastSearch)}\n`;
            
            messages.push({ role: 'system', content: clientContext });
        }

        // Adiciona contexto de produtos encontrados
        if (productContext) {
            messages.push({ role: 'system', content: productContext });
        }

        // Adiciona histórico da conversa (últimas mensagens)
        const recentHistory = conversationHistory.slice(-6); // Últimas 6 mensagens
        for (const msg of recentHistory) {
            messages.push(msg);
        }

        // Adiciona mensagem atual
        messages.push({ role: 'user', content: message });

        // Chama a API
        const completion = await openai.chat.completions.create({
            model: config.model,
            messages,
            max_tokens: config.maxTokens,
            temperature: config.temperature,
        });

        const responseText = completion.choices[0]?.message?.content || '';

        // Processa a resposta para extrair ações
        const { cleanResponse, action, actionData } = parseResponse(responseText);

        const result = {
            response: cleanResponse,
            action,
            actionData,
            tokensUsed: completion.usage?.total_tokens || 0,
            model: config.model
        };

        // Salva no cache
        responseCache.set(cacheKey, {
            response: result,
            timestamp: Date.now()
        });

        // Limpa cache antigo periodicamente
        cleanCache();

        logger.info(`🧠 IA respondeu (${result.tokensUsed} tokens)`);
        return result;

    } catch (error) {
        logger.error('Erro ao processar com IA:', error.message);
        throw error;
    }
}

/**
 * Busca contexto de produtos relevantes para a mensagem
 * @param {string} message - Mensagem do cliente
 * @returns {string|null} Contexto formatado ou null
 */
async function getProductContext(message) {
    try {
        // Palavras que indicam busca de produto
        const searchIndicators = [
            'tem', 'existe', 'disponível', 'preço', 'valor', 'quanto',
            'buscar', 'procurar', 'filtro', 'óleo', 'pastilha', 'disco',
            'amortecedor', 'vela', 'correia', 'bateria', 'pneu', 'peça'
        ];

        const lowerMessage = message.toLowerCase();
        const shouldSearch = searchIndicators.some(ind => lowerMessage.includes(ind));

        if (!shouldSearch) {
            return null;
        }

        // Extrai possíveis termos de busca
        const searchTerms = extractSearchTerms(message);
        
        if (searchTerms.length === 0) {
            return null;
        }

        // Busca produtos
        const results = await productService.smartSearch({
            query: searchTerms.join(' '),
            limit: 5
        });

        if (!results.products || results.products.length === 0) {
            return `RESULTADO DA BUSCA: Nenhum produto encontrado para "${searchTerms.join(' ')}". Sugira ao cliente reformular a busca ou falar com um atendente.`;
        }

        let context = `PRODUTOS ENCONTRADOS PARA "${searchTerms.join(' ')}":\n\n`;
        
        results.products.forEach((p, i) => {
            context += `${i + 1}. ${p.nome}\n`;
            context += `   Código: ${p.codigo || 'N/A'}\n`;
            context += `   Preço: R$ ${parseFloat(p.preco).toFixed(2)}\n`;
            if (p.preco_final && p.preco_final < p.preco) {
                context += `   Preço Promocional: R$ ${parseFloat(p.preco_final).toFixed(2)}\n`;
            }
            context += `   Estoque: ${p.quantidade} unidades\n`;
            if (p.marca) context += `   Marca: ${p.marca}\n`;
            if (p.veiculo_compativel) context += `   Compatível com: ${p.veiculo_compativel}\n`;
            context += `\n`;
        });

        context += `Use essas informações para responder ao cliente. Mencione os produtos relevantes com seus preços.`;

        return context;
    } catch (error) {
        logger.debug('Erro ao buscar contexto de produtos:', error.message);
        return null;
    }
}

/**
 * Extrai termos de busca da mensagem
 * @param {string} message - Mensagem original
 * @returns {array} Termos de busca
 */
function extractSearchTerms(message) {
    // Remove palavras comuns que não são termos de busca
    const stopWords = [
        'oi', 'olá', 'bom', 'dia', 'tarde', 'noite', 'tem', 'vocês', 'voces',
        'disponível', 'disponivel', 'quero', 'preciso', 'gostaria', 'pode',
        'quanto', 'custa', 'preço', 'preco', 'valor', 'qual', 'como',
        'para', 'pro', 'pra', 'meu', 'minha', 'um', 'uma', 'o', 'a', 'de', 'do', 'da',
        'é', 'e', 'em', 'no', 'na', 'que', 'por', 'com', 'esse', 'essa', 'este', 'esta'
    ];

    // Limpa e tokeniza
    const words = message
        .toLowerCase()
        .replace(/[?!.,;:]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !stopWords.includes(word));

    return words;
}

/**
 * Parseia a resposta da IA para extrair ações
 * @param {string} response - Resposta da IA
 * @returns {object} Resposta limpa e ação extraída
 */
function parseResponse(response) {
    // Procura por padrão de ação: [ACTION:nome|param1=valor1|param2=valor2]
    const actionRegex = /\[ACTION:(\w+)(?:\|([^\]]+))?\]/g;
    
    let action = null;
    let actionData = {};
    
    const match = actionRegex.exec(response);
    if (match) {
        action = match[1];
        
        // Parseia parâmetros
        if (match[2]) {
            const params = match[2].split('|');
            for (const param of params) {
                const [key, value] = param.split('=');
                if (key && value) {
                    actionData[key.trim()] = value.trim();
                }
            }
        }
    }

    // Remove a tag de ação da resposta
    const cleanResponse = response.replace(actionRegex, '').trim();

    return {
        cleanResponse,
        action,
        actionData
    };
}

/**
 * Limpa cache antigo
 */
function cleanCache() {
    const now = Date.now();
    for (const [key, value] of responseCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            responseCache.delete(key);
        }
    }
}

/**
 * Gera resposta para pergunta específica sobre produto
 * @param {object} product - Dados do produto
 * @param {string} question - Pergunta do cliente
 * @returns {string} Resposta formatada
 */
async function answerProductQuestion(product, question) {
    if (!openai) {
        throw new Error('Serviço de IA não inicializado');
    }

    try {
        const productInfo = `
PRODUTO:
- Nome: ${product.nome}
- Código: ${product.codigo || 'N/A'}
- Preço: R$ ${parseFloat(product.preco).toFixed(2)}
- Estoque: ${product.quantidade} unidades
- Marca: ${product.marca || 'N/A'}
- Categoria: ${product.categoria_nome || 'N/A'}
- Descrição: ${product.descricao || 'N/A'}
- Veículos compatíveis: ${product.veiculo_compativel || 'N/A'}
`;

        const completion = await openai.chat.completions.create({
            model: config.model,
            messages: [
                { 
                    role: 'system', 
                    content: `Você é um especialista em peças automotivas. Responda a pergunta do cliente sobre o produto abaixo de forma clara e concisa. Use formatação WhatsApp (*negrito*, _itálico_).

${productInfo}`
                },
                { role: 'user', content: question }
            ],
            max_tokens: 300,
            temperature: 0.7,
        });

        return completion.choices[0]?.message?.content || '';
    } catch (error) {
        logger.error('Erro ao responder sobre produto:', error.message);
        throw error;
    }
}

/**
 * Gera sugestão de produtos baseado no perfil do cliente
 * @param {object} customer - Dados do cliente
 * @param {number} limit - Limite de sugestões
 * @returns {array} Produtos sugeridos
 */
async function suggestProducts(customer, limit = 5) {
    try {
        // Se cliente tem veículo cadastrado, busca compatíveis
        if (customer.veiculo) {
            const products = await productService.searchProductsByVehicle(customer.veiculo, limit);
            if (products.length > 0) {
                return products;
            }
        }

        // Senão, retorna produtos em destaque
        return await productService.getFeaturedProducts(limit);
    } catch (error) {
        logger.error('Erro ao sugerir produtos:', error.message);
        return [];
    }
}

/**
 * Analisa sentimento da mensagem
 * @param {string} message - Mensagem do cliente
 * @returns {object} Análise de sentimento
 */
async function analyzeSentiment(message) {
    if (!openai) {
        return { sentiment: 'neutral', confidence: 0 };
    }

    try {
        const completion = await openai.chat.completions.create({
            model: config.model,
            messages: [
                {
                    role: 'system',
                    content: 'Analise o sentimento da mensagem e responda APENAS com um JSON: {"sentiment": "positive|negative|neutral", "confidence": 0.0-1.0, "urgency": "low|medium|high"}'
                },
                { role: 'user', content: message }
            ],
            max_tokens: 50,
            temperature: 0.3,
        });

        const response = completion.choices[0]?.message?.content || '';
        return JSON.parse(response);
    } catch (error) {
        return { sentiment: 'neutral', confidence: 0, urgency: 'low' };
    }
}

/**
 * Gera resumo da conversa
 * @param {array} messages - Histórico de mensagens
 * @returns {string} Resumo da conversa
 */
async function summarizeConversation(messages) {
    if (!openai || messages.length === 0) {
        return '';
    }

    try {
        const conversationText = messages
            .map(m => `${m.tipo === 'entrada' ? 'Cliente' : 'Atendente'}: ${m.mensagem}`)
            .join('\n');

        const completion = await openai.chat.completions.create({
            model: config.model,
            messages: [
                {
                    role: 'system',
                    content: 'Faça um resumo breve (máximo 3 frases) da conversa abaixo, destacando o que o cliente procura e o status do atendimento.'
                },
                { role: 'user', content: conversationText }
            ],
            max_tokens: 150,
            temperature: 0.5,
        });

        return completion.choices[0]?.message?.content || '';
    } catch (error) {
        logger.error('Erro ao resumir conversa:', error.message);
        return '';
    }
}

/**
 * Retorna estatísticas do serviço
 * @returns {object} Estatísticas
 */
function getStats() {
    return {
        initialized: !!openai,
        model: config.model,
        cacheSize: responseCache.size,
        config: {
            maxTokens: config.maxTokens,
            temperature: config.temperature
        }
    };
}

/**
 * Limpa todo o cache
 */
function clearCache() {
    responseCache.clear();
    logger.info('Cache da IA limpo');
}

module.exports = {
    testConnection,
    processMessage,
    answerProductQuestion,
    suggestProducts,
    analyzeSentiment,
    summarizeConversation,
    getStats,
    clearCache,
    initOpenAI,
};