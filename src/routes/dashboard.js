/**
 * ============================================
 * ROTAS DO DASHBOARD
 * ============================================
 * 
 * Endpoints para estatísticas e dados
 * do painel administrativo.
 */

const express = require('express');
const router = express.Router();

const db = require('../database/connection');
const productService = require('../services/productService');
const serviceService = require('../services/serviceService');
const customerService = require('../services/customerService');
const logger = require('../utils/logger');
const { authMiddleware } = require('../middlewares/auth');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// ============================================
// ESTATÍSTICAS GERAIS
// ============================================

/**
 * GET /api/dashboard/stats
 * Estatísticas gerais do sistema
 */
router.get('/stats', async (req, res) => {
    try {
        // Busca todas as estatísticas em paralelo
        const [
            productStats,
            serviceStats,
            customerStats,
            conversationStats,
            attendanceStats
        ] = await Promise.all([
            productService.getStatistics(),
            serviceService.getStatistics(),
            customerService.getCustomerStats(),
            customerService.getConversationStats(),
            customerService.getAttendanceStats()
        ]);

        res.json({
            success: true,
            data: {
                produtos: productStats,
                servicos: serviceStats,
                clientes: customerStats,
                conversas: conversationStats,
                atendimentos: attendanceStats,
                atualizadoEm: new Date().toISOString()
            }
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
 * GET /api/dashboard/summary
 * Resumo rápido para o topo do dashboard
 */
router.get('/summary', async (req, res) => {
    try {
        const [
            totalProdutos,
            totalServicos,
            totalClientes,
            filaAtendimento,
            mensagensHoje,
            produtosEstoqueBaixo
        ] = await Promise.all([
            db.queryOne('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND quantidade > 0'),
            db.queryOne('SELECT COUNT(*) as total FROM servicos WHERE ativo = 1'),
            db.queryOne('SELECT COUNT(*) as total FROM clientes'),
            db.queryOne('SELECT COUNT(*) as total FROM atendimentos WHERE status = "aguardando"'),
            db.queryOne('SELECT COUNT(*) as total FROM conversas WHERE DATE(created_at) = CURDATE()'),
            db.queryOne('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1 AND quantidade > 0 AND quantidade <= quantidade_minima')
        ]);

        res.json({
            success: true,
            data: {
                produtos: totalProdutos?.total || 0,
                servicos: totalServicos?.total || 0,
                clientes: totalClientes?.total || 0,
                fila_atendimento: filaAtendimento?.total || 0,
                mensagens_hoje: mensagensHoje?.total || 0,
                estoque_baixo: produtosEstoqueBaixo?.total || 0
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar resumo:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar resumo'
        });
    }
});

// ============================================
// GRÁFICOS E ANALYTICS
// ============================================

/**
 * GET /api/dashboard/chart/messages
 * Dados para gráfico de mensagens por dia
 */
router.get('/chart/messages', async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const data = await db.query(`
            SELECT 
                DATE(created_at) AS data,
                COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS recebidas,
                SUM(CASE WHEN tipo = 'saida' THEN 1 ELSE 0 END) AS enviadas
            FROM conversas
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY data ASC
        `, [parseInt(days)]);

        // Preenche dias sem dados
        const result = [];
        const today = new Date();
        
        for (let i = parseInt(days) - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const existing = data.find(d => d.data && d.data.toISOString().split('T')[0] === dateStr);
            
            result.push({
                data: dateStr,
                total: existing?.total || 0,
                recebidas: existing?.recebidas || 0,
                enviadas: existing?.enviadas || 0
            });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar dados do gráfico de mensagens:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do gráfico'
        });
    }
});

/**
 * GET /api/dashboard/chart/customers
 * Dados para gráfico de novos clientes por dia
 */
router.get('/chart/customers', async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const data = await db.query(`
            SELECT 
                DATE(created_at) AS data,
                COUNT(*) AS novos_clientes
            FROM clientes
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY data ASC
        `, [parseInt(days)]);

        // Preenche dias sem dados
        const result = [];
        const today = new Date();
        
        for (let i = parseInt(days) - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const existing = data.find(d => d.data && d.data.toISOString().split('T')[0] === dateStr);
            
            result.push({
                data: dateStr,
                novos_clientes: existing?.novos_clientes || 0
            });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar dados do gráfico de clientes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do gráfico'
        });
    }
});

