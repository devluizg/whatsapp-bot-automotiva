/**
 * ============================================
 * SERVIÇO DE SERVIÇOS (SERVICES)
 * ============================================
 * 
 * Lógica de negócio para gerenciamento de
 * serviços oferecidos pela loja automotiva.
 */

const db = require('../database/connection');
const logger = require('../utils/logger');
const { normalizeForSearch } = require('../utils/formatter');

// ============================================
// FUNÇÕES DE BUSCA (BOT E IA)
// ============================================

/**
 * Busca todos os serviços ativos
 * @param {number} limit - Limite de resultados
 * @param {number} offset - Offset para paginação
 * @returns {array} Lista de serviços
 */
async function getAllServices(limit = 10, offset = 0) {
    try {
        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.ativo = 1
            ORDER BY s.destaque DESC, s.nome ASC
            LIMIT ? OFFSET ?
        `;

        const services = await db.query(sql, [limit, offset]);
        logger.debug(`Serviços encontrados: ${services.length}`);
        
        return services;
    } catch (error) {
        logger.error('Erro ao buscar serviços:', error.message);
        throw error;
    }
}

/**
 * Conta total de serviços ativos
 * @returns {number} Total de serviços
 */
async function countServices() {
    try {
        const result = await db.queryOne(`
            SELECT COUNT(*) AS total 
            FROM servicos 
            WHERE ativo = 1
        `);
        
        return result ? result.total : 0;
    } catch (error) {
        logger.error('Erro ao contar serviços:', error.message);
        return 0;
    }
}

/**
 * Busca serviço por ID
 * @param {number} id - ID do serviço
 * @returns {object|null} Serviço encontrado ou null
 */
async function getServiceById(id) {
    try {
        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.id = ? AND s.ativo = 1
        `;

        const service = await db.queryOne(sql, [id]);
        return service;
    } catch (error) {
        logger.error('Erro ao buscar serviço por ID:', error.message);
        throw error;
    }
}

/**
 * Busca serviço por código
 * @param {string} code - Código do serviço
 * @returns {object|null} Serviço encontrado ou null
 */
async function getServiceByCode(code) {
    try {
        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.codigo = ? AND s.ativo = 1
        `;

        const service = await db.queryOne(sql, [code.toUpperCase()]);
        return service;
    } catch (error) {
        logger.error('Erro ao buscar serviço por código:', error.message);
        throw error;
    }
}

/**
 * Busca serviços por nome
 * @param {string} searchTerm - Termo de busca
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de serviços
 */
async function searchServicesByName(searchTerm, limit = 10) {
    try {
        const normalized = normalizeForSearch(searchTerm);
        const searchPattern = `%${normalized}%`;

        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.ativo = 1 
                AND (
                    LOWER(s.nome) LIKE LOWER(?)
                    OR LOWER(s.descricao) LIKE LOWER(?)
                    OR LOWER(s.codigo) LIKE LOWER(?)
                )
            ORDER BY 
                CASE 
                    WHEN LOWER(s.nome) LIKE LOWER(?) THEN 1
                    WHEN LOWER(s.nome) LIKE LOWER(?) THEN 2
                    ELSE 3
                END,
                s.nome ASC
            LIMIT ?
        `;

        const exactMatch = `${normalized}%`;
        const services = await db.query(sql, [
            searchPattern,
            searchPattern,
            searchPattern,
            normalized,
            exactMatch,
            limit
        ]);

        logger.info(`Busca serviços por "${searchTerm}": ${services.length} resultado(s)`);
        return services;
    } catch (error) {
        logger.error('Erro ao buscar serviços por nome:', error.message);
        throw error;
    }
}

/**
 * Busca serviços por categoria
 * @param {number} categoryId - ID da categoria
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de serviços
 */
async function getServicesByCategory(categoryId, limit = 10) {
    try {
        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.ativo = 1 
                AND s.categoria_id = ?
            ORDER BY s.nome ASC
            LIMIT ?
        `;

        const services = await db.query(sql, [categoryId, limit]);
        return services;
    } catch (error) {
        logger.error('Erro ao buscar serviços por categoria:', error.message);
        throw error;
    }
}

/**
 * Busca serviços em destaque
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de serviços
 */
async function getFeaturedServices(limit = 5) {
    try {
        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.ativo = 1 
                AND s.destaque = 1
            ORDER BY s.updated_at DESC
            LIMIT ?
        `;

        const services = await db.query(sql, [limit]);
        return services;
    } catch (error) {
        logger.error('Erro ao buscar serviços em destaque:', error.message);
        throw error;
    }
}

/**
 * Busca serviços em promoção
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de serviços em promoção
 */
async function getServicesOnSale(limit = 10) {
    try {
        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome,
                pr.desconto_percentual,
                pr.desconto_valor,
                pr.data_fim AS promocao_fim,
                CASE 
                    WHEN pr.desconto_percentual > 0 
                        THEN s.preco - (s.preco * pr.desconto_percentual / 100)
                    WHEN pr.desconto_valor > 0 
                        THEN s.preco - pr.desconto_valor
                    ELSE s.preco_promocional
                END AS preco_final
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            LEFT JOIN promocoes pr ON s.id = pr.servico_id 
                AND pr.ativo = 1 
                AND pr.data_inicio <= CURDATE() 
                AND pr.data_fim >= CURDATE()
            WHERE s.ativo = 1 
                AND (
                    s.preco_promocional IS NOT NULL 
                    OR pr.id IS NOT NULL
                )
            ORDER BY pr.data_fim ASC, s.nome ASC
            LIMIT ?
        `;

        const services = await db.query(sql, [limit]);
        return services;
    } catch (error) {
        logger.error('Erro ao buscar serviços em promoção:', error.message);
        throw error;
    }
}

/**
 * Busca todas as categorias de serviços
 * @returns {array} Lista de categorias
 */
async function getAllCategories() {
    try {
        const sql = `
            SELECT 
                cs.*,
                COUNT(s.id) AS total_servicos
            FROM categorias_servicos cs
            LEFT JOIN servicos s ON cs.id = s.categoria_id AND s.ativo = 1
            WHERE cs.ativo = 1
            GROUP BY cs.id
            ORDER BY cs.nome ASC
        `;

        const categories = await db.query(sql);
        return categories;
    } catch (error) {
        logger.error('Erro ao buscar categorias de serviços:', error.message);
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
            'SELECT * FROM categorias_servicos WHERE id = ? AND ativo = 1',
            [id]
        );
        return category;
    } catch (error) {
        logger.error('Erro ao buscar categoria por ID:', error.message);
        throw error;
    }
}

/**
 * Busca geral de serviços
 * @param {string} term - Termo de busca
 * @param {number} limit - Limite de resultados
 * @returns {array} Lista de serviços
 */
async function search(term, limit = 10) {
    try {
        const normalized = normalizeForSearch(term);
        const searchPattern = `%${normalized}%`;

        const sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome,
                CASE 
                    WHEN LOWER(s.codigo) = LOWER(?) THEN 1
                    WHEN LOWER(s.nome) LIKE LOWER(?) THEN 2
                    ELSE 3
                END AS relevancia
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE s.ativo = 1 
                AND (
                    LOWER(s.nome) LIKE LOWER(?)
                    OR LOWER(s.codigo) LIKE LOWER(?)
                    OR LOWER(s.descricao) LIKE LOWER(?)
                    OR LOWER(cs.nome) LIKE LOWER(?)
                )
            ORDER BY relevancia ASC, s.nome ASC
            LIMIT ?
        `;

        const services = await db.query(sql, [
            normalized,
            `${normalized}%`,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            limit
        ]);

        logger.info(`Busca geral serviços por "${term}": ${services.length} resultado(s)`);
        return services;
    } catch (error) {
        logger.error('Erro na busca geral de serviços:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES PARA IA
// ============================================

/**
 * Busca inteligente de serviços para a IA
 * @param {object} params - Parâmetros de busca
 * @returns {object} Resultados e contexto
 */
async function smartSearch(params = {}) {
    try {
        const {
            query = '',
            categoria = null,
            precoMin = null,
            precoMax = null,
            apenasPromocao = false,
            apenasDestaque = false,
            limit = 10
        } = params;

        let sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome,
                pr.desconto_percentual,
                pr.desconto_valor,
                CASE 
                    WHEN pr.desconto_percentual > 0 
                        THEN ROUND(s.preco - (s.preco * pr.desconto_percentual / 100), 2)
                    WHEN pr.desconto_valor > 0 
                        THEN ROUND(s.preco - pr.desconto_valor, 2)
                    WHEN s.preco_promocional IS NOT NULL 
                        THEN s.preco_promocional
                    ELSE s.preco
                END AS preco_final,
                (pr.id IS NOT NULL OR s.preco_promocional IS NOT NULL) AS em_promocao
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            LEFT JOIN promocoes pr ON s.id = pr.servico_id 
                AND pr.ativo = 1 
                AND pr.data_inicio <= CURDATE() 
                AND pr.data_fim >= CURDATE()
            WHERE s.ativo = 1
        `;

        const queryParams = [];

        // Busca por texto
        if (query) {
            const normalized = normalizeForSearch(query);
            const searchPattern = `%${normalized}%`;
            sql += ` AND (
                LOWER(s.nome) LIKE LOWER(?)
                OR LOWER(s.codigo) LIKE LOWER(?)
                OR LOWER(s.descricao) LIKE LOWER(?)
                OR LOWER(cs.nome) LIKE LOWER(?)
            )`;
            queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Filtro por categoria
        if (categoria) {
            if (typeof categoria === 'number') {
                sql += ` AND s.categoria_id = ?`;
                queryParams.push(categoria);
            } else {
                sql += ` AND LOWER(cs.nome) LIKE LOWER(?)`;
                queryParams.push(`%${categoria}%`);
            }
        }

        // Filtro por faixa de preço
        if (precoMin !== null) {
            sql += ` AND s.preco >= ?`;
            queryParams.push(precoMin);
        }

        if (precoMax !== null) {
            sql += ` AND s.preco <= ?`;
            queryParams.push(precoMax);
        }

        // Apenas promoções
        if (apenasPromocao) {
            sql += ` AND (pr.id IS NOT NULL OR s.preco_promocional IS NOT NULL)`;
        }

        // Apenas destaque
        if (apenasDestaque) {
            sql += ` AND s.destaque = 1`;
        }

        sql += ` ORDER BY s.destaque DESC, s.nome ASC LIMIT ?`;
        queryParams.push(limit);

        const services = await db.query(sql, queryParams);

        const context = {
            total_encontrado: services.length,
            filtros_aplicados: {
                busca: query || null,
                categoria: categoria || null,
                faixa_preco: (precoMin || precoMax) ? { min: precoMin, max: precoMax } : null,
                apenas_promocao: apenasPromocao,
                apenas_destaque: apenasDestaque
            }
        };

        logger.info(`Smart search serviços: ${services.length} resultado(s)`);

        return {
            services,
            context
        };
    } catch (error) {
        logger.error('Erro na busca inteligente de serviços:', error.message);
        throw error;
    }
}

/**
 * Obtém informações completas de um serviço para a IA
 * @param {number} serviceId - ID do serviço
 * @returns {object} Informações detalhadas
 */
async function getServiceDetailsForAI(serviceId) {
    try {
        const service = await getServiceById(serviceId);
        
        if (!service) {
            return null;
        }

        // Busca promoção ativa
        const promotion = await db.queryOne(`
            SELECT * FROM promocoes 
            WHERE servico_id = ? 
                AND ativo = 1 
                AND data_inicio <= CURDATE() 
                AND data_fim >= CURDATE()
        `, [serviceId]);

        // Calcula preço final
        let precoFinal = service.preco;
        if (promotion) {
            if (promotion.desconto_percentual > 0) {
                precoFinal = service.preco - (service.preco * promotion.desconto_percentual / 100);
            } else if (promotion.desconto_valor > 0) {
                precoFinal = service.preco - promotion.desconto_valor;
            }
        } else if (service.preco_promocional) {
            precoFinal = service.preco_promocional;
        }

        return {
            ...service,
            promocao: promotion,
            preco_final: Math.round(precoFinal * 100) / 100,
            economia: promotion ? Math.round((service.preco - precoFinal) * 100) / 100 : 0,
            duracao_formatada: formatDuration(service.duracao_estimada)
        };
    } catch (error) {
        logger.error('Erro ao obter detalhes do serviço para IA:', error.message);
        throw error;
    }
}

/**
 * Obtém resumo dos serviços para contexto da IA
 * @returns {object} Resumo dos serviços
 */
async function getServicesSummary() {
    try {
        const [
            totalServicos,
            categorias,
            servicosDestaque
        ] = await Promise.all([
            countServices(),
            getAllCategories(),
            getFeaturedServices(5)
        ]);

        return {
            total_servicos: totalServicos,
            categorias: categorias.map(c => ({
                id: c.id,
                nome: c.nome,
                total: c.total_servicos
            })),
            servicos_destaque: servicosDestaque.map(s => s.nome),
            atualizado_em: new Date().toISOString()
        };
    } catch (error) {
        logger.error('Erro ao obter resumo dos serviços:', error.message);
        return null;
    }
}

/**
 * Formata duração em minutos para texto legível
 * @param {number} minutes - Duração em minutos
 * @returns {string} Duração formatada
 */
function formatDuration(minutes) {
    if (!minutes) return 'Não informado';
    
    if (minutes < 60) {
        return `${minutes} minutos`;
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (mins === 0) {
        return `${hours}h`;
    }
    
    return `${hours}h ${mins}min`;
}

// ============================================
// FUNÇÕES DE CRUD (PAINEL ADMIN)
// ============================================

/**
 * Lista serviços com paginação e filtros (para admin)
 * @param {object} options - Opções de listagem
 * @returns {object} Serviços e paginação
 */
async function listServices(options = {}) {
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
                LOWER(s.nome) LIKE LOWER(?)
                OR LOWER(s.codigo) LIKE LOWER(?)
            )`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern);
        }

        if (categoria) {
            whereClause += ` AND s.categoria_id = ?`;
            params.push(categoria);
        }

        if (ativo !== null) {
            whereClause += ` AND s.ativo = ?`;
            params.push(ativo ? 1 : 0);
        }

        // Conta total
        const countResult = await db.queryOne(`
            SELECT COUNT(*) as total 
            FROM servicos s 
            WHERE ${whereClause}
        `, params);

        const total = countResult.total;

        // Busca serviços
        const allowedOrderBy = ['created_at', 'nome', 'preco', 'duracao_estimada', 'updated_at'];
        const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'created_at';
        const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const services = await db.query(`
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
            WHERE ${whereClause}
            ORDER BY s.${safeOrderBy} ${safeOrder}
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return {
            data: services,
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
        logger.error('Erro ao listar serviços:', error.message);
        throw error;
    }
}

/**
 * Cria um novo serviço
 * @param {object} data - Dados do serviço
 * @returns {number} ID do serviço criado
 */
async function createService(data) {
    try {
        const {
            codigo,
            nome,
            descricao,
            categoria_id,
            preco,
            preco_promocional,
            duracao_estimada,
            ativo = true,
            destaque = false
        } = data;

        // Verifica se código já existe
        if (codigo) {
            const existing = await db.queryOne(
                'SELECT id FROM servicos WHERE codigo = ?',
                [codigo.toUpperCase()]
            );
            if (existing) {
                throw new Error('Código do serviço já existe');
            }
        }

        const serviceId = await db.insert('servicos', {
            codigo: codigo ? codigo.toUpperCase() : null,
            nome,
            descricao: descricao || null,
            categoria_id: categoria_id || null,
            preco: preco || 0,
            preco_promocional: preco_promocional || null,
            duracao_estimada: duracao_estimada || 60,
            ativo: ativo ? 1 : 0,
            destaque: destaque ? 1 : 0
        });

        logger.info(`Serviço criado: ID ${serviceId} - ${nome}`);
        return serviceId;
    } catch (error) {
        logger.error('Erro ao criar serviço:', error.message);
        throw error;
    }
}

/**
 * Atualiza um serviço existente
 * @param {number} id - ID do serviço
 * @param {object} data - Dados para atualizar
 * @returns {boolean} Sucesso da operação
 */
async function updateService(id, data) {
    try {
        const updateData = {};
        const allowedFields = [
            'codigo', 'nome', 'descricao', 'categoria_id', 'preco',
            'preco_promocional', 'duracao_estimada', 'ativo', 'destaque'
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

        // Verifica se código já existe em outro serviço
        if (updateData.codigo) {
            const existing = await db.queryOne(
                'SELECT id FROM servicos WHERE codigo = ? AND id != ?',
                [updateData.codigo, id]
            );
            if (existing) {
                throw new Error('Código do serviço já existe');
            }
        }

        const affected = await db.update('servicos', updateData, 'id = ?', [id]);
        
        if (affected > 0) {
            logger.info(`Serviço atualizado: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao atualizar serviço:', error.message);
        throw error;
    }
}

/**
 * Exclui um serviço (soft delete)
 * @param {number} id - ID do serviço
 * @returns {boolean} Sucesso da operação
 */
async function deleteService(id) {
    try {
        const affected = await db.update(
            'servicos',
            { ativo: 0 },
            'id = ?',
            [id]
        );

        if (affected > 0) {
            logger.info(`Serviço desativado: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao excluir serviço:', error.message);
        throw error;
    }
}

/**
 * Exclui um serviço permanentemente
 * @param {number} id - ID do serviço
 * @returns {boolean} Sucesso da operação
 */
async function hardDeleteService(id) {
    try {
        const affected = await db.remove('servicos', 'id = ?', [id]);

        if (affected > 0) {
            logger.info(`Serviço excluído permanentemente: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao excluir serviço permanentemente:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE IMPORTAÇÃO JSON
// ============================================

/**
 * Importa serviços de um arquivo JSON
 * @param {array} services - Array de serviços
 * @param {object} options - Opções de importação
 * @returns {object} Resultado da importação
 */
async function importServices(services, options = {}) {
    const {
        updateExisting = true,
        skipInvalid = true
    } = options;

    const result = {
        total: services.length,
        success: 0,
        errors: 0,
        skipped: 0,
        details: []
    };

    for (const service of services) {
        try {
            // Valida campos obrigatórios
            if (!service.nome) {
                if (skipInvalid) {
                    result.skipped++;
                    result.details.push({
                        servico: service.codigo || 'SEM CÓDIGO',
                        status: 'skipped',
                        reason: 'Nome é obrigatório'
                    });
                    continue;
                } else {
                    throw new Error('Nome é obrigatório');
                }
            }

            // Verifica se serviço já existe (por código)
            let existingService = null;
            if (service.codigo) {
                existingService = await db.queryOne(
                    'SELECT id FROM servicos WHERE codigo = ?',
                    [service.codigo.toUpperCase()]
                );
            }

            if (existingService) {
                if (updateExisting) {
                    await updateService(existingService.id, service);
                    result.success++;
                    result.details.push({
                        servico: service.codigo,
                        status: 'updated',
                        id: existingService.id
                    });
                } else {
                    result.skipped++;
                    result.details.push({
                        servico: service.codigo,
                        status: 'skipped',
                        reason: 'Serviço já existe'
                    });
                }
            } else {
                const newId = await createService(service);
                result.success++;
                result.details.push({
                    servico: service.codigo || service.nome,
                    status: 'created',
                    id: newId
                });
            }
        } catch (error) {
            result.errors++;
            result.details.push({
                servico: service.codigo || service.nome || 'DESCONHECIDO',
                status: 'error',
                reason: error.message
            });
        }
    }

    logger.info(`Importação de serviços concluída: ${result.success} sucesso, ${result.errors} erros, ${result.skipped} ignorados`);
    return result;
}

/**
 * Exporta todos os serviços para JSON
 * @param {object} options - Opções de exportação
 * @returns {array} Array de serviços
 */
async function exportServices(options = {}) {
    const {
        includeInactive = false,
        fields = null
    } = options;

    try {
        let sql = `
            SELECT 
                s.*,
                cs.nome AS categoria_nome
            FROM servicos s
            LEFT JOIN categorias_servicos cs ON s.categoria_id = cs.id
        `;

        if (!includeInactive) {
            sql += ` WHERE s.ativo = 1`;
        }

        sql += ` ORDER BY s.nome ASC`;

        const services = await db.query(sql);

        if (fields && Array.isArray(fields)) {
            return services.map(s => {
                const filtered = {};
                for (const field of fields) {
                    if (s[field] !== undefined) {
                        filtered[field] = s[field];
                    }
                }
                return filtered;
            });
        }

        return services;
    } catch (error) {
        logger.error('Erro ao exportar serviços:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE CATEGORIA (CRUD)
// ============================================

/**
 * Lista todas as categorias de serviços (para admin)
 * @returns {array} Lista de categorias
 */
async function listCategories() {
    try {
        const sql = `
            SELECT 
                cs.*,
                COUNT(s.id) AS total_servicos
            FROM categorias_servicos cs
            LEFT JOIN servicos s ON cs.id = s.categoria_id AND s.ativo = 1
            GROUP BY cs.id
            ORDER BY cs.nome ASC
        `;

        return await db.query(sql);
    } catch (error) {
        logger.error('Erro ao listar categorias de serviços:', error.message);
        throw error;
    }
}

/**
 * Cria uma nova categoria de serviços
 * @param {object} data - Dados da categoria
 * @returns {number} ID da categoria criada
 */
async function createCategory(data) {
    try {
        const { nome, descricao, icone, ativo = true } = data;

        const categoryId = await db.insert('categorias_servicos', {
            nome,
            descricao: descricao || null,
            icone: icone || null,
            ativo: ativo ? 1 : 0
        });

        logger.info(`Categoria de serviços criada: ID ${categoryId} - ${nome}`);
        return categoryId;
    } catch (error) {
        logger.error('Erro ao criar categoria de serviços:', error.message);
        throw error;
    }
}

/**
 * Atualiza uma categoria de serviços
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

        const affected = await db.update('categorias_servicos', updateData, 'id = ?', [id]);
        
        if (affected > 0) {
            logger.info(`Categoria de serviços atualizada: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao atualizar categoria de serviços:', error.message);
        throw error;
    }
}

/**
 * Exclui uma categoria de serviços
 * @param {number} id - ID da categoria
 * @returns {boolean} Sucesso da operação
 */
async function deleteCategory(id) {
    try {
        // Verifica se há serviços vinculados
        const servicesCount = await db.queryOne(
            'SELECT COUNT(*) as total FROM servicos WHERE categoria_id = ?',
            [id]
        );

        if (servicesCount.total > 0) {
            throw new Error(`Não é possível excluir: ${servicesCount.total} serviço(s) vinculado(s)`);
        }

        const affected = await db.remove('categorias_servicos', 'id = ?', [id]);
        
        if (affected > 0) {
            logger.info(`Categoria de serviços excluída: ID ${id}`);
        }

        return affected > 0;
    } catch (error) {
        logger.error('Erro ao excluir categoria de serviços:', error.message);
        throw error;
    }
}

// ============================================
// FUNÇÕES DE ESTATÍSTICAS
// ============================================

/**
 * Obtém estatísticas de serviços
 * @returns {object} Estatísticas
 */
async function getStatistics() {
    try {
        const [
            totalServicos,
            servicosAtivos,
            servicosDestaque,
            categorias,
            precoMedio
        ] = await Promise.all([
            db.queryOne('SELECT COUNT(*) as total FROM servicos'),
            db.queryOne('SELECT COUNT(*) as total FROM servicos WHERE ativo = 1'),
            db.queryOne('SELECT COUNT(*) as total FROM servicos WHERE ativo = 1 AND destaque = 1'),
            db.queryOne('SELECT COUNT(*) as total FROM categorias_servicos WHERE ativo = 1'),
            db.queryOne('SELECT AVG(preco) as media FROM servicos WHERE ativo = 1')
        ]);

        return {
            servicos: {
                total: totalServicos.total,
                ativos: servicosAtivos.total,
                destaque: servicosDestaque.total,
                preco_medio: Math.round((precoMedio.media || 0) * 100) / 100
            },
            categorias: categorias.total
        };
    } catch (error) {
        logger.error('Erro ao obter estatísticas de serviços:', error.message);
        throw error;
    }
}

module.exports = {
    // Busca (Bot e IA)
    getAllServices,
    countServices,
    getServiceById,
    getServiceByCode,
    searchServicesByName,
    getServicesByCategory,
    getFeaturedServices,
    getServicesOnSale,
    getAllCategories,
    getCategoryById,
    search,
    
    // IA
    smartSearch,
    getServiceDetailsForAI,
    getServicesSummary,
    
    // CRUD Serviços (Admin)
    listServices,
    createService,
    updateService,
    deleteService,
    hardDeleteService,
    
    // Importação/Exportação
    importServices,
    exportServices,
    
    // CRUD Categorias (Admin)
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    
    // Estatísticas
    getStatistics,
    
    // Utils
    formatDuration,
};