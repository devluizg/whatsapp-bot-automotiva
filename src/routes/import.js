/**
 * ============================================
 * ROTAS DE IMPORTAÇÃO
 * ============================================
 * 
 * Endpoints para importação de produtos,
 * serviços e outros dados via JSON.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const db = require('../database/connection');
const productService = require('../services/productService');
const serviceService = require('../services/serviceService');
const logger = require('../utils/logger');
const { authMiddleware, managerMiddleware } = require('../middlewares/auth');

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/imports');
        
        // Cria diretório se não existir
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `import-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        // Aceita apenas JSON
        if (file.mimetype === 'application/json' || path.extname(file.originalname) === '.json') {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos JSON são permitidos'), false);
        }
    }
});

// Todas as rotas requerem autenticação de gerente ou admin
router.use(authMiddleware);
router.use(managerMiddleware);

// ============================================
// IMPORTAÇÃO DE PRODUTOS
// ============================================

/**
 * POST /api/import/products
 * Importa produtos via JSON no body
 */
router.post('/products', async (req, res) => {
    try {
        const { products, options = {} } = req.body;

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. Envie um array de produtos.'
            });
        }

        if (products.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Array de produtos está vazio'
            });
        }

        // Limite de segurança
        if (products.length > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Máximo de 1000 produtos por importação'
            });
        }

        // Registra importação
        const importId = await db.insert('importacoes', {
            tipo: 'produtos',
            total_registros: products.length,
            usuario_id: req.user.id,
            status: 'processando'
        });

        // Processa importação
        const result = await productService.importProducts(products, {
            updateExisting: options.updateExisting !== false,
            skipInvalid: options.skipInvalid !== false
        });

        // Atualiza registro de importação
        await db.update('importacoes', {
            registros_sucesso: result.success,
            registros_erro: result.errors,
            erros: JSON.stringify(result.details.filter(d => d.status === 'error')),
            status: 'concluido'
        }, 'id = ?', [importId]);

        logger.info(`Importação de produtos por ${req.user.email}: ${result.success} sucesso, ${result.errors} erros`);

        // Notifica via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('import:completed', {
                type: 'products',
                result
            });
        }

        res.json({
            success: true,
            message: `Importação concluída: ${result.success} produtos importados`,
            data: {
                importId,
                ...result
            }
        });

    } catch (error) {
        logger.error('Erro na importação de produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na importação de produtos'
        });
    }
});

/**
 * POST /api/import/products/file
 * Importa produtos via upload de arquivo JSON
 */
router.post('/products/file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo enviado'
            });
        }

        // Lê o arquivo
        const filePath = req.file.path;
        const fileContent = fs.readFileSync(filePath, 'utf8');

        let products;
        try {
            const parsed = JSON.parse(fileContent);
            // Aceita tanto array direto quanto objeto com propriedade 'products'
            products = Array.isArray(parsed) ? parsed : parsed.products;
        } catch (e) {
            // Remove arquivo inválido
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: 'Arquivo JSON inválido'
            });
        }

        if (!products || !Array.isArray(products)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. O arquivo deve conter um array de produtos.'
            });
        }

        // Parse das opções
        const options = {
            updateExisting: req.body.updateExisting !== 'false',
            skipInvalid: req.body.skipInvalid !== 'false'
        };

        // Registra importação
        const importId = await db.insert('importacoes', {
            tipo: 'produtos',
            arquivo: req.file.filename,
            total_registros: products.length,
            usuario_id: req.user.id,
            status: 'processando'
        });

        // Processa importação
        const result = await productService.importProducts(products, options);

        // Atualiza registro
        await db.update('importacoes', {
            registros_sucesso: result.success,
            registros_erro: result.errors,
            erros: JSON.stringify(result.details.filter(d => d.status === 'error')),
            status: 'concluido'
        }, 'id = ?', [importId]);

        // Remove arquivo após processamento
        fs.unlinkSync(filePath);

        logger.info(`Importação de arquivo por ${req.user.email}: ${result.success} produtos`);

        res.json({
            success: true,
            message: `Importação concluída: ${result.success} produtos importados`,
            data: {
                importId,
                filename: req.file.originalname,
                ...result
            }
        });

    } catch (error) {
        // Remove arquivo em caso de erro
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        logger.error('Erro na importação de arquivo de produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na importação de produtos'
        });
    }
});