/**
 * GET /api/dashboard/chart/attendances
 * Dados para gráfico de atendimentos
 */
router.get('/chart/attendances', async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const data = await db.query(`
            SELECT 
                DATE(created_at) AS data,
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'finalizado' THEN 1 ELSE 0 END) AS finalizados,
                SUM(CASE WHEN status = 'cancelado' THEN 1 ELSE 0 END) AS cancelados
            FROM atendimentos
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
            GROUP BY DATE(created_at)
            ORDER BY data ASC
        `, [parseInt(days)]);

        // Preenche dias sem dados
        const result = [];
        const today = new Date();
        
        for (let i = parseInt(days) - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const existing = data.find(d => d.data && d.data.toISOString().split('T')[0] === dateStr);
            
            result.push({
                data: dateStr,
                total: existing?.total || 0,
                finalizados: existing?.finalizados || 0,
                cancelados: existing?.cancelados || 0
            });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar dados do gráfico de atendimentos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do gráfico'
        });
    }
});

/**
 * GET /api/dashboard/chart/categories
 * Dados para gráfico de produtos por categoria
 */
router.get('/chart/categories', async (req, res) => {
    try {
        const data = await db.query(`
            SELECT 
                c.nome AS categoria,
                COUNT(p.id) AS total_produtos,
                SUM(p.quantidade) AS total_estoque
            FROM categorias c
            LEFT JOIN produtos p ON c.id = p.categoria_id AND p.ativo = 1
            WHERE c.ativo = 1
            GROUP BY c.id, c.nome
            ORDER BY total_produtos DESC
        `);

        res.json({
            success: true,
            data
        });

    } catch (error) {
        logger.error('Erro ao buscar dados do gráfico de categorias:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do gráfico'
        });
    }
});

/**
 * GET /api/dashboard/chart/hours
 * Dados para gráfico de mensagens por hora do dia
 */
router.get('/chart/hours', async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const data = await db.query(`
            SELECT 
                HOUR(created_at) AS hora,
                COUNT(*) AS total
            FROM conversas
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY HOUR(created_at)
            ORDER BY hora ASC
        `, [parseInt(days)]);

        // Preenche todas as horas (0-23)
        const result = [];
        for (let h = 0; h < 24; h++) {
            const existing = data.find(d => d.hora === h);
            result.push({
                hora: h,
                label: `${h.toString().padStart(2, '0')}:00`,
                total: existing?.total || 0
            });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar dados do gráfico por hora:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do gráfico'
        });
    }
});

/**
 * GET /api/dashboard/chart/response-origin
 * Dados para gráfico de origem das respostas (bot/ia/humano)
 */
router.get('/chart/response-origin', async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const data = await db.query(`
            SELECT 
                COALESCE(origem, 'bot') AS origem,
                COUNT(*) AS total
            FROM conversas
            WHERE tipo = 'saida' 
                AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY origem
            ORDER BY total DESC
        `, [parseInt(days)]);

        // Calcula percentuais
        const totalMsgs = data.reduce((sum, d) => sum + d.total, 0);
        const result = data.map(d => ({
            origem: d.origem,
            total: d.total,
            percentual: totalMsgs > 0 ? Math.round((d.total / totalMsgs) * 100) : 0
        }));

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar dados do gráfico de origem:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do gráfico'
        });
    }
});

// ============================================
// LISTAS RÁPIDAS
// ============================================

/**
 * GET /api/dashboard/recent-customers
 * Clientes recentes
 */
router.get('/recent-customers', async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        const customers = await db.query(`
            SELECT 
                id,
                telefone,
                nome,
                veiculo,
                ultimo_contato,
                total_interacoes
            FROM clientes
            ORDER BY ultimo_contato DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({
            success: true,
            data: customers
        });

    } catch (error) {
        logger.error('Erro ao buscar clientes recentes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar clientes recentes'
        });
    }
});

/**
 * GET /api/dashboard/recent-messages
 * Mensagens recentes
 */
router.get('/recent-messages', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const messages = await db.query(`
            SELECT 
                c.id,
                c.telefone,
                c.mensagem,
                c.tipo,
                c.origem,
                c.created_at,
                cl.nome AS cliente_nome
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({
            success: true,
            data: messages
        });

    } catch (error) {
        logger.error('Erro ao buscar mensagens recentes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar mensagens recentes'
        });
    }
});

