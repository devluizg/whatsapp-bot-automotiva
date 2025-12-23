/**
 * ============================================
 * SERVIÇO DE CLIENTES
 * ============================================
 * 
 * Lógica de negócio para gerenciamento de
 * clientes, sessões e histórico de conversas.
 */

const db = require('../database/connection');
const logger = require('../utils/logger');
const { settings } = require('../config/settings');
const { extractPhoneFromJid } = require('../utils/formatter');

/**
 * Busca cliente pelo telefone
 * @param {string} phone - Número do telefone
 * @returns {object|null} Cliente encontrado ou null
 */
async function getCustomerByPhone(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const customer = await db.queryOne(
            'SELECT * FROM clientes WHERE telefone = ?',
            [cleanPhone]
        );
        
        return customer;
    } catch (error) {
        logger.error('Erro ao buscar cliente:', error.message);
        throw error;
    }
}

/**
 * Busca cliente pelo ID
 * @param {number} id - ID do cliente
 * @returns {object|null} Cliente encontrado ou null
 */
async function getCustomerById(id) {
    try {
        const customer = await db.queryOne(
            'SELECT * FROM clientes WHERE id = ?',
            [id]
        );
        
        return customer;
    } catch (error) {
        logger.error('Erro ao buscar cliente por ID:', error.message);
        throw error;
    }
}

/**
 * Cria ou atualiza cliente
 * @param {string} phone - Número do telefone
 * @param {object} data - Dados do cliente
 * @returns {object} Cliente criado/atualizado
 */
async function upsertCustomer(phone, data = {}) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        // Verifica se cliente existe
        let customer = await getCustomerByPhone(cleanPhone);
        
        if (customer) {
            // Atualiza cliente existente
            const updateData = {
                total_interacoes: customer.total_interacoes + 1,
                ultimo_contato: new Date(),
            };

            // Só atualiza nome se vier preenchido e cliente não tiver nome
            if (data.nome && !customer.nome) {
                updateData.nome = data.nome;
            }

            // Atualiza outros campos se vierem preenchidos
            if (data.email) updateData.email = data.email;
            if (data.veiculo) updateData.veiculo = data.veiculo;
            if (data.placa) updateData.placa = data.placa;

            await db.update(
                'clientes',
                updateData,
                'id = ?',
                [customer.id]
            );
            
            customer = await getCustomerById(customer.id);
            logger.debug(`Cliente atualizado: ${cleanPhone}`);
        } else {
            // Cria novo cliente
            const insertData = {
                telefone: cleanPhone,
                total_interacoes: 1,
                ultimo_contato: new Date(),
                ...data,
            };
            
            const customerId = await db.insert('clientes', insertData);
            customer = await getCustomerById(customerId);
            logger.info(`Novo cliente cadastrado: ${cleanPhone}`);
        }
        
        return customer;
    } catch (error) {
        logger.error('Erro ao criar/atualizar cliente:', error.message);
        throw error;
    }
}

/**
 * Atualiza dados do cliente
 * @param {string} phone - Número do telefone
 * @param {object} data - Dados para atualizar
 * @returns {boolean} Sucesso da operação
 */
async function updateCustomer(phone, data) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.update(
            'clientes',
            data,
            'telefone = ?',
            [cleanPhone]
        );
        
        return result > 0;
    } catch (error) {
        logger.error('Erro ao atualizar cliente:', error.message);
        throw error;
    }
}

/**
 * Registra último contato do cliente
 * @param {string} phone - Número do telefone
 * @returns {boolean} Sucesso da operação
 */
async function updateLastContact(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE clientes 
             SET ultimo_contato = NOW(), 
                 total_interacoes = total_interacoes + 1 
             WHERE telefone = ?`,
            [cleanPhone]
        );
        
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao atualizar último contato:', error.message);
        return false;
    }
}

/**
 * Atualiza total de compras do cliente
 * @param {string} phone - Número do telefone
 * @param {number} valor - Valor a adicionar
 * @returns {boolean} Sucesso da operação
 */
async function updateTotalCompras(phone, valor) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE clientes 
             SET total_compras = total_compras + ?
             WHERE telefone = ?`,
            [valor, cleanPhone]
        );
        
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao atualizar total de compras:', error.message);
        return false;
    }
}

