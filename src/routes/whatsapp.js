/**
 * ============================================
 * ROTAS DO WHATSAPP
 * ============================================
 * 
 * Endpoints para gerenciamento da conexão WhatsApp,
 * envio de mensagens e status da conexão.
 */

const express = require('express');
const router = express.Router();

const whatsappService = require('../services/whatsappService');
const customerService = require('../services/customerService');
const logger = require('../utils/logger');
const { authMiddleware, managerMiddleware, auditMiddleware } = require('../middlewares/auth');

// ============================================
// ROTAS DE STATUS DA CONEXÃO
// ============================================

/**
 * GET /api/whatsapp/status
 * Retorna status da conexão com WhatsApp
 */
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const status = await whatsappService.getConnectionStatus();

        res.json({
            success: true,
            data: {
                connected: status.connected,
                status: status.status,
                phoneNumber: status.phoneNumber || null,
                lastConnected: status.lastConnected || null,
                uptime: status.uptime || null,
                qrCode: status.qrCode || null,
                batteryLevel: status.batteryLevel || null,
                isCharging: status.isCharging || null
            }
        });

    } catch (error) {
        logger.error('Erro ao obter status do WhatsApp:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter status do WhatsApp'
        });
    }
});

/**
 * GET /api/whatsapp/qrcode
 * Retorna QR Code para autenticação
 */
router.get('/qrcode', authMiddleware, async (req, res) => {
    try {
        const qrCode = await whatsappService.getQRCode();

        if (!qrCode) {
            return res.status(404).json({
                success: false,
                message: 'QR Code não disponível. O WhatsApp pode já estar conectado.'
            });
        }

        res.json({
            success: true,
            data: {
                qrCode,
                expiresIn: 60, // segundos
                message: 'Escaneie o QR Code com seu WhatsApp'
            }
        });

    } catch (error) {
        logger.error('Erro ao obter QR Code:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter QR Code'
        });
    }
});

/**
 * GET /api/whatsapp/info
 * Retorna informações do dispositivo conectado
 */
router.get('/info', authMiddleware, async (req, res) => {
    try {
        const info = await whatsappService.getDeviceInfo();

        if (!info) {
            return res.status(404).json({
                success: false,
                message: 'Dispositivo não conectado'
            });
        }

        res.json({
            success: true,
            data: info
        });

    } catch (error) {
        logger.error('Erro ao obter informações do dispositivo:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter informações do dispositivo'
        });
    }
});

// ============================================
// ROTAS DE CONEXÃO/DESCONEXÃO
// ============================================

/**
 * POST /api/whatsapp/connect
 * Inicia conexão com WhatsApp
 */
router.post('/connect', 
    authMiddleware, 
    managerMiddleware,
    auditMiddleware('conectar_whatsapp', 'whatsapp'),
    async (req, res) => {
        try {
            const status = await whatsappService.getConnectionStatus();

            if (status.connected) {
                return res.status(400).json({
                    success: false,
                    message: 'WhatsApp já está conectado'
                });
            }

            // Inicia processo de conexão
            await whatsappService.connect();

            logger.info(`Conexão WhatsApp iniciada por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('whatsapp:connecting', {
                    initiatedBy: req.user.email,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'Processo de conexão iniciado. Aguarde o QR Code.'
            });

        } catch (error) {
            logger.error('Erro ao conectar WhatsApp:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao iniciar conexão com WhatsApp'
            });
        }
    }
);

/**
 * POST /api/whatsapp/disconnect
 * Desconecta do WhatsApp
 */
router.post('/disconnect',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('desconectar_whatsapp', 'whatsapp'),
    async (req, res) => {
        try {
            const status = await whatsappService.getConnectionStatus();

            if (!status.connected) {
                return res.status(400).json({
                    success: false,
                    message: 'WhatsApp já está desconectado'
                });
            }

            await whatsappService.disconnect();

            logger.info(`WhatsApp desconectado por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('whatsapp:disconnected', {
                    disconnectedBy: req.user.email,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'WhatsApp desconectado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao desconectar WhatsApp:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao desconectar WhatsApp'
            });
        }
    }
);

/**
 * POST /api/whatsapp/restart
 * Reinicia conexão com WhatsApp
 */
router.post('/restart',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('reiniciar_whatsapp', 'whatsapp'),
    async (req, res) => {
        try {
            logger.info(`Reiniciando WhatsApp por ${req.user.email}`);

            // Notifica que está reiniciando
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('whatsapp:restarting', {
                    restartedBy: req.user.email,
                    timestamp: new Date().toISOString()
                });
            }

            await whatsappService.restart();

            res.json({
                success: true,
                message: 'WhatsApp reiniciado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao reiniciar WhatsApp:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao reiniciar WhatsApp'
            });
        }
    }
);

/**
 * POST /api/whatsapp/logout
 * Faz logout do WhatsApp (remove sessão)
 */
router.post('/logout',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('logout_whatsapp', 'whatsapp'),
    async (req, res) => {
        try {
            await whatsappService.logout();

            logger.info(`Logout do WhatsApp realizado por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('whatsapp:logout', {
                    logoutBy: req.user.email,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'Logout realizado. Será necessário escanear o QR Code novamente.'
            });

        } catch (error) {
            logger.error('Erro ao fazer logout do WhatsApp:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao fazer logout do WhatsApp'
            });
        }
    }
);

// ============================================
// ROTAS DE ENVIO DE MENSAGENS
// ============================================

/**
 * POST /api/whatsapp/send
 * Envia mensagem para um número
 */
router.post('/send',
    authMiddleware,
    auditMiddleware('enviar_mensagem', 'whatsapp'),
    async (req, res) => {
        try {
            const { phone, message, type = 'text' } = req.body;

            // Validações
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Número de telefone é obrigatório'
                });
            }

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: 'Mensagem é obrigatória'
                });
            }

            // Verifica conexão
            const status = await whatsappService.getConnectionStatus();
            if (!status.connected) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp não está conectado'
                });
            }

            // Formata o número
            const formattedPhone = whatsappService.formatPhoneNumber(phone);

            // Envia a mensagem
            const result = await whatsappService.sendMessage(formattedPhone, message);

            // Salva no histórico
            await customerService.saveMessage(formattedPhone, message, 'saida', 'humano');

            logger.info(`Mensagem enviada para ${formattedPhone} por ${req.user.email}`);

            // Notifica via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.to('admins').emit('message:sent', {
                    phone: formattedPhone,
                    message,
                    sentBy: req.user.email,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'Mensagem enviada com sucesso',
                data: {
                    phone: formattedPhone,
                    messageId: result.messageId || null,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Erro ao enviar mensagem:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao enviar mensagem'
            });
        }
    }
);

/**
 * POST /api/whatsapp/send-bulk
 * Envia mensagem para múltiplos números
 */
router.post('/send-bulk',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('enviar_mensagem_massa', 'whatsapp'),
    async (req, res) => {
        try {
            const { phones, message, delay = 2000 } = req.body;

            // Validações
            if (!phones || !Array.isArray(phones) || phones.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Lista de telefones é obrigatória'
                });
            }

            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: 'Mensagem é obrigatória'
                });
            }

            if (phones.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Máximo de 100 destinatários por envio'
                });
            }

            // Verifica conexão
            const status = await whatsappService.getConnectionStatus();
            if (!status.connected) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp não está conectado'
                });
            }

            logger.info(`Envio em massa iniciado por ${req.user.email} para ${phones.length} números`);

            // Envia em background
            const results = {
                total: phones.length,
                sent: 0,
                failed: 0,
                errors: []
            };

            // Processo assíncrono
            (async () => {
                for (const phone of phones) {
                    try {
                        const formattedPhone = whatsappService.formatPhoneNumber(phone);
                        await whatsappService.sendMessage(formattedPhone, message);
                        await customerService.saveMessage(formattedPhone, message, 'saida', 'humano');
                        results.sent++;

                        // Delay entre mensagens para evitar bloqueio
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } catch (error) {
                        results.failed++;
                        results.errors.push({ phone, error: error.message });
                    }
                }

                // Notifica conclusão via Socket.IO
                const io = req.app.get('io');
                if (io) {
                    io.to('admins').emit('bulk:completed', {
                        results,
                        completedBy: req.user.email,
                        timestamp: new Date().toISOString()
                    });
                }

                logger.info(`Envio em massa concluído: ${results.sent}/${results.total} enviados`);
            })();

            res.json({
                success: true,
                message: 'Envio em massa iniciado',
                data: {
                    total: phones.length,
                    estimatedTime: `${Math.ceil((phones.length * delay) / 60000)} minutos`
                }
            });

        } catch (error) {
            logger.error('Erro no envio em massa:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao iniciar envio em massa'
            });
        }
    }
);

/**
 * POST /api/whatsapp/send-media
 * Envia mídia (imagem, áudio, documento)
 */
router.post('/send-media',
    authMiddleware,
    auditMiddleware('enviar_midia', 'whatsapp'),
    async (req, res) => {
        try {
            const { phone, mediaUrl, caption = '', type = 'image' } = req.body;

            // Validações
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Número de telefone é obrigatório'
                });
            }

            if (!mediaUrl) {
                return res.status(400).json({
                    success: false,
                    message: 'URL da mídia é obrigatória'
                });
            }

            // Verifica conexão
            const status = await whatsappService.getConnectionStatus();
            if (!status.connected) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp não está conectado'
                });
            }

            const formattedPhone = whatsappService.formatPhoneNumber(phone);

            // Envia a mídia
            const result = await whatsappService.sendMedia(formattedPhone, mediaUrl, caption, type);

            logger.info(`Mídia enviada para ${formattedPhone} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Mídia enviada com sucesso',
                data: {
                    phone: formattedPhone,
                    type,
                    messageId: result.messageId || null,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Erro ao enviar mídia:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao enviar mídia'
            });
        }
    }
);

/**
 * POST /api/whatsapp/send-location
 * Envia localização
 */
router.post('/send-location',
    authMiddleware,
    auditMiddleware('enviar_localizacao', 'whatsapp'),
    async (req, res) => {
        try {
            const { phone, latitude, longitude, name = '', address = '' } = req.body;

            // Validações
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Número de telefone é obrigatório'
                });
            }

            if (latitude === undefined || longitude === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Latitude e longitude são obrigatórias'
                });
            }

            // Verifica conexão
            const status = await whatsappService.getConnectionStatus();
            if (!status.connected) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp não está conectado'
                });
            }

            const formattedPhone = whatsappService.formatPhoneNumber(phone);

            // Envia a localização
            const result = await whatsappService.sendLocation(formattedPhone, {
                latitude,
                longitude,
                name,
                address
            });

            logger.info(`Localização enviada para ${formattedPhone} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Localização enviada com sucesso',
                data: {
                    phone: formattedPhone,
                    messageId: result.messageId || null,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Erro ao enviar localização:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao enviar localização'
            });
        }
    }
);

/**
 * POST /api/whatsapp/send-contact
 * Envia contato (vCard)
 */
router.post('/send-contact',
    authMiddleware,
    auditMiddleware('enviar_contato', 'whatsapp'),
    async (req, res) => {
        try {
            const { phone, contact } = req.body;

            // Validações
            if (!phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Número de telefone é obrigatório'
                });
            }

            if (!contact || !contact.name || !contact.phone) {
                return res.status(400).json({
                    success: false,
                    message: 'Dados do contato são obrigatórios (name, phone)'
                });
            }

            // Verifica conexão
            const status = await whatsappService.getConnectionStatus();
            if (!status.connected) {
                return res.status(503).json({
                    success: false,
                    message: 'WhatsApp não está conectado'
                });
            }

            const formattedPhone = whatsappService.formatPhoneNumber(phone);

            // Envia o contato
            const result = await whatsappService.sendContact(formattedPhone, contact);

            logger.info(`Contato enviado para ${formattedPhone} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Contato enviado com sucesso',
                data: {
                    phone: formattedPhone,
                    messageId: result.messageId || null,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            logger.error('Erro ao enviar contato:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao enviar contato'
            });
        }
    }
);

// ============================================
// ROTAS DE VERIFICAÇÃO
// ============================================

/**
 * POST /api/whatsapp/check-number
 * Verifica se número existe no WhatsApp
 */
router.post('/check-number', authMiddleware, async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Número de telefone é obrigatório'
            });
        }

        // Verifica conexão
        const status = await whatsappService.getConnectionStatus();
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp não está conectado'
            });
        }

        const formattedPhone = whatsappService.formatPhoneNumber(phone);
        const exists = await whatsappService.checkNumberExists(formattedPhone);

        res.json({
            success: true,
            data: {
                phone: formattedPhone,
                exists,
                checkedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Erro ao verificar número:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar número'
        });
    }
});

/**
 * POST /api/whatsapp/check-numbers
 * Verifica múltiplos números no WhatsApp
 */
router.post('/check-numbers', authMiddleware, async (req, res) => {
    try {
        const { phones } = req.body;

        if (!phones || !Array.isArray(phones) || phones.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Lista de telefones é obrigatória'
            });
        }

        if (phones.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Máximo de 50 números por verificação'
            });
        }

        // Verifica conexão
        const status = await whatsappService.getConnectionStatus();
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp não está conectado'
            });
        }

        const results = [];
        for (const phone of phones) {
            try {
                const formattedPhone = whatsappService.formatPhoneNumber(phone);
                const exists = await whatsappService.checkNumberExists(formattedPhone);
                results.push({ phone: formattedPhone, exists });
            } catch (error) {
                results.push({ phone, exists: false, error: error.message });
            }
        }

        res.json({
            success: true,
            data: {
                results,
                total: phones.length,
                existing: results.filter(r => r.exists).length,
                checkedAt: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Erro ao verificar números:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar números'
        });
    }
});

// ============================================
// ROTAS DE PERFIL E CONTATOS
// ============================================

/**
 * GET /api/whatsapp/profile/:phone
 * Obtém informações do perfil de um contato
 */
router.get('/profile/:phone', authMiddleware, async (req, res) => {
    try {
        const { phone } = req.params;

        // Verifica conexão
        const status = await whatsappService.getConnectionStatus();
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp não está conectado'
            });
        }

        const formattedPhone = whatsappService.formatPhoneNumber(phone);
        const profile = await whatsappService.getContactProfile(formattedPhone);

        res.json({
            success: true,
            data: profile
        });

    } catch (error) {
        logger.error('Erro ao obter perfil:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter perfil do contato'
        });
    }
});

/**
 * GET /api/whatsapp/profile-picture/:phone
 * Obtém foto de perfil de um contato
 */
router.get('/profile-picture/:phone', authMiddleware, async (req, res) => {
    try {
        const { phone } = req.params;

        // Verifica conexão
        const status = await whatsappService.getConnectionStatus();
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp não está conectado'
            });
        }

        const formattedPhone = whatsappService.formatPhoneNumber(phone);
        const pictureUrl = await whatsappService.getProfilePicture(formattedPhone);

        res.json({
            success: true,
            data: {
                phone: formattedPhone,
                pictureUrl: pictureUrl || null
            }
        });

    } catch (error) {
        logger.error('Erro ao obter foto de perfil:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter foto de perfil'
        });
    }
});

// ============================================
// ROTAS DE ESTATÍSTICAS
// ============================================

/**
 * GET /api/whatsapp/stats
 * Retorna estatísticas do WhatsApp
 */
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        const stats = await whatsappService.getStats();

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao obter estatísticas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter estatísticas'
        });
    }
});

/**
 * GET /api/whatsapp/stats/messages
 * Estatísticas de mensagens
 */
router.get('/stats/messages', authMiddleware, async (req, res) => {
    try {
        const { period = 'today' } = req.query;

        const stats = await whatsappService.getMessageStats(period);

        res.json({
            success: true,
            data: stats
        });

    } catch (error) {
        logger.error('Erro ao obter estatísticas de mensagens:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter estatísticas de mensagens'
        });
    }
});

// ============================================
// ROTAS DE GRUPOS (OPCIONAL)
// ============================================

/**
 * GET /api/whatsapp/groups
 * Lista grupos do WhatsApp
 */
router.get('/groups', authMiddleware, async (req, res) => {
    try {
        // Verifica conexão
        const status = await whatsappService.getConnectionStatus();
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp não está conectado'
            });
        }

        const groups = await whatsappService.getGroups();

        res.json({
            success: true,
            data: groups,
            total: groups.length
        });

    } catch (error) {
        logger.error('Erro ao listar grupos:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar grupos'
        });
    }
});

/**
 * GET /api/whatsapp/groups/:groupId
 * Detalhes de um grupo
 */
router.get('/groups/:groupId', authMiddleware, async (req, res) => {
    try {
        const { groupId } = req.params;

        // Verifica conexão
        const status = await whatsappService.getConnectionStatus();
        if (!status.connected) {
            return res.status(503).json({
                success: false,
                message: 'WhatsApp não está conectado'
            });
        }

        const group = await whatsappService.getGroupInfo(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: 'Grupo não encontrado'
            });
        }

        res.json({
            success: true,
            data: group
        });

    } catch (error) {
        logger.error('Erro ao obter detalhes do grupo:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter detalhes do grupo'
        });
    }
});

// ============================================
// ROTAS DE TEMPLATES DE MENSAGEM
// ============================================

/**
 * GET /api/whatsapp/templates
 * Lista templates de mensagem salvos
 */
router.get('/templates', authMiddleware, async (req, res) => {
    try {
        const templates = await whatsappService.getMessageTemplates();

        res.json({
            success: true,
            data: templates
        });

    } catch (error) {
        logger.error('Erro ao listar templates:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar templates'
        });
    }
});

/**
 * POST /api/whatsapp/templates
 * Cria novo template de mensagem
 */
router.post('/templates',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const { name, content, category = 'geral' } = req.body;

            if (!name || !content) {
                return res.status(400).json({
                    success: false,
                    message: 'Nome e conteúdo são obrigatórios'
                });
            }

            const templateId = await whatsappService.createMessageTemplate({
                name,
                content,
                category,
                createdBy: req.user.id
            });

            logger.info(`Template criado: ${name} por ${req.user.email}`);

            res.status(201).json({
                success: true,
                message: 'Template criado com sucesso',
                data: { id: templateId, name, content, category }
            });

        } catch (error) {
            logger.error('Erro ao criar template:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao criar template'
            });
        }
    }
);

/**
 * PUT /api/whatsapp/templates/:id
 * Atualiza template de mensagem
 */
router.put('/templates/:id',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);
            const { name, content, category } = req.body;

            const updated = await whatsappService.updateMessageTemplate(id, {
                name,
                content,
                category
            });

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: 'Template não encontrado'
                });
            }

            logger.info(`Template atualizado: ID ${id} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Template atualizado com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao atualizar template:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar template'
            });
        }
    }
);

/**
 * DELETE /api/whatsapp/templates/:id
 * Remove template de mensagem
 */
router.delete('/templates/:id',
    authMiddleware,
    managerMiddleware,
    async (req, res) => {
        try {
            const id = parseInt(req.params.id);

            await whatsappService.deleteMessageTemplate(id);

            logger.info(`Template excluído: ID ${id} por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Template removido com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao excluir template:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao excluir template'
            });
        }
    }
);

// ============================================
// ROTAS DE CONFIGURAÇÃO
// ============================================

/**
 * GET /api/whatsapp/config
 * Retorna configurações do WhatsApp
 */
router.get('/config', authMiddleware, managerMiddleware, async (req, res) => {
    try {
        const config = await whatsappService.getConfig();

        res.json({
            success: true,
            data: config
        });

    } catch (error) {
        logger.error('Erro ao obter configurações:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao obter configurações'
        });
    }
});

/**
 * PUT /api/whatsapp/config
 * Atualiza configurações do WhatsApp
 */
router.put('/config',
    authMiddleware,
    managerMiddleware,
    auditMiddleware('atualizar_config_whatsapp', 'whatsapp'),
    async (req, res) => {
        try {
            const config = req.body;

            await whatsappService.updateConfig(config);

            logger.info(`Configurações do WhatsApp atualizadas por ${req.user.email}`);

            res.json({
                success: true,
                message: 'Configurações atualizadas com sucesso'
            });

        } catch (error) {
            logger.error('Erro ao atualizar configurações:', error.message);
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar configurações'
            });
        }
    }
);

// ============================================
// WEBHOOKS (PARA INTEGRAÇÃO EXTERNA)
// ============================================

/**
 * POST /api/whatsapp/webhook
 * Recebe webhooks de serviços externos
 */
router.post('/webhook', async (req, res) => {
    try {
        const { type, data } = req.body;

        logger.debug(`Webhook recebido: ${type}`);

        // Processa diferentes tipos de webhook
        switch (type) {
            case 'message':
                // Processa mensagem recebida via webhook
                await whatsappService.processWebhookMessage(data);
                break;

            case 'status':
                // Atualiza status de mensagem
                await whatsappService.processMessageStatus(data);
                break;

            default:
                logger.warn(`Tipo de webhook desconhecido: ${type}`);
        }

        res.json({ success: true });

    } catch (error) {
        logger.error('Erro ao processar webhook:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar webhook'
        });
    }
});

/**
 * GET /api/whatsapp/webhook
 * Verificação de webhook (usado por alguns serviços)
 */
router.get('/webhook', (req, res) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;

    const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'whatsapp_bot_verify';

    if (mode === 'subscribe' && token === verifyToken) {
        logger.info('Webhook verificado com sucesso');
        res.send(challenge);
    } else {
        res.status(403).send('Verificação falhou');
    }
});

module.exports = router;