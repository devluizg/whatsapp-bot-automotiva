/**
 * ============================================
 * ROTAS DE SERVIÇOS
 * ============================================
 * 
 * Endpoints para CRUD de serviços oferecidos
 * pela loja automotiva.
 */

const express = require('express');
const router = express.Router();

const serviceService = require('../services/serviceService');
const logger = require('../utils/logger');
const { authMiddleware, managerMiddleware, auditMiddleware } = require('../middlewares/auth');

// ============================================
// ROTAS PÚBLICAS (LISTAGEM E BUSCA)
// ============================================

/**
 * GET /api/services
 * Lista serviços com paginação e filtros
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            categoria = null,
            ativo = null,
            orderBy = 'created_at',
            order = 'DESC'
        } = req.query;

        const result = await serviceService.listServices({
            page: parseInt(page),
            limit: parseInt(limit),
            search,
            categoria: categoria ? parseInt(categoria) : null,
            ativo: ativo !== null ? ativo === 'true' : null,
            orderBy,
            order
        });

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('Erro ao listar serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar serviços'
        });
    }
});

/**
 * GET /api/services/search
 * Busca serviços por termo
 */
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;

        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Termo de busca deve ter pelo menos 2 caracteres'
            });
        }

        const services = await serviceService.search(q, parseInt(limit));

        res.json({
            success: true,
            data: services,
            total: services.length
        });

    } catch (error) {
        logger.error('Erro na busca de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar serviços'
        });
    }
});

/**
 * GET /api/services/smart-search
 * Busca inteligente para IA
 */
router.get('/smart-search', async (req, res) => {
    try {
        const {
            query = '',
            categoria = null,
            precoMin = null,
            precoMax = null,
            apenasPromocao = false,
            apenasDestaque = false,
            limit = 10
        } = req.query;

        const result = await serviceService.smartSearch({
            query,
            categoria,
            precoMin: precoMin ? parseFloat(precoMin) : null,
            precoMax: precoMax ? parseFloat(precoMax) : null,
            apenasPromocao: apenasPromocao === 'true',
            apenasDestaque: apenasDestaque === 'true',
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: result.services,
            context: result.context
        });

    } catch (error) {
        logger.error('Erro na busca inteligente de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na busca inteligente'
        });
    }
});

/**
 * GET /api/services/featured
 * Lista serviços em destaque
 */
router.get('/featured', async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        const services = await serviceService.getFeaturedServices(parseInt(limit));

        res.json({
            success: true,
            data: services
        });

    } catch (error) {
        logger.error('Erro ao buscar serviços em destaque:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar serviços em destaque'
        });
    }
});

/**
 * GET /api/services/promotions
 * Lista serviços em promoção
 */
router.get('/promotions', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const services = await serviceService.getServicesOnSale(parseInt(limit));

        res.json({
            success: true,
            data: services
        });

    } catch (error) {
        logger.error('Erro ao buscar promoções de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar promoções'
        });
    }
});

/**
 * GET /api/services/by-category/:categoryId
 * Busca serviços por categoria
 */
router.get('/by-category/:categoryId', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.categoryId);
        const { limit = 20 } = req.query;

        const services = await serviceService.getServicesByCategory(categoryId, parseInt(limit));

        res.json({
            success: true,
            data: services,
            total: services.length
        });

    } catch (error) {
        logger.error('Erro ao buscar serviços por categoria:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar serviços por categoria'
        });
    }
});

/**
 * GET /api/services/statistics
 * Estatísticas de serviços
 */
router.get('/statistics', authMiddleware, async (req, res) => {
    try {
        const stats = await serviceService.getStatistics();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao buscar estatísticas de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas'
        });
    }
});

/**
 * GET /api/services/summary
 * Resumo dos serviços para IA
 */
router.get('/summary', async (req, res) => {
    try {
        const summary = await serviceService.getServicesSummary();

        res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        logger.error('Erro ao buscar resumo de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar resumo dos serviços'
        });
    }
});

/**
 * GET /api/services/all
 * Lista todos os serviços ativos (sem paginação)
 */
router.get('/all', async (req, res) => {
    try {
        const { limit = 100 } = req.query;
        const services = await serviceService.getAllServices(parseInt(limit));

        res.json({
            success: true,
            data: services,
            total: services.length
        });

    } catch (error) {
        logger.error('Erro ao listar todos serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar serviços'
        });
    }
});

/**
 * GET /api/services/:id
 * Busca serviço por ID
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        // Verifica se é um número válido
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        const service = await serviceService.getServiceById(id);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Serviço não encontrado'
            });
        }

        res.json({
            success: true,
            data: service
        });

    } catch (error) {
        logger.error('Erro ao buscar serviço:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar serviço'
        });
    }
});

/**
 * GET /api/services/code/:code
 * Busca serviço por código
 */
router.get('/code/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const service = await serviceService.getServiceByCode(code);

        if (!service) {
            return res.status(404).json({
                success: false,
                message: 'Serviço não encontrado'
            });
        }

        res.json({
            success: true,
            data: service
        });

    } catch (error) {
        logger.error('Erro ao buscar serviço por código:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar serviço'
        });
    }
});

/**
 * GET /api/services/:id/details
 * Detalhes completos do serviço para IA
 */
router.get('/:id/details', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        const details = await serviceService.getServiceDetailsForAI(id);

        if (!details) {
            return res.status(404).json({
                success: false,
                message: 'Serviço não encontrado'
            });
        }

        res.json({
            success: true,
            data: details
        });

    } catch (error) {
        logger.error('Erro ao buscar detalhes do serviço:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar detalhes do serviço'
        });
    }
});

// ============================================
// ROTAS PROTEGIDAS (CRUD - REQUER AUTENTICAÇÃO)
// ============================================

/**
 * POST /api/services
 * Cria novo serviço
 */
router.post('/',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('criar_servico', 'servicos'),
    async (req, res) => {
        try {
            const serviceData = req.body;

            // Validações básicas
            if (!serviceData.nome) {
                return res.status(400).json({
                    success: false,
                    message: 'Nome do serviço é obrigatório'
                });
            }

            if (serviceData.preco === undefined || serviceData.preco < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Preço deve ser um valor positivo'
                });
            }

            const serviceId = await serviceService.createService(serviceData);

            // Busca serviço criado
            const service = await serviceService.getServiceById(serviceId);

            logger.info(`Serviço criado: ${service.nome} (ID: ${serviceId}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('service:created', service);
            }

            res.status(201).json({
                success: true,
                message: 'Serviço criado com sucesso',
                data: service
            });

        } catch (error) {
            logger.error('Erro ao criar serviço:', error.message);

            if (error.message.includes('já existe')) {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Erro ao criar serviço'
            });
        }
    }
);

/**
 * PUT /api/services/:id
 * Atualiza serviço existente
 */
router.put('/:id',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('atualizar_servico', 'servicos'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const serviceData = req.body;

            // Verifica se serviço existe
            const existingService = await serviceService.getServiceById(id);
            if (!existingService) {
                return res.status(404).json({
                    success: false,
                    message: 'Serviço não encontrado'
                });
            }

            // Validações
            if (serviceData.preco !== undefined && serviceData.preco < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Preço deve ser um valor positivo'
                });
            }

            const updated = await serviceService.updateService(id, serviceData);

            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Nenhum dado foi alterado'
                });
            }

            // Busca serviço atualizado
            const service = await serviceService.getServiceById(id);

            logger.info(`Serviço atualizado: ${service.nome} (ID: ${id}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('service:updated', service);
            }

            res.json({
                success: true,
                message: 'Serviço atualizado com sucesso',
                data: service
            });

        } catch (error) {
            logger.error('Erro ao atualizar serviço:', error.message);

            if (error.message.includes('já existe')) {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar serviço'
            });
        }
    }
);

/**
 * PATCH /api/services/:id/toggle-featured
 * Ativa/desativa destaque do serviço
 */
router.patch('/:id/toggle-featured',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            const service = await serviceService.getServiceById(id);
            if (!service) {
                return res.status(404).json({
                    success: false,
                    message: 'Serviço não encontrado'
                });
            }

            const newFeatured = !service.destaque;
            await serviceService.updateService(id, { destaque: newFeatured });

            logger.info(`Serviço ${newFeatured ? 'destacado' : 'removido dos destaques'}: ${service.nome} por ${req.user.email}`);

            res.json({
                success: true,
                message: newFeatured ? 'Serviço marcado como destaque' : 'Serviço removido dos destaques',
                data: { id, destaque: newFeatured }
            });

        } catch (error) {
            logger.error('Erro ao alterar destaque:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao alterar destaque'
            });
        }
    }
);

/**
 * PATCH /api/services/:id/toggle-active
 * Ativa/desativa serviço
 */
router.patch('/:id/toggle-active',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            const service = await serviceService.getServiceById(id);
            if (!service) {
                return res.status(404).json({
                    success: false,
                    message: 'Serviço não encontrado'
                });
            }

            const newActive = !service.ativo;
            await serviceService.updateService(id, { ativo: newActive });

            logger.info(`Serviço ${newActive ? 'ativado' : 'desativado'}: ${service.nome} por ${req.user.email}`);

            res.json({
                success: true,
                message: newActive ? 'Serviço ativado' : 'Serviço desativado',
                data: { id, ativo: newActive }
            });

        } catch (error) {
            logger.error('Erro ao alterar status:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao alterar status'
            });
        }
    }
);

/**
 * DELETE /api/services/:id
 * Remove serviço (soft delete)
 */
router.delete('/:id',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('excluir_servico', 'servicos'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            const service = await serviceService.getServiceById(id);
            if (!service) {
                return res.status(404).json({
                    success: false,
                    message: 'Serviço não encontrado'
                });
            }

            await serviceService.deleteService(id);

            logger.info(`Serviço excluído: ${service.nome} (ID: ${id}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('service:deleted', { id, nome: service.nome });
            }

            res.json({
                success: true,
                message: 'Serviço removido com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao excluir serviço:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao excluir serviço'
            });
        }
    }
);

// ============================================
// ROTAS DE CATEGORIAS DE SERVIÇOS
// ============================================

/**
 * GET /api/services/categories/all
 * Lista todas as categorias de serviços
 */
router.get('/categories/all', async (req, res) => {
    try {
        const categories = await serviceService.getAllCategories();

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        logger.error('Erro ao listar categorias de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar categorias'
        });
    }
});

/**
 * GET /api/services/categories/list
 * Lista categorias para admin
 */
router.get('/categories/list', authMiddleware, async (req, res) => {
    try {
        const categories = await serviceService.listCategories();

        res.json({
            success: true,
            data: categories
        });

    } catch (error) {
        logger.error('Erro ao listar categorias:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar categorias'
        });
    }
});

/**
 * GET /api/services/categories/:id
 * Busca categoria por ID
 */
router.get('/categories/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const category = await serviceService.getCategoryById(id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }

        res.json({
            success: true,
            data: category
        });

    } catch (error) {
        logger.error('Erro ao buscar categoria:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar categoria'
        });
    }
});

/**
 * POST /api/services/categories
 * Cria nova categoria de serviços
 */
router.post('/categories',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const { nome, descricao, icone } = req.body;

            if (!nome) {
                return res.status(400).json({
                    success: false,
                    message: 'Nome da categoria é obrigatório'
                });
            }

            const categoryId = await serviceService.createCategory({ nome, descricao, icone });

            logger.info(`Categoria de serviços criada: ${nome} por ${req.user.email}`);

            res.status(201).json({
                success: true,
                message: 'Categoria criada com sucesso',
                data: { id: categoryId, nome, descricao, icone }
            });

        } catch (error) {
            logger.error('Erro ao criar categoria de serviços:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao criar categoria'
            });
        }
    }
);

/**
 * PUT /api/services/categories/:id
 * Atualiza categoria de serviços
 */
router.put('/categories/:id',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { nome, descricao, icone, ativo } = req.body;

            const updated = await serviceService.updateCategory(id, { nome, descricao, icone, ativo });

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Categoria não encontrada'
                });
            }

            logger.info(`Categoria de serviços atualizada: ID ${id} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Categoria atualizada com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao atualizar categoria de serviços:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar categoria'
            });
        }
    }
);

/**
 * DELETE /api/services/categories/:id
 * Remove categoria de serviços
 */
router.delete('/categories/:id',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            await serviceService.deleteCategory(id);

            logger.info(`Categoria de serviços excluída: ID ${id} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Categoria removida com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao excluir categoria de serviços:', error.message);

            if (error.message.includes('vinculado')) {
                return res.status(400).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Erro ao excluir categoria'
            });
        }
    }
);

// ============================================
// ROTAS DE EXPORTAÇÃO
// ============================================

/**
 * GET /api/services/export/json
 * Exporta serviços para JSON
 */
router.get('/export/json', authMiddleware, async (req, res) => {
    try {
        const { includeInactive = false } = req.query;

        const services = await serviceService.exportServices({
            includeInactive: includeInactive === 'true'
        });

        res.json({
            success: true,
            data: services,
            total: services.length,
            exportedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Erro ao exportar serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar serviços'
        });
    }
});

/**
 * GET /api/services/export/download
 * Download de serviços em JSON
 */
router.get('/export/download', authMiddleware, async (req, res) => {
    try {
        const services = await serviceService.exportServices({ includeInactive: false });

        const filename = `servicos_${new Date().toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(services);

    } catch (error) {
        logger.error('Erro ao exportar serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar serviços'
        });
    }
});

module.exports = router;