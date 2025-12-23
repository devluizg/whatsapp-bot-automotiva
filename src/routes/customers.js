/**
 * ============================================
 * ROTAS DE CLIENTES
 * ============================================
 * 
 * Endpoints para gerenciamento de clientes
 * que interagem com o bot.
 */

const express = require('express');
const router = express.Router();

const customerService = require('../services/customerService');
const logger = require('../utils/logger');
const { authMiddleware, managerMiddleware } = require('../middlewares/auth');

// Todas as rotas de clientes requerem autenticação
router.use(authMiddleware);

// ============================================
// ROTAS DE LISTAGEM E BUSCA
// ============================================

/**
 * GET /api/customers
 * Lista clientes com paginação e filtros
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            orderBy = 'ultimo_contato',
            order = 'DESC'
        } = req.query;

        const result = await customerService.listCustomers({
            page: parseInt(page),
            limit: parseInt(limit),
            search,
            orderBy,
            order
        });

        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        logger.error('Erro ao listar clientes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar clientes'
        });
    }
});

/**
 * GET /api/customers/stats
 * Estatísticas de clientes
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await customerService.getCustomerStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao buscar estatísticas de clientes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas'
        });
    }
});

/**
 * GET /api/customers/recent
 * Lista clientes recentes (últimas interações)
 */
router.get('/recent', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const result = await customerService.listCustomers({
            page: 1,
            limit: parseInt(limit),
            orderBy: 'ultimo_contato',
            order: 'DESC'
        });

        res.json({
            success: true,
            data: result.data
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
 * GET /api/customers/search
 * Busca clientes por termo
 */
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 20 } = req.query;

        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Termo de busca deve ter pelo menos 2 caracteres'
            });
        }

        const result = await customerService.listCustomers({
            page: 1,
            limit: parseInt(limit),
            search: q
        });

        res.json({
            success: true,
            data: result.data,
            total: result.pagination.total
        });

    } catch (error) {
        logger.error('Erro na busca de clientes:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar clientes'
        });
    }
});

/**
 * GET /api/customers/by-phone/:phone
 * Busca cliente por telefone
 */
router.get('/by-phone/:phone', async (req, res) => {
    try {
        const { phone } = req.params;

        // Limpa o telefone (remove caracteres especiais)
        const cleanPhone = phone.replace(/\D/g, '');

        const customer = await customerService.getCustomerByPhone(cleanPhone);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        res.json({
            success: true,
            data: customer
        });

    } catch (error) {
        logger.error('Erro ao buscar cliente por telefone:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar cliente'
        });
    }
});

/**
 * GET /api/customers/:id
 * Busca cliente por ID
 */
router.get('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        const customer = await customerService.getCustomerById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        res.json({
            success: true,
            data: customer
        });

    } catch (error) {
        logger.error('Erro ao buscar cliente:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar cliente'
        });
    }
});

/**
 * GET /api/customers/:id/conversations
 * Histórico de conversas do cliente
 */
router.get('/:id/conversations', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { limit = 50 } = req.query;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        // Busca cliente
        const customer = await customerService.getCustomerById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        // Busca histórico de conversas
        const conversations = await customerService.getConversationHistory(
            customer.telefone,
            parseInt(limit)
        );

        res.json({
            success: true,
            data: conversations,
            customer: {
                id: customer.id,
                nome: customer.nome,
                telefone: customer.telefone
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar conversas do cliente:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar conversas'
        });
    }
});

/**
 * GET /api/customers/:id/session
 * Sessão atual do cliente
 */
router.get('/:id/session', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        // Busca cliente
        const customer = await customerService.getCustomerById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        // Busca sessão
        const session = await customerService.getSession(customer.telefone);

        res.json({
            success: true,
            data: session
        });

    } catch (error) {
        logger.error('Erro ao buscar sessão do cliente:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar sessão'
        });
    }
});

// ============================================
// ROTAS DE CRUD
// ============================================

/**
 * PUT /api/customers/:id
 * Atualiza dados do cliente
 */
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { nome, email, veiculo, placa, ano_veiculo, observacoes } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        // Busca cliente
        const customer = await customerService.getCustomerById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        // Atualiza dados
        const updateData = {};
        if (nome !== undefined) updateData.nome = nome;
        if (email !== undefined) updateData.email = email;
        if (veiculo !== undefined) updateData.veiculo = veiculo;
        if (placa !== undefined) updateData.placa = placa;
        if (ano_veiculo !== undefined) updateData.ano_veiculo = ano_veiculo;
        if (observacoes !== undefined) updateData.observacoes = observacoes;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum dado para atualizar'
            });
        }

        await customerService.updateCustomer(customer.telefone, updateData);

        // Busca cliente atualizado
        const updatedCustomer = await customerService.getCustomerById(id);

        logger.info(`Cliente atualizado: ${customer.telefone} por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Cliente atualizado com sucesso',
            data: updatedCustomer
        });

    } catch (error) {
        logger.error('Erro ao atualizar cliente:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar cliente'
        });
    }
});

/**
 * DELETE /api/customers/:id/session
 * Limpa sessão do cliente
 */
router.delete('/:id/session', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        // Busca cliente
        const customer = await customerService.getCustomerById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        // Limpa sessão
        await customerService.clearSession(customer.telefone);

        logger.info(`Sessão limpa: ${customer.telefone} por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Sessão do cliente limpa com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao limpar sessão:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao limpar sessão'
        });
    }
});