/**
 * GET /api/import/products/template
 * Retorna template JSON para importação de produtos
 */
router.get('/products/template', (req, res) => {
    const template = {
        descricao: "Template para importação de produtos",
        instrucoes: [
            "Preencha os campos obrigatórios: nome e preco",
            "O código deve ser único (se fornecido)",
            "categoria_id deve corresponder a uma categoria existente",
            "Use updateExisting=true para atualizar produtos existentes"
        ],
        campos: {
            codigo: "Código único do produto (opcional)",
            nome: "Nome do produto (obrigatório)",
            descricao: "Descrição detalhada (opcional)",
            categoria_id: "ID da categoria (opcional)",
            preco: "Preço de venda (obrigatório)",
            preco_promocional: "Preço promocional (opcional)",
            custo: "Preço de custo (opcional)",
            quantidade: "Quantidade em estoque (padrão: 0)",
            quantidade_minima: "Estoque mínimo para alerta (padrão: 5)",
            marca: "Marca do produto (opcional)",
            localizacao: "Localização no estoque (opcional)",
            veiculo_compativel: "Veículos compatíveis (opcional)",
            imagem_url: "URL da imagem (opcional)",
            ativo: "Produto ativo (padrão: true)",
            destaque: "Produto em destaque (padrão: false)"
        },
        exemplo: [
            {
                codigo: "FLT001",
                nome: "Filtro de Óleo",
                descricao: "Filtro de óleo de alta qualidade",
                categoria_id: 1,
                preco: 35.90,
                quantidade: 50,
                marca: "Tecfil",
                veiculo_compativel: "Gol, Parati, Saveiro 1.6 1.8",
                ativo: true
            },
            {
                codigo: "FRE001",
                nome: "Pastilha de Freio Dianteira",
                descricao: "Jogo de pastilhas dianteiras",
                categoria_id: 2,
                preco: 89.90,
                quantidade: 20,
                marca: "Cobreq",
                veiculo_compativel: "Gol G5, G6, Fox"
            }
        ]
    };

    res.json(template);
});

// ============================================
// IMPORTAÇÃO DE SERVIÇOS
// ============================================

/**
 * POST /api/import/services
 * Importa serviços via JSON no body
 */
router.post('/services', async (req, res) => {
    try {
        const { services, options = {} } = req.body;

        if (!services || !Array.isArray(services)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. Envie um array de serviços.'
            });
        }

        if (services.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Array de serviços está vazio'
            });
        }

        // Limite de segurança
        if (services.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Máximo de 500 serviços por importação'
            });
        }

        // Registra importação
        const importId = await db.insert('importacoes', {
            tipo: 'servicos',
            total_registros: services.length,
            usuario_id: req.user.id,
            status: 'processando'
        });

        // Processa importação
        const result = await serviceService.importServices(services, {
            updateExisting: options.updateExisting !== false,
            skipInvalid: options.skipInvalid !== false
        });

        // Atualiza registro
        await db.update('importacoes', {
            registros_sucesso: result.success,
            registros_erro: result.errors,
            erros: JSON.stringify(result.details.filter(d => d.status === 'error')),
            status: 'concluido'
        }, 'id = ?', [importId]);

        logger.info(`Importação de serviços por ${req.user.email}: ${result.success} sucesso, ${result.errors} erros`);

        res.json({
            success: true,
            message: `Importação concluída: ${result.success} serviços importados`,
            data: {
                importId,
                ...result
            }
        });

    } catch (error) {
        logger.error('Erro na importação de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na importação de serviços'
        });
    }
});

/**
 * POST /api/import/services/file
 * Importa serviços via upload de arquivo JSON
 */
