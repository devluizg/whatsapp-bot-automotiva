/**
 * ============================================
 * SERVIÇO DE PRODUTOS
 * ============================================
 * 
 * Lógica de negócio para gerenciamento de
 * produtos, estoque e promoções.
 */

const db = require('../database/connection');
const logger = require('../utils/logger');
const { normalizeForSearch } = require('../utils/formatter');

// ============================================
// FUNÇÕES DE BUSCA (BOT E IA)
// ============================================

/**
 * Busca todos os produtos em estoque
 * @param {number} limit - Limite de resultados
 * @param {number} offset - Offset para paginação
 * @returns {array} Lista de produtos
 */
async function getAllProducts(limit = 10, offset = 0) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 AND p.quantidade > 0
            ORDER BY p.nome ASC
            LIMIT ? OFFSET ?
        `;

        const products = await db.query(sql, [limit, offset]);
        logger.debug(`Produtos encontrados: ${products.length}`);
        
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos:', error.message);
        throw error;
    }
}

/**
 * Conta total de produtos em estoque
 * @returns {number} Total de produtos
 */
async function countProducts() {
    try {
        const result = await db.queryOne(`
            SELECT COUNT(*) AS total 
            FROM produtos 
            WHERE ativo = 1 AND quantidade > 0
        `);
        
        return result ? result.total : 0;
    } catch (error) {
        logger.error('Erro ao contar produtos:', error.message);
        return 0;
    }
}

/**
 * Busca produto por ID
 * @param {number} id - ID do produto
 * @returns {object|null} Produto encontrado ou null
 */
async function getProductById(id) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.id = ? AND p.ativo = 1
        `;

        const product = await db.queryOne(sql, [id]);
        return product;
    } catch (error) {
        logger.error('Erro ao buscar produto por ID:', error.message);
        throw error;
    }
}

/**
 * Busca produto por código
 * @param {string} code - Código do produto
 * @returns {object|null} Produto encontrado ou null
 */
async function getProductByCode(code) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.codigo = ? AND p.ativo = 1
        `;

        const product = await db.queryOne(sql, [code.toUpperCase()]);
        return product;
    } catch (error) {
        logger.error('Erro ao buscar produto por código:', error.message);
        throw error;
    }
}

/**
 * Busca produtos por nome
 * @param {string} searchTerm - Termo de busca
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos
 */
async function searchProductsByName(searchTerm, limit = 10) {
    try {
        const normalized = normalizeForSearch(searchTerm);
        const searchPattern = `%${normalized}%`;

        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND (
                    LOWER(p.nome) LIKE LOWER(?)
                    OR LOWER(p.descricao) LIKE LOWER(?)
                    OR LOWER(p.codigo) LIKE LOWER(?)
                    OR LOWER(p.marca) LIKE LOWER(?)
                )
            ORDER BY 
                CASE 
                    WHEN LOWER(p.nome) LIKE LOWER(?) THEN 1
                    WHEN LOWER(p.nome) LIKE LOWER(?) THEN 2
                    ELSE 3
                END,
                p.nome ASC
            LIMIT ?
        `;

        const exactMatch = `${normalized}%`;
        const products = await db.query(sql, [
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            normalized,
            exactMatch,
            limit
        ]);

        logger.info(`Busca por "${searchTerm}": ${products.length} resultado(s)`);
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos por nome:', error.message);
        throw error;
    }
}

/**
 * Busca produtos por veículo compatível
 * @param {string} vehicle - Modelo do veículo
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos
 */
async function searchProductsByVehicle(vehicle, limit = 10) {
    try {
        const normalized = normalizeForSearch(vehicle);
        const searchPattern = `%${normalized}%`;

        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND LOWER(p.veiculo_compativel) LIKE LOWER(?)
            ORDER BY p.nome ASC
            LIMIT ?
        `;

        const products = await db.query(sql, [searchPattern, limit]);
        logger.info(`Busca por veículo "${vehicle}": ${products.length} resultado(s)`);
        
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos por veículo:', error.message);
        throw error;
    }
}

/**
 * Busca produtos por categoria
 * @param {number} categoryId - ID da categoria
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos
 */
async function getProductsByCategory(categoryId, limit = 10) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND p.categoria_id = ?
            ORDER BY p.nome ASC
            LIMIT ?
        `;

        const products = await db.query(sql, [categoryId, limit]);
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos por categoria:', error.message);
        throw error;
    }
}

/**
 * Busca produtos em destaque
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos
 */
async function getFeaturedProducts(limit = 5) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND p.destaque = 1
            ORDER BY p.updated_at DESC
            LIMIT ?
        `;

        const products = await db.query(sql, [limit]);
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos em destaque:', error.message);
        throw error;
    }
}

/**
 * Busca produtos com estoque baixo
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos
 */
async function getLowStockProducts(limit = 10) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND p.quantidade <= p.quantidade_minima
            ORDER BY p.quantidade ASC
            LIMIT ?
        `;

        const products = await db.query(sql, [limit]);
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos com estoque baixo:', error.message);
        throw error;
    }
}

// Alias para getLowStockProducts
const getLowStock = getLowStockProducts;

/**
 * Busca todas as categorias ativas
 * @returns {array} Lista de categorias
 */
async function getAllCategories() {
    try {
        const sql = `
            SELECT 
                c.*,
                COUNT(p.id) AS total_produtos
            FROM categorias c
            LEFT JOIN produtos p ON c.id = p.categoria_id AND p.ativo = 1 AND p.quantidade > 0
            WHERE c.ativo = 1
            GROUP BY c.id
            ORDER BY c.nome ASC
        `;

        const categories = await db.query(sql);
        return categories;
    } catch (error) {
        logger.error('Erro ao buscar categorias:', error.message);
        throw error;
    }
}

/**
 * Busca categoria por ID
 * @param {number} id - ID da categoria
 * @returns {object|null} Categoria encontrada ou null
 */
async function getCategoryById(id) {
    try {
        const category = await db.queryOne(
            'SELECT * FROM categorias WHERE id = ? AND ativo = 1',
            [id]
        );
        return category;
    } catch (error) {
        logger.error('Erro ao buscar categoria por ID:', error.message);
        throw error;
    }
}

/**
 * Busca promoções ativas
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de promoções
 */
async function getActivePromotions(limit = 5) {
    try {
        const sql = `
            SELECT 
                pr.*,
                p.nome AS produto_nome,
                p.preco AS produto_preco,
                p.quantidade AS produto_quantidade,
                p.codigo AS produto_codigo
            FROM promocoes pr
            LEFT JOIN produtos p ON pr.produto_id = p.id
            WHERE pr.ativo = 1
                AND pr.data_inicio <= CURDATE()
                AND pr.data_fim >= CURDATE()
                AND (p.id IS NULL OR (p.ativo = 1 AND p.quantidade > 0))
            ORDER BY pr.data_fim ASC
            LIMIT ?
        `;

        const promotions = await db.query(sql, [limit]);
        logger.debug(`Promoções ativas: ${promotions.length}`);
        
        return promotions;
    } catch (error) {
        logger.error('Erro ao buscar promoções:', error.message);
        throw error;
    }
}

/**
 * Busca produtos em promoção
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos em promoção
 */
async function getProductsOnSale(limit = 10) {
    try {
        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome,
                pr.desconto_percentual,
                pr.desconto_valor,
                pr.data_fim AS promocao_fim,
                CASE 
                    WHEN pr.desconto_percentual > 0 
                        THEN p.preco - (p.preco * pr.desconto_percentual / 100)
                    WHEN pr.desconto_valor > 0 
                        THEN p.preco - pr.desconto_valor
                    ELSE p.preco_promocional
                END AS preco_final
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN promocoes pr ON p.id = pr.produto_id 
                AND pr.ativo = 1 
                AND pr.data_inicio <= CURDATE() 
                AND pr.data_fim >= CURDATE()
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND (
                    p.preco_promocional IS NOT NULL 
                    OR pr.id IS NOT NULL
                )
            ORDER BY pr.data_fim ASC, p.nome ASC
            LIMIT ?
        `;

        const products = await db.query(sql, [limit]);
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos em promoção:', error.message);
        throw error;
    }
}

/**
 * Atualiza quantidade do estoque
 * @param {number} productId - ID do produto
 * @param {number} quantity - Nova quantidade (ou delta se relative=true)
 * @param {boolean} relative - Se deve adicionar/subtrair da quantidade atual
 * @returns {boolean} Sucesso da operação
 */
async function updateStock(productId, quantity, relative = false) {
    try {
        let sql;
        
        if (relative) {
            sql = `
                UPDATE produtos 
                SET quantidade = quantidade + ?,
                    updated_at = NOW()
                WHERE id = ?
            `;
        } else {
            sql = `
                UPDATE produtos 
                SET quantidade = ?,
                    updated_at = NOW()
                WHERE id = ?
            `;
        }

        const result = await db.query(sql, [quantity, productId]);
        
        if (result.affectedRows > 0) {
            logger.info(`Estoque atualizado - Produto ID ${productId}: ${relative ? (quantity > 0 ? '+' : '') + quantity : quantity}`);
            return true;
        }

        return false;
    } catch (error) {
        logger.error('Erro ao atualizar estoque:', error.message);
        throw error;
    }
}

/**
 * Verifica disponibilidade do produto
 * @param {number} productId - ID do produto
 * @param {number} requestedQty - Quantidade solicitada
 * @returns {object} Informações de disponibilidade
 */
async function checkAvailability(productId, requestedQty = 1) {
    try {
        const product = await getProductById(productId);

        if (!product) {
            return {
                available: false,
                reason: 'Produto não encontrado',
                product: null,
                requestedQty,
                availableQty: 0
            };
        }

        if (product.quantidade <= 0) {
            return {
                available: false,
                reason: 'Produto esgotado',
                product,
                requestedQty,
                availableQty: 0
            };
        }

        if (product.quantidade < requestedQty) {
            return {
                available: false,
                reason: 'Quantidade insuficiente em estoque',
                product,
                requestedQty,
                availableQty: product.quantidade
            };
        }

        return {
            available: true,
            reason: 'Disponível',
            product,
            requestedQty,
            availableQty: product.quantidade
        };
    } catch (error) {
        logger.error('Erro ao verificar disponibilidade:', error.message);
        throw error;
    }
}

/**
 * Busca produtos similares
 * @param {number} productId - ID do produto base
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos similares
 */
async function getSimilarProducts(productId, limit = 5) {
    try {
        const product = await getProductById(productId);
        
        if (!product) {
            return [];
        }

        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND p.id != ?
                AND p.categoria_id = ?
            ORDER BY RAND()
            LIMIT ?
        `;

        const products = await db.query(sql, [productId, product.categoria_id, limit]);
        return products;
    } catch (error) {
        logger.error('Erro ao buscar produtos similares:', error.message);
        throw error;
    }
}

/**
 * Busca geral (nome, código, veículo, categoria)
 * @param {string} term - Termo de busca
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de produtos
 */
async function search(term, limit = 10) {
    try {
        const normalized = normalizeForSearch(term);
        const searchPattern = `%${normalized}%`;

        const sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome,
                CASE 
                    WHEN LOWER(p.codigo) = LOWER(?) THEN 1
                    WHEN LOWER(p.nome) LIKE LOWER(?) THEN 2
                    WHEN LOWER(p.veiculo_compativel) LIKE LOWER(?) THEN 3
                    ELSE 4
                END AS relevancia
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE p.ativo = 1 
                AND p.quantidade > 0
                AND (
                    LOWER(p.nome) LIKE LOWER(?)
                    OR LOWER(p.codigo) LIKE LOWER(?)
                    OR LOWER(p.descricao) LIKE LOWER(?)
                    OR LOWER(p.marca) LIKE LOWER(?)
                    OR LOWER(p.veiculo_compativel) LIKE LOWER(?)
                    OR LOWER(c.nome) LIKE LOWER(?)
                )
            ORDER BY relevancia ASC, p.nome ASC
            LIMIT ?
        `;

        const products = await db.query(sql, [
            normalized,
            `${normalized}%`,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            limit
        ]);

        logger.info(`Busca geral por "${term}": ${products.length} resultado(s)`);
        return products;
    } catch (error) {
        logger.error('Erro na busca geral:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES PARA IA - BUSCA INTELIGENTE
// ============================================

/**
 * Busca inteligente para a IA (busca em múltiplos campos com contexto)
 * @param {object} params - Parâmetros de busca
 * @returns {object} Resultados e contexto
 */
async function smartSearch(params = {}) {
    try {
        const {
            query = '',
            categoria = null,
            veiculo = null,
            marca = null,
            precoMin = null,
            precoMax = null,
            apenasPromocao = false,
            apenasDestaque = false,
            limit = 10
        } = params;

        let sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome,
                pr.desconto_percentual,
                pr.desconto_valor,
                CASE 
                    WHEN pr.desconto_percentual > 0 
                        THEN ROUND(p.preco - (p.preco * pr.desconto_percentual / 100), 2)
                    WHEN pr.desconto_valor > 0 
                        THEN ROUND(p.preco - pr.desconto_valor, 2)
                    WHEN p.preco_promocional IS NOT NULL 
                        THEN p.preco_promocional
                    ELSE p.preco
                END AS preco_final,
                (pr.id IS NOT NULL OR p.preco_promocional IS NOT NULL) AS em_promocao
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            LEFT JOIN promocoes pr ON p.id = pr.produto_id 
                AND pr.ativo = 1 
                AND pr.data_inicio <= CURDATE() 
                AND pr.data_fim >= CURDATE()
            WHERE p.ativo = 1 AND p.quantidade > 0
        `;

        const queryParams = [];

        // Busca por texto
        if (query) {
            const normalized = normalizeForSearch(query);
            const searchPattern = `%${normalized}%`;
            sql += ` AND (
                LOWER(p.nome) LIKE LOWER(?)
                OR LOWER(p.codigo) LIKE LOWER(?)
                OR LOWER(p.descricao) LIKE LOWER(?)
                OR LOWER(p.marca) LIKE LOWER(?)
                OR LOWER(p.veiculo_compativel) LIKE LOWER(?)
                OR LOWER(c.nome) LIKE LOWER(?)
            )`;
            queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Filtro por categoria
        if (categoria) {
            if (typeof categoria === 'number') {
                sql += ` AND p.categoria_id = ?`;
                queryParams.push(categoria);
            } else {
                sql += ` AND LOWER(c.nome) LIKE LOWER(?)`;
                queryParams.push(`%${categoria}%`);
            }
        }

        // Filtro por veículo
        if (veiculo) {
            sql += ` AND LOWER(p.veiculo_compativel) LIKE LOWER(?)`;
            queryParams.push(`%${veiculo}%`);
        }

        // Filtro por marca
        if (marca) {
            sql += ` AND LOWER(p.marca) LIKE LOWER(?)`;
            queryParams.push(`%${marca}%`);
        }

        // Filtro por faixa de preço
        if (precoMin !== null) {
            sql += ` AND p.preco >= ?`;
            queryParams.push(precoMin);
        }

        if (precoMax !== null) {
            sql += ` AND p.preco <= ?`;
            queryParams.push(precoMax);
        }

        // Apenas promoções
        if (apenasPromocao) {
            sql += ` AND (pr.id IS NOT NULL OR p.preco_promocional IS NOT NULL)`;
        }

        // Apenas destaque
        if (apenasDestaque) {
            sql += ` AND p.destaque = 1`;
        }

        sql += ` ORDER BY p.destaque DESC, p.nome ASC LIMIT ?`;
        queryParams.push(limit);

        const products = await db.query(sql, queryParams);

        // Gera contexto para a IA
        const context = {
            total_encontrado: products.length,
            filtros_aplicados: {
                busca: query || null,
                categoria: categoria || null,
                veiculo: veiculo || null,
                marca: marca || null,
                faixa_preco: (precoMin || precoMax) ? { min: precoMin, max: precoMax } : null,
                apenas_promocao: apenasPromocao,
                apenas_destaque: apenasDestaque
            },
            sugestoes: []
        };

        // Adiciona sugestões se não encontrou nada
        if (products.length === 0 && query) {
            const sugestoes = await getSuggestions(query);
            context.sugestoes = sugestoes;
        }

        logger.info(`Smart search: ${products.length} resultado(s) para query="${query}"`);

        return {
            products,
            context
        };
    } catch (error) {
        logger.error('Erro na busca inteligente:', error.message);
        throw error;
    }
}

/**
 * Busca sugestões quando não encontra resultados
 * @param {string} term - Termo original
 * @returns {array} Sugestões de busca
 */
async function getSuggestions(term) {
    try {
        // Busca produtos mais populares/destaque como sugestão
        const suggestions = await db.query(`
            SELECT DISTINCT 
                nome,
                categoria_id,
                (SELECT nome FROM categorias WHERE id = p.categoria_id) AS categoria_nome
            FROM produtos p
            WHERE ativo = 1 AND quantidade > 0
            ORDER BY destaque DESC, quantidade DESC
            LIMIT 5
        `);

        return suggestions.map(s => s.nome);
    } catch (error) {
        return [];
    }
}

/**
 * Obtém informações completas de um produto para a IA
 * @param {number} productId - ID do produto
 * @returns {object} Informações detalhadas
 */
async function getProductDetailsForAI(productId) {
    try {
        const product = await getProductById(productId);
        
        if (!product) {
            return null;
        }

        // Busca promoção ativa
        const promotion = await db.queryOne(`
            SELECT * FROM promocoes 
            WHERE produto_id = ? 
                AND ativo = 1 
                AND data_inicio <= CURDATE() 
                AND data_fim >= CURDATE()
        `, [productId]);

        // Busca produtos similares
        const similar = await getSimilarProducts(productId, 3);

        // Calcula preço final
        let precoFinal = product.preco;
        if (promotion) {
            if (promotion.desconto_percentual > 0) {
                precoFinal = product.preco - (product.preco * promotion.desconto_percentual / 100);
            } else if (promotion.desconto_valor > 0) {
                precoFinal = product.preco - promotion.desconto_valor;
            }
        } else if (product.preco_promocional) {
            precoFinal = product.preco_promocional;
        }

        return {
            ...product,
            promocao: promotion,
            preco_final: Math.round(precoFinal * 100) / 100,
            economia: promotion ? Math.round((product.preco - precoFinal) * 100) / 100 : 0,
            produtos_similares: similar,
            disponivel: product.quantidade > 0,
            estoque_baixo: product.quantidade <= product.quantidade_minima
        };
    } catch (error) {
        logger.error('Erro ao obter detalhes para IA:', error.message);
        throw error;
    }
}

/**
 * Obtém resumo do catálogo para contexto da IA
 * @returns {object} Resumo do catálogo
 */
async function getCatalogSummary() {
    try {
        const [
            totalProdutos,
            categorias,
            promocoesAtivas,
            produtosDestaque,
            marcas
        ] = await Promise.all([
            countProducts(),
            getAllCategories(),
            getActivePromotions(10),
            getFeaturedProducts(5),
            db.query(`
                SELECT DISTINCT marca, COUNT(*) as total 
                FROM produtos 
                WHERE ativo = 1 AND quantidade > 0 AND marca IS NOT NULL
                GROUP BY marca
                ORDER BY total DESC
                LIMIT 10
            `)
        ]);

        return {
            total_produtos: totalProdutos,
            categorias: categorias.map(c => ({
                id: c.id,
                nome: c.nome,
                total: c.total_produtos
            })),
            promocoes_ativas: promocoesAtivas.length,
            produtos_destaque: produtosDestaque.length,
            marcas_disponiveis: marcas.map(m => m.marca),
            atualizado_em: new Date().toISOString()
        };
    } catch (error) {
        logger.error('Erro ao obter resumo do catálogo:', error.message);
        return null;
    }
}

// ============================================
// FUNÇÕES DE CRUD (PAINEL ADMIN)
// ============================================

/**
 * Lista produtos com paginação e filtros (para admin)
 * @param {object} options - Opções de listagem
 * @returns {object} Produtos e paginação
 */
async function listProducts(options = {}) {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            categoria = null,
            ativo = null,
            orderBy = 'created_at',
            order = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        let whereClause = '1=1';
        const params = [];

        if (search) {
            whereClause += ` AND (
                LOWER(p.nome) LIKE LOWER(?)
                OR LOWER(p.codigo) LIKE LOWER(?)
                OR LOWER(p.marca) LIKE LOWER(?)
            )`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        if (categoria) {
            whereClause += ` AND p.categoria_id = ?`;
            params.push(categoria);
        }

        if (ativo !== null) {
            whereClause += ` AND p.ativo = ?`;
            params.push(ativo ? 1 : 0);
        }

        // Conta total
        const countResult = await db.queryOne(`
            SELECT COUNT(*) as total 
            FROM produtos p 
            WHERE ${whereClause}
        `, params);

        const total = countResult.total;

        // Busca produtos
        const allowedOrderBy = ['created_at', 'nome', 'preco', 'quantidade', 'updated_at'];
        const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
        const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const products = await db.query(`
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            WHERE ${whereClause}
            ORDER BY p.${safeOrderBy} ${safeOrder}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return {
            data: products,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };
    } catch (error) {
        logger.error('Erro ao listar produtos:', error.message);
        throw error;
    }
}

/**
 * Cria um novo produto
 * @param {object} data - Dados do produto
 * @returns {number} ID do produto criado
 */
async function createProduct(data) {
    try {
        const {
            codigo,
            nome,
            descricao,
            categoria_id,
            preco,
            preco_promocional,
            custo,
            quantidade,
            quantidade_minima,
            marca,
            localizacao,
            veiculo_compativel,
            imagem_url,
            ativo = true,
            destaque = false
        } = data;

        // Verifica se código já existe
        if (codigo) {
            const existing = await db.queryOne(
                'SELECT id FROM produtos WHERE codigo = ?',
                [codigo.toUpperCase()]
            );
            if (existing) {
                throw new Error('Código do produto já existe');
            }
        }

        const productId = await db.insert('produtos', {
            codigo: codigo ? codigo.toUpperCase() : null,
            nome,
            descricao: descricao || null,
            categoria_id: categoria_id || null,
            preco: preco || 0,
            preco_promocional: preco_promocional || null,
            custo: custo || null,
            quantidade: quantidade || 0,
            quantidade_minima: quantidade_minima || 5,
            marca: marca || null,
            localizacao: localizacao || null,
            veiculo_compativel: veiculo_compativel || null,
            imagem_url: imagem_url || null,
            ativo: ativo ? 1 : 0,
            destaque: destaque ? 1 : 0
        });

        logger.info(`Produto criado: ID ${productId} - ${nome}`);
        return productId;
    } catch (error) {
        logger.error('Erro ao criar produto:', error.message);
        throw error;
    }
}

/**
 * Atualiza um produto existente
 * @param {number} id - ID do produto
 * @param {object} data - Dados para atualizar
 * @returns {boolean} Sucesso da operação
 */
async function updateProduct(id, data) {
    try {
        // Remove campos undefined/null que não devem ser atualizados
        const updateData = {};
        const allowedFields = [
            'codigo', 'nome', 'descricao', 'categoria_id', 'preco',
            'preco_promocional', 'custo', 'quantidade', 'quantidade_minima',
            'marca', 'localizacao', 'veiculo_compativel', 'imagem_url',
            'ativo', 'destaque'
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                if (field === 'codigo' && data[field]) {
                    updateData[field] = data[field].toUpperCase();
                } else if (field === 'ativo' || field === 'destaque') {
                    updateData[field] = data[field] ? 1 : 0;
                } else {
                    updateData[field] = data[field];
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return false;
        }

        // Verifica se código já existe em outro produto
        if (updateData.codigo) {
            const existing = await db.queryOne(
                'SELECT id FROM produtos WHERE codigo = ? AND id != ?',
                [updateData.codigo, id]
            );
            if (existing) {
                throw new Error('Código do produto já existe');
            }
        }

        const affected = await db.update('produtos', updateData, 'id = ?', [id]);
        
        if (affected > 0) {
            logger.info(`Produto atualizado: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao atualizar produto:', error.message);
        throw error;
    }
}

/**
 * Exclui um produto (soft delete)
 * @param {number} id - ID do produto
 * @returns {boolean} Sucesso da operação
 */
async function deleteProduct(id) {
    try {
        const affected = await db.update(
            'produtos',
            { ativo: 0 },
            'id = ?',
            [id]
        );

        if (affected > 0) {
            logger.info(`Produto desativado: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao excluir produto:', error.message);
        throw error;
    }
}

/**
 * Exclui um produto permanentemente
 * @param {number} id - ID do produto
 * @returns {boolean} Sucesso da operação
 */
async function hardDeleteProduct(id) {
    try {
        const affected = await db.remove('produtos', 'id = ?', [id]);

        if (affected > 0) {
            logger.info(`Produto excluído permanentemente: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao excluir produto permanentemente:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE IMPORTAÇÃO JSON
// ============================================

/**
 * Importa produtos de um arquivo JSON
 * @param {array} products - Array de produtos
 * @param {object} options - Opções de importação
 * @returns {object} Resultado da importação
 */
async function importProducts(products, options = {}) {
    const {
        updateExisting = true,
        skipInvalid = true
    } = options;

    const result = {
        total: products.length,
        success: 0,
        errors: 0,
        skipped: 0,
        details: []
    };

    for (const product of products) {
        try {
            // Valida campos obrigatórios
            if (!product.nome) {
                if (skipInvalid) {
                    result.skipped++;
                    result.details.push({
                        produto: product.codigo || 'SEM CÓDIGO',
                        status: 'skipped',
                        reason: 'Nome é obrigatório'
                    });
                    continue;
                } else {
                    throw new Error('Nome é obrigatório');
                }
            }

            // Verifica se produto já existe (por código)
            let existingProduct = null;
            if (product.codigo) {
                existingProduct = await db.queryOne(
                    'SELECT id FROM produtos WHERE codigo = ?',
                    [product.codigo.toUpperCase()]
                );
            }

            if (existingProduct) {
                if (updateExisting) {
                    // Atualiza produto existente
                    await updateProduct(existingProduct.id, product);
                    result.success++;
                    result.details.push({
                        produto: product.codigo,
                        status: 'updated',
                        id: existingProduct.id
                    });
                } else {
                    result.skipped++;
                    result.details.push({
                        produto: product.codigo,
                        status: 'skipped',
                        reason: 'Produto já existe'
                    });
                }
            } else {
                // Cria novo produto
                const newId = await createProduct(product);
                result.success++;
                result.details.push({
                    produto: product.codigo || product.nome,
                    status: 'created',
                    id: newId
                });
            }
        } catch (error) {
            result.errors++;
            result.details.push({
                produto: product.codigo || product.nome || 'DESCONHECIDO',
                status: 'error',
                reason: error.message
            });
        }
    }

    logger.info(`Importação concluída: ${result.success} sucesso, ${result.errors} erros, ${result.skipped} ignorados`);
    return result;
}

/**
 * Exporta todos os produtos para JSON
 * @param {object} options - Opções de exportação
 * @returns {array} Array de produtos
 */
async function exportProducts(options = {}) {
    const {
        includeInactive = false,
        fields = null
    } = options;

    try {
        let sql = `
            SELECT 
                p.*,
                c.nome AS categoria_nome
            FROM produtos p
            LEFT JOIN categorias c ON p.categoria_id = c.id
        `;

        if (!includeInactive) {
            sql += ` WHERE p.ativo = 1`;
        }

        sql += ` ORDER BY p.nome ASC`;

        const products = await db.query(sql);

        // Se especificou campos, filtra
        if (fields && Array.isArray(fields)) {
            return products.map(p => {
                const filtered = {};
                for (const field of fields) {
                    if (p[field] !== undefined) {
                        filtered[field] = p[field];
                    }
                }
                return filtered;
            });
        }

        return products;
    } catch (error) {
        logger.error('Erro ao exportar produtos:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE CATEGORIA (CRUD)
// ============================================

/**
 * Lista todas as categorias (para admin)
 * @returns {array} Lista de categorias
 */
async function listCategories() {
    try {
        const sql = `
            SELECT 
                c.*,
                COUNT(p.id) AS total_produtos,
                SUM(CASE WHEN p.quantidade > 0 THEN 1 ELSE 0 END) AS produtos_em_estoque
            FROM categorias c
            LEFT JOIN produtos p ON c.id = p.categoria_id AND p.ativo = 1
            GROUP BY c.id
            ORDER BY c.nome ASC
        `;

        return await db.query(sql);
    } catch (error) {
        logger.error('Erro ao listar categorias:', error.message);
        throw error;
    }
}

/**
 * Cria uma nova categoria
 * @param {object} data - Dados da categoria
 * @returns {number} ID da categoria criada
 */
async function createCategory(data) {
    try {
        const { nome, descricao, icone, ativo = true } = data;

        const categoryId = await db.insert('categorias', {
            nome,
            descricao: descricao || null,
            icone: icone || null,
            ativo: ativo ? 1 : 0
        });

        logger.info(`Categoria criada: ID ${categoryId} - ${nome}`);
        return categoryId;
    } catch (error) {
        logger.error('Erro ao criar categoria:', error.message);
        throw error;
    }
}

/**
 * Atualiza uma categoria
 * @param {number} id - ID da categoria
 * @param {object} data - Dados para atualizar
 * @returns {boolean} Sucesso da operação
 */
async function updateCategory(id, data) {
    try {
        const updateData = {};
        const allowedFields = ['nome', 'descricao', 'icone', 'ativo'];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                if (field === 'ativo') {
                    updateData[field] = data[field] ? 1 : 0;
                } else {
                    updateData[field] = data[field];
                }
            }
        }

        if (Object.keys(updateData).length === 0) {
            return false;
        }

        const affected = await db.update('categorias', updateData, 'id = ?', [id]);
        
        if (affected > 0) {
            logger.info(`Categoria atualizada: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao atualizar categoria:', error.message);
        throw error;
    }
}

/**
 * Exclui uma categoria
 * @param {number} id - ID da categoria
 * @returns {boolean} Sucesso da operação
 */
async function deleteCategory(id) {
    try {
        // Verifica se há produtos vinculados
        const productsCount = await db.queryOne(
            'SELECT COUNT(*) as total FROM produtos WHERE categoria_id = ?',
            [id]
        );

        if (productsCount.total > 0) {
            throw new Error(`Não é possível excluir: ${productsCount.total} produto(s) vinculado(s)`);
        }

        const affected = await db.remove('categorias', 'id = ?', [id]);
        
        if (affected > 0) {
            logger.info(`Categoria excluída: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao excluir categoria:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE ESTATÍSTICAS
// ============================================

/**
 * Obtém estatísticas de produtos
 * @returns {object} Estatísticas
 */
async function getStatistics() {
    try {
        const [
            totalProdutos,
            produtosAtivos,
            produtosEstoqueBaixo,
            produtosSemEstoque,
            valorTotalEstoque,
            categorias
        ] = await Promise.all([
            db.queryOne('SELECT COUNT(*) as total FROM produtos'),
            db.queryOne('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND quantidade > 0'),
            db.queryOne('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND quantidade > 0 AND quantidade <= quantidade_minima'),
            db.queryOne('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND quantidade = 0'),
            db.queryOne('SELECT SUM(preco * quantidade) as total FROM produtos WHERE ativo = 1'),
            db.queryOne('SELECT COUNT(*) as total FROM categorias WHERE ativo = 1')
        ]);

        return {
            produtos: {
                total: totalProdutos.total,
                ativos: produtosAtivos.total,
                estoque_baixo: produtosEstoqueBaixo.total,
                sem_estoque: produtosSemEstoque.total,
                valor_estoque: valorTotalEstoque.total || 0
            },
            categorias: categorias.total
        };
    } catch (error) {
        logger.error('Erro ao obter estatísticas:', error.message);
        throw error;
    }
}

module.exports = {
    // Busca (Bot e IA)
    getAllProducts,
    countProducts,
    getProductById,
    getProductByCode,
    searchProductsByName,
    searchProductsByVehicle,
    getProductsByCategory,
    getFeaturedProducts,
    getLowStockProducts,
    getLowStock,
    getAllCategories,
    getCategoryById,
    getActivePromotions,
    getProductsOnSale,
    updateStock,
    checkAvailability,
    getSimilarProducts,
    search,
    
    // IA
    smartSearch,
    getProductDetailsForAI,
    getCatalogSummary,
    
    // CRUD Produtos (Admin)
    listProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    hardDeleteProduct,
    
    // Importação/Exportação
    importProducts,
    exportProducts,
    
    // CRUD Categorias (Admin)
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    
    // Estatísticas
    getStatistics,
};