// ============================================
// GERENCIAMENTO DE SESSÕES
// ============================================

/**
 * Obtém ou cria sessão do cliente
 * @param {string} phone - Número do telefone
 * @returns {object} Dados da sessão
 */
async function getSession(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        let session = await db.queryOne(
            'SELECT * FROM sessoes WHERE telefone = ?',
            [cleanPhone]
        );
        
        // Se não existe ou expirou, cria nova
        if (!session || (session.expira_em && new Date(session.expira_em) < new Date())) {
            session = await createSession(cleanPhone);
        }
        
        // Parse dos dados JSON
        let dados = {};
        let contextoIA = [];
        
        try {
            dados = session.dados ? JSON.parse(session.dados) : {};
        } catch (e) {
            dados = {};
        }
        
        try {
            contextoIA = session.contexto_ia ? JSON.parse(session.contexto_ia) : [];
        } catch (e) {
            contextoIA = [];
        }
        
        return {
            phone: cleanPhone,
            state: session.estado || settings.states.IDLE,
            data: dados,
            aiContext: contextoIA,
            createdAt: session.created_at,
            updatedAt: session.updated_at,
        };
    } catch (error) {
        logger.error('Erro ao obter sessão:', error.message);
        
        // Retorna sessão padrão em caso de erro
        return {
            phone: extractPhoneFromJid(phone),
            state: settings.states.IDLE,
            data: {},
            aiContext: [],
        };
    }
}

/**
 * Cria nova sessão
 * @param {string} phone - Número do telefone
 * @returns {object} Sessão criada
 */
async function createSession(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        // Remove sessão antiga se existir
        await db.query('DELETE FROM sessoes WHERE telefone = ?', [cleanPhone]);
        
        // Cria nova sessão (expira em 30 minutos)
        const expiraEm = new Date();
        expiraEm.setMinutes(expiraEm.getMinutes() + 30);
        
        await db.insert('sessoes', {
            telefone: cleanPhone,
            estado: settings.states.IDLE,
            dados: JSON.stringify({}),
            contexto_ia: JSON.stringify([]),
            expira_em: expiraEm,
        });
        
        const session = await db.queryOne(
            'SELECT * FROM sessoes WHERE telefone = ?',
            [cleanPhone]
        );
        
        logger.debug(`Sessão criada: ${cleanPhone}`);
        return session;
    } catch (error) {
        logger.error('Erro ao criar sessão:', error.message);
        throw error;
    }
}

/**
 * Atualiza estado da sessão
 * @param {string} phone - Número do telefone
 * @param {string} state - Novo estado
 * @param {object} data - Dados adicionais
 * @returns {boolean} Sucesso da operação
 */
async function updateSession(phone, state, data = null) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        // Obtém sessão atual
        const session = await getSession(cleanPhone);
        
        // Mescla dados
        const newData = data !== null 
            ? { ...session.data, ...data }
            : session.data;
        
        // Atualiza expiração (mais 30 minutos)
        const expiraEm = new Date();
        expiraEm.setMinutes(expiraEm.getMinutes() + 30);
        
        const result = await db.query(
            `UPDATE sessoes 
             SET estado = ?, dados = ?, expira_em = ?, updated_at = NOW()
             WHERE telefone = ?`,
            [state, JSON.stringify(newData), expiraEm, cleanPhone]
        );
        
        if (result.affectedRows === 0) {
            // Sessão não existe, cria uma nova
            await db.insert('sessoes', {
                telefone: cleanPhone,
                estado: state,
                dados: JSON.stringify(newData),
                contexto_ia: JSON.stringify([]),
                expira_em: expiraEm,
            });
        }
        
        logger.debug(`Sessão atualizada: ${cleanPhone} -> ${state}`);
        return true;
    } catch (error) {
        logger.error('Erro ao atualizar sessão:', error.message);
        return false;
    }
}