router.post('/services/file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo enviado'
            });
        }

        // Lê o arquivo
        const filePath = req.file.path;
        const fileContent = fs.readFileSync(filePath, 'utf8');

        let services;
        try {
            const parsed = JSON.parse(fileContent);
            services = Array.isArray(parsed) ? parsed : parsed.services;
        } catch (e) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: 'Arquivo JSON inválido'
            });
        }

        if (!services || !Array.isArray(services)) {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. O arquivo deve conter um array de serviços.'
            });
        }

        const options = {
            updateExisting: req.body.updateExisting !== 'false',
            skipInvalid: req.body.skipInvalid !== 'false'
        };

        // Registra importação
        const importId = await db.insert('importacoes', {
            tipo: 'servicos',
            arquivo: req.file.filename,
            total_registros: services.length,
            usuario_id: req.user.id,
            status: 'processando'
        });

        // Processa importação
        const result = await serviceService.importServices(services, options);

        // Atualiza registro
        await db.update('importacoes', {
            registros_sucesso: result.success,
            registros_erro: result.errors,
            erros: JSON.stringify(result.details.filter(d => d.status === 'error')),
            status: 'concluido'
        }, 'id = ?', [importId]);

        // Remove arquivo
        fs.unlinkSync(filePath);

        logger.info(`Importação de arquivo de serviços por ${req.user.email}: ${result.success} serviços`);

        res.json({
            success: true,
            message: `Importação concluída: ${result.success} serviços importados`,
            data: {
                importId,
                filename: req.file.originalname,
                ...result
            }
        });

    } catch (error) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        logger.error('Erro na importação de arquivo de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na importação de serviços'
        });
    }
});

/**
 * GET /api/import/services/template
 * Retorna template JSON para importação de serviços
 */
router.get('/services/template', (req, res) => {
    const template = {
        descricao: "Template para importação de serviços",
        instrucoes: [
            "Preencha os campos obrigatórios: nome e preco",
            "O código deve ser único (se fornecido)",
            "categoria_id deve corresponder a uma categoria de serviços existente",
            "duracao_estimada é em minutos"
        ],
        campos: {
            codigo: "Código único do serviço (opcional)",
            nome: "Nome do serviço (obrigatório)",
            descricao: "Descrição detalhada (opcional)",
            categoria_id: "ID da categoria de serviços (opcional)",
            preco: "Preço do serviço (obrigatório)",
            preco_promocional: "Preço promocional (opcional)",
            duracao_estimada: "Duração em minutos (padrão: 60)",
            ativo: "Serviço ativo (padrão: true)",
            destaque: "Serviço em destaque (padrão: false)"
        },
        exemplo: [
            {
                codigo: "SRV001",
                nome: "Troca de Óleo",
                descricao: "Troca de óleo do motor com filtro incluso",
                categoria_id: 1,
                preco: 89.90,
                duracao_estimada: 30,
                ativo: true
            },
            {
                codigo: "SRV002",
                nome: "Alinhamento e Balanceamento",
                descricao: "Alinhamento de direção e balanceamento das 4 rodas",
                categoria_id: 5,
                preco: 120.00,
                duracao_estimada: 60
            }
        ]
    };

    res.json(template);
});

// ============================================
// IMPORTAÇÃO DE CATEGORIAS
// ============================================

/**
 * POST /api/import/categories
 * Importa categorias de produtos
 */
router.post('/categories', async (req, res) => {
    try {
        const { categories } = req.body;

        if (!categories || !Array.isArray(categories)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. Envie um array de categorias.'
            });
        }

        const result = {
            total: categories.length,
            success: 0,
            errors: 0,
            details: []
        };

        for (const category of categories) {
            try {
                if (!category.nome) {
                    result.errors++;
                    result.details.push({
                        nome: category.nome || 'SEM NOME',
                        status: 'error',
                        reason: 'Nome é obrigatório'
                    });
                    continue;
                }

                // Verifica se já existe
                const existing = await db.queryOne(
                    'SELECT id FROM categorias WHERE nome = ?',
                    [category.nome]
                );

                if (existing) {
                    // Atualiza
                    await db.update('categorias', {
                        descricao: category.descricao || null,
                        icone: category.icone || null
                    }, 'id = ?', [existing.id]);

                    result.success++;
                    result.details.push({
                        nome: category.nome,
                        status: 'updated',
                        id: existing.id
                    });
                } else {
                    // Cria
                    const id = await productService.createCategory(category);
                    result.success++;
                    result.details.push({
                        nome: category.nome,
                        status: 'created',
                        id
                    });
                }
            } catch (e) {
                result.errors++;
                result.details.push({
                    nome: category.nome || 'DESCONHECIDO',
                    status: 'error',
                    reason: e.message
                });
            }
        }

        logger.info(`Importação de categorias por ${req.user.email}: ${result.success} sucesso`);

        res.json({
            success: true,
            message: `${result.success} categoria(s) importada(s)`,
            data: result
        });

    } catch (error) {
        logger.error('Erro na importação de categorias:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na importação de categorias'
        });
    }
});