// ============================================
// ROTAS DE FILA DE ATENDIMENTO
// ============================================

/**
 * GET /api/customers/queue/list
 * Lista fila de atendimento
 */
router.get('/queue/list', async (req, res) => {
    try {
        const queue = await customerService.getQueue();

        res.json({
            success: true,
            data: queue,
            total: queue.length
        });

    } catch (error) {
        logger.error('Erro ao listar fila:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar fila de atendimento'
        });
    }
});

/**
 * GET /api/customers/queue/active
 * Lista atendimentos em andamento
 */
router.get('/queue/active', async (req, res) => {
    try {
        const activeAttendances = await customerService.getActiveAttendances();

        res.json({
            success: true,
            data: activeAttendances,
            total: activeAttendances.length
        });

    } catch (error) {
        logger.error('Erro ao listar atendimentos ativos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar atendimentos ativos'
        });
    }
});

/**
 * GET /api/customers/queue/stats
 * Estatísticas de atendimento
 */
router.get('/queue/stats', async (req, res) => {
    try {
        const stats = await customerService.getAttendanceStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao buscar estatísticas de atendimento:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas'
        });
    }
});

/**
 * GET /api/customers/queue/next
 * Próximo da fila
 */
router.get('/queue/next', async (req, res) => {
    try {
        const next = await customerService.getNextInQueue();

        if (!next) {
            return res.json({
                success: true,
                data: null,
                message: 'Fila vazia'
            });
        }

        res.json({
            success: true,
            data: next
        });

    } catch (error) {
        logger.error('Erro ao buscar próximo da fila:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar próximo da fila'
        });
    }
});

/**
 * POST /api/customers/queue/:phone/start
 * Inicia atendimento de um cliente
 */
router.post('/queue/:phone/start', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        const result = await customerService.startAttendance(
            cleanPhone,
            req.user.id,
            req.user.nome
        );

        if (!result) {
            return res.status(400).json({
                success: false,
                message: 'Não foi possível iniciar o atendimento'
            });
        }

        logger.info(`Atendimento iniciado: ${cleanPhone} por ${req.user.email}`);

        // Notifica via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('attendance:started', {
                phone: cleanPhone,
                attendant: req.user.nome
            });
        }

        res.json({
            success: true,
            message: 'Atendimento iniciado com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao iniciar atendimento:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao iniciar atendimento'
        });
    }
});

/**
 * POST /api/customers/queue/:phone/finish
 * Finaliza atendimento de um cliente
 */
router.post('/queue/:phone/finish', async (req, res) => {
    try {
        const { phone } = req.params;
        const { observacoes = '' } = req.body;
        const cleanPhone = phone.replace(/\D/g, '');

        const result = await customerService.finishAttendance(cleanPhone, observacoes);

        if (!result) {
            return res.status(400).json({
                success: false,
                message: 'Não foi possível finalizar o atendimento'
            });
        }

        logger.info(`Atendimento finalizado: ${cleanPhone} por ${req.user.email}`);

        // Notifica via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('attendance:finished', {
                phone: cleanPhone
            });
        }

        res.json({
            success: true,
            message: 'Atendimento finalizado com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao finalizar atendimento:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao finalizar atendimento'
        });
    }
});

/**
 * DELETE /api/customers/queue/:phone
 * Remove cliente da fila
 */
router.delete('/queue/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const cleanPhone = phone.replace(/\D/g, '');

        const result = await customerService.removeFromQueue(cleanPhone);

        if (!result) {
            return res.status(400).json({
                success: false,
                message: 'Cliente não está na fila'
            });
        }

        logger.info(`Cliente removido da fila: ${cleanPhone} por ${req.user.email}`);

        // Notifica via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('queue:updated');
        }

        res.json({
            success: true,
            message: 'Cliente removido da fila'
        });

    } catch (error) {
        logger.error('Erro ao remover da fila:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao remover da fila'
        });
    }
});

// ============================================
// ROTAS DE MENSAGENS
// ============================================

/**
 * GET /api/customers/messages/unread
 * Lista conversas com mensagens não lidas
 */
router.get('/messages/unread', async (req, res) => {
    try {
        const unreadConversations = await customerService.getUnreadConversations();

        res.json({
            success: true,
            data: unreadConversations,
            total: unreadConversations.length
        });

    } catch (error) {
        logger.error('Erro ao buscar mensagens não lidas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar mensagens não lidas'
        });
    }
});

/**
 * POST /api/customers/:id/messages/read
 * Marca mensagens como lidas
 */
router.post('/:id/messages/read', async (req, res) => {
    try {
        const id = parseInt(req.params.id);

        if (isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID inválido'
            });
        }

        // Busca cliente
        const customer = await customerService.getCustomerById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Cliente não encontrado'
            });
        }

        const count = await customerService.markMessagesAsRead(customer.telefone);

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
 * GET /api/customers/conversation-stats
 * Estatísticas de conversas
 */
router.get('/conversation-stats', async (req, res) => {
    try {
        const stats = await customerService.getConversationStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao buscar estatísticas de conversas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar estatísticas'
        });
    }
});

module.exports = router;