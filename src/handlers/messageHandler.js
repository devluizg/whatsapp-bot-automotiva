/**
 * ============================================
 * HANDLER PRINCIPAL DE MENSAGENS
 * ============================================
 * 
 * Processa todas as mensagens recebidas,
 * identifica intenções e coordena respostas.
 * Agora com integração de IA para respostas inteligentes.
 */

const logger = require('../utils/logger');
const { settings } = require('../config/settings');
const { 
    detectIntent, 
    getMenuOption, 
    extractSearchTerm,
    extractFirstNumber,
    isWithinBusinessHours,
} = require('../utils/helpers');

const customerService = require('../services/customerService');
const whatsappService = require('../services/whatsappService');
const menuHandler = require('./menuHandler');
const productHandler = require('./productHandler');

// IA Service - carrega dinamicamente se configurado
let aiService = null;
let aiEnabled = false;

/**
 * Inicializa o serviço de IA
 */
async function initAI() {
    if (!process.env.OPENAI_API_KEY) {
        logger.warn('⚠️  IA não configurada - modo básico ativo');
        return false;
    }

    try {
        aiService = require('../services/aiService');
        const testResult = await aiService.testConnection();
        
        if (testResult.success) {
            aiEnabled = true;
            logger.info('🧠 IA inicializada com sucesso');
            return true;
        } else {
            logger.warn('⚠️  IA não disponível:', testResult.error);
            return false;
        }
    } catch (error) {
        logger.warn('⚠️  Erro ao carregar serviço de IA:', error.message);
        return false;
    }
}

// Inicializa IA no carregamento do módulo
initAI();

/**
 * Verifica se deve usar IA para a mensagem
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @returns {boolean} Se deve usar IA
 */
function shouldUseAI(text, session) {
    // Se IA não está habilitada, retorna false
    if (!aiEnabled || !aiService) {
        return false;
    }

    // Se está em atendimento humano, não usa IA
    if (session.state === settings.states.IN_ATTENDANCE) {
        return false;
    }

    // Se é um comando de menu simples (número 1-6), não usa IA
    const menuOption = getMenuOption(text);
    if (menuOption >= 1 && menuOption <= 6) {
        return false;
    }

    // Se é comando global (menu, cancelar, sair), não usa IA
    const globalCommands = ['menu', 'voltar', 'inicio', 'cancelar', 'sair'];
    if (globalCommands.includes(text.toLowerCase().trim())) {
        return false;
    }

    // Para mensagens mais complexas ou perguntas, usa IA
    const complexIndicators = [
        '?', 'como', 'qual', 'quanto', 'quando', 'onde', 'porque', 'por que',
        'preciso', 'quero', 'gostaria', 'pode', 'tem', 'existe', 'disponível',
        'preço', 'valor', 'custo', 'orçamento', 'promoção', 'desconto',
        'serve', 'funciona', 'compatível', 'encaixa', 'original',
        'diferença', 'melhor', 'recomenda', 'indica', 'sugere',
        'prazo', 'entrega', 'garantia', 'troca', 'devolução',
        'instala', 'instalação', 'mão de obra', 'serviço'
    ];

    const lowerText = text.toLowerCase();
    const hasComplexIndicator = complexIndicators.some(indicator => lowerText.includes(indicator));

    // Se a mensagem é complexa (tem indicadores ou é longa)
    if (hasComplexIndicator || text.length > 30) {
        return true;
    }

    return false;
}

/**
 * Processa mensagem recebida
 * @param {object} messageData - Dados da mensagem
 * @returns {object} Resultado do processamento
 */