/**
 * Atualiza contexto da IA na sessão
 * @param {string} phone - Número do telefone
 * @param {array} context - Contexto da conversa para IA
 * @returns {boolean} Sucesso da operação
 */
async function updateAIContext(phone, context) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        // Limita o contexto às últimas 10 mensagens
        const limitedContext = context.slice(-10);
        
        const result = await db.query(
            `UPDATE sessoes 
             SET contexto_ia = ?, updated_at = NOW()
             WHERE telefone = ?`,
            [JSON.stringify(limitedContext), cleanPhone]
        );
        
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao atualizar contexto IA:', error.message);
        return false;
    }
}

/**
 * Limpa dados da sessão (volta ao estado inicial)
 * @param {string} phone - Número do telefone
 * @returns {boolean} Sucesso da operação
 */
async function clearSession(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE sessoes 
             SET estado = ?, dados = ?, contexto_ia = ?, updated_at = NOW()
             WHERE telefone = ?`,
            [settings.states.IDLE, JSON.stringify({}), JSON.stringify([]), cleanPhone]
        );
        
        logger.debug(`Sessão limpa: ${cleanPhone}`);
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao limpar sessão:', error.message);
        return false;
    }
}

/**
 * Remove sessões expiradas
 * @returns {number} Número de sessões removidas
 */
async function cleanExpiredSessions() {
    try {
        const result = await db.query(
            'DELETE FROM sessoes WHERE expira_em < NOW()'
        );
        
        if (result.affectedRows > 0) {
            logger.info(`Sessões expiradas removidas: ${result.affectedRows}`);
        }
        
        return result.affectedRows;
    } catch (error) {
        logger.error('Erro ao limpar sessões expiradas:', error.message);
        return 0;
    }
}

// ============================================
// HISTÓRICO DE CONVERSAS
// ============================================

/**
 * Salva mensagem no histórico
 * @param {string} phone - Número do telefone
 * @param {string} message - Conteúdo da mensagem
 * @param {string} type - Tipo (entrada/saida)
 * @param {string} origem - Origem (bot/ia/humano/cliente)
 * @returns {number} ID da mensagem salva
 */
async function saveMessage(phone, message, type = 'entrada', origem = 'cliente') {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        // Busca cliente
        const customer = await getCustomerByPhone(cleanPhone);
        
        // Define origem baseada no tipo se não especificada
        if (type === 'entrada') {
            origem = 'cliente';
        } else if (origem === 'cliente') {
            origem = 'bot'; // Padrão para mensagens de saída
        }
        
        const messageId = await db.insert('conversas', {
            cliente_id: customer ? customer.id : null,
            telefone: cleanPhone,
            mensagem: message,
            tipo: type,
            origem: origem,
        });
        
        // Atualiza contexto da IA com a nova mensagem
        await addMessageToAIContext(cleanPhone, {
            role: type === 'entrada' ? 'user' : 'assistant',
            content: message
        });
        
        return messageId;
    } catch (error) {
        logger.error('Erro ao salvar mensagem:', error.message);
        return null;
    }
}

/**
 * Adiciona mensagem ao contexto da IA
 * @param {string} phone - Número do telefone
 * @param {object} message - Mensagem {role, content}
 */
async function addMessageToAIContext(phone, message) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const session = await getSession(cleanPhone);
        const context = session.aiContext || [];
        
        context.push(message);
        
        // Mantém apenas as últimas 10 mensagens
        const limitedContext = context.slice(-10);
        
        await updateAIContext(cleanPhone, limitedContext);
    } catch (error) {
        logger.debug('Erro ao adicionar ao contexto IA:', error.message);
    }
}

/**
 * Busca histórico de conversas do cliente
 * @param {string} phone - Número do telefone
 * @param {number} limit - Limite de mensagens
 * @returns {array} Lista de mensagens
 */
async function getConversationHistory(phone, limit = 50) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const messages = await db.query(
            `SELECT * FROM conversas 
             WHERE telefone = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [cleanPhone, limit]
        );
        
        return messages.reverse(); // Ordem cronológica
    } catch (error) {
        logger.error('Erro ao buscar histórico:', error.message);
        return [];
    }
}

