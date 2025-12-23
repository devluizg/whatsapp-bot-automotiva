/**
 * ============================================
 * ROTAS DE CONVERSAS
 * ============================================
 * 
 * Endpoints para gerenciamento de conversas
 * e histórico de mensagens.
 */

const express = require('express');
const router = express.Router();

const db = require('../database/connection');
const customerService = require('../services/customerService');
const logger = require('../utils/logger');
const { authMiddleware } = require('../middlewares/auth');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// ============================================
// ROTAS DE LISTAGEM
// ============================================

/**
 * GET /api/conversations
 * Lista todas as conversas (agrupadas por cliente)
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            orderBy = 'ultima_mensagem',
            order = 'DESC'
        } = req.query;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        // Query para listar conversas agrupadas por telefone
        let whereClause = '1=1';
        const params = [];

        if (search) {
            whereClause += ` AND (
                c.telefone LIKE ?
                OR cl.nome LIKE ?
            )`;
            params.push(`%${search}%`, `%${search}%`);
        }

        // Conta total de conversas únicas
        const countResult = await db.queryOne(`
            SELECT COUNT(DISTINCT c.telefone) as total
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            WHERE ${whereClause}
        `, params);

        const total = countResult?.total || 0;

        // Busca conversas agrupadas
        const conversations = await db.query(`
            SELECT 
                c.telefone,
                cl.id AS cliente_id,
                cl.nome AS cliente_nome,
                cl.veiculo AS cliente_veiculo,
                COUNT(c.id) AS total_mensagens,
                SUM(CASE WHEN c.lida = 0 AND c.tipo = 'entrada' THEN 1 ELSE 0 END) AS nao_lidas,
                MAX(c.created_at) AS ultima_mensagem,
                (
                    SELECT mensagem FROM conversas 
                    WHERE telefone = c.telefone 
                    ORDER BY created_at DESC LIMIT 1
                ) AS ultima_mensagem_texto,
                (
                    SELECT tipo FROM conversas 
                    WHERE telefone = c.telefone 
                    ORDER BY created_at DESC LIMIT 1
                ) AS ultima_mensagem_tipo
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            WHERE ${whereClause}
            GROUP BY c.telefone, cl.id, cl.nome, cl.veiculo
            ORDER BY ${orderBy === 'ultima_mensagem' ? 'ultima_mensagem' : 'total_mensagens'} ${order}
            LIMIT ? OFFSET ?
        `, [...params, parseInt(limit), offset]);

        res.json({
            success: true,
            data: conversations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / parseInt(limit)),
                hasNext: parseInt(page) * parseInt(limit) < total,
                hasPrev: parseInt(page) > 1
            }
        });

    } catch (error) {
        logger.error('Erro ao listar conversas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar conversas'
        });
    }
});

/**
 * GET /api/conversations/recent
 * Conversas recentes
 */
router.get('/recent', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const conversations = await db.query(`
            SELECT 
                c.telefone,
                cl.id AS cliente_id,
                cl.nome AS cliente_nome,
                COUNT(c.id) AS total_mensagens,
                SUM(CASE WHEN c.lida = 0 AND c.tipo = 'entrada' THEN 1 ELSE 0 END) AS nao_lidas,
                MAX(c.created_at) AS ultima_mensagem,
                (
                    SELECT mensagem FROM conversas 
                    WHERE telefone = c.telefone 
                    ORDER BY created_at DESC LIMIT 1
                ) AS ultima_mensagem_texto
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            GROUP BY c.telefone, cl.id, cl.nome
            ORDER BY ultima_mensagem DESC
            LIMIT ?
        `, [parseInt(limit)]);

        res.json({
            success: true,
            data: conversations
        });

    } catch (error) {
        logger.error('Erro ao buscar conversas recentes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar conversas recentes'
        });
    }
});

/**
 * GET /api/conversations/unread
 * Conversas com mensagens não lidas
 */
router.get('/unread', async (req, res) => {
    try {
        const unreadConversations = await customerService.getUnreadConversations();

        res.json({
            success: true,
            data: unreadConversations,
            total: unreadConversations.length
        });

    } catch (error) {
        logger.error('Erro ao buscar conversas não lidas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar conversas não lidas'
        });
    }
});

/**
 * GET /api/conversations/stats
 * Estatísticas de conversas
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await customerService.getConversationStats();

        // Estatísticas adicionais
        const additionalStats = await db.query(`
            SELECT 
                DATE(created_at) AS data,
                COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS recebidas,
                SUM(CASE WHEN tipo = 'saida' THEN 1 ELSE 0 END) AS enviadas
            FROM conversas
            WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            GROUP BY DATE(created_at)
            ORDER BY data ASC
        `);

        res.json({
            success: true,
            data: {
                ...stats,
                historico_7_dias: additionalStats
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar estatísticas de conversas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas'
        });
    }
});

/**
 * GET /api/conversations/by-date
 * Conversas por data
 */
