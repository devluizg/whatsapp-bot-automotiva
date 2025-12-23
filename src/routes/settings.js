/**
 * ============================================
 * ROTAS DE CONFIGURAÇÕES
 * ============================================
 * 
 * Endpoints para gerenciamento das configurações
 * do sistema e da loja.
 */

const express = require('express');
const router = express.Router();

const db = require('../database/connection');
const logger = require('../utils/logger');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

// Todas as rotas requerem autenticação
router.use(authMiddleware);

// ============================================
// CONFIGURAÇÕES GERAIS
// ============================================

/**
 * GET /api/settings
 * Lista todas as configurações
 */
router.get('/', async (req, res) => {
    try {
        const settings = await db.query(`
            SELECT 
                id,
                chave,
                valor,
                tipo,
                descricao,
                editavel
            FROM configuracoes
            ORDER BY chave ASC
        `);

        // Converte valores baseado no tipo
        const formattedSettings = settings.map(s => ({
            ...s,
            valor: parseSettingValue(s.valor, s.tipo)
        }));

        // Agrupa por prefixo
        const grouped = {};
        formattedSettings.forEach(s => {
            const prefix = s.chave.split('_')[0];
            if (!grouped[prefix]) {
                grouped[prefix] = [];
            }
            grouped[prefix].push(s);
        });

        res.json({
            success: true,
            data: formattedSettings,
            grouped
        });

    } catch (error) {
        logger.error('Erro ao listar configurações:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar configurações'
        });
    }
});

/**
 * GET /api/settings/public
 * Configurações públicas (não sensíveis)
 */
router.get('/public', async (req, res) => {
    try {
        const publicKeys = [
            'loja_nome',
            'loja_telefone',
            'loja_endereco',
            'loja_horario',
            'loja_dias_funcionamento',
            'bot_mensagem_boas_vindas'
        ];

        const settings = await db.query(`
            SELECT chave, valor, tipo
            FROM configuracoes
            WHERE chave IN (${publicKeys.map(() => '?').join(',')})
        `, publicKeys);

        const result = {};
        settings.forEach(s => {
            result[s.chave] = parseSettingValue(s.valor, s.tipo);
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar configurações públicas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar configurações'
        });
    }
});

/**
 * GET /api/settings/:key
 * Busca configuração específica
 */
router.get('/:key', async (req, res) => {
    try {
        const { key } = req.params;

        const setting = await db.queryOne(
            'SELECT * FROM configuracoes WHERE chave = ?',
            [key]
        );

        if (!setting) {
            return res.status(404).json({
                success: false,
                message: 'Configuração não encontrada'
            });
        }

        res.json({
            success: true,
            data: {
                ...setting,
                valor: parseSettingValue(setting.valor, setting.tipo)
            }
        });

    } catch (error) {
        logger.error('Erro ao buscar configuração:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar configuração'
        });
    }
});

/**
 * PUT /api/settings/:key
 * Atualiza configuração específica
 */
router.put('/:key', adminMiddleware, async (req, res) => {
    try {
        const { key } = req.params;
        const { valor } = req.body;

        // Busca configuração
        const setting = await db.queryOne(
            'SELECT * FROM configuracoes WHERE chave = ?',
            [key]
        );

        if (!setting) {
            return res.status(404).json({
                success: false,
                message: 'Configuração não encontrada'
            });
        }

        // Verifica se é editável
        if (!setting.editavel) {
            return res.status(403).json({
                success: false,
                message: 'Esta configuração não pode ser alterada'
            });
        }

        // Converte valor para string (armazenamento)
        const valorString = stringifySettingValue(valor, setting.tipo);

        // Atualiza
        await db.update(
            'configuracoes',
            { valor: valorString },
            'chave = ?',
            [key]
        );

        logger.info(`Configuração atualizada: ${key} por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Configuração atualizada com sucesso',
            data: {
                chave: key,
                valor: valor
            }
        });

    } catch (error) {
        logger.error('Erro ao atualizar configuração:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar configuração'
        });
    }
});

/**
 * PUT /api/settings
 * Atualiza múltiplas configurações de uma vez
 */
router.put('/', adminMiddleware, async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || !Array.isArray(settings)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido. Envie um array de {chave, valor}'
            });
        }

        const results = {
            updated: [],
            errors: []
        };

        for (const item of settings) {
            try {
                const { chave, valor } = item;

                // Busca configuração
                const setting = await db.queryOne(
                    'SELECT * FROM configuracoes WHERE chave = ?',
                    [chave]
                );

                if (!setting) {
                    results.errors.push({ chave, error: 'Não encontrada' });
                    continue;
                }

                if (!setting.editavel) {
                    results.errors.push({ chave, error: 'Não editável' });
                    continue;
                }

                // Atualiza
                const valorString = stringifySettingValue(valor, setting.tipo);
                await db.update(
                    'configuracoes',
                    { valor: valorString },
                    'chave = ?',
                    [chave]
                );

                results.updated.push(chave);
            } catch (e) {
                results.errors.push({ chave: item.chave, error: e.message });
            }
        }

        logger.info(`Configurações atualizadas: ${results.updated.length} por ${req.user.email}`);

        res.json({
            success: true,
            message: `${results.updated.length} configuração(ões) atualizada(s)`,
            data: results
        });

    } catch (error) {
        logger.error('Erro ao atualizar configurações:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar configurações'
        });
    }
});

/**
 * POST /api/settings
 * Cria nova configuração (apenas admin)
 */
router.post('/', adminMiddleware, async (req, res) => {
    try {
        const { chave, valor, tipo = 'string', descricao = '', editavel = true } = req.body;

        if (!chave) {
            return res.status(400).json({
                success: false,
                message: 'Chave é obrigatória'
            });
        }

        // Verifica se já existe
        const existing = await db.queryOne(
            'SELECT id FROM configuracoes WHERE chave = ?',
            [chave]
        );

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Configuração já existe'
            });
        }

        // Valida tipo
        const validTypes = ['string', 'number', 'boolean', 'json'];
        if (!validTypes.includes(tipo)) {
            return res.status(400).json({
                success: false,
                message: `Tipo inválido. Use: ${validTypes.join(', ')}`
            });
        }

        // Converte valor
        const valorString = stringifySettingValue(valor, tipo);

        // Insere
        const id = await db.insert('configuracoes', {
            chave,
            valor: valorString,
            tipo,
            descricao,
            editavel: editavel ? 1 : 0
        });

        logger.info(`Configuração criada: ${chave} por ${req.user.email}`);

        res.status(201).json({
            success: true,
            message: 'Configuração criada com sucesso',
            data: { id, chave, valor, tipo, descricao }
        });

    } catch (error) {
        logger.error('Erro ao criar configuração:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar configuração'
        });
    }
});

/**
 * DELETE /api/settings/:key
 * Remove configuração (apenas admin)
 */
router.delete('/:key', adminMiddleware, async (req, res) => {
    try {
        const { key } = req.params;

        // Verifica se existe
        const setting = await db.queryOne(
            'SELECT * FROM configuracoes WHERE chave = ?',
            [key]
        );

        if (!setting) {
            return res.status(404).json({
                success: false,
                message: 'Configuração não encontrada'
            });
        }

        // Não permite excluir configurações do sistema
        const protectedKeys = [
            'loja_nome',
            'loja_telefone',
            'bot_mensagem_boas_vindas',
            'ia_ativa'
        ];

        if (protectedKeys.includes(key)) {
            return res.status(403).json({
                success: false,
                message: 'Esta configuração não pode ser excluída'
            });
        }

        await db.remove('configuracoes', 'chave = ?', [key]);

        logger.info(`Configuração excluída: ${key} por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Configuração excluída com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao excluir configuração:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir configuração'
        });
    }
});

// ============================================
// CONFIGURAÇÕES DA LOJA
// ============================================

/**
 * GET /api/settings/store/info
 * Informações da loja
 */
router.get('/store/info', async (req, res) => {
    try {
        const storeKeys = [
            'loja_nome',
            'loja_telefone',
            'loja_endereco',
            'loja_horario',
            'loja_dias_funcionamento'
        ];

        const settings = await db.query(`
            SELECT chave, valor, tipo
            FROM configuracoes
            WHERE chave IN (${storeKeys.map(() => '?').join(',')})
        `, storeKeys);

        const result = {};
        settings.forEach(s => {
            const shortKey = s.chave.replace('loja_', '');
            result[shortKey] = parseSettingValue(s.valor, s.tipo);
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar informações da loja:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar informações'
        });
    }
});

/**
 * PUT /api/settings/store/info
 * Atualiza informações da loja
 */
router.put('/store/info', adminMiddleware, async (req, res) => {
    try {
        const { nome, telefone, endereco, horario, dias_funcionamento } = req.body;

        const updates = [];

        if (nome !== undefined) {
            updates.push({ chave: 'loja_nome', valor: nome });
        }
        if (telefone !== undefined) {
            updates.push({ chave: 'loja_telefone', valor: telefone });
        }
        if (endereco !== undefined) {
            updates.push({ chave: 'loja_endereco', valor: endereco });
        }
        if (horario !== undefined) {
            updates.push({ chave: 'loja_horario', valor: horario });
        }
        if (dias_funcionamento !== undefined) {
            updates.push({ chave: 'loja_dias_funcionamento', valor: dias_funcionamento });
        }

        for (const update of updates) {
            await db.query(
                'UPDATE configuracoes SET valor = ? WHERE chave = ?',
                [update.valor, update.chave]
            );
        }

        logger.info(`Informações da loja atualizadas por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Informações da loja atualizadas'
        });

    } catch (error) {
        logger.error('Erro ao atualizar informações da loja:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar informações'
        });
    }
});

// ============================================
// CONFIGURAÇÕES DO BOT
// ============================================

/**
 * GET /api/settings/bot/config
 * Configurações do bot
 */
router.get('/bot/config', async (req, res) => {
    try {
        const botKeys = [
            'bot_mensagem_boas_vindas',
            'bot_mensagem_fora_horario',
            'bot_tempo_sessao',
            'ia_ativa',
            'ia_temperatura',
            'ia_max_tokens'
        ];

        const settings = await db.query(`
            SELECT chave, valor, tipo, descricao
            FROM configuracoes
            WHERE chave IN (${botKeys.map(() => '?').join(',')})
        `, botKeys);

        const result = {};
        settings.forEach(s => {
            result[s.chave] = {
                valor: parseSettingValue(s.valor, s.tipo),
                tipo: s.tipo,
                descricao: s.descricao
            };
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar configurações do bot:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar configurações'
        });
    }
});

/**
 * PUT /api/settings/bot/config
 * Atualiza configurações do bot
 */
router.put('/bot/config', adminMiddleware, async (req, res) => {
    try {
        const {
            mensagem_boas_vindas,
            mensagem_fora_horario,
            tempo_sessao,
            ia_ativa,
            ia_temperatura,
            ia_max_tokens
        } = req.body;

        const updates = [];

        if (mensagem_boas_vindas !== undefined) {
            updates.push({ chave: 'bot_mensagem_boas_vindas', valor: mensagem_boas_vindas });
        }
        if (mensagem_fora_horario !== undefined) {
            updates.push({ chave: 'bot_mensagem_fora_horario', valor: mensagem_fora_horario });
        }
        if (tempo_sessao !== undefined) {
            updates.push({ chave: 'bot_tempo_sessao', valor: tempo_sessao.toString() });
        }
        if (ia_ativa !== undefined) {
            updates.push({ chave: 'ia_ativa', valor: ia_ativa.toString() });
        }
        if (ia_temperatura !== undefined) {
            updates.push({ chave: 'ia_temperatura', valor: ia_temperatura.toString() });
        }
        if (ia_max_tokens !== undefined) {
            updates.push({ chave: 'ia_max_tokens', valor: ia_max_tokens.toString() });
        }

        for (const update of updates) {
            await db.query(
                'UPDATE configuracoes SET valor = ? WHERE chave = ?',
                [update.valor, update.chave]
            );
        }

        logger.info(`Configurações do bot atualizadas por ${req.user.email}`);

        // Notifica via Socket.IO
        const io = req.app.get('io');
        if (io) {
            io.to('admins').emit('settings:updated', { type: 'bot' });
        }

        res.json({
            success: true,
            message: 'Configurações do bot atualizadas'
        });

    } catch (error) {
        logger.error('Erro ao atualizar configurações do bot:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar configurações'
        });
    }
});

// ============================================
// CONFIGURAÇÕES DE NOTIFICAÇÃO
// ============================================

/**
 * GET /api/settings/notifications
 * Configurações de notificação
 */
router.get('/notifications', async (req, res) => {
    try {
        const notifKeys = [
            'notificar_estoque_baixo',
            'email_notificacoes'
        ];

        const settings = await db.query(`
            SELECT chave, valor, tipo
            FROM configuracoes
            WHERE chave IN (${notifKeys.map(() => '?').join(',')})
        `, notifKeys);

        const result = {};
        settings.forEach(s => {
            result[s.chave] = parseSettingValue(s.valor, s.tipo);
        });

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Erro ao buscar configurações de notificação:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar configurações'
        });
    }
});

/**
 * PUT /api/settings/notifications
 * Atualiza configurações de notificação
 */
router.put('/notifications', adminMiddleware, async (req, res) => {
    try {
        const { notificar_estoque_baixo, email_notificacoes } = req.body;

        if (notificar_estoque_baixo !== undefined) {
            await db.query(
                'UPDATE configuracoes SET valor = ? WHERE chave = ?',
                [notificar_estoque_baixo.toString(), 'notificar_estoque_baixo']
            );
        }

        if (email_notificacoes !== undefined) {
            await db.query(
                'UPDATE configuracoes SET valor = ? WHERE chave = ?',
                [email_notificacoes, 'email_notificacoes']
            );
        }

        logger.info(`Configurações de notificação atualizadas por ${req.user.email}`);

        res.json({
            success: true,
            message: 'Configurações de notificação atualizadas'
        });

    } catch (error) {
        logger.error('Erro ao atualizar configurações de notificação:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar configurações'
        });
    }
});

// ============================================
// EXPORTAR / IMPORTAR CONFIGURAÇÕES
// ============================================

/**
 * GET /api/settings/export
 * Exporta todas as configurações
 */
router.get('/export', adminMiddleware, async (req, res) => {
    try {
        const settings = await db.query('SELECT * FROM configuracoes ORDER BY chave');

        const exportData = {
            exportedAt: new Date().toISOString(),
            exportedBy: req.user.email,
            settings: settings.map(s => ({
                chave: s.chave,
                valor: s.valor,
                tipo: s.tipo,
                descricao: s.descricao
            }))
        };

        const filename = `configuracoes_${new Date().toISOString().split('T')[0]}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        res.json(exportData);

    } catch (error) {
        logger.error('Erro ao exportar configurações:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao exportar configurações'
        });
    }
});

/**
 * POST /api/settings/import
 * Importa configurações
 */
router.post('/import', adminMiddleware, async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || !Array.isArray(settings)) {
            return res.status(400).json({
                success: false,
                message: 'Formato inválido'
            });
        }

        const results = {
            updated: 0,
            created: 0,
            errors: []
        };

        for (const setting of settings) {
            try {
                const { chave, valor, tipo, descricao } = setting;

                if (!chave) continue;

                // Verifica se existe
                const existing = await db.queryOne(
                    'SELECT id, editavel FROM configuracoes WHERE chave = ?',
                    [chave]
                );

                if (existing) {
                    if (existing.editavel) {
                        await db.update(
                            'configuracoes',
                            { valor: valor || '' },
                            'chave = ?',
                            [chave]
                        );
                        results.updated++;
                    }
                } else {
                    await db.insert('configuracoes', {
                        chave,
                        valor: valor || '',
                        tipo: tipo || 'string',
                        descricao: descricao || '',
                        editavel: 1
                    });
                    results.created++;
                }
            } catch (e) {
                results.errors.push({ chave: setting.chave, error: e.message });
            }
        }

        logger.info(`Configurações importadas por ${req.user.email}: ${results.updated} atualizadas, ${results.created} criadas`);

        res.json({
            success: true,
            message: `${results.updated} atualizada(s), ${results.created} criada(s)`,
            data: results
        });

    } catch (error) {
        logger.error('Erro ao importar configurações:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao importar configurações'
        });
    }
});

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Converte valor da string para o tipo correto
 * @param {string} value - Valor como string
 * @param {string} type - Tipo do valor
 * @returns {any} Valor convertido
 */
function parseSettingValue(value, type) {
    if (value === null || value === undefined) {
        return null;
    }

    switch (type) {
        case 'number':
            return parseFloat(value) || 0;
        case 'boolean':
            return value === 'true' || value === '1';
        case 'json':
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        default:
            return value;
    }
}

/**
 * Converte valor para string para armazenamento
 * @param {any} value - Valor original
 * @param {string} type - Tipo do valor
 * @returns {string} Valor como string
 */
function stringifySettingValue(value, type) {
    if (value === null || value === undefined) {
        return '';
    }

    switch (type) {
        case 'json':
            return typeof value === 'string' ? value : JSON.stringify(value);
        case 'boolean':
            return value ? 'true' : 'false';
        default:
            return String(value);
    }
}

module.exports = router;