/**
 * Busca histórico formatado para a IA
 * @param {string} phone - Número do telefone
 * @param {number} limit - Limite de mensagens
 * @returns {array} Lista de mensagens formatadas para IA
 */
async function getConversationHistoryForAI(phone, limit = 10) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const messages = await db.query(
            `SELECT mensagem, tipo, origem, created_at FROM conversas 
             WHERE telefone = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [cleanPhone, limit]
        );
        
        // Formata para o padrão da OpenAI
        return messages.reverse().map(msg => ({
            role: msg.tipo === 'entrada' ? 'user' : 'assistant',
            content: msg.mensagem
        }));
    } catch (error) {
        logger.error('Erro ao buscar histórico para IA:', error.message);
        return [];
    }
}

/**
 * Busca últimas mensagens do cliente
 * @param {string} phone - Número do telefone
 * @param {number} count - Quantidade de mensagens
 * @returns {array} Lista de mensagens
 */
async function getLastMessages(phone, count = 5) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const messages = await db.query(
            `SELECT * FROM conversas 
             WHERE telefone = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [cleanPhone, count]
        );
        
        return messages;
    } catch (error) {
        logger.error('Erro ao buscar últimas mensagens:', error.message);
        return [];
    }
}

/**
 * Conta mensagens do cliente
 * @param {string} phone - Número do telefone
 * @returns {number} Total de mensagens
 */
async function countMessages(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.queryOne(
            `SELECT COUNT(*) as total FROM conversas WHERE telefone = ?`,
            [cleanPhone]
        );
        
        return result ? result.total : 0;
    } catch (error) {
        logger.error('Erro ao contar mensagens:', error.message);
        return 0;
    }
}

/**
 * Marca mensagens como lidas
 * @param {string} phone - Número do telefone
 * @returns {number} Quantidade marcada
 */