router.get('/by-date', async (req, res) => {
    try {
        const { 
            startDate, 
            endDate,
            limit = 100 
        } = req.query;

        let whereClause = '1=1';
        const params = [];

        if (startDate) {
            whereClause += ` AND DATE(c.created_at) >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ` AND DATE(c.created_at) <= ?`;
            params.push(endDate);
        }

        const messages = await db.query(`
            SELECT 
                c.*,
                cl.nome AS cliente_nome
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            WHERE ${whereClause}
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [...params, parseInt(limit)]);

        res.json({
            success: true,
            data: messages,
            total: messages.length
        });

    } catch (error) {
        logger.error('Erro ao buscar conversas por data:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar conversas por data'
        });
    }
});

// ============================================
// ROTAS POR TELEFONE
// ============================================

/**
 * GET /api/conversations/:phone
 * Histórico de conversa de um telefone
 */
router.get('/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { limit = 50, before = null } = req.query;

        const cleanPhone = phone.replace(/\D/g, '');

        let whereClause = 'telefone = ?';
        const params = [cleanPhone];

        if (before) {
            whereClause += ' AND id < ?';
            params.push(parseInt(before));
        }

        const messages = await db.query(`
            SELECT * FROM conversas 
            WHERE ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ?
        `, [...params, parseInt(limit)]);

        // Busca informações do cliente
        const customer = await customerService.getCustomerByPhone(cleanPhone);

        // Busca sessão atual
        const session = await customerService.getSession(cleanPhone);

        res.json({
            success: true,
            data: messages.reverse(), // Ordem cronológica
            customer: customer || { telefone: cleanPhone },
            session: {
                state: session.state,
                data: session.data
            },
            hasMore: messages.length === parseInt(limit)
        });

    } catch (error) {
        logger.error('Erro ao buscar conversa:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar conversa'
        });
    }
});

/**
 * GET /api/conversations/:phone/summary
 * Resumo da conversa (para IA)
 */
router.get('/:phone/summary', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        // Busca últimas mensagens
        const messages = await customerService.getConversationHistory(cleanPhone, 20);

        // Tenta gerar resumo com IA
        let summary = null;
        try {
            const aiService = require('../services/aiService');
            summary = await aiService.summarizeConversation(messages);
        } catch (e) {
            // IA não disponível
            logger.debug('IA não disponível para resumo');
        }

        // Estatísticas da conversa
        const stats = await db.queryOne(`
            SELECT 
                COUNT(*) AS total_mensagens,
                MIN(created_at) AS primeira_mensagem,
                MAX(created_at) AS ultima_mensagem,
                SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS mensagens_cliente,
                SUM(CASE WHEN tipo = 'saida' THEN 1 ELSE 0 END) AS mensagens_bot
            FROM conversas
            WHERE telefone = ?
        `, [cleanPhone]);

        res.json({
            success: true,
            data: {
                telefone: cleanPhone,
                resumo_ia: summary,
                estatisticas: stats,
                ultimas_mensagens: messages.slice(-5)
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar resumo da conversa:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar resumo'
        });
    }
});

/**
 * POST /api/conversations/:phone/read
 * Marca todas as mensagens como lidas
 */
router.post('/:phone/read', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        const count = await customerService.markMessagesAsRead(cleanPhone);

        // Notifica via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('messages:read', { phone: cleanPhone });
        }

        res.json({
            success: true,
            message: `${count} mensagem(ns) marcada(s) como lida(s)`
        });

    } catch (error) {
        logger.error('Erro ao marcar mensagens como lidas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao marcar mensagens como lidas'
        });
    }
});

/**
 * DELETE /api/conversations/:phone
 * Exclui histórico de conversa (apenas admin)
 */
router.delete('/:phone', async (req, res) => {
    try {
        // Verifica se é admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Apenas administradores podem excluir conversas'
            });
        }

        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        const result = await db.query(
            'DELETE FROM conversas WHERE telefone = ?',
            [cleanPhone]
        );

        logger.info(`Conversa excluída: ${cleanPhone} por ${req.user.email} (${result.affectedRows} mensagens)`);

        res.json({
            success: true,
            message: `${result.affectedRows} mensagem(ns) excluída(s)`
        });

    } catch (error) {
        logger.error('Erro ao excluir conversa:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir conversa'
        });
    }
});

// ============================================
// ROTAS DE BUSCA
// ============================================

/**
 * GET /api/conversations/search/messages
 * Busca em todas as mensagens
 */
