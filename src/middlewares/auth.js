/**
 * ============================================
 * MIDDLEWARES DE AUTENTICAÇÃO
 * ============================================
 * 
 * Middlewares para verificação de autenticação
 * e autorização nas rotas da API.
 */

const jwt = require('jsonwebtoken');
const db = require('../database/connection');
const logger = require('../utils/logger');

// Configuração JWT
const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-padrao';

/**
 * Middleware de autenticação
 * Verifica se o token JWT é válido
 */
async function authMiddleware(req, res, next) {
    try {
        // Busca token no header Authorization
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'Token de autenticação não fornecido',
                code: 'NO_TOKEN'
            });
        }

        // Formato esperado: "Bearer <token>"
        const parts = authHeader.split(' ');

        if (parts.length !== 2) {
            return res.status(401).json({
                success: false,
                message: 'Formato de token inválido',
                code: 'INVALID_FORMAT'
            });
        }

        const [scheme, token] = parts;

        if (!/^Bearer$/i.test(scheme)) {
            return res.status(401).json({
                success: false,
                message: 'Token mal formatado',
                code: 'MALFORMED_TOKEN'
            });
        }

        // Verifica e decodifica o token
        const decoded = jwt.verify(token, JWT_SECRET);

        // Verifica se usuário ainda existe e está ativo
        const user = await db.queryOne(
            'SELECT id, nome, email, role, ativo FROM usuarios WHERE id = ? AND ativo = 1',
            [decoded.id]
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Usuário não encontrado ou inativo',
                code: 'USER_NOT_FOUND'
            });
        }

        // Adiciona dados do usuário à requisição
        req.user = {
            id: user.id,
            nome: user.nome,
            email: user.email,
            role: user.role
        };

        return next();

    } catch (error) {
        // Token expirado
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expirado. Faça login novamente.',
                code: 'TOKEN_EXPIRED'
            });
        }

        // Token inválido
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token inválido',
                code: 'INVALID_TOKEN'
            });
        }

        logger.error('Erro no middleware de autenticação:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Erro na autenticação',
            code: 'AUTH_ERROR'
        });
    }
}

/**
 * Middleware de autorização para Admin
 * Requer role 'admin'
 */
function adminMiddleware(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Não autenticado',
            code: 'NOT_AUTHENTICATED'
        });
    }

    if (req.user.role !== 'admin') {
        logger.warn(`Acesso negado: ${req.user.email} tentou acessar rota admin`);
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Requer permissão de administrador.',
            code: 'ADMIN_REQUIRED'
        });
    }

    return next();
}

/**
 * Middleware de autorização para Gerente ou Admin
 * Requer role 'admin' ou 'gerente'
 */
function managerMiddleware(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Não autenticado',
            code: 'NOT_AUTHENTICATED'
        });
    }

    const allowedRoles = ['admin', 'gerente'];

    if (!allowedRoles.includes(req.user.role)) {
        logger.warn(`Acesso negado: ${req.user.email} tentou acessar rota de gerente`);
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Requer permissão de gerente ou administrador.',
            code: 'MANAGER_REQUIRED'
        });
    }

    return next();
}

/**
 * Middleware para verificar roles específicas
 * @param {array} roles - Array de roles permitidas
 * @returns {function} Middleware
 */
function requireRoles(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Não autenticado',
                code: 'NOT_AUTHENTICATED'
            });
        }

        if (!roles.includes(req.user.role)) {
            logger.warn(`Acesso negado: ${req.user.email} (${req.user.role}) tentou acessar rota restrita`);
            return res.status(403).json({
                success: false,
                message: 'Acesso negado. Permissão insuficiente.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }

        return next();
    };
}

/**
 * Middleware opcional de autenticação
 * Não bloqueia se não tiver token, mas adiciona user se tiver
 */
async function optionalAuthMiddleware(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            req.user = null;
            return next();
        }

        const parts = authHeader.split(' ');

        if (parts.length !== 2 || !/^Bearer$/i.test(parts[0])) {
            req.user = null;
            return next();
        }

        const token = parts[1];
        const decoded = jwt.verify(token, JWT_SECRET);

        const user = await db.queryOne(
            'SELECT id, nome, email, role, ativo FROM usuarios WHERE id = ? AND ativo = 1',
            [decoded.id]
        );

        if (user) {
            req.user = {
                id: user.id,
                nome: user.nome,
                email: user.email,
                role: user.role
            };
        } else {
            req.user = null;
        }

        return next();

    } catch (error) {
        // Em caso de erro, apenas não autentica
        req.user = null;
        return next();
    }
}

/**
 * Middleware para verificar se usuário é o dono do recurso ou admin
 * @param {function} getOwnerId - Função que retorna o ID do dono do recurso
 * @returns {function} Middleware
 */
function ownerOrAdminMiddleware(getOwnerId) {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Não autenticado',
                code: 'NOT_AUTHENTICATED'
            });
        }

        // Admin sempre tem acesso
        if (req.user.role === 'admin') {
            return next();
        }

        try {
            const ownerId = await getOwnerId(req);

            if (ownerId === req.user.id) {
                return next();
            }

            logger.warn(`Acesso negado: ${req.user.email} tentou acessar recurso de outro usuário`);
            return res.status(403).json({
                success: false,
                message: 'Acesso negado. Você não tem permissão para este recurso.',
                code: 'NOT_OWNER'
            });

        } catch (error) {
            logger.error('Erro no ownerOrAdminMiddleware:', error.message);
            return res.status(500).json({
                success: false,
                message: 'Erro ao verificar permissões'
            });
        }
    };
}

/**
 * Middleware para log de ações
 * Registra ações importantes no sistema
 */
function auditMiddleware(action, module) {
    return async (req, res, next) => {
        // Armazena resposta original
        const originalSend = res.send;

        res.send = function (body) {
            // Restaura função original
            res.send = originalSend;

            // Tenta fazer log após resposta
            try {
                const statusCode = res.statusCode;
                const success = statusCode >= 200 && statusCode < 300;

                if (req.user && success) {
                    // Log assíncrono para não atrasar resposta
                    setImmediate(async () => {
                        try {
                            await db.insert('logs_sistema', {
                                tipo: 'info',
                                modulo: module,
                                acao: action,
                                descricao: `${req.method} ${req.path}`,
                                dados: JSON.stringify({
                                    params: req.params,
                                    query: req.query,
                                    body: sanitizeBody(req.body)
                                }),
                                usuario_id: req.user.id,
                                ip: req.ip || req.connection.remoteAddress
                            });
                        } catch (error) {
                            logger.debug('Erro ao salvar log de auditoria:', error.message);
                        }
                    });
                }
            } catch (error) {
                // Ignora erros de log
            }

            return originalSend.call(this, body);
        };

        next();
    };
}

/**
 * Remove dados sensíveis do body para log
 * @param {object} body - Body da requisição
 * @returns {object} Body sanitizado
 */
function sanitizeBody(body) {
    if (!body) return {};

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'senha', 'currentPassword', 'newPassword', 'token'];

    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    }

    return sanitized;
}

/**
 * Middleware para verificar horário de funcionamento
 * Bloqueia certas operações fora do horário
 */
function businessHoursMiddleware(req, res, next) {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Domingo

    // Configuração padrão: Seg-Sab, 8h às 18h
    const startHour = parseInt(process.env.HORARIO_INICIO?.split(':')[0]) || 8;
    const endHour = parseInt(process.env.HORARIO_FIM?.split(':')[0]) || 18;

    // Verifica se é dia útil (1-6 = Seg-Sab)
    const isWorkDay = day >= 1 && day <= 6;

    // Verifica se está no horário
    const isWorkHour = hour >= startHour && hour < endHour;

    if (!isWorkDay || !isWorkHour) {
        // Adiciona flag mas não bloqueia
        req.outsideBusinessHours = true;
    } else {
        req.outsideBusinessHours = false;
    }

    next();
}

/**
 * Gera token JWT
 * @param {object} user - Dados do usuário
 * @returns {string} Token JWT
 */
function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            role: user.role,
            nome: user.nome
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
}

/**
 * Decodifica token sem verificar
 * @param {string} token - Token JWT
 * @returns {object|null} Payload decodificado ou null
 */
function decodeToken(token) {
    try {
        return jwt.decode(token);
    } catch {
        return null;
    }
}

/**
 * Verifica token
 * @param {string} token - Token JWT
 * @returns {object} Resultado da verificação
 */
function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return { valid: true, decoded };
    } catch (error) {
        return { 
            valid: false, 
            error: error.name === 'TokenExpiredError' ? 'expired' : 'invalid' 
        };
    }
}

module.exports = {
    authMiddleware,
    adminMiddleware,
    managerMiddleware,
    requireRoles,
    optionalAuthMiddleware,
    ownerOrAdminMiddleware,
    auditMiddleware,
    businessHoursMiddleware,
    generateToken,
    decodeToken,
    verifyToken
};