async function markMessagesAsRead(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE conversas SET lida = 1 WHERE telefone = ? AND lida = 0`,
            [cleanPhone]
        );
        
        return result.affectedRows;
    } catch (error) {
        logger.error('Erro ao marcar mensagens como lidas:', error.message);
        return 0;
    }
}

/**
 * Busca conversas não lidas
 * @returns {array} Lista de conversas não lidas
 */
async function getUnreadConversations() {
    try {
        const conversations = await db.query(`
            SELECT 
                c.telefone,
                cl.nome AS cliente_nome,
                COUNT(*) AS nao_lidas,
                MAX(c.created_at) AS ultima_mensagem
            FROM conversas c
            LEFT JOIN clientes cl ON c.cliente_id = cl.id
            WHERE c.lida = 0 AND c.tipo = 'entrada'
            GROUP BY c.telefone, cl.nome
            ORDER BY ultima_mensagem DESC
        `);
        
        return conversations;
    } catch (error) {
        logger.error('Erro ao buscar conversas não lidas:', error.message);
        return [];
    }
}

// ============================================
// FILA DE ATENDIMENTO HUMANO
// ============================================

/**
 * Adiciona cliente à fila de atendimento
 * @param {string} phone - Número do telefone
 * @param {string} reason - Motivo do atendimento
 * @returns {object} Dados do atendimento
 */
async function addToQueue(phone, reason = '') {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        // Verifica se já está na fila
        const existing = await db.queryOne(
            `SELECT * FROM atendimentos 
             WHERE telefone = ? AND status IN ('aguardando', 'em_atendimento')`,
            [cleanPhone]
        );
        
        if (existing) {
            return {
                success: false,
                message: 'Você já está na fila de atendimento',
                position: await getQueuePosition(cleanPhone),
                attendance: existing,
            };
        }
        
        // Busca cliente
        const customer = await getCustomerByPhone(cleanPhone);
        
        // Adiciona à fila
        const attendanceId = await db.insert('atendimentos', {
            cliente_id: customer ? customer.id : null,
            telefone: cleanPhone,
            motivo: reason,
            status: 'aguardando',
        });
        
        // Atualiza sessão
        await updateSession(phone, settings.states.WAITING_HUMAN);
        
        const position = await getQueuePosition(cleanPhone);
        
        logger.info(`Cliente adicionado à fila: ${cleanPhone} (posição ${position})`);
        
        return {
            success: true,
            message: 'Adicionado à fila de atendimento',
            position,
            attendanceId,
        };
    } catch (error) {
        logger.error('Erro ao adicionar à fila:', error.message);
        throw error;
    }
}

/**
 * Obtém posição na fila de atendimento
 * @param {string} phone - Número do telefone
 * @returns {number} Posição na fila (0 se não estiver)
 */
async function getQueuePosition(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.queryOne(
            `SELECT COUNT(*) + 1 AS posicao
             FROM atendimentos 
             WHERE status = 'aguardando'
             AND created_at < (
                 SELECT created_at FROM atendimentos 
                 WHERE telefone = ? AND status = 'aguardando'
             )`,
            [cleanPhone]
        );
        
        return result ? result.posicao : 0;
    } catch (error) {
        logger.error('Erro ao obter posição na fila:', error.message);
        return 0;
    }
}

/**
 * Remove cliente da fila de atendimento
 * @param {string} phone - Número do telefone
 * @returns {boolean} Sucesso da operação
 */
async function removeFromQueue(phone) {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE atendimentos 
             SET status = 'cancelado', updated_at = NOW()
             WHERE telefone = ? AND status = 'aguardando'`,
            [cleanPhone]
        );
        
        // Limpa sessão
        await clearSession(phone);
        
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao remover da fila:', error.message);
        return false;
    }
}

/**
 * Inicia atendimento de um cliente
 * @param {string} phone - Número do telefone do cliente
 * @param {number} atendenteId - ID do atendente
 * @param {string} atendenteNome - Nome do atendente
 * @returns {boolean} Sucesso da operação
 */