/**
 * POST /api/import/service-categories
 * Importa categorias de serviços
 */
router.post('/service-categories', async (req, res) => {
    try {
        const { categories } = req.body;

        if (!categories || !Array.isArray(categories)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. Envie um array de categorias.'
            });
        }

        const result = {
            total: categories.length,
            success: 0,
            errors: 0,
            details: []
        };

        for (const category of categories) {
            try {
                if (!category.nome) {
                    result.errors++;
                    result.details.push({
                        nome: category.nome || 'SEM NOME',
                        status: 'error',
                        reason: 'Nome é obrigatório'
                    });
                    continue;
                }

                // Verifica se já existe
                const existing = await db.queryOne(
                    'SELECT id FROM categorias_servicos WHERE nome = ?',
                    [category.nome]
                );

                if (existing) {
                    await db.update('categorias_servicos', {
                        descricao: category.descricao || null,
                        icone: category.icone || null
                    }, 'id = ?', [existing.id]);

                    result.success++;
                    result.details.push({
                        nome: category.nome,
                        status: 'updated',
                        id: existing.id
                    });
                } else {
                    const id = await serviceService.createCategory(category);
                    result.success++;
                    result.details.push({
                        nome: category.nome,
                        status: 'created',
                        id
                    });
                }
            } catch (e) {
                result.errors++;
                result.details.push({
                    nome: category.nome || 'DESCONHECIDO',
                    status: 'error',
                    reason: e.message
                });
            }
        }

        logger.info(`Importação de categorias de serviços por ${req.user.email}: ${result.success} sucesso`);

        res.json({
            success: true,
            message: `${result.success} categoria(s) importada(s)`,
            data: result
        });

    } catch (error) {
        logger.error('Erro na importação de categorias de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na importação de categorias'
        });
    }
});

// ============================================
// HISTÓRICO DE IMPORTAÇÕES
// ============================================

/**
 * GET /api/import/history
 * Lista histórico de importações
 */
router.get('/history', async (req, res) => {
    try {
        const { page = 1, limit = 20, tipo = null } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);

        let whereClause = '1=1';
        const params = [];

        if (tipo) {
            whereClause += ' AND i.tipo = ?';
            params.push(tipo);
        }

        const [imports, countResult] = await Promise.all([
            db.query(`
                SELECT 
                    i.*,
                    u.nome AS usuario_nome
                FROM importacoes i
                LEFT JOIN usuarios u ON i.usuario_id = u.id
                WHERE ${whereClause}
                ORDER BY i.created_at DESC
                LIMIT ? OFFSET ?
            `, [...params, parseInt(limit), offset]),
            db.queryOne(`
                SELECT COUNT(*) as total FROM importacoes i WHERE ${whereClause}
            `, params)
        ]);

        // Parse dos erros
        const formattedImports = imports.map(i => ({
            ...i,
            erros: i.erros ? JSON.parse(i.erros) : []
        }));

        res.json({
            success: true,
            data: formattedImports,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: countResult?.total || 0,
                totalPages: Math.ceil((countResult?.total || 0) / parseInt(limit))
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar histórico de importações:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar histórico'
        });
    }
});

/**
 * GET /api/import/history/:id
 * Detalhes de uma importação específica
 */
router.get('/history/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const importData = await db.queryOne(`
            SELECT 
                i.*,
                u.nome AS usuario_nome
            FROM importacoes i
            LEFT JOIN usuarios u ON i.usuario_id = u.id
            WHERE i.id = ?
        `, [id]);

        if (!importData) {
            return res.status(404).json({
                success: false,
                message: 'Importação não encontrada'
            });
        }

        res.json({
            success: true,
            data: {
                ...importData,
                erros: importData.erros ? JSON.parse(importData.erros) : []
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar detalhes da importação:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar detalhes'
        });
    }
});

/**
 * DELETE /api/import/history/:id
 * Remove registro de importação do histórico
 */
router.delete('/history/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        const result = await db.remove('importacoes', 'id = ?', [id]);

        if (result === 0) {
            return res.status(404).json({
                success: false,
                message: 'Importação não encontrada'
            });
        }

        logger.info(`Registro de importação excluído: ${id} por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Registro removido com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao remover registro de importação:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao remover registro'
        });
    }
});

// ============================================
// VALIDAÇÃO PRÉVIA
// ============================================

/**
 * POST /api/import/validate/products
 * Valida produtos antes de importar
 */
router.post('/validate/products', async (req, res) => {
    try {
        const { products } = req.body;

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido'
            });
        }

        const validation = {
            total: products.length,
            valid: 0,
            invalid: 0,
            warnings: 0,
            details: []
        };

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const issues = [];
            let status = 'valid';

            // Validações obrigatórias
            if (!product.nome) {
                issues.push({ field: 'nome', message: 'Nome é obrigatório', type: 'error' });
                status = 'invalid';
            }

            if (product.preco === undefined || product.preco < 0) {
                issues.push({ field: 'preco', message: 'Preço inválido', type: 'error' });
                status = 'invalid';
            }

            // Validações de aviso
            if (product.codigo) {
                const existing = await db.queryOne(
                    'SELECT id FROM produtos WHERE codigo = ?',
                    [product.codigo.toUpperCase()]
                );
                if (existing) {
                    issues.push({ 
                        field: 'codigo', 
                        message: 'Código já existe - será atualizado', 
                        type: 'warning' 
                    });
                    if (status === 'valid') status = 'warning';
                }
            }

            if (product.categoria_id) {
                const category = await db.queryOne(
                    'SELECT id FROM categorias WHERE id = ?',
                    [product.categoria_id]
                );
                if (!category) {
                    issues.push({ 
                        field: 'categoria_id', 
                        message: 'Categoria não encontrada', 
                        type: 'warning' 
                    });
                    if (status === 'valid') status = 'warning';
                }
            }

            if (status === 'valid') validation.valid++;
            else if (status === 'invalid') validation.invalid++;
            else validation.warnings++;

            validation.details.push({
                index: i,
                codigo: product.codigo || null,
                nome: product.nome || 'SEM NOME',
                status,
                issues
            });
        }

        res.json({
            success: true,
            message: validation.invalid === 0 
                ? 'Validação concluída com sucesso' 
                : `${validation.invalid} produto(s) com erros`,
            data: validation
        });

    } catch (error) {
        logger.error('Erro na validação de produtos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na validação'
        });
    }
});

/**
 * POST /api/import/validate/services
 * Valida serviços antes de importar
 */
router.post('/validate/services', async (req, res) => {
    try {
        const { services } = req.body;

        if (!services || !Array.isArray(services)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido'
            });
        }

        const validation = {
            total: services.length,
            valid: 0,
            invalid: 0,
            warnings: 0,
            details: []
        };

        for (let i = 0; i < services.length; i++) {
            const service = services[i];
            const issues = [];
            let status = 'valid';

            if (!service.nome) {
                issues.push({ field: 'nome', message: 'Nome é obrigatório', type: 'error' });
                status = 'invalid';
            }

            if (service.preco === undefined || service.preco < 0) {
                issues.push({ field: 'preco', message: 'Preço inválido', type: 'error' });
                status = 'invalid';
            }

            if (service.codigo) {
                const existing = await db.queryOne(
                    'SELECT id FROM servicos WHERE codigo = ?',
                    [service.codigo.toUpperCase()]
                );
                if (existing) {
                    issues.push({ 
                        field: 'codigo', 
                        message: 'Código já existe - será atualizado', 
                        type: 'warning' 
                    });
                    if (status === 'valid') status = 'warning';
                }
            }

            if (status === 'valid') validation.valid++;
            else if (status === 'invalid') validation.invalid++;
            else validation.warnings++;

            validation.details.push({
                index: i,
                codigo: service.codigo || null,
                nome: service.nome || 'SEM NOME',
                status,
                issues
            });
        }

        res.json({
            success: true,
            message: validation.invalid === 0 
                ? 'Validação concluída com sucesso' 
                : `${validation.invalid} serviço(s) com erros`,
            data: validation
        });

    } catch (error) {
        logger.error('Erro na validação de serviços:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro na validação'
        });
    }
});

module.exports = router;