/**
 * GET /api/dashboard/low-stock
 * Produtos com estoque baixo
 */
router.get('/low-stock', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const products = await productService.getLowStockProducts(parseInt(limit));

        res.json({
            success: true,
            data: products
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
 * GET /api/dashboard/queue
 * Fila de atendimento atual
 */
router.get('/queue', async (req, res) => {
    try {
        const queue = await customerService.getQueue();
        const activeAttendances = await customerService.getActiveAttendances();

        res.json({
            success: true,
            data: {
                aguardando: queue,
                em_atendimento: activeAttendances,
                total_aguardando: queue.length,
                total_em_atendimento: activeAttendances.length
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar fila de atendimento:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar fila de atendimento'
        });
    }
});

/**
 * GET /api/dashboard/top-products
 * Produtos mais buscados/populares
 */
router.get('/top-products', async (req, res) => {
    try {
        const { limit = 5 } = req.query;

        // Busca produtos mais mencionados nas conversas
        const products = await db.query(`
            SELECT 
                p.id,
                p.codigo,
                p.nome,
                p.preco,
                p.quantidade,
                COUNT(c.id) AS mencoes
            FROM produtos p
            JOIN conversas c ON c.mensagem LIKE CONCAT('%', p.nome, '%')
            WHERE p.ativo = 1
            GROUP BY p.id
            ORDER BY mencoes DESC
            LIMIT ?
        `, [parseInt(limit)]);

        // Se não encontrar, retorna produtos em destaque
        if (products.length === 0) {
            const featured = await productService.getFeaturedProducts(parseInt(limit));
            return res.json({
                success: true,
                data: featured,
                source: 'destaque'
            });
        }

        res.json({
            success: true,
            data: products,
            source: 'mencoes'
        });

    } catch (error) {
        logger.error('Erro ao buscar produtos populares:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar produtos populares'
        });
    }
});

// ============================================
// STATUS DO SISTEMA
// ============================================

/**
 * GET /api/dashboard/system-status
 * Status geral do sistema
 */
router.get('/system-status', async (req, res) => {
    try {
        // Status do banco de dados
        const dbConnected = await db.isConnected();

        // Status do WhatsApp
        let whatsappConnected = false;
        try {
            const whatsappService = require('../services/whatsappService');
            whatsappConnected = whatsappService.isConnected();
        } catch (e) {
            // WhatsApp service não disponível
        }

        // Status da IA
        let aiEnabled = false;
        try {
            const messageHandler = require('../handlers/messageHandler');
            aiEnabled = messageHandler.isAIEnabled();
        } catch (e) {
            // Handler não disponível
        }

        // Estatísticas do banco
        const dbStats = await db.getStats();

        // Uso de memória
        const memoryUsage = process.memoryUsage();

        res.json({
            success: true,
            data: {
                services: {
                    database: dbConnected ? 'online' : 'offline',
                    whatsapp: whatsappConnected ? 'connected' : 'disconnected',
                    ai: aiEnabled ? 'enabled' : 'disabled',
                    server: 'running'
                },
                database: dbStats,
                memory: {
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
                    rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB'
                },
                uptime: Math.round(process.uptime()) + ' segundos',
                nodeVersion: process.version,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar status do sistema:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar status do sistema'
        });
    }
});

/**
 * GET /api/dashboard/activity-log
 * Log de atividades recentes
 */
router.get('/activity-log', async (req, res) => {
    try {
        const { limit = 20 } = req.query;

        const logs = await db.query(`
            SELECT 
                l.*,
                u.nome AS usuario_nome
            FROM logs_sistema l
            LEFT JOIN usuarios u ON l.usuario_id = u.id
            ORDER BY l.created_at DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({
            success: true,
            data: logs
        });

    } catch (error) {
        logger.error('Erro ao buscar log de atividades:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar log de atividades'
        });
    }
});

// ============================================
// RELATÓRIOS
// ============================================

/**
 * GET /api/dashboard/report/daily
 * Relatório diário
 */
router.get('/report/daily', async (req, res) => {
    try {
        const { date = new Date().toISOString().split('T')[0] } = req.query;

        const [
            mensagens,
            novosClientes,
            atendimentos,
            interacoes
        ] = await Promise.all([
            db.queryOne(`
                SELECT 
                    COUNT(*) AS total,
                    SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS recebidas,
                    SUM(CASE WHEN tipo = 'saida' THEN 1 ELSE 0 END) AS enviadas
                FROM conversas
                WHERE DATE(created_at) = ?
            `, [date]),
            db.queryOne(`
                SELECT COUNT(*) AS total
                FROM clientes
                WHERE DATE(created_at) = ?
            `, [date]),
            db.queryOne(`
                SELECT 
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 'finalizado' THEN 1 ELSE 0 END) AS finalizados,
                    AVG(CASE WHEN status = 'finalizado' THEN TIMESTAMPDIFF(MINUTE, created_at, finalizado_em) END) AS tempo_medio
                FROM atendimentos
                WHERE DATE(created_at) = ?
            `, [date]),
            db.query(`
                SELECT telefone, COUNT(*) AS total
                FROM conversas
                WHERE DATE(created_at) = ?
                GROUP BY telefone
            `, [date])
        ]);

        res.json({
            success: true,
            data: {
                data: date,
                mensagens: {
                    total: mensagens?.total || 0,
                    recebidas: mensagens?.recebidas || 0,
                    enviadas: mensagens?.enviadas || 0
                },
                clientes: {
                    novos: novosClientes?.total || 0,
                    ativos: interacoes.length
                },
                atendimentos: {
                    total: atendimentos?.total || 0,
                    finalizados: atendimentos?.finalizados || 0,
                    tempo_medio_minutos: Math.round(atendimentos?.tempo_medio || 0)
                }
            }
        });

    } catch (error) {
        logger.error('Erro ao gerar relatório diário:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar relatório'
        });
    }
});

/**
 * GET /api/dashboard/report/weekly
 * Relatório semanal
 */
router.get('/report/weekly', async (req, res) => {
    try {
        const [
            mensagensPorDia,
            clientesPorDia,
            atendimentosPorDia
        ] = await Promise.all([
            db.query(`
                SELECT 
                    DATE(created_at) AS data,
                    COUNT(*) AS total,
                    SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS recebidas,
                    SUM(CASE WHEN tipo = 'saida' THEN 1 ELSE 0 END) AS enviadas
                FROM conversas
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at)
                ORDER BY data ASC
            `),
            db.query(`
                SELECT 
                    DATE(created_at) AS data,
                    COUNT(*) AS novos
                FROM clientes
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at)
                ORDER BY data ASC
            `),
            db.query(`
                SELECT 
                    DATE(created_at) AS data,
                    COUNT(*) AS total,
                    SUM(CASE WHEN status = 'finalizado' THEN 1 ELSE 0 END) AS finalizados
                FROM atendimentos
                WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                GROUP BY DATE(created_at)
                ORDER BY data ASC
            `)
        ]);

        // Totais da semana
        const totals = {
            mensagens: mensagensPorDia.reduce((sum, d) => sum + d.total, 0),
            mensagens_recebidas: mensagensPorDia.reduce((sum, d) => sum + d.recebidas, 0),
            mensagens_enviadas: mensagensPorDia.reduce((sum, d) => sum + d.enviadas, 0),
            novos_clientes: clientesPorDia.reduce((sum, d) => sum + d.novos, 0),
            atendimentos: atendimentosPorDia.reduce((sum, d) => sum + d.total, 0),
            atendimentos_finalizados: atendimentosPorDia.reduce((sum, d) => sum + d.finalizados, 0)
        };

        res.json({
            success: true,
            data: {
                periodo: 'Últimos 7 dias',
                totais: totals,
                detalhes: {
                    mensagens: mensagensPorDia,
                    clientes: clientesPorDia,
                    atendimentos: atendimentosPorDia
                }
            }
        });

    } catch (error) {
        logger.error('Erro ao gerar relatório semanal:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar relatório'
        });
    }
});

module.exports = router;