async function handleMessage(messageData) {
    const { phone, text, pushName, jid } = messageData;

    try {
        logger.info(`📨 Processando mensagem de ${phone}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // Registra/atualiza cliente
        const customer = await customerService.upsertCustomer(phone, {
            nome: pushName || null,
        });

        // Salva mensagem recebida no histórico
        await customerService.saveMessage(phone, text, 'entrada');

        // Obtém sessão atual do cliente
        const session = await customerService.getSession(phone);

        // Decide se usa IA ou processamento tradicional
        let response;
        
        if (shouldUseAI(text, session)) {
            response = await processWithAI(text, session, customer);
        } else {
            response = await processMessageByState(text, session, customer);
        }

        // Atualiza sessão se necessário
        if (response.newState) {
            await customerService.updateSession(phone, response.newState, response.data || {});
        }

        // Envia resposta
        if (response.message) {
            await sendResponse(jid, response.message);
            
            // Salva resposta no histórico (marca origem como IA se aplicável)
            const origem = response.fromAI ? 'ia' : 'bot';
            await customerService.saveMessage(phone, response.message, 'saida', origem);
        }

        // Envia mensagens adicionais se houver
        if (response.additionalMessages && response.additionalMessages.length > 0) {
            for (const msg of response.additionalMessages) {
                await sendResponse(jid, msg);
                await customerService.saveMessage(phone, msg, 'saida');
            }
        }

        return {
            success: true,
            response: response.message,
            usedAI: response.fromAI || false,
        };

    } catch (error) {
        logger.error(`Erro ao processar mensagem de ${phone}:`, error.message);
        
        // Envia mensagem de erro
        const errorMessage = menuHandler.getErrorMessage();
        await sendResponse(jid, errorMessage);

        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Processa mensagem usando IA
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @param {object} customer - Dados do cliente
 * @returns {object} Resposta formatada
 */
async function processWithAI(text, session, customer) {
    try {
        logger.info(`🧠 Processando com IA: "${text.substring(0, 30)}..."`);

        // Obtém contexto da conversa
        const conversationHistory = await customerService.getConversationHistory(session.phone, 10);
        
        // Formata histórico para a IA
        const formattedHistory = conversationHistory.map(msg => ({
            role: msg.tipo === 'entrada' ? 'user' : 'assistant',
            content: msg.mensagem
        })).reverse(); // Ordena do mais antigo para o mais recente

        // Chama o serviço de IA
        const aiResponse = await aiService.processMessage({
            message: text,
            customerName: customer?.nome,
            customerPhone: session.phone,
            customerVehicle: customer?.veiculo,
            conversationHistory: formattedHistory,
            sessionData: session.data
        });

        // Se a IA identificou uma ação específica
        if (aiResponse.action) {
            const actionResult = await handleAIAction(aiResponse.action, aiResponse.actionData, session);
            if (actionResult) {
                return {
                    ...actionResult,
                    fromAI: true
                };
            }
        }

        // Retorna resposta da IA
        return {
            message: aiResponse.response,
            newState: aiResponse.suggestedState || session.state,
            data: aiResponse.sessionData || session.data,
            fromAI: true,
            additionalMessages: aiResponse.additionalMessages || []
        };

    } catch (error) {
        logger.error('Erro no processamento com IA:', error.message);
        
        // Fallback para processamento tradicional
        logger.info('Usando fallback para processamento tradicional');
        return await processMessageByState(text, session, customer);
    }
}

/**
 * Processa ações identificadas pela IA
 * @param {string} action - Tipo de ação
 * @param {object} actionData - Dados da ação
 * @param {object} session - Dados da sessão
 * @returns {object|null} Resposta ou null para continuar com resposta da IA
 */
async function handleAIAction(action, actionData, session) {
    try {
        switch (action) {
            case 'search_product':
                // IA identificou que cliente quer buscar produto
                return await menuHandler.handleProductSearch(actionData.query);

            case 'search_vehicle':
                // IA identificou busca por veículo
                return await menuHandler.handleVehicleSearch(actionData.vehicle);

            case 'show_product':
                // IA identificou que cliente quer ver produto específico
                const productResult = await productHandler.processProductInput(actionData.code);
                if (productResult) {
                    return {
                        message: productResult.message,
                        newState: settings.states.IDLE,
                        data: productResult.found ? { selectedProduct: productResult.product } : {}
                    };
                }
                return null;

            case 'show_promotions':
                // IA identificou interesse em promoções
                return await menuHandler.processMenuOption(4, session);

            case 'show_categories':
                // IA identificou interesse em categorias
                return await menuHandler.processMenuOption(5, session);

            case 'request_human':
                // IA identificou que cliente quer falar com humano
                return await menuHandler.handleHumanRequest(session.phone);

            case 'show_services':
                // IA identificou interesse em serviços
                return await handleServicesRequest();

            case 'create_quote':
                // IA identificou pedido de orçamento
                return await handleQuoteRequest(actionData, session);

            case 'check_availability':
                // IA identificou verificação de disponibilidade
                return await handleAvailabilityCheck(actionData);

            default:
                // Ação não reconhecida, deixa a IA responder
                return null;
        }
    } catch (error) {
        logger.error(`Erro ao processar ação da IA (${action}):`, error.message);
        return null;
    }
}

/**
 * Processa pedido de serviços
 * @returns {object} Resposta formatada
 */
async function handleServicesRequest() {
    try {
        const serviceService = require('../services/serviceService');
        const services = await serviceService.getAllServices(10);

        if (services.length === 0) {
            return {
                message: `😅 Ainda não temos serviços cadastrados.\n\nDigite *3* para falar com um atendente.`,
                newState: settings.states.IDLE
            };
        }

        let message = `🔧 *Nossos Serviços*\n\n`;

        services.forEach((service, index) => {
            message += `*${index + 1}. ${service.nome}*\n`;
            if (service.descricao) {
                message += `   ${service.descricao.substring(0, 50)}${service.descricao.length > 50 ? '...' : ''}\n`;
            }
            message += `   💰 R$ ${parseFloat(service.preco).toFixed(2).replace('.', ',')}\n`;
            if (service.duracao_estimada) {
                message += `   ⏱️ ${service.duracao_estimada} min\n`;
            }
            message += `\n`;
        });

        message += `\n💡 Para mais informações sobre um serviço, é só perguntar!`;

        return {
            message,
            newState: settings.states.IDLE
        };
    } catch (error) {
        logger.error('Erro ao buscar serviços:', error.message);
        return {
            message: `🔧 *Nossos Serviços*\n\nPara conhecer nossos serviços e agendar, digite *3* para falar com um atendente.`,
            newState: settings.states.IDLE
        };
    }
}

/**
 * Processa pedido de orçamento
 * @param {object} data - Dados do orçamento
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta formatada
 */
async function handleQuoteRequest(data, session) {
    // Por enquanto, encaminha para atendente
    const message = `📋 *Solicitação de Orçamento*\n\n` +
        `Entendi que você precisa de um orçamento!\n\n` +
        `Para elaborar um orçamento personalizado, vou te conectar com um de nossos atendentes.\n\n` +
        `Aguarde um momento... ⏳`;

    // Adiciona na fila
    await customerService.addToQueue(session.phone, 'Solicitação de orçamento via IA');

    return {
        message,
        newState: settings.states.WAITING_HUMAN,
        additionalMessages: [
            `📍 Você foi adicionado à fila de atendimento.\n\nDigite *cancelar* a qualquer momento para sair da fila.`
        ]
    };
}

/**
 * Processa verificação de disponibilidade
 * @param {object} data - Dados do produto
 * @returns {object} Resposta formatada
 */
async function handleAvailabilityCheck(data) {
    try {
        const productService = require('../services/productService');
        
        if (data.productId) {
            const availability = await productService.checkAvailability(data.productId, data.quantity || 1);
            
            if (availability.available) {
                return {
                    message: `✅ *Disponível!*\n\n` +
                        `*${availability.product.nome}*\n` +
                        `📦 Quantidade em estoque: ${availability.availableQty} unidades\n` +
                        `💰 Preço: R$ ${parseFloat(availability.product.preco).toFixed(2).replace('.', ',')}`,
                    newState: settings.states.IDLE
                };
            } else {
                return {
                    message: `❌ *${availability.reason}*\n\n` +
                        (availability.availableQty > 0 
                            ? `Temos apenas ${availability.availableQty} unidade(s) disponível(is).`
                            : `No momento estamos sem estoque deste produto.`),
                    newState: settings.states.IDLE
                };
            }
        }

        // Se não tem ID, busca pelo termo
        if (data.query) {
            return await menuHandler.handleProductSearch(data.query);
        }

        return null;
    } catch (error) {
        logger.error('Erro ao verificar disponibilidade:', error.message);
        return null;
    }
}

/**
 * Processa mensagem baseado no estado da sessão
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @param {object} customer - Dados do cliente
 * @returns {object} Resposta formatada
 */
async function processMessageByState(text, session, customer) {
    const { state, phone, data } = session;
    const normalizedText = text.toLowerCase().trim();

    // Comandos globais (funcionam em qualquer estado)
    const globalResponse = await handleGlobalCommands(normalizedText, session);
    if (globalResponse) {
        return globalResponse;
    }

    // Comandos administrativos
    const adminResponse = await handleAdminCommand(text, session);
    if (adminResponse) {
        return adminResponse;
    }

    // Processa baseado no estado atual
    switch (state) {
        case settings.states.IDLE:
            return await handleIdleState(text, session, customer);

        case settings.states.WAITING_SEARCH:
            return await handleSearchState(text, session);

        case settings.states.WAITING_VEHICLE:
            return await handleVehicleState(text, session);

        case settings.states.WAITING_HUMAN:
            return await handleHumanWaitState(text, session);

        case settings.states.IN_ATTENDANCE:
            return await handleInAttendanceState(text, session);

        case settings.states.WAITING_AI:
            return await handleAIWaitState(text, session, customer);

        default:
            return await handleIdleState(text, session, customer);
    }
}

/**
 * Processa comandos globais (funcionam em qualquer estado)
 * @param {string} text - Texto normalizado
 * @param {object} session - Dados da sessão
 * @returns {object|null} Resposta ou null se não for comando global
 */
async function handleGlobalCommands(text, session) {
    // Comando: menu / voltar / inicio
    if (settings.triggers.menu.some(trigger => text.includes(trigger))) {
        return {
            message: menuHandler.getMainMenu(),
            newState: settings.states.IDLE,
            data: {},
        };
    }

    // Comando: cancelar
    if (text === 'cancelar' || text === 'sair') {
        await customerService.removeFromQueue(session.phone);
        return {
            message: `✅ Operação cancelada.\n\n${menuHandler.getMainMenu()}`,
            newState: settings.states.IDLE,
            data: {},
        };
    }

    // Comando: ajuda
    if (text === 'ajuda' || text === 'help') {
        return {
            message: getHelpMessage(),
            newState: settings.states.IDLE,
        };
    }

    return null;
}

/**
 * Retorna mensagem de ajuda
 * @returns {string} Mensagem de ajuda
 */
function getHelpMessage() {
    let message = `❓ *Central de Ajuda*\n\n`;
    message += `*Comandos disponíveis:*\n\n`;
    message += `📋 *menu* - Voltar ao menu principal\n`;
    message += `🔍 *buscar [termo]* - Buscar produto\n`;
    message += `🚗 *veiculo [modelo]* - Buscar por veículo\n`;
    message += `❌ *cancelar* - Cancelar operação atual\n`;
    message += `👤 *atendente* - Falar com humano\n\n`;
    
    if (aiEnabled) {
        message += `💡 *Dica:* Você pode me perguntar naturalmente!\n`;
        message += `Exemplos:\n`;
        message += `• _"Tem filtro de óleo pro Gol?"_\n`;
        message += `• _"Quanto custa uma pastilha de freio?"_\n`;
        message += `• _"Quais promoções tem hoje?"_\n`;
    }

    return message;
}

/**
 * Processa mensagem no estado IDLE (padrão)
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @param {object} customer - Dados do cliente
 * @returns {object} Resposta formatada
 */
async function handleIdleState(text, session, customer) {
    const normalizedText = text.toLowerCase().trim();
    const intent = detectIntent(text);

    logger.debug(`Intent detectada: ${intent}`);

    switch (intent) {
        // Saudações
        case 'greeting':
            return await menuHandler.getInitialResponse(customer?.nome);

        // Opção do menu (número)
        case 'menu_option':
            const option = getMenuOption(text);
            if (option >= 1 && option <= 6) {
                return await menuHandler.processMenuOption(option, session);
            }
            return {
                message: menuHandler.getInvalidOptionMessage(),
                newState: settings.states.IDLE,
            };

        // Agradecimento
        case 'thanks':
            return {
                message: menuHandler.getThanksMessage(),
                newState: settings.states.IDLE,
            };

        // Despedida
        case 'goodbye':
            return {
                message: menuHandler.getGoodbyeMessage(),
                newState: settings.states.IDLE,
            };

        // Solicitação de atendente humano
        case 'human':
            return await menuHandler.handleHumanRequest(session.phone);

        // Busca explícita
        case 'search':
            const searchTerm = extractSearchTerm(text);
            if (searchTerm) {
                return await menuHandler.handleProductSearch(searchTerm);
            }
            return {
                message: menuHandler.getSearchPromptMessage(),
                newState: settings.states.WAITING_SEARCH,
            };

        // Busca por veículo
        case 'vehicle_search':
            const vehicle = extractSearchTerm(text);
            if (vehicle) {
                return await menuHandler.handleVehicleSearch(vehicle);
            }
            return {
                message: menuHandler.getVehiclePromptMessage(),
                newState: settings.states.WAITING_VEHICLE,
            };

        // Paginação
        case 'pagination':
            const page = extractFirstNumber(text);
            if (page) {
                return await menuHandler.handlePagination(page, session);
            }
            return {
                message: `⚠️ Informe o número da página.\nExemplo: *pagina 2*`,
                newState: settings.states.IDLE,
            };

        // Busca genérica (pode ser código ou termo)
        case 'generic_search':
        default:
            return await handleGenericInput(text, session);
    }
}

/**
 * Processa entrada genérica (código de produto ou busca)
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta formatada
 */
async function handleGenericInput(text, session) {
    const normalizedText = text.trim();

    // Verifica se é um código de produto
    const productResult = await productHandler.processProductInput(normalizedText);
    if (productResult) {
        return {
            message: productResult.message,
            newState: settings.states.IDLE,
            data: productResult.found ? { selectedProduct: productResult.product } : {},
        };
    }

    // Se o texto for muito curto, pede mais informações
    if (normalizedText.length < 3) {
        return {
            message: menuHandler.getInvalidOptionMessage(),
            newState: settings.states.IDLE,
        };
    }

    // Tenta fazer uma busca com o termo
    const searchResult = await productHandler.searchProducts(normalizedText);

    if (searchResult.found) {
        return {
            message: searchResult.message,
            newState: settings.states.IDLE,
            data: { lastSearch: searchResult.products },
        };
    }

    // Nenhum resultado - mostra sugestões
    return {
        message: searchResult.message,
        newState: settings.states.IDLE,
    };
}

/**
 * Processa mensagem no estado WAITING_SEARCH
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta formatada
 */
async function handleSearchState(text, session) {
    const searchTerm = text.trim();

    if (searchTerm.length < 2) {
        return {
            message: `⚠️ Digite pelo menos 2 caracteres para buscar.\n\nOu digite *menu* para voltar.`,
            newState: settings.states.WAITING_SEARCH,
        };
    }

    const result = await menuHandler.handleProductSearch(searchTerm);
    
    return {
        ...result,
        newState: settings.states.IDLE,
    };
}

/**
 * Processa mensagem no estado WAITING_VEHICLE
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta formatada
 */
async function handleVehicleState(text, session) {
    const vehicle = text.trim();

    if (vehicle.length < 2) {
        return {
            message: `⚠️ Digite o modelo do veículo.\n\nExemplo: _Gol G5_, _Civic 2020_\n\nOu digite *menu* para voltar.`,
            newState: settings.states.WAITING_VEHICLE,
        };
    }

    const result = await menuHandler.handleVehicleSearch(vehicle);
    
    return {
        ...result,
        newState: settings.states.IDLE,
    };
}

/**
 * Processa mensagem no estado WAITING_HUMAN
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta formatada
 */
async function handleHumanWaitState(text, session) {
    const normalizedText = text.toLowerCase().trim();

    // Verifica se quer cancelar
    if (normalizedText === 'cancelar' || normalizedText === 'desistir') {
        await customerService.removeFromQueue(session.phone);
        return {
            message: `✅ Você saiu da fila de atendimento.\n\n${menuHandler.getMainMenu()}`,
            newState: settings.states.IDLE,
            data: {},
        };
    }

    // Obtém posição na fila
    const position = await customerService.getQueuePosition(session.phone);

    // Salva mensagem para o atendente ver depois
    let message = `⏳ *Aguardando atendente...*\n\n`;
    message += `📍 Sua posição na fila: *${position}º*\n\n`;
    message += `Sua mensagem foi registrada e será vista pelo atendente.\n\n`;
    message += `💡 Digite *cancelar* para sair da fila.`;

    return {
        message,
        newState: settings.states.WAITING_HUMAN,
    };
}

/**
 * Processa mensagem no estado IN_ATTENDANCE
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta formatada
 */
async function handleInAttendanceState(text, session) {
    // Quando está em atendimento humano, não responde automaticamente
    // Apenas registra a mensagem
    logger.info(`[ATENDIMENTO] ${session.phone}: ${text}`);

    // Verifica se quer encerrar
    if (text.toLowerCase().trim() === 'encerrar') {
        return {
            message: `✅ *Atendimento encerrado*\n\nObrigado pelo contato!\n\n${menuHandler.getMainMenu()}`,
            newState: settings.states.IDLE,
            data: {},
        };
    }

    // Não envia resposta automática durante atendimento humano
    return {
        message: null,
        newState: settings.states.IN_ATTENDANCE,
    };
}

/**
 * Processa mensagem no estado WAITING_AI (conversação com IA)
 * @param {string} text - Texto da mensagem
 * @param {object} session - Dados da sessão
 * @param {object} customer - Dados do cliente
 * @returns {object} Resposta formatada
 */
async function handleAIWaitState(text, session, customer) {
    // Se a IA está ativa, processa com ela
    if (aiEnabled && aiService) {
        return await processWithAI(text, session, customer);
    }

    // Fallback para estado IDLE
    return await handleIdleState(text, session, customer);
}

/**
 * Envia resposta para o cliente
 * @param {string} jid - JID do destinatário
 * @param {string} message - Mensagem a enviar
 */
async function sendResponse(jid, message) {
    if (!message) return;

    try {
        await whatsappService.sendMessage(jid, message);
    } catch (error) {
        logger.error('Erro ao enviar resposta:', error.message);
        throw error;
    }
}

/**
 * Processa mensagem de forma assíncrona (para filas)
 * @param {object} messageData - Dados da mensagem
 */
async function handleMessageAsync(messageData) {
    try {
        await handleMessage(messageData);
    } catch (error) {
        logger.error('Erro no processamento assíncrono:', error.message);
    }
}

/**
 * Verifica e responde mensagens pendentes na fila de atendimento
 */
async function checkPendingAttendances() {
    try {
        const queue = await customerService.getQueue();
        
        if (queue.length > 0) {
            logger.info(`📋 ${queue.length} cliente(s) aguardando atendimento`);
        }

        // Aqui você pode implementar notificações para atendentes
        // ou lógica de distribuição de atendimentos

    } catch (error) {
        logger.error('Erro ao verificar atendimentos:', error.message);
    }
}

/**
 * Envia mensagem de broadcast para lista de contatos
 * @param {array} phones - Lista de telefones
 * @param {string} message - Mensagem a enviar
 * @returns {object} Resultado do envio
 */
async function broadcastMessage(phones, message) {
    const results = {
        success: [],
        failed: [],
    };

    for (const phone of phones) {
        try {
            await whatsappService.sendMessage(phone, message);
            results.success.push(phone);
            
            // Delay entre mensagens para evitar bloqueio
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            logger.error(`Erro ao enviar para ${phone}:`, error.message);
            results.failed.push({ phone, error: error.message });
        }
    }

    logger.info(`Broadcast: ${results.success.length} enviados, ${results.failed.length} falhas`);
    
    return results;
}

/**
 * Processa comandos administrativos (para uso interno)
 * @param {string} text - Texto do comando
 * @param {object} session - Dados da sessão
 * @returns {object|null} Resposta ou null se não for comando admin
 */
async function handleAdminCommand(text, session) {
    // Lista de telefones admin (configurar no .env)
    const adminPhones = (process.env.ADMIN_PHONES || '').split(',').filter(p => p);
    
    if (!adminPhones.includes(session.phone)) {
        return null;
    }

    const normalizedText = text.toLowerCase().trim();

    // Comando: /status
    if (normalizedText === '/status') {
        const queueCount = await customerService.countQueue();
        const connected = whatsappService.isConnected();
        
        return {
            message: `📊 *Status do Bot*\n\n` +
                    `🤖 Bot: ${connected ? '✅ Online' : '❌ Offline'}\n` +
                    `🧠 IA: ${aiEnabled ? '✅ Ativa' : '❌ Inativa'}\n` +
                    `👥 Fila de atendimento: ${queueCount}\n` +
                    `⏰ Horário comercial: ${isWithinBusinessHours() ? '✅ Sim' : '❌ Não'}`,
            newState: settings.states.IDLE,
        };
    }

    // Comando: /fila
    if (normalizedText === '/fila') {
        const queue = await customerService.getQueue();
        
        if (queue.length === 0) {
            return {
                message: `📋 *Fila de Atendimento*\n\nNenhum cliente aguardando.`,
                newState: settings.states.IDLE,
            };
        }

        let message = `📋 *Fila de Atendimento*\n\n`;
        queue.forEach((item, index) => {
            message += `${index + 1}. ${item.telefone}\n`;
            message += `   └ ${item.motivo || 'Sem motivo'}\n`;
        });

        return {
            message,
            newState: settings.states.IDLE,
        };
    }

    // Comando: /ia [on|off]
    if (normalizedText.startsWith('/ia')) {
        const param = normalizedText.split(' ')[1];
        
        if (param === 'off') {
            aiEnabled = false;
            return {
                message: `🧠 IA desativada temporariamente.`,
                newState: settings.states.IDLE,
            };
        } else if (param === 'on') {
            if (aiService) {
                aiEnabled = true;
                return {
                    message: `🧠 IA ativada!`,
                    newState: settings.states.IDLE,
                };
            } else {
                return {
                    message: `❌ IA não configurada. Verifique a chave OPENAI_API_KEY.`,
                    newState: settings.states.IDLE,
                };
            }
        } else {
            return {
                message: `🧠 *Status da IA*\n\nIA está ${aiEnabled ? 'ativada ✅' : 'desativada ❌'}\n\nUse: /ia on ou /ia off`,
                newState: settings.states.IDLE,
            };
        }
    }

    // Comando: /reload
    if (normalizedText === '/reload') {
        await initAI();
        return {
            message: `🔄 Serviços recarregados!\n\n🧠 IA: ${aiEnabled ? '✅ Ativa' : '❌ Inativa'}`,
            newState: settings.states.IDLE,
        };
    }

    return null;
}

/**
 * Retorna se a IA está habilitada
 * @returns {boolean} Status da IA
 */
function isAIEnabled() {
    return aiEnabled;
}

/**
 * Retorna estatísticas do handler
 * @returns {object} Estatísticas
 */
function getStats() {
    return {
        aiEnabled,
        aiService: aiService ? 'loaded' : 'not loaded'
    };
}

module.exports = {
    handleMessage,
    handleMessageAsync,
    processMessageByState,
    processWithAI,
    handleGlobalCommands,
    handleIdleState,
    handleSearchState,
    handleVehicleState,
    handleHumanWaitState,
    handleInAttendanceState,
    handleAIWaitState,
    checkPendingAttendances,
    broadcastMessage,
    handleAdminCommand,
    isAIEnabled,
    getStats,
    initAI,
};