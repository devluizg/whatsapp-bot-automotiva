/**
 * ============================================
 * ROTAS DE PRODUTOS
 * ============================================
 * 
 * Endpoints para CRUD de produtos e categorias.
 */

const express = require('express');
const router = express.Router();

const productService = require('../services/productService');
const logger = require('../utils/logger');
const { authMiddleware, managerMiddleware, auditMiddleware } = require('../middlewares/auth');

// ============================================
// ROTAS PÚBLICAS (LISTAGEM E BUSCA)
// ============================================

/**
 * GET /api/products
 * Lista produtos com paginação e filtros
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

        const result = await productService.listProducts({
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
        logger.error('Erro ao listar produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar produtos'
        });
    }
});

/**
 * GET /api/products/search
 * Busca produtos por termo
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

        const products = await productService.search(q, parseInt(limit));

        res.json({
            success: true,
            data: products,
            total: products.length
        });

    } catch (error) {
        logger.error('Erro na busca de produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos'
        });
    }
});

/**
 * GET /api/products/smart-search
 * Busca inteligente para IA
 */
router.get('/smart-search', async (req, res) => {
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
        } = req.query;

        const result = await productService.smartSearch({
            query,
            categoria,
            veiculo,
            marca,
            precoMin: precoMin ? parseFloat(precoMin) : null,
            precoMax: precoMax ? parseFloat(precoMax) : null,
            apenasPromocao: apenasPromocao === 'true',
            apenasDestaque: apenasDestaque === 'true',
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            data: result.products,
            context: result.context
        });

    } catch (error) {
        logger.error('Erro na busca inteligente:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na busca inteligente'
        });
    }
});

/**
 * GET /api/products/featured
 * Lista produtos em destaque
 */
router.get('/featured', async (req, res) => {
    try {
        const { limit = 5 } = req.query;
        const products = await productService.getFeaturedProducts(parseInt(limit));

        res.json({
            success: true,
            data: products
        });

    } catch (error) {
        logger.error('Erro ao buscar produtos em destaque:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos em destaque'
        });
    }
});

/**
 * GET /api/products/promotions
 * Lista produtos em promoção
 */
router.get('/promotions', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const products = await productService.getProductsOnSale(parseInt(limit));

        res.json({
            success: true,
            data: products
        });

    } catch (error) {
        logger.error('Erro ao buscar promoções:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar promoções'
        });
    }
});

/**
 * GET /api/products/low-stock
 * Lista produtos com estoque baixo
 */
router.get('/low-stock', authMiddleware, async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const products = await productService.getLowStockProducts(parseInt(limit));

        res.json({
            success: true,
            data: products,
            total: products.length
        });

    } catch (error) {
        logger.error('Erro ao buscar produtos com estoque baixo:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos com estoque baixo'
        });
    }
});

/**
 * GET /api/products/by-vehicle/:vehicle
 * Busca produtos por veículo compatível
 */
router.get('/by-vehicle/:vehicle', async (req, res) => {
    try {
        const { vehicle } = req.params;
        const { limit = 20 } = req.query;

        const products = await productService.searchProductsByVehicle(vehicle, parseInt(limit));

        res.json({
            success: true,
            data: products,
            total: products.length
        });

    } catch (error) {
        logger.error('Erro ao buscar por veículo:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos por veículo'
        });
    }
});

/**
 * GET /api/products/by-category/:categoryId
 * Busca produtos por categoria
 */
router.get('/by-category/:categoryId', async (req, res) => {
    try {
        const categoryId = parseInt(req.params.categoryId);
        const { limit = 20 } = req.query;

        const products = await productService.getProductsByCategory(categoryId, parseInt(limit));

        res.json({
            success: true,
            data: products,
            total: products.length
        });

    } catch (error) {
        logger.error('Erro ao buscar por categoria:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos por categoria'
        });
    }
});

/**
 * GET /api/products/statistics
 * Estatísticas de produtos
 */
router.get('/statistics', authMiddleware, async (req, res) => {
    try {
        const stats = await productService.getStatistics();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao buscar estatísticas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas'
        });
    }
});

/**
 * GET /api/products/summary
 * Resumo do catálogo para IA
 */
router.get('/summary', async (req, res) => {
    try {
        const summary = await productService.getCatalogSummary();

        res.json({
            success: true,
            data: summary
        });

    } catch (error) {
        logger.error('Erro ao buscar resumo:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar resumo do catálogo'
        });
    }
});

/**
 * GET /api/products/:id
 * Busca produto por ID
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const product = await productService.getProductById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        logger.error('Erro ao buscar produto:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produto'
        });
    }
});

/**
 * GET /api/products/code/:code
 * Busca produto por código
 */
router.get('/code/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const product = await productService.getProductByCode(code);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        res.json({
            success: true,
            data: product
        });

    } catch (error) {
        logger.error('Erro ao buscar produto por código:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produto'
        });
    }
});