async function startAttendance(phone, atendenteId = null, atendenteNome = '') {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE atendimentos 
             SET status = 'em_atendimento', 
                 atendente_id = ?,
                 atendente = ?,
                 iniciado_em = NOW(),
                 updated_at = NOW()
             WHERE telefone = ? AND status = 'aguardando'`,
            [atendenteId, atendenteNome, cleanPhone]
        );
        
        // Atualiza sessão
        await updateSession(phone, settings.states.IN_ATTENDANCE);
        
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao iniciar atendimento:', error.message);
        return false;
    }
}

/**
 * Finaliza atendimento de um cliente
 * @param {string} phone - Número do telefone do cliente
 * @param {string} observacoes - Observações finais
 * @returns {boolean} Sucesso da operação
 */
async function finishAttendance(phone, observacoes = '') {
    try {
        const cleanPhone = extractPhoneFromJid(phone);
        
        const result = await db.query(
            `UPDATE atendimentos 
             SET status = 'finalizado', 
                 observacoes = ?,
                 finalizado_em = NOW(),
                 updated_at = NOW()
             WHERE telefone = ? AND status = 'em_atendimento'`,
            [observacoes, cleanPhone]
        );
        
        // Limpa sessão
        await clearSession(phone);
        
        return result.affectedRows > 0;
    } catch (error) {
        logger.error('Erro ao finalizar atendimento:', error.message);
        return false;
    }
}

/**
 * Conta clientes aguardando na fila
 * @returns {number} Total na fila
 */
async function countQueue() {
    try {
        const result = await db.queryOne(
            `SELECT COUNT(*) AS total FROM atendimentos WHERE status = 'aguardando'`
        );
        
        return result ? result.total : 0;
    } catch (error) {
        logger.error('Erro ao contar fila:', error.message);
        return 0;
    }
}

/**
 * Busca próximo da fila para atendimento
 * @returns {object|null} Próximo atendimento ou null
 */
async function getNextInQueue() {
    try {
        const next = await db.queryOne(
            `SELECT a.*, c.nome AS cliente_nome
             FROM atendimentos a
             LEFT JOIN clientes c ON a.cliente_id = c.id
             WHERE a.status = 'aguardando'
             ORDER BY a.prioridade DESC, a.created_at ASC
             LIMIT 1`
        );
        
        return next;
    } catch (error) {
        logger.error('Erro ao buscar próximo da fila:', error.message);
        return null;
    }
}

/**
 * Lista todos na fila de atendimento
 * @returns {array} Lista de atendimentos aguardando
 */
async function getQueue() {
    try {
        const queue = await db.query(
            `SELECT a.*, c.nome AS cliente_nome
             FROM atendimentos a
             LEFT JOIN clientes c ON a.cliente_id = c.id
             WHERE a.status = 'aguardando'
             ORDER BY a.prioridade DESC, a.created_at ASC`
        );
        
        return queue;
    } catch (error) {
        logger.error('Erro ao listar fila:', error.message);
        return [];
    }
}

/**
 * Lista atendimentos em andamento
 * @returns {array} Lista de atendimentos ativos
 */
async function getActiveAttendances() {
    try {
        const attendances = await db.query(
            `SELECT a.*, c.nome AS cliente_nome
             FROM atendimentos a
             LEFT JOIN clientes c ON a.cliente_id = c.id
             WHERE a.status = 'em_atendimento'
             ORDER BY a.iniciado_em ASC`
        );
        
        return attendances;
    } catch (error) {
        logger.error('Erro ao listar atendimentos ativos:', error.message);
        return [];
    }
}

// ============================================
// ESTATÍSTICAS E RELATÓRIOS
// ============================================

/**
 * Obtém estatísticas de clientes
 * @returns {object} Estatísticas
 */
async function getCustomerStats() {
    try {
        const [
            totalClientes,
            clientesHoje,
            clientesSemana,
            clientesMes
        ] = await Promise.all([
            db.queryOne('SELECT COUNT(*) as total FROM clientes'),
            db.queryOne(`SELECT COUNT(*) as total FROM clientes WHERE DATE(created_at) = CURDATE()`),
            db.queryOne(`SELECT COUNT(*) as total FROM clientes WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`),
            db.queryOne(`SELECT COUNT(*) as total FROM clientes WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`)
        ]);

        return {
            total: totalClientes?.total || 0,
            hoje: clientesHoje?.total || 0,
            semana: clientesSemana?.total || 0,
            mes: clientesMes?.total || 0
        };
    } catch (error) {
        logger.error('Erro ao obter estatísticas de clientes:', error.message);
        return { total: 0, hoje: 0, semana: 0, mes: 0 };
    }
}

/**
 * Obtém estatísticas de conversas
 * @returns {object} Estatísticas
 */
async function getConversationStats() {
    try {
        const [
            totalMensagens,
            mensagensHoje,
            porOrigem
        ] = await Promise.all([
            db.queryOne('SELECT COUNT(*) as total FROM conversas'),
            db.queryOne(`SELECT COUNT(*) as total FROM conversas WHERE DATE(created_at) = CURDATE()`),
            db.query(`
                SELECT origem, COUNT(*) as total 
                FROM conversas 
                WHERE DATE(created_at) = CURDATE()
                GROUP BY origem
            `)
        ]);

        const origemMap = {};
        porOrigem.forEach(o => {
            origemMap[o.origem] = o.total;
        });

        return {
            total: totalMensagens?.total || 0,
            hoje: mensagensHoje?.total || 0,
            porOrigem: origemMap
        };
    } catch (error) {
        logger.error('Erro ao obter estatísticas de conversas:', error.message);
        return { total: 0, hoje: 0, porOrigem: {} };
    }
}

/**
 * Obtém estatísticas de atendimentos
 * @returns {object} Estatísticas
 */
async function getAttendanceStats() {
    try {
        const [
            aguardando,
            emAtendimento,
            finalizadosHoje,
            tempoMedio
        ] = await Promise.all([
            db.queryOne(`SELECT COUNT(*) as total FROM atendimentos WHERE status = 'aguardando'`),
            db.queryOne(`SELECT COUNT(*) as total FROM atendimentos WHERE status = 'em_atendimento'`),
            db.queryOne(`SELECT COUNT(*) as total FROM atendimentos WHERE status = 'finalizado' AND DATE(finalizado_em) = CURDATE()`),
            db.queryOne(`
                SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, finalizado_em)) as media
                FROM atendimentos 
                WHERE status = 'finalizado' 
                AND finalizado_em IS NOT NULL
                AND DATE(finalizado_em) = CURDATE()
            `)
        ]);

        return {
            aguardando: aguardando?.total || 0,
            emAtendimento: emAtendimento?.total || 0,
            finalizadosHoje: finalizadosHoje?.total || 0,
            tempoMedioMinutos: Math.round(tempoMedio?.media || 0)
        };
    } catch (error) {
        logger.error('Erro ao obter estatísticas de atendimentos:', error.message);
        return { aguardando: 0, emAtendimento: 0, finalizadosHoje: 0, tempoMedioMinutos: 0 };
    }
}

/**
 * Lista clientes com paginação (para admin)
 * @param {object} options - Opções de listagem
 * @returns {object} Clientes e paginação
 */
async function listCustomers(options = {}) {
    try {
        const {
            page = 1,
            limit = 20,
            search = '',
            orderBy = 'ultimo_contato',
            order = 'DESC'
        } = options;

        const offset = (page - 1) * limit;
        let whereClause = '1=1';
        const params = [];

        if (search) {
            whereClause += ` AND (
                telefone LIKE ?
                OR nome LIKE ?
                OR email LIKE ?
                OR veiculo LIKE ?
            )`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Conta total
        const countResult = await db.queryOne(
            `SELECT COUNT(*) as total FROM clientes WHERE ${whereClause}`,
            params
        );
        const total = countResult.total;

        // Busca clientes
        const allowedOrderBy = ['ultimo_contato', 'nome', 'created_at', 'total_interacoes'];
        const safeOrderBy = allowedOrderBy.includes(orderBy) ? orderBy : 'ultimo_contato';
        const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        const customers = await db.query(
            `SELECT * FROM clientes 
             WHERE ${whereClause}
             ORDER BY ${safeOrderBy} ${safeOrder}
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return {
            data: customers,
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
        logger.error('Erro ao listar clientes:', error.message);
        throw error;
    }
}

module.exports = {
    // Clientes
    getCustomerByPhone,
    getCustomerById,
    upsertCustomer,
    updateCustomer,
    updateLastContact,
    updateTotalCompras,
    listCustomers,
    
    // Sessões
    getSession,
    createSession,
    updateSession,
    updateAIContext,
    clearSession,
    cleanExpiredSessions,
    
    // Conversas
    saveMessage,
    addMessageToAIContext,
    getConversationHistory,
    getConversationHistoryForAI,
    getLastMessages,
    countMessages,
    markMessagesAsRead,
    getUnreadConversations,
    
    // Fila de atendimento
    addToQueue,
    getQueuePosition,
    removeFromQueue,
    startAttendance,
    finishAttendance,
    countQueue,
    getNextInQueue,
    getQueue,
    getActiveAttendances,
    
    // Estatísticas
    getCustomerStats,
    getConversationStats,
    getAttendanceStats,
};