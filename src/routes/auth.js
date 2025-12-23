/**
 * ============================================
 * ROTAS DE AUTENTICAÇÃO
 * ============================================
 * 
 * Endpoints para login, logout e gerenciamento
 * de usuários do painel administrativo.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const db = require('../database/connection');
const logger = require('../utils/logger');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

// Configurações JWT
const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-padrao';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10;

// ============================================
// ROTAS PÚBLICAS
// ============================================

/**
 * POST /api/auth/login
 * Realiza login do usuário
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validação básica
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email e senha são obrigatórios'
            });
        }

        // Busca usuário
        const user = await db.queryOne(
            'SELECT * FROM usuarios WHERE email = ? AND ativo = 1',
            [email.toLowerCase()]
        );

        if (!user) {
            logger.warn(`Tentativa de login falhou: email não encontrado (${email})`);
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }

        // Verifica senha
        const validPassword = await bcrypt.compare(password, user.senha);

        if (!validPassword) {
            logger.warn(`Tentativa de login falhou: senha incorreta (${email})`);
            return res.status(401).json({
                success: false,
                message: 'Email ou senha incorretos'
            });
        }

        // Gera token JWT
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
                nome: user.nome
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Atualiza último acesso
        await db.update(
            'usuarios',
            { ultimo_acesso: new Date() },
            'id = ?',
            [user.id]
        );

        // Log de sucesso
        logger.info(`Login realizado: ${user.email} (${user.role})`);

        // Retorna dados do usuário (sem senha)
        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            data: {
                token,
                user: {
                    id: user.id,
                    nome: user.nome,
                    email: user.email,
                    role: user.role,
                    avatar_url: user.avatar_url
                }
            }
        });

    } catch (error) {
        logger.error('Erro no login:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao realizar login'
        });
    }
});

/**
 * POST /api/auth/register
 * Registra novo usuário (apenas se não houver admin)
 */
router.post('/register', async (req, res) => {
    try {
        const { nome, email, password } = req.body;

        // Validação
        if (!nome || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nome, email e senha são obrigatórios'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Senha deve ter no mínimo 6 caracteres'
            });
        }

        // Verifica se já existe algum admin
        const adminExists = await db.queryOne(
            'SELECT id FROM usuarios WHERE role = "admin" LIMIT 1'
        );

        // Se já existe admin, bloqueia registro público
        if (adminExists) {
            return res.status(403).json({
                success: false,
                message: 'Registro público desabilitado. Entre em contato com o administrador.'
            });
        }

        // Verifica se email já existe
        const existingUser = await db.queryOne(
            'SELECT id FROM usuarios WHERE email = ?',
            [email.toLowerCase()]
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Este email já está cadastrado'
            });
        }

        // Criptografa senha
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Cria usuário como admin (primeiro usuário)
        const userId = await db.insert('usuarios', {
            nome,
            email: email.toLowerCase(),
            senha: hashedPassword,
            role: 'admin',
            ativo: 1
        });

        logger.info(`Primeiro admin criado: ${email}`);

        // Gera token
        const token = jwt.sign(
            { id: userId, email: email.toLowerCase(), role: 'admin', nome },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.status(201).json({
            success: true,
            message: 'Usuário administrador criado com sucesso',
            data: {
                token,
                user: {
                    id: userId,
                    nome,
                    email: email.toLowerCase(),
                    role: 'admin'
                }
            }
        });

    } catch (error) {
        logger.error('Erro no registro:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar usuário'
        });
    }
});

/**
 * POST /api/auth/forgot-password
 * Solicita recuperação de senha
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email é obrigatório'
            });
        }

        // Verifica se usuário existe
        const user = await db.queryOne(
            'SELECT id, nome FROM usuarios WHERE email = ? AND ativo = 1',
            [email.toLowerCase()]
        );

        // Sempre retorna sucesso (segurança - não revela se email existe)
        if (!user) {
            logger.warn(`Recuperação de senha: email não encontrado (${email})`);
            return res.json({
                success: true,
                message: 'Se o email existir, você receberá instruções de recuperação'
            });
        }

        // TODO: Implementar envio de email com token de recuperação
        // Por enquanto, apenas loga
        logger.info(`Recuperação de senha solicitada: ${email}`);

        res.json({
            success: true,
            message: 'Se o email existir, você receberá instruções de recuperação'
        });

    } catch (error) {
        logger.error('Erro na recuperação de senha:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar solicitação'
        });
    }
});

// ============================================
// ROTAS PROTEGIDAS (REQUER AUTENTICAÇÃO)
// ============================================

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado
 */
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await db.queryOne(
            'SELECT id, nome, email, role, avatar_url, ultimo_acesso, created_at FROM usuarios WHERE id = ?',
            [req.user.id]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            data: user
        });

    } catch (error) {
        logger.error('Erro ao buscar usuário:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do usuário'
        });
    }
});

/**
 * PUT /api/auth/me
 * Atualiza dados do usuário autenticado
 */
router.put('/me', authMiddleware, async (req, res) => {
    try {
        const { nome, email, avatar_url } = req.body;
        const userId = req.user.id;

        const updateData = {};

        if (nome) updateData.nome = nome;
        if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

        // Se está alterando email, verifica se já existe
        if (email && email !== req.user.email) {
            const existingUser = await db.queryOne(
                'SELECT id FROM usuarios WHERE email = ? AND id != ?',
                [email.toLowerCase(), userId]
            );

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Este email já está em uso'
                });
            }

            updateData.email = email.toLowerCase();
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum dado para atualizar'
            });
        }

        await db.update('usuarios', updateData, 'id = ?', [userId]);

        // Busca usuário atualizado
        const user = await db.queryOne(
            'SELECT id, nome, email, role, avatar_url FROM usuarios WHERE id = ?',
            [userId]
        );

        logger.info(`Perfil atualizado: ${user.email}`);

        res.json({
            success: true,
            message: 'Perfil atualizado com sucesso',
            data: user
        });

    } catch (error) {
        logger.error('Erro ao atualizar perfil:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar perfil'
        });
    }
});

/**
 * PUT /api/auth/password
 * Altera senha do usuário autenticado
 */
router.put('/password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        // Validação
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Senha atual e nova senha são obrigatórias'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Nova senha deve ter no mínimo 6 caracteres'
            });
        }

        // Busca usuário com senha
        const user = await db.queryOne(
            'SELECT senha FROM usuarios WHERE id = ?',
            [userId]
        );

        // Verifica senha atual
        const validPassword = await bcrypt.compare(currentPassword, user.senha);

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Senha atual incorreta'
            });
        }

        // Criptografa nova senha
        const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

        // Atualiza senha
        await db.update('usuarios', { senha: hashedPassword }, 'id = ?', [userId]);

        logger.info(`Senha alterada: ${req.user.email}`);

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao alterar senha:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao alterar senha'
        });
    }
});

/**
 * POST /api/auth/logout
 * Realiza logout (invalida token no cliente)
 */
router.post('/logout', authMiddleware, (req, res) => {
    // JWT é stateless, então apenas retornamos sucesso
    // O cliente deve remover o token
    logger.info(`Logout: ${req.user.email}`);

    res.json({
        success: true,
        message: 'Logout realizado com sucesso'
    });
});

/**
 * POST /api/auth/refresh
 * Renova token JWT
 */
router.post('/refresh', authMiddleware, (req, res) => {
    try {
        // Gera novo token
        const token = jwt.sign(
            {
                id: req.user.id,
                email: req.user.email,
                role: req.user.role,
                nome: req.user.nome
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        res.json({
            success: true,
            data: { token }
        });

    } catch (error) {
        logger.error('Erro ao renovar token:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao renovar token'
        });
    }
});

// ============================================
// ROTAS DE ADMIN (GERENCIAMENTO DE USUÁRIOS)
// ============================================

/**
 * GET /api/auth/users
 * Lista todos os usuários (apenas admin)
 */
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await db.query(
            `SELECT id, nome, email, role, ativo, avatar_url, ultimo_acesso, created_at 
             FROM usuarios 
             ORDER BY created_at DESC`
        );

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        logger.error('Erro ao listar usuários:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar usuários'
        });
    }
});

/**
 * POST /api/auth/users
 * Cria novo usuário (apenas admin)
 */
router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { nome, email, password, role = 'atendente' } = req.body;

        // Validação
        if (!nome || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Nome, email e senha são obrigatórios'
            });
        }

        // Valida role
        const validRoles = ['admin', 'gerente', 'atendente'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Role inválida. Use: admin, gerente ou atendente'
            });
        }

        // Verifica se email já existe
        const existingUser = await db.queryOne(
            'SELECT id FROM usuarios WHERE email = ?',
            [email.toLowerCase()]
        );

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Este email já está cadastrado'
            });
        }

        // Criptografa senha
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // Cria usuário
        const userId = await db.insert('usuarios', {
            nome,
            email: email.toLowerCase(),
            senha: hashedPassword,
            role,
            ativo: 1
        });

        logger.info(`Usuário criado por ${req.user.email}: ${email} (${role})`);

        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            data: {
                id: userId,
                nome,
                email: email.toLowerCase(),
                role
            }
        });

    } catch (error) {
        logger.error('Erro ao criar usuário:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar usuário'
        });
    }
});

/**
 * PUT /api/auth/users/:id
 * Atualiza usuário (apenas admin)
 */
router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nome, email, password, role, ativo } = req.body;

        // Verifica se usuário existe
        const user = await db.queryOne(
            'SELECT * FROM usuarios WHERE id = ?',
            [userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Não permite desativar a si mesmo
        if (userId === req.user.id && ativo === false) {
            return res.status(400).json({
                success: false,
                message: 'Você não pode desativar sua própria conta'
            });
        }

        // Monta objeto de atualização
        const updateData = {};

        if (nome) updateData.nome = nome;
        if (role) updateData.role = role;
        if (ativo !== undefined) updateData.ativo = ativo ? 1 : 0;

        // Se está alterando email, verifica se já existe
        if (email && email !== user.email) {
            const existingUser = await db.queryOne(
                'SELECT id FROM usuarios WHERE email = ? AND id != ?',
                [email.toLowerCase(), userId]
            );

            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Este email já está em uso'
                });
            }

            updateData.email = email.toLowerCase();
        }

        // Se está alterando senha
        if (password) {
            updateData.senha = await bcrypt.hash(password, BCRYPT_ROUNDS);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum dado para atualizar'
            });
        }

        await db.update('usuarios', updateData, 'id = ?', [userId]);

        logger.info(`Usuário atualizado por ${req.user.email}: ID ${userId}`);

        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao atualizar usuário:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar usuário'
        });
    }
});

/**
 * DELETE /api/auth/users/:id
 * Remove usuário (apenas admin)
 */
router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);

        // Não permite excluir a si mesmo
        if (userId === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Você não pode excluir sua própria conta'
            });
        }

        // Verifica se usuário existe
        const user = await db.queryOne(
            'SELECT email FROM usuarios WHERE id = ?',
            [userId]
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Desativa usuário (soft delete)
        await db.update('usuarios', { ativo: 0 }, 'id = ?', [userId]);

        logger.info(`Usuário desativado por ${req.user.email}: ${user.email}`);

        res.json({
            success: true,
            message: 'Usuário removido com sucesso'
        });

    } catch (error) {
        logger.error('Erro ao remover usuário:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao remover usuário'
        });
    }
});

module.exports = router;