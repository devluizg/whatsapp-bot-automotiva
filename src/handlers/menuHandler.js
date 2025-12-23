/**
 * ============================================
 * HANDLER DE MENUS
 * ============================================
 * 
 * Gerencia exibição de menus e navegação
 * entre as diferentes opções do bot.
 */

const { settings, formatMessage } = require('../config/settings');
const { formatProductList, formatPromotionList } = require('../utils/formatter');
const { getGreeting, isWithinBusinessHours } = require('../utils/helpers');
const logger = require('../utils/logger');

const productService = require('../services/productService');
const customerService = require('../services/customerService');

/**
 * Gera mensagem de boas-vindas
 * @param {string} customerName - Nome do cliente (opcional)
 * @returns {string} Mensagem de boas-vindas
 */
function getWelcomeMessage(customerName = '') {
    const greeting = getGreeting();
    
    let message = formatMessage(settings.messages.welcome, {
        greeting,
        customerName: customerName || 'cliente',
    });

    return message;
}

/**
 * Gera menu principal
 * @returns {string} Menu principal formatado
 */
function getMainMenu() {
    return formatMessage(settings.messages.mainMenu);
}

/**
 * Gera mensagem de boas-vindas + menu principal
 * @param {string} customerName - Nome do cliente (opcional)
 * @returns {string} Mensagem completa
 */
function getWelcomeWithMenu(customerName = '') {
    const welcome = getWelcomeMessage(customerName);
    const menu = getMainMenu();
    
    return `${welcome}\n\n${menu}`;
}

/**
 * Gera mensagem de fora do horário de funcionamento
 * @returns {string} Mensagem formatada
 */
function getOutsideHoursMessage() {
    return formatMessage(settings.messages.outsideHours);
}

/**
 * Gera mensagem de opção inválida
 * @returns {string} Mensagem formatada
 */
function getInvalidOptionMessage() {
    return formatMessage(settings.messages.invalidOption);
}

/**
 * Gera mensagem de erro
 * @returns {string} Mensagem formatada
 */
function getErrorMessage() {
    return formatMessage(settings.messages.error);
}

/**
 * Gera mensagem de despedida
 * @returns {string} Mensagem formatada
 */
function getGoodbyeMessage() {
    return formatMessage(settings.messages.goodbye);
}

/**
 * Gera mensagem de agradecimento
 * @returns {string} Mensagem formatada
 */
function getThanksMessage() {
    return `😊 *Por nada!*\n\nSe precisar de mais alguma coisa, é só chamar!\n\nDigite *menu* para ver as opções.`;
}

/**
 * Gera mensagem de horário de funcionamento
 * @returns {string} Mensagem formatada
 */
function getStoreHoursMessage() {
    return formatMessage(settings.messages.storeHours);
}

/**
 * Gera mensagem solicitando termo de busca
 * @returns {string} Mensagem formatada
 */
function getSearchPromptMessage() {
    return formatMessage(settings.messages.waitingSearch);
}

/**
 * Gera mensagem solicitando veículo
 * @returns {string} Mensagem formatada
 */
function getVehiclePromptMessage() {
    return formatMessage(settings.messages.waitingVehicle);
}

/**
 * Gera mensagem de encaminhamento para atendente
 * @param {number} position - Posição na fila
 * @returns {string} Mensagem formatada
 */
function getHumanQueueMessage(position = 0) {
    let message = formatMessage(settings.messages.forwardToHuman);
    
    if (position > 0) {
        message += `\n\n📍 Sua posição na fila: *${position}º*`;
    }
    
    return message;
}

/**
 * Gera mensagem de nenhum produto encontrado
 * @returns {string} Mensagem formatada
 */
function getNoProductsMessage() {
    return formatMessage(settings.messages.noProductsFound);
}

/**
 * Processa seleção do menu principal
 * @param {number} option - Opção selecionada
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta com mensagem e novo estado
 */
async function processMenuOption(option, session) {
    try {
        switch (option) {
            case 1:
                // Ver peças em estoque
                return await handleProductList();

            case 2:
                // Buscar peça por nome
                return {
                    message: getSearchPromptMessage(),
                    newState: settings.states.WAITING_SEARCH,
                    data: { searchType: 'name' },
                };

            case 3:
                // Buscar por veículo
                return {
                    message: getVehiclePromptMessage(),
                    newState: settings.states.WAITING_VEHICLE,
                    data: { searchType: 'vehicle' },
                };

            case 4:
                // Promoções do dia
                return await handlePromotions();

            case 5:
                // Horário de funcionamento
                return {
                    message: getStoreHoursMessage(),
                    newState: settings.states.IDLE,
                };

            case 6:
                // Falar com atendente
                return await handleHumanRequest(session.phone);

            default:
                return {
                    message: getInvalidOptionMessage(),
                    newState: settings.states.IDLE,
                };
        }
    } catch (error) {
        logger.error('Erro ao processar opção do menu:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa listagem de produtos em estoque
 * @param {number} page - Página atual
 * @returns {object} Resposta com lista de produtos
 */
async function handleProductList(page = 1) {
    try {
        const perPage = settings.pagination.productsPerPage;
        const offset = (page - 1) * perPage;
        
        const products = await productService.getAllProducts(50, 0);
        
        if (!products || products.length === 0) {
            return {
                message: getNoProductsMessage(),
                newState: settings.states.IDLE,
            };
        }

        const formattedList = formatProductList(products, page, perPage);
        
        let message = formattedList;
        message += `\n\n💡 *Dicas:*\n`;
        message += `• Digite o *código* do produto para mais detalhes\n`;
        message += `• Digite *buscar [nome]* para filtrar\n`;
        message += `• Digite *menu* para voltar`;

        return {
            message,
            newState: settings.states.IDLE,
            data: { 
                lastSearch: products,
                currentPage: page,
                totalPages: Math.ceil(products.length / perPage),
            },
        };
    } catch (error) {
        logger.error('Erro ao listar produtos:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa busca por nome de produto
 * @param {string} searchTerm - Termo de busca
 * @returns {object} Resposta com resultados
 */
async function handleProductSearch(searchTerm) {
    try {
        const products = await productService.search(searchTerm, settings.pagination.maxSearchResults);

        if (!products || products.length === 0) {
            return {
                message: getNoProductsMessage(),
                newState: settings.states.IDLE,
            };
        }

        const formattedList = formatProductList(products, 1, settings.pagination.productsPerPage);
        
        let message = `🔍 *Resultados para "${searchTerm}":*\n\n`;
        message += formattedList;
        message += `\n\n💡 Digite *menu* para ver outras opções`;

        return {
            message,
            newState: settings.states.IDLE,
            data: { 
                lastSearch: products,
                searchTerm,
            },
        };
    } catch (error) {
        logger.error('Erro na busca de produtos:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa busca por veículo
 * @param {string} vehicle - Modelo do veículo
 * @returns {object} Resposta com resultados
 */
async function handleVehicleSearch(vehicle) {
    try {
        const products = await productService.searchProductsByVehicle(
            vehicle, 
            settings.pagination.maxSearchResults
        );

        if (!products || products.length === 0) {
            let message = `😕 *Nenhum produto encontrado para "${vehicle}"*\n\n`;
            message += `💡 *Dicas:*\n`;
            message += `• Tente abreviar o nome (ex: "Gol G5" ao invés de "Volkswagen Gol G5")\n`;
            message += `• Informe o ano do veículo\n`;
            message += `• Digite *menu* para outras opções`;
            
            return {
                message,
                newState: settings.states.IDLE,
            };
        }

        const formattedList = formatProductList(products, 1, settings.pagination.productsPerPage);
        
        let message = `🚗 *Peças para "${vehicle}":*\n\n`;
        message += formattedList;
        message += `\n\n💡 Digite *menu* para ver outras opções`;

        return {
            message,
            newState: settings.states.IDLE,
            data: { 
                lastSearch: products,
                vehicle,
            },
        };
    } catch (error) {
        logger.error('Erro na busca por veículo:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa exibição de promoções
 * @returns {object} Resposta com promoções
 */
async function handlePromotions() {
    try {
        const promotions = await productService.getActivePromotions(5);
        const productsOnSale = await productService.getProductsOnSale(5);

        if ((!promotions || promotions.length === 0) && 
            (!productsOnSale || productsOnSale.length === 0)) {
            return {
                message: `😕 *Sem promoções no momento*\n\nFique de olho! Em breve teremos ofertas especiais.\n\nDigite *menu* para ver outras opções.`,
                newState: settings.states.IDLE,
            };
        }

        let message = `🔥 *PROMOÇÕES DO DIA* 🔥\n\n`;

        if (promotions && promotions.length > 0) {
            message += formatPromotionList(promotions);
            message += `\n`;
        }

        if (productsOnSale && productsOnSale.length > 0) {
            message += `\n📦 *Produtos em Oferta:*\n\n`;
            message += formatProductList(productsOnSale, 1, 5);
        }

        message += `\n\n💡 Aproveite! Estoque limitado.\nDigite *menu* para outras opções.`;

        return {
            message,
            newState: settings.states.IDLE,
        };
    } catch (error) {
        logger.error('Erro ao buscar promoções:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa solicitação de atendimento humano
 * @param {string} phone - Telefone do cliente
 * @returns {object} Resposta com status da fila
 */
async function handleHumanRequest(phone) {
    try {
        const result = await customerService.addToQueue(phone, 'Solicitação via menu');

        if (result.success) {
            return {
                message: getHumanQueueMessage(result.position),
                newState: settings.states.WAITING_HUMAN,
            };
        } else {
            let message = `ℹ️ ${result.message}\n\n`;
            message += `📍 Sua posição na fila: *${result.position}º*\n\n`;
            message += `Aguarde que em breve você será atendido.`;
            
            return {
                message,
                newState: settings.states.WAITING_HUMAN,
            };
        }
    } catch (error) {
        logger.error('Erro ao solicitar atendente:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa busca por código de produto
 * @param {string} code - Código do produto
 * @returns {object} Resposta com detalhes do produto
 */
async function handleProductByCode(code) {
    try {
        const product = await productService.getProductByCode(code.toUpperCase());

        if (!product) {
            return {
                message: `❌ Produto com código *${code.toUpperCase()}* não encontrado.\n\nDigite *menu* para ver as opções.`,
                newState: settings.states.IDLE,
            };
        }

        const { formatProduct } = require('../utils/formatter');
        
        let message = `📦 *Detalhes do Produto*\n`;
        message += formatProduct(product);
        
        // Busca produtos similares
        const similar = await productService.getSimilarProducts(product.id, 3);
        
        if (similar && similar.length > 0) {
            message += `\n\n🔗 *Produtos Relacionados:*\n`;
            similar.forEach(p => {
                message += `• ${p.nome} - R$ ${p.preco}\n`;
            });
        }

        message += `\n\n💡 *Quer comprar?*\n`;
        message += `Digite *6* para falar com um atendente.`;

        return {
            message,
            newState: settings.states.IDLE,
            data: { selectedProduct: product },
        };
    } catch (error) {
        logger.error('Erro ao buscar produto por código:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Processa navegação de página
 * @param {number} page - Número da página
 * @param {object} session - Dados da sessão
 * @returns {object} Resposta com página solicitada
 */
async function handlePagination(page, session) {
    try {
        const products = session.data?.lastSearch;
        
        if (!products || products.length === 0) {
            return {
                message: `⚠️ Nenhuma busca ativa.\n\nDigite *1* para ver produtos em estoque ou *2* para fazer uma busca.`,
                newState: settings.states.IDLE,
            };
        }

        const perPage = settings.pagination.productsPerPage;
        const totalPages = Math.ceil(products.length / perPage);

        if (page < 1 || page > totalPages) {
            return {
                message: `⚠️ Página inválida. Digite um número entre 1 e ${totalPages}.`,
                newState: settings.states.IDLE,
            };
        }

        const formattedList = formatProductList(products, page, perPage);

        return {
            message: formattedList,
            newState: settings.states.IDLE,
            data: { 
                ...session.data,
                currentPage: page,
            },
        };
    } catch (error) {
        logger.error('Erro na paginação:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Gera menu de categorias
 * @returns {object} Resposta com menu de categorias
 */
async function handleCategoriesMenu() {
    try {
        const categories = await productService.getAllCategories();

        if (!categories || categories.length === 0) {
            return {
                message: `😕 Nenhuma categoria disponível no momento.`,
                newState: settings.states.IDLE,
            };
        }

        let message = `📁 *Categorias Disponíveis*\n\n`;

        categories.forEach((cat, index) => {
            message += `${index + 1}️⃣ ${cat.nome} (${cat.total_produtos} produtos)\n`;
        });

        message += `\n💡 Digite o número da categoria para ver os produtos.`;

        return {
            message,
            newState: settings.states.IDLE,
            data: { categories },
        };
    } catch (error) {
        logger.error('Erro ao listar categorias:', error.message);
        return {
            message: getErrorMessage(),
            newState: settings.states.IDLE,
        };
    }
}

/**
 * Verifica se deve mostrar menu ou mensagem de horário
 * @param {string} customerName - Nome do cliente
 * @returns {object} Resposta apropriada
 */
async function getInitialResponse(customerName = '') {
    // Verifica horário de funcionamento
    if (!isWithinBusinessHours()) {
        const outsideMessage = getOutsideHoursMessage();
        const menu = getMainMenu();
        
        return {
            message: `${outsideMessage}\n\n${menu}`,
            newState: settings.states.IDLE,
        };
    }

    return {
        message: getWelcomeWithMenu(customerName),
        newState: settings.states.IDLE,
    };
}

module.exports = {
    // Mensagens
    getWelcomeMessage,
    getMainMenu,
    getWelcomeWithMenu,
    getOutsideHoursMessage,
    getInvalidOptionMessage,
    getErrorMessage,
    getGoodbyeMessage,
    getThanksMessage,
    getStoreHoursMessage,
    getSearchPromptMessage,
    getVehiclePromptMessage,
    getHumanQueueMessage,
    getNoProductsMessage,
    
    // Handlers
    processMenuOption,
    handleProductList,
    handleProductSearch,
    handleVehicleSearch,
    handlePromotions,
    handleHumanRequest,
    handleProductByCode,
    handlePagination,
    handleCategoriesMenu,
    getInitialResponse,
};