/**
 * ============================================
 * HANDLER DE PRODUTOS
 * ============================================
 * 
 * Processa todas as operações relacionadas a
 * produtos: busca, detalhes, estoque, etc.
 */

const productService = require('../services/productService');
const logger = require('../utils/logger');
const { 
    formatProduct, 
    formatProductList, 
    formatCurrency,
    formatStockStatus,
    normalizeForSearch 
} = require('../utils/formatter');
const { settings } = require('../config/settings');

/**
 * Busca produto por código
 * @param {string} code - Código do produto
 * @returns {object} Resposta formatada
 */
async function getProductByCode(code) {
    try {
        const product = await productService.getProductByCode(code);

        if (!product) {
            return {
                found: false,
                message: `❌ *Produto não encontrado*\n\nO código *${code.toUpperCase()}* não existe no nosso sistema.\n\n💡 Dicas:\n• Verifique se digitou corretamente\n• Digite *1* para ver produtos disponíveis\n• Digite *2* para buscar por nome`,
            };
        }

        return {
            found: true,
            product,
            message: await formatProductDetails(product),
        };
    } catch (error) {
        logger.error('Erro ao buscar produto por código:', error.message);
        return {
            found: false,
            message: `⚠️ Erro ao buscar produto. Tente novamente.`,
        };
    }
}

/**
 * Busca produto por ID
 * @param {number} id - ID do produto
 * @returns {object} Resposta formatada
 */
async function getProductById(id) {
    try {
        const product = await productService.getProductById(id);

        if (!product) {
            return {
                found: false,
                message: `❌ Produto não encontrado.`,
            };
        }

        return {
            found: true,
            product,
            message: await formatProductDetails(product),
        };
    } catch (error) {
        logger.error('Erro ao buscar produto por ID:', error.message);
        return {
            found: false,
            message: `⚠️ Erro ao buscar produto. Tente novamente.`,
        };
    }
}

/**
 * Busca produtos por termo
 * @param {string} term - Termo de busca
 * @param {number} limit - Limite de resultados
 * @returns {object} Resposta formatada
 */
async function searchProducts(term, limit = 10) {
    try {
        const normalizedTerm = normalizeForSearch(term);
        
        if (normalizedTerm.length < 2) {
            return {
                found: false,
                count: 0,
                message: `⚠️ *Termo muito curto*\n\nDigite pelo menos 2 caracteres para buscar.`,
            };
        }

        const products = await productService.search(normalizedTerm, limit);

        if (!products || products.length === 0) {
            return {
                found: false,
                count: 0,
                products: [],
                message: getNoResultsMessage(term),
            };
        }

        const formattedList = formatProductList(
            products, 
            1, 
            settings.pagination.productsPerPage
        );

        let message = `🔍 *Resultados para "${term}"*\n`;
        message += `📦 ${products.length} produto(s) encontrado(s)\n\n`;
        message += formattedList;
        message += getSearchFooter();

        return {
            found: true,
            count: products.length,
            products,
            message,
        };
    } catch (error) {
        logger.error('Erro na busca de produtos:', error.message);
        return {
            found: false,
            count: 0,
            message: `⚠️ Erro ao buscar produtos. Tente novamente.`,
        };
    }
}

/**
 * Busca produtos por veículo
 * @param {string} vehicle - Modelo do veículo
 * @param {number} limit - Limite de resultados
 * @returns {object} Resposta formatada
 */
async function searchByVehicle(vehicle, limit = 10) {
    try {
        const products = await productService.searchProductsByVehicle(vehicle, limit);

        if (!products || products.length === 0) {
            return {
                found: false,
                count: 0,
                products: [],
                message: getNoVehicleResultsMessage(vehicle),
            };
        }

        const formattedList = formatProductList(
            products, 
            1, 
            settings.pagination.productsPerPage
        );

        let message = `🚗 *Peças para ${vehicle}*\n`;
        message += `📦 ${products.length} produto(s) compatível(is)\n\n`;
        message += formattedList;
        message += getSearchFooter();

        return {
            found: true,
            count: products.length,
            products,
            message,
        };
    } catch (error) {
        logger.error('Erro na busca por veículo:', error.message);
        return {
            found: false,
            count: 0,
            message: `⚠️ Erro ao buscar produtos. Tente novamente.`,
        };
    }
}

/**
 * Busca produtos por categoria
 * @param {number} categoryId - ID da categoria
 * @param {number} limit - Limite de resultados
 * @returns {object} Resposta formatada
 */
async function searchByCategory(categoryId, limit = 10) {
    try {
        const category = await productService.getCategoryById(categoryId);
        
        if (!category) {
            return {
                found: false,
                count: 0,
                message: `❌ Categoria não encontrada.`,
            };
        }

        const products = await productService.getProductsByCategory(categoryId, limit);

        if (!products || products.length === 0) {
            return {
                found: false,
                count: 0,
                products: [],
                message: `😕 *Nenhum produto em "${category.nome}"*\n\nEsta categoria está vazia no momento.\n\nDigite *menu* para ver outras opções.`,
            };
        }

        const formattedList = formatProductList(
            products, 
            1, 
            settings.pagination.productsPerPage
        );

        let message = `📁 *Categoria: ${category.nome}*\n`;
        message += `📦 ${products.length} produto(s) disponível(is)\n\n`;
        message += formattedList;
        message += getSearchFooter();

        return {
            found: true,
            count: products.length,
            products,
            category,
            message,
        };
    } catch (error) {
        logger.error('Erro na busca por categoria:', error.message);
        return {
            found: false,
            count: 0,
            message: `⚠️ Erro ao buscar produtos. Tente novamente.`,
        };
    }
}

/**
 * Lista todas as categorias disponíveis
 * @returns {object} Resposta formatada
 */
async function getCategories() {
    try {
        const categories = await productService.getAllCategories();

        if (!categories || categories.length === 0) {
            return {
                found: false,
                count: 0,
                message: `😕 Nenhuma categoria disponível.`,
            };
        }

        let message = `📁 *CATEGORIAS DISPONÍVEIS*\n\n`;

        categories.forEach((cat, index) => {
            const emoji = getCategoryEmoji(cat.nome);
            message += `${emoji} *${cat.nome}*\n`;
            message += `   └ ${cat.total_produtos} produto(s) em estoque\n\n`;
        });

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💡 Digite o nome da categoria para ver os produtos.`;

        return {
            found: true,
            count: categories.length,
            categories,
            message,
        };
    } catch (error) {
        logger.error('Erro ao listar categorias:', error.message);
        return {
            found: false,
            count: 0,
            message: `⚠️ Erro ao buscar categorias. Tente novamente.`,
        };
    }
}

/**
 * Lista produtos em destaque
 * @param {number} limit - Limite de resultados
 * @returns {object} Resposta formatada
 */
async function getFeaturedProducts(limit = 5) {
    try {
        const products = await productService.getFeaturedProducts(limit);

        if (!products || products.length === 0) {
            return {
                found: false,
                count: 0,
                message: `😕 Nenhum produto em destaque no momento.`,
            };
        }

        let message = `⭐ *PRODUTOS EM DESTAQUE*\n\n`;
        
        products.forEach(product => {
            message += formatProduct(product);
            message += `\n`;
        });

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `💡 Digite o código do produto para mais detalhes.`;

        return {
            found: true,
            count: products.length,
            products,
            message,
        };
    } catch (error) {
        logger.error('Erro ao listar destaques:', error.message);
        return {
            found: false,
            count: 0,
            message: `⚠️ Erro ao buscar produtos. Tente novamente.`,
        };
    }
}

/**
 * Lista produtos em promoção
 * @param {number} limit - Limite de resultados
 * @returns {object} Resposta formatada
 */
async function getProductsOnSale(limit = 10) {
    try {
        const products = await productService.getProductsOnSale(limit);

        if (!products || products.length === 0) {
            return {
                found: false,
                count: 0,
                message: `😕 *Nenhuma promoção ativa*\n\nFique de olho! Em breve teremos ofertas especiais.\n\nDigite *menu* para ver outras opções.`,
            };
        }

        let message = `🔥 *PRODUTOS EM PROMOÇÃO* 🔥\n\n`;

        products.forEach(product => {
            message += `━━━━━━━━━━━━━━━━━━\n`;
            message += `📌 *${product.nome}*\n`;
            message += `🏷️ Código: ${product.codigo}\n`;
            
            if (product.desconto_percentual) {
                const precoOriginal = formatCurrency(product.preco);
                const precoFinal = formatCurrency(product.preco_final);
                message += `💰 ~${precoOriginal}~ *${precoFinal}*\n`;
                message += `🏷️ *${product.desconto_percentual}% OFF*\n`;
            } else {
                message += `💰 *${formatCurrency(product.preco_final || product.preco)}*\n`;
            }
            
            message += `📊 Estoque: ${product.quantidade} un.\n`;
            
            if (product.promocao_fim) {
                const dataFim = new Date(product.promocao_fim).toLocaleDateString('pt-BR');
                message += `⏰ Válido até: ${dataFim}\n`;
            }
            
            message += `\n`;
        });

        message += `━━━━━━━━━━━━━━━━━━\n`;
        message += `⚡ *Aproveite! Estoque limitado.*\n`;
        message += `💡 Digite o código para mais detalhes.`;

        return {
            found: true,
            count: products.length,
            products,
            message,
        };
    } catch (error) {
        logger.error('Erro ao listar promoções:', error.message);
        return {
            found: false,
            count: 0,
            message: `⚠️ Erro ao buscar promoções. Tente novamente.`,
        };
    }
}

/**
 * Verifica disponibilidade de produto
 * @param {string} codeOrId - Código ou ID do produto
 * @param {number} quantity - Quantidade desejada
 * @returns {object} Resposta formatada
 */
async function checkProductAvailability(codeOrId, quantity = 1) {
    try {
        let product;

        // Tenta buscar por código primeiro
        if (isNaN(codeOrId)) {
            product = await productService.getProductByCode(codeOrId);
        } else {
            product = await productService.getProductById(parseInt(codeOrId));
        }

        if (!product) {
            return {
                available: false,
                message: `❌ Produto não encontrado.`,
            };
        }

        const availability = await productService.checkAvailability(product.id, quantity);

        let message = `📦 *Verificação de Disponibilidade*\n\n`;
        message += `📌 *${product.nome}*\n`;
        message += `🏷️ Código: ${product.codigo}\n`;
        message += `💰 Preço: ${formatCurrency(product.preco)}\n\n`;

        if (availability.available) {
            message += `✅ *DISPONÍVEL*\n`;
            message += `📊 Estoque: ${availability.availableQty} unidade(s)\n`;
            message += `🛒 Quantidade solicitada: ${quantity}\n\n`;
            message += `💡 Digite *6* para falar com um atendente e fazer seu pedido.`;
        } else {
            message += `❌ *${availability.reason.toUpperCase()}*\n`;
            
            if (availability.availableQty > 0) {
                message += `📊 Disponível: apenas ${availability.availableQty} unidade(s)\n`;
            }
            
            message += `\n💡 Digite *6* para ser avisado quando chegar.`;
        }

        return {
            available: availability.available,
            product,
            availableQty: availability.availableQty,
            requestedQty: quantity,
            message,
        };
    } catch (error) {
        logger.error('Erro ao verificar disponibilidade:', error.message);
        return {
            available: false,
            message: `⚠️ Erro ao verificar disponibilidade. Tente novamente.`,
        };
    }
}

/**
 * Busca produtos similares
 * @param {string} codeOrId - Código ou ID do produto
 * @param {number} limit - Limite de resultados
 * @returns {object} Resposta formatada
 */
async function getSimilarProducts(codeOrId, limit = 5) {
    try {
        let product;

        if (isNaN(codeOrId)) {
            product = await productService.getProductByCode(codeOrId);
        } else {
            product = await productService.getProductById(parseInt(codeOrId));
        }

        if (!product) {
            return {
                found: false,
                message: `❌ Produto não encontrado.`,
            };
        }

        const similar = await productService.getSimilarProducts(product.id, limit);

        if (!similar || similar.length === 0) {
            return {
                found: false,
                message: `😕 Nenhum produto similar encontrado.`,
            };
        }

        let message = `🔗 *Produtos similares a "${product.nome}"*\n\n`;

        similar.forEach(p => {
            message += `• *${p.nome}*\n`;
            message += `  ${formatCurrency(p.preco)} | ${formatStockStatus(p.quantidade)}\n`;
            message += `  Código: ${p.codigo}\n\n`;
        });

        message += `💡 Digite o código para mais detalhes.`;

        return {
            found: true,
            count: similar.length,
            products: similar,
            originalProduct: product,
            message,
        };
    } catch (error) {
        logger.error('Erro ao buscar similares:', error.message);
        return {
            found: false,
            message: `⚠️ Erro ao buscar produtos. Tente novamente.`,
        };
    }
}

/**
 * Formata detalhes completos do produto
 * @param {object} product - Dados do produto
 * @returns {string} Mensagem formatada
 */
async function formatProductDetails(product) {
    let message = `📦 *DETALHES DO PRODUTO*\n`;
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    message += `📌 *${product.nome}*\n\n`;
    
    if (product.codigo) {
        message += `🏷️ *Código:* ${product.codigo}\n`;
    }
    
    if (product.categoria_nome) {
        message += `📁 *Categoria:* ${product.categoria_nome}\n`;
    }
    
    if (product.marca) {
        message += `🏭 *Marca:* ${product.marca}\n`;
    }
    
    message += `\n`;
    
    // Preço
    if (product.preco_promocional && product.preco_promocional < product.preco) {
        message += `💰 *Preço:* ~${formatCurrency(product.preco)}~ *${formatCurrency(product.preco_promocional)}*\n`;
        const desconto = Math.round((1 - product.preco_promocional / product.preco) * 100);
        message += `🏷️ *Desconto:* ${desconto}% OFF\n`;
    } else {
        message += `💰 *Preço:* ${formatCurrency(product.preco)}\n`;
    }
    
    message += `\n`;
    
    // Estoque
    const stockStatus = formatStockStatus(product.quantidade, product.quantidade_minima);
    message += `📊 *Estoque:* ${stockStatus}\n`;
    message += `   └ ${product.quantidade} unidade(s) disponível(is)\n`;
    
    if (product.localizacao) {
        message += `📍 *Localização:* ${product.localizacao}\n`;
    }
    
    message += `\n`;
    
    // Compatibilidade
    if (product.veiculo_compativel) {
        message += `🚗 *Veículos Compatíveis:*\n`;
        message += `   ${product.veiculo_compativel}\n\n`;
    }
    
    // Descrição
    if (product.descricao) {
        message += `📝 *Descrição:*\n`;
        message += `   ${product.descricao}\n\n`;
    }
    
    message += `━━━━━━━━━━━━━━━━━━\n\n`;
    
    // Produtos similares
    try {
        const similar = await productService.getSimilarProducts(product.id, 3);
        if (similar && similar.length > 0) {
            message += `🔗 *Veja também:*\n`;
            similar.forEach(p => {
                message += `• ${p.nome} - ${formatCurrency(p.preco)}\n`;
            });
            message += `\n`;
        }
    } catch (e) {
        // Ignora erro de produtos similares
    }
    
    message += `💡 *Quer comprar?*\n`;
    message += `Digite *6* para falar com um atendente.\n\n`;
    message += `🔙 Digite *menu* para voltar ao início.`;
    
    return message;
}

/**
 * Retorna mensagem de nenhum resultado encontrado
 * @param {string} term - Termo buscado
 * @returns {string} Mensagem formatada
 */
function getNoResultsMessage(term) {
    let message = `😕 *Nenhum resultado encontrado*\n\n`;
    message += `Não encontramos produtos para "${term}".\n\n`;
    message += `💡 *Dicas de busca:*\n`;
    message += `• Verifique a ortografia\n`;
    message += `• Use termos mais simples\n`;
    message += `• Tente o nome genérico da peça\n`;
    message += `• Busque pelo código do produto\n\n`;
    message += `🔍 *Exemplos:*\n`;
    message += `• _filtro de oleo_\n`;
    message += `• _pastilha freio_\n`;
    message += `• _FLT001_\n\n`;
    message += `Digite *menu* para ver outras opções.`;
    
    return message;
}

/**
 * Retorna mensagem de nenhum resultado por veículo
 * @param {string} vehicle - Veículo buscado
 * @returns {string} Mensagem formatada
 */
function getNoVehicleResultsMessage(vehicle) {
    let message = `😕 *Nenhuma peça encontrada*\n\n`;
    message += `Não encontramos peças para "${vehicle}".\n\n`;
    message += `💡 *Dicas:*\n`;
    message += `• Tente abreviar (ex: "Gol G5")\n`;
    message += `• Inclua o ano (ex: "Civic 2020")\n`;
    message += `• Use modelo e motor (ex: "HB20 1.0")\n\n`;
    message += `🔍 *Exemplos de busca:*\n`;
    message += `• _Gol G5_\n`;
    message += `• _Onix 2019_\n`;
    message += `• _Corolla 2.0_\n\n`;
    message += `Digite *6* para falar com um atendente.`;
    
    return message;
}

/**
 * Retorna rodapé padrão para buscas
 * @returns {string} Rodapé formatado
 */
function getSearchFooter() {
    let footer = `\n━━━━━━━━━━━━━━━━━━\n`;
    footer += `💡 *Opções:*\n`;
    footer += `• Digite o *código* para mais detalhes\n`;
    footer += `• Digite *menu* para voltar\n`;
    footer += `• Digite *6* para falar com atendente`;
    
    return footer;
}

/**
 * Retorna emoji baseado na categoria
 * @param {string} categoryName - Nome da categoria
 * @returns {string} Emoji correspondente
 */
function getCategoryEmoji(categoryName) {
    const emojiMap = {
        'filtros': '🔧',
        'freios': '🛑',
        'suspensão': '🔩',
        'suspensao': '🔩',
        'motor': '⚙️',
        'elétrica': '⚡',
        'eletrica': '⚡',
        'iluminação': '💡',
        'iluminacao': '💡',
        'óleo': '🛢️',
        'oleo': '🛢️',
        'fluidos': '🛢️',
        'acessórios': '🎁',
        'acessorios': '🎁',
        'pneus': '🛞',
        'lataria': '🚗',
    };

    const normalized = categoryName.toLowerCase();
    
    for (const [key, emoji] of Object.entries(emojiMap)) {
        if (normalized.includes(key)) {
            return emoji;
        }
    }

    return '📦';
}

/**
 * Processa entrada do usuário relacionada a produtos
 * @param {string} input - Entrada do usuário
 * @returns {object|null} Resposta ou null se não for relacionado a produto
 */
async function processProductInput(input) {
    const normalized = input.trim().toUpperCase();

    // Verifica se parece um código de produto (letras + números)
    if (/^[A-Z]{2,4}\d{2,4}$/.test(normalized)) {
        return await getProductByCode(normalized);
    }

    return null;
}

module.exports = {
    getProductByCode,
    getProductById,
    searchProducts,
    searchByVehicle,
    searchByCategory,
    getCategories,
    getFeaturedProducts,
    getProductsOnSale,
    checkProductAvailability,
    getSimilarProducts,
    formatProductDetails,
    processProductInput,
    getNoResultsMessage,
    getNoVehicleResultsMessage,
    getCategoryEmoji,
};