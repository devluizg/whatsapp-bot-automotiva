/**
 * ============================================
 * CONFIGURAÇÕES GERAIS DO BOT
 * ============================================
 * 
 * Mensagens, menus e configurações de funcionamento.
 */

require('dotenv').config();

const settings = {
    // ============================================
    // INFORMAÇÕES DA LOJA
    // ============================================
    store: {
        name: process.env.STORE_NAME || 'Loja Automotiva',
        phone: process.env.STORE_PHONE || '',
        address: process.env.STORE_ADDRESS || '',
        instagram: process.env.STORE_INSTAGRAM || '',
    },

    // ============================================
    // INFORMAÇÕES DO BOT
    // ============================================
    bot: {
        name: process.env.BOT_NAME || 'AutoBot',
        prefix: '', // Prefixo para comandos (deixe vazio para nenhum)
        typingDelay: 1000, // Delay para simular digitação (ms)
        messageDelay: 500, // Delay entre mensagens (ms)
    },

    // ============================================
    // HORÁRIO DE FUNCIONAMENTO
    // ============================================
    schedule: {
        startTime: process.env.HORARIO_INICIO || '08:00',
        endTime: process.env.HORARIO_FIM || '18:00',
        workDays: (process.env.DIAS_FUNCIONAMENTO || 'seg,ter,qua,qui,sex,sab').split(','),
        timezone: 'America/Sao_Paulo',
    },

    // ============================================
    // MENSAGENS DO BOT
    // ============================================
    messages: {
        // Saudação inicial
        welcome: `🚗 *Olá! Bem-vindo à {storeName}!*

Sou o *{botName}*, seu assistente virtual.

Como posso ajudar você hoje?`,

        // Menu principal
        mainMenu: `📋 *Menu Principal*

Digite o número da opção desejada:

1️⃣ - Ver peças em estoque
2️⃣ - Buscar peça por nome
3️⃣ - Buscar por veículo
4️⃣ - Promoções do dia
5️⃣ - Horário de funcionamento
6️⃣ - Falar com atendente

💡 _Ou digite diretamente o nome da peça que procura_`,

        // Mensagem de opção inválida
        invalidOption: `❌ Desculpe, não entendi sua mensagem.

Digite *menu* para ver as opções disponíveis.`,

        // Mensagem fora do horário
        outsideHours: `⏰ *Estamos fora do horário de atendimento*

Nosso horário de funcionamento:
🕗 {startTime} às {endTime}
📅 {workDays}

Deixe sua mensagem que responderemos assim que possível!`,

        // Nenhum produto encontrado
        noProductsFound: `😕 *Nenhum produto encontrado*

Não encontramos produtos com esse termo.

💡 *Dicas:*
• Verifique a ortografia
• Tente termos mais simples
• Use o nome genérico da peça

Digite *menu* para ver outras opções.`,

        // Lista de produtos
        productListHeader: `📦 *Produtos em Estoque*

Encontramos {count} produto(s):

`,

        // Item de produto
        productItem: `━━━━━━━━━━━━━━━━━━
📌 *{name}*
💰 Preço: R$ {price}
📊 Estoque: {quantity} unidade(s)
🚗 Compatível: {compatible}
📝 Código: {code}
`,

        // Rodapé da lista
        productListFooter: `
━━━━━━━━━━━━━━━━━━

💬 *Quer mais informações?*
Digite o código do produto ou fale com um atendente.

🔙 Digite *menu* para voltar`,

        // Encaminhamento para atendente
        forwardToHuman: `👨‍💼 *Atendimento Humano*

Certo! Um de nossos atendentes irá falar com você em breve.

⏱️ Tempo médio de espera: 5 minutos

Enquanto isso, pode me dizer mais sobre o que precisa?`,

        // Horário de funcionamento
        storeHours: `🕐 *Horário de Funcionamento*

📍 *{storeName}*

⏰ *Horário:*
{startTime} às {endTime}

📅 *Dias:*
{workDays}

📍 *Endereço:*
{address}

📱 *Instagram:*
{instagram}`,

        // Promoções
        promotions: `🔥 *Promoções do Dia*

Confira nossas ofertas especiais:

`,

        // Despedida
        goodbye: `👋 *Obrigado pelo contato!*

Foi um prazer atender você.
Volte sempre à *{storeName}*!

⭐ _Avalie nosso atendimento!_`,

        // Aguardando busca
        waitingSearch: `🔍 *Busca de Peças*

Digite o *nome da peça* que você procura:

_Exemplo: filtro de óleo, pastilha de freio, vela de ignição_`,

        // Aguardando veículo
        waitingVehicle: `🚗 *Busca por Veículo*

Digite o *modelo do veículo*:

_Exemplo: Gol G5, Civic 2020, HB20 1.0_`,

        // Erro genérico
        error: `⚠️ *Ops! Ocorreu um erro*

Por favor, tente novamente em alguns instantes.

Se o problema persistir, digite *6* para falar com um atendente.`,
    },

    // ============================================
    // PALAVRAS-CHAVE PARA GATILHOS
    // ============================================
    triggers: {
        greetings: ['oi', 'olá', 'ola', 'hey', 'hello', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'eai', 'opa'],
        menu: ['menu', 'opcoes', 'opções', 'ajuda', 'help', 'inicio', 'início', 'voltar'],
        thanks: ['obrigado', 'obrigada', 'valeu', 'agradeço', 'thanks', 'vlw', 'tmj'],
        goodbye: ['tchau', 'bye', 'até mais', 'ate mais', 'flw', 'falou'],
        human: ['atendente', 'humano', 'pessoa', 'falar com alguém', 'falar com alguem'],
    },

    // ============================================
    // ESTADOS DA CONVERSA
    // ============================================
    states: {
        IDLE: 'idle',
        WAITING_SEARCH: 'waiting_search',
        WAITING_VEHICLE: 'waiting_vehicle',
        WAITING_HUMAN: 'waiting_human',
        IN_ATTENDANCE: 'in_attendance',
    },

    // ============================================
    // CONFIGURAÇÕES DE PAGINAÇÃO
    // ============================================
    pagination: {
        productsPerPage: 5,
        maxSearchResults: 10,
    },
};

/**
 * Formata uma mensagem substituindo placeholders
 * @param {string} template - Template da mensagem
 * @param {object} data - Dados para substituição
 * @returns {string} Mensagem formatada
 */
function formatMessage(template, data = {}) {
    let message = template;
    
    // Dados padrão
    const defaultData = {
        storeName: settings.store.name,
        botName: settings.bot.name,
        startTime: settings.schedule.startTime,
        endTime: settings.schedule.endTime,
        workDays: formatWorkDays(settings.schedule.workDays),
        address: settings.store.address || 'Não informado',
        instagram: settings.store.instagram || 'Não informado',
    };

    // Mescla dados padrão com dados fornecidos
    const allData = { ...defaultData, ...data };

    // Substitui placeholders
    for (const [key, value] of Object.entries(allData)) {
        const regex = new RegExp(`{${key}}`, 'g');
        message = message.replace(regex, value);
    }

    return message;
}

/**
 * Formata dias da semana para exibição
 * @param {array} days - Array de dias abreviados
 * @returns {string} Dias formatados
 */
function formatWorkDays(days) {
    const dayNames = {
        'seg': 'Segunda',
        'ter': 'Terça',
        'qua': 'Quarta',
        'qui': 'Quinta',
        'sex': 'Sexta',
        'sab': 'Sábado',
        'dom': 'Domingo',
    };

    return days.map(day => dayNames[day] || day).join(', ');
}

module.exports = {
    settings,
    formatMessage,
    formatWorkDays,
};