router.get('/search/messages', async (req, res) => {
    try {
        const { q, limit = 50 } = req.query;

        if (!q || q.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Termo de busca deve ter pelo menos 3 caracteres'
            });
        }

        const messages = await db.query(`
            SELECT 
                c.*,
                cl.nome AS cliente_nome
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            WHERE c.mensagem LIKE ?
            ORDER BY c.created_at DESC
            LIMIT ?
        `, [`%${q}%`, parseInt(limit)]);

        res.json({
            success: true,
            data: messages,
            total: messages.length,
            query: q
        });

    } catch (error) {
        logger.error('Erro na busca de mensagens:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar mensagens'
        });
    }
});

// ============================================
// ROTAS DE EXPORTAÇÃO
// ============================================

/**
 * GET /api/conversations/:phone/export
 * Exporta conversa para JSON
 */
router.get('/:phone/export', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        const messages = await db.query(`
            SELECT 
                c.id,
                c.mensagem,
                c.tipo,
                c.origem,
                c.created_at
            FROM conversas c
            WHERE c.telefone = ?
            ORDER BY c.created_at ASC
        `, [cleanPhone]);

        const customer = await customerService.getCustomerByPhone(cleanPhone);

        const exportData = {
            exportedAt: new Date().toISOString(),
            cliente: customer || { telefone: cleanPhone },
            total_mensagens: messages.length,
            mensagens: messages
        };

        const filename = `conversa_${cleanPhone}_${new Date().toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(exportData);

    } catch (error) {
        logger.error('Erro ao exportar conversa:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar conversa'
        });
    }
});

/**
 * GET /api/conversations/export/all
 * Exporta todas as conversas
 */
router.get('/export/all', async (req, res) => {
    try {
        // Verifica se é admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Apenas administradores podem exportar todas as conversas'
            });
        }

        const { startDate, endDate } = req.query;

        let whereClause = '1=1';
        const params = [];

        if (startDate) {
            whereClause += ` AND DATE(c.created_at) >= ?`;
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ` AND DATE(c.created_at) <= ?`;
            params.push(endDate);
        }

        const messages = await db.query(`
            SELECT 
                c.*,
                cl.nome AS cliente_nome
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            WHERE ${whereClause}
            ORDER BY c.created_at ASC
        `, params);

        const exportData = {
            exportedAt: new Date().toISOString(),
            exportedBy: req.user.email,
            filters: { startDate, endDate },
            total_mensagens: messages.length,
            mensagens: messages
        };

        const filename = `conversas_${new Date().toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(exportData);

    } catch (error) {
        logger.error('Erro ao exportar conversas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar conversas'
        });
    }
});

// ============================================
// ROTAS DE ANÁLISE
// ============================================

/**
 * GET /api/conversations/analytics/hourly
 * Análise por hora do dia
 */
router.get('/analytics/hourly', async (req, res) => {
    try {
        const { days = 7 } = req.query;

        const analytics = await db.query(`
            SELECT 
                HOUR(created_at) AS hora,
                COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS recebidas
            FROM conversas
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY HOUR(created_at)
            ORDER BY hora ASC
        `, [parseInt(days)]);

        res.json({
            success: true,
            data: analytics,
            period: `Últimos ${days} dias`
        });

    } catch (error) {
        logger.error('Erro na análise por hora:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar análise'
        });
    }
});

/**
 * GET /api/conversations/analytics/daily
 * Análise por dia da semana
 */
router.get('/analytics/daily', async (req, res) => {
    try {
        const { weeks = 4 } = req.query;

        const analytics = await db.query(`
            SELECT 
                DAYOFWEEK(created_at) AS dia_semana,
                DAYNAME(created_at) AS nome_dia,
                COUNT(*) AS total,
                SUM(CASE WHEN tipo = 'entrada' THEN 1 ELSE 0 END) AS recebidas
            FROM conversas
            WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? WEEK)
            GROUP BY DAYOFWEEK(created_at), DAYNAME(created_at)
            ORDER BY dia_semana ASC
        `, [parseInt(weeks)]);

        res.json({
            success: true,
            data: analytics,
            period: `Últimas ${weeks} semanas`
        });

    } catch (error) {
        logger.error('Erro na análise por dia:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar análise'
        });
    }
});

/**
 * GET /api/conversations/analytics/origin
 * Análise por origem (bot, ia, humano)
 */
router.get('/analytics/origin', async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const analytics = await db.query(`
            SELECT 
                origem,
                COUNT(*) AS total,
                ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM conversas WHERE tipo = 'saida' AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)), 2) AS percentual
            FROM conversas
            WHERE tipo = 'saida' 
                AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
            GROUP BY origem
            ORDER BY total DESC
        `, [parseInt(days), parseInt(days)]);

        res.json({
            success: true,
            data: analytics,
            period: `Últimos ${days} dias`
        });

    } catch (error) {
        logger.error('Erro na análise por origem:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao gerar análise'
        });
    }
});

module.exports = router;