/**
 * GET /api/products/:id/details
 * Detalhes completos do produto para IA
 */
router.get('/:id/details', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const details = await productService.getProductDetailsForAI(id);

        if (!details) {
            return res.status(404).json({
                success: false,
                message: 'Produto não encontrado'
            });
        }

        res.json({
            success: true,
            data: details
        });

    } catch (error) {
        logger.error('Erro ao buscar detalhes do produto:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar detalhes do produto'
        });
    }
});

/**
 * GET /api/products/:id/similar
 * Busca produtos similares
 */
router.get('/:id/similar', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { limit = 5 } = req.query;

        const products = await productService.getSimilarProducts(id, parseInt(limit));

        res.json({
            success: true,
            data: products
        });

    } catch (error) {
        logger.error('Erro ao buscar produtos similares:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos similares'
        });
    }
});

/**
 * GET /api/products/:id/availability
 * Verifica disponibilidade do produto
 */
router.get('/:id/availability', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { quantity = 1 } = req.query;

        const availability = await productService.checkAvailability(id, parseInt(quantity));

        res.json({
            success: true,
            data: availability
        });

    } catch (error) {
        logger.error('Erro ao verificar disponibilidade:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar disponibilidade'
        });
    }
});

// ============================================
// ROTAS PROTEGIDAS (CRUD - REQUER AUTENTICAÇÃO)
// ============================================

/**
 * POST /api/products
 * Cria novo produto
 */
router.post('/', 
    authMiddleware, 
    managerMiddleware,
    auditMiddleware('criar_produto', 'produtos'),
    async (req, res) => {
        try {
            const productData = req.body;

            // Validações básicas
            if (!productData.nome) {
                return res.status(400).json({
                    success: false,
                    message: 'Nome do produto é obrigatório'
                });
            }

            if (productData.preco === undefined || productData.preco < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Preço deve ser um valor positivo'
                });
            }

            const productId = await productService.createProduct(productData);

            // Busca produto criado
            const product = await productService.getProductById(productId);

            logger.info(`Produto criado: ${product.nome} (ID: ${productId}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('product:created', product);
            }

            res.status(201).json({
                success: true,
                message: 'Produto criado com sucesso',
                data: product
            });

        } catch (error) {
            logger.error('Erro ao criar produto:', error.message);
            
            if (error.message.includes('já existe')) {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Erro ao criar produto'
            });
        }
    }
);

/**
 * PUT /api/products/:id
 * Atualiza produto existente
 */
router.put('/:id',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('atualizar_produto', 'produtos'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const productData = req.body;

            // Verifica se produto existe
            const existingProduct = await productService.getProductById(id);
            if (!existingProduct) {
                return res.status(404).json({
                    success: false,
                    message: 'Produto não encontrado'
                });
            }

            // Validações
            if (productData.preco !== undefined && productData.preco < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Preço deve ser um valor positivo'
                });
            }

            const updated = await productService.updateProduct(id, productData);

            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Nenhum dado foi alterado'
                });
            }

            // Busca produto atualizado
            const product = await productService.getProductById(id);

            logger.info(`Produto atualizado: ${product.nome} (ID: ${id}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('product:updated', product);
            }

            res.json({
                success: true,
                message: 'Produto atualizado com sucesso',
                data: product
            });

        } catch (error) {
            logger.error('Erro ao atualizar produto:', error.message);

            if (error.message.includes('já existe')) {
                return res.status(409).json({
                    success: false,
                    message: error.message
                });
            }

            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar produto'
            });
        }
    }
);

/**
 * PATCH /api/products/:id/stock
 * Atualiza estoque do produto
 */
router.patch('/:id/stock',
    authMiddleware,
    auditMiddleware('atualizar_estoque', 'produtos'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { quantity, operation = 'set' } = req.body;

            if (quantity === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Quantidade é obrigatória'
                });
            }

            // Verifica se produto existe
            const product = await productService.getProductById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Produto não encontrado'
                });
            }

            // operation: 'set' (definir valor), 'add' (adicionar), 'subtract' (subtrair)
            let newQuantity = parseInt(quantity);
            let relative = false;

            if (operation === 'add') {
                relative = true;
            } else if (operation === 'subtract') {
                relative = true;
                newQuantity = -Math.abs(newQuantity);
            }

            const updated = await productService.updateStock(id, newQuantity, relative);

            if (!updated) {
                return res.status(400).json({
                    success: false,
                    message: 'Erro ao atualizar estoque'
                });
            }

            // Busca produto atualizado
            const updatedProduct = await productService.getProductById(id);

            logger.info(`Estoque atualizado: ${product.nome} (${operation}: ${quantity}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('stock:updated', {
                    productId: id,
                    productName: product.nome,
                    oldQuantity: product.quantidade,
                    newQuantity: updatedProduct.quantidade,
                    operation
                });

                // Verifica se estoque ficou baixo
                if (updatedProduct.quantidade <= updatedProduct.quantidade_minima) {
                    io.to('admins').emit('stock:low', {
                        product: updatedProduct
                    });
                }
            }

            res.json({
                success: true,
                message: 'Estoque atualizado com sucesso',
                data: {
                    id,
                    nome: updatedProduct.nome,
                    quantidade_anterior: product.quantidade,
                    quantidade_atual: updatedProduct.quantidade
                }
            });

        } catch (error) {
            logger.error('Erro ao atualizar estoque:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar estoque'
            });
        }
    }
);

/**
 * PATCH /api/products/:id/toggle-featured
 * Ativa/desativa destaque do produto
 */
router.patch('/:id/toggle-featured',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            const product = await productService.getProductById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Produto não encontrado'
                });
            }

            const newFeatured = !product.destaque;
            await productService.updateProduct(id, { destaque: newFeatured });

            res.json({
                success: true,
                message: newFeatured ? 'Produto marcado como destaque' : 'Produto removido dos destaques',
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
 * PATCH /api/products/:id/toggle-active
 * Ativa/desativa produto
 */
router.patch('/:id/toggle-active',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            const product = await productService.getProductById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Produto não encontrado'
                });
            }

            const newActive = !product.ativo;
            await productService.updateProduct(id, { ativo: newActive });

            logger.info(`Produto ${newActive ? 'ativado' : 'desativado'}: ${product.nome} por ${req.user.email}`);

            res.json({
                success: true,
                message: newActive ? 'Produto ativado' : 'Produto desativado',
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
 * DELETE /api/products/:id
 * Remove produto (soft delete)
 */
router.delete('/:id',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('excluir_produto', 'produtos'),
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            const product = await productService.getProductById(id);
            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: 'Produto não encontrado'
                });
            }

            await productService.deleteProduct(id);

            logger.info(`Produto excluído: ${product.nome} (ID: ${id}) por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('product:deleted', { id, nome: product.nome });
            }

            res.json({
                success: true,
                message: 'Produto removido com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao excluir produto:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao excluir produto'
            });
        }
    }
);

// ============================================
// ROTAS DE CATEGORIAS
// ============================================

/**
 * GET /api/products/categories/all
 * Lista todas as categorias
 */
router.get('/categories/all', async (req, res) => {
    try {
        const categories = await productService.getAllCategories();

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
 * GET /api/products/categories/list
 * Lista categorias para admin
 */
router.get('/categories/list', authMiddleware, async (req, res) => {
    try {
        const categories = await productService.listCategories();

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
 * GET /api/products/categories/:id
 * Busca categoria por ID
 */
router.get('/categories/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const category = await productService.getCategoryById(id);

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
 * POST /api/products/categories
 * Cria nova categoria
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

            const categoryId = await productService.createCategory({ nome, descricao, icone });

            logger.info(`Categoria criada: ${nome} por ${req.user.email}`);

            res.status(201).json({
                success: true,
                message: 'Categoria criada com sucesso',
                data: { id: categoryId, nome, descricao, icone }
            });

        } catch (error) {
            logger.error('Erro ao criar categoria:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao criar categoria'
            });
        }
    }
);

/**
 * PUT /api/products/categories/:id
 * Atualiza categoria
 */
router.put('/categories/:id',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { nome, descricao, icone, ativo } = req.body;

            const updated = await productService.updateCategory(id, { nome, descricao, icone, ativo });

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Categoria não encontrada'
                });
            }

            logger.info(`Categoria atualizada: ID ${id} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Categoria atualizada com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao atualizar categoria:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar categoria'
            });
        }
    }
);

/**
 * DELETE /api/products/categories/:id
 * Remove categoria
 */
router.delete('/categories/:id',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            await productService.deleteCategory(id);

            logger.info(`Categoria excluída: ID ${id} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Categoria removida com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao excluir categoria:', error.message);
            
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
 * GET /api/products/export/json
 * Exporta produtos para JSON
 */
router.get('/export/json', authMiddleware, async (req, res) => {
    try {
        const { includeInactive = false } = req.query;

        const products = await productService.exportProducts({
            includeInactive: includeInactive === 'true'
        });

        res.json({
            success: true,
            data: products,
            total: products.length,
            exportedAt: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Erro ao exportar produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar produtos'
        });
    }
});

/**
 * GET /api/products/export/download
 * Download de produtos em JSON
 */
router.get('/export/download', authMiddleware, async (req, res) => {
    try {
        const products = await productService.exportProducts({ includeInactive: false });

        const filename = `produtos_${new Date().toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(products);

    } catch (error) {
        logger.error('Erro ao exportar produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar produtos'
        });
    }
});

module.exports = router;