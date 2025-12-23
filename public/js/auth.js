/**
 * ============================================
 * AUTENTICAÇÃO
 * Gerencia login, logout e sessão do usuário
 * ============================================
 */

const Auth = {
    // Dados do usuário logado
    user: null,
    
    // Estado de inicialização
    initialized: false,

    /**
     * Inicializa o módulo de autenticação
     */
    async init() {
        // Verifica se há token salvo
        if (API.isAuthenticated()) {
            try {
                // Valida token e obtém dados do usuário
                await this.loadUser();
                this.initialized = true;
                return true;
            } catch (error) {
                console.error('Erro ao validar sessão:', error);
                this.logout(false);
                return false;
            }
        }
        
        this.initialized = true;
        return false;
    },

    /**
     * Carrega dados do usuário logado
     */
    async loadUser() {
        try {
            const response = await API.auth.me();
            
            if (response.success && response.data) {
                this.user = response.data;
                this.updateUI();
                return this.user;
            }
            
            throw new Error('Usuário não encontrado');
        } catch (error) {
            this.user = null;
            throw error;
        }
    },

    /**
     * Realiza login
     * @param {string} email - E-mail
     * @param {string} password - Senha
     * @returns {Promise<object>} Dados do usuário
     */
    async login(email, password) {
        try {
            // Validações básicas
            if (!email || !password) {
                throw new Error('E-mail e senha são obrigatórios');
            }

            if (!Utils.isValidEmail(email)) {
                throw new Error('E-mail inválido');
            }

            // Faz requisição de login
            const response = await API.auth.login(email, password);

            if (response.success) {
                // Carrega dados do usuário
                if (response.data.user) {
                    this.user = response.data.user;
                } else {
                    await this.loadUser();
                }

                // Atualiza UI
                this.updateUI();

                // Dispara evento de login
                window.dispatchEvent(new CustomEvent('auth:login', { 
                    detail: this.user 
                }));

                return this.user;
            } else {
                throw new Error(response.message || 'Erro ao fazer login');
            }
        } catch (error) {
            throw error;
        }
    },

    /**
     * Realiza logout
     * @param {boolean} callApi - Se deve chamar API de logout
     */
    async logout(callApi = true) {
        try {
            if (callApi) {
                await API.auth.logout();
            }
        } catch (error) {
            console.error('Erro no logout:', error);
        }

        // Limpa dados locais
        this.user = null;
        API.clearToken();

        // Limpa outros dados do localStorage se necessário
        Utils.storage.remove('user_preferences');

        // Dispara evento de logout
        window.dispatchEvent(new CustomEvent('auth:logout'));

        // Recarrega página para mostrar tela de login
        window.location.reload();
    },

    /**
     * Verifica se está autenticado
     * @returns {boolean}
     */
    isAuthenticated() {
        return API.isAuthenticated() && this.user !== null;
    },

    /**
     * Verifica se usuário tem determinada permissão
     * @param {string} permission - Nome da permissão
     * @returns {boolean}
     */
    hasPermission(permission) {
        if (!this.user) return false;
        
        // Admin tem todas as permissões
        if (this.user.role === 'admin') return true;
        
        // Verifica permissões específicas
        if (this.user.permissions && Array.isArray(this.user.permissions)) {
            return this.user.permissions.includes(permission);
        }
        
        return false;
    },

    /**
     * Verifica se usuário é admin
     * @returns {boolean}
     */
    isAdmin() {
        return this.user && this.user.role === 'admin';
    },

    /**
     * Verifica se usuário é gerente ou superior
     * @returns {boolean}
     */
    isManager() {
        return this.user && ['admin', 'manager', 'gerente'].includes(this.user.role);
    },

    /**
     * Obtém dados do usuário
     * @returns {object|null}
     */
    getUser() {
        return this.user;
    },

    /**
     * Obtém ID do usuário
     * @returns {number|null}
     */
    getUserId() {
        return this.user ? this.user.id : null;
    },

    /**
     * Obtém nome do usuário
     * @returns {string}
     */
    getUserName() {
        return this.user ? this.user.nome || this.user.name || 'Usuário' : 'Usuário';
    },

    /**
     * Obtém e-mail do usuário
     * @returns {string}
     */
    getUserEmail() {
        return this.user ? this.user.email : '';
    },

    /**
     * Obtém role do usuário
     * @returns {string}
     */
    getUserRole() {
        return this.user ? this.user.role || this.user.cargo || 'user' : 'user';
    },

    /**
     * Obtém nome formatado do cargo
     * @returns {string}
     */
    getUserRoleLabel() {
        const roles = {
            'admin': 'Administrador',
            'manager': 'Gerente',
            'gerente': 'Gerente',
            'attendant': 'Atendente',
            'atendente': 'Atendente',
            'user': 'Usuário'
        };
        
        const role = this.getUserRole();
        return roles[role] || Utils.capitalize(role);
    },

    /**
     * Atualiza UI com dados do usuário
     */
    updateUI() {
        if (!this.user) return;

        // Atualiza nome do usuário na sidebar
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            userNameEl.textContent = this.getUserName();
        }

        // Atualiza cargo do usuário
        const userRoleEl = document.getElementById('user-role');
        if (userRoleEl) {
            userRoleEl.textContent = this.getUserRoleLabel();
        }

        // Atualiza avatar se tiver
        const userAvatarEl = document.querySelector('.user-avatar');
        if (userAvatarEl) {
            if (this.user.avatar) {
                userAvatarEl.innerHTML = `<img src="${this.user.avatar}" alt="Avatar">`;
            } else {
                userAvatarEl.innerHTML = `<i class="fas fa-user"></i>`;
            }
        }

        // Mostra/oculta elementos baseado em permissões
        this.updatePermissionBasedElements();
    },

    /**
     * Atualiza visibilidade de elementos baseado em permissões
     */
    updatePermissionBasedElements() {
        // Elementos que requerem admin
        document.querySelectorAll('[data-require-admin]').forEach(el => {
            el.style.display = this.isAdmin() ? '' : 'none';
        });

        // Elementos que requerem gerente
        document.querySelectorAll('[data-require-manager]').forEach(el => {
            el.style.display = this.isManager() ? '' : 'none';
        });

        // Elementos que requerem permissão específica
        document.querySelectorAll('[data-require-permission]').forEach(el => {
            const permission = el.getAttribute('data-require-permission');
            el.style.display = this.hasPermission(permission) ? '' : 'none';
        });
    },

    /**
     * Altera senha do usuário
     * @param {string} currentPassword - Senha atual
     * @param {string} newPassword - Nova senha
     * @returns {Promise<boolean>}
     */
    async changePassword(currentPassword, newPassword) {
        try {
            // Validações
            if (!currentPassword || !newPassword) {
                throw new Error('Senhas são obrigatórias');
            }

            if (newPassword.length < 6) {
                throw new Error('Nova senha deve ter pelo menos 6 caracteres');
            }

            const response = await API.auth.changePassword(currentPassword, newPassword);

            if (response.success) {
                Toast.success('Senha alterada com sucesso!');
                return true;
            } else {
                throw new Error(response.message || 'Erro ao alterar senha');
            }
        } catch (error) {
            throw error;
        }
    },

    /**
     * Atualiza dados do perfil
     * @param {object} data - Dados a atualizar
     * @returns {Promise<object>}
     */
    async updateProfile(data) {
        try {
            const response = await API.put('/auth/profile', data);

            if (response.success) {
                // Atualiza dados locais
                this.user = { ...this.user, ...response.data };
                this.updateUI();
                
                Toast.success('Perfil atualizado com sucesso!');
                return this.user;
            } else {
                throw new Error(response.message || 'Erro ao atualizar perfil');
            }
        } catch (error) {
            throw error;
        }
    },

    /**
     * Configura listeners do formulário de login
     */
    setupLoginForm() {
        const loginForm = document.getElementById('login-form');
        const loginError = document.getElementById('login-error');
        
        if (!loginForm) return;

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            // Limpa erro anterior
            if (loginError) {
                loginError.style.display = 'none';
                loginError.textContent = '';
            }

            // Desabilita botão
            const originalText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';

            try {
                await this.login(email, password);
                
                // Login bem sucedido - app.js vai mostrar o painel
                Toast.success(`Bem-vindo, ${this.getUserName()}!`);
                
            } catch (error) {
                // Mostra erro
                if (loginError) {
                    loginError.textContent = error.message;
                    loginError.style.display = 'flex';
                }
                
                // Shake no formulário
                loginForm.classList.add('shake');
                setTimeout(() => loginForm.classList.remove('shake'), 500);
                
            } finally {
                // Reabilita botão
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        });

        // Limpa erro ao digitar
        const inputs = loginForm.querySelectorAll('input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                if (loginError) {
                    loginError.style.display = 'none';
                }
            });
        });
    },

    /**
     * Configura botão de logout
     */
    setupLogoutButton() {
        const logoutBtn = document.getElementById('btn-logout');
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                const confirmed = await Modal.confirm(
                    'Sair do Sistema',
                    'Tem certeza que deseja sair?'
                );
                
                if (confirmed) {
                    await this.logout();
                }
            });
        }
    },

    /**
     * Configura listener para sessão expirada
     */
    setupSessionExpiredListener() {
        window.addEventListener('auth:expired', () => {
            Toast.error('Sua sessão expirou. Faça login novamente.');
            this.logout(false);
        });
    },

    /**
     * Obtém token de autenticação
     * @returns {string|null}
     */
    getToken() {
        return API.token;
    },

    /**
     * Verifica se o token está próximo de expirar
     * @returns {boolean}
     */
    isTokenExpiring() {
        const token = this.getToken();
        if (!token) return true;

        try {
            // Decodifica payload do JWT (parte do meio)
            const payload = JSON.parse(atob(token.split('.')[1]));
            const exp = payload.exp * 1000; // Converte para milliseconds
            const now = Date.now();
            const fiveMinutes = 5 * 60 * 1000;

            return (exp - now) < fiveMinutes;
        } catch (error) {
            return true;
        }
    },

    /**
     * Renova token se necessário
     */
    async refreshTokenIfNeeded() {
        if (this.isTokenExpiring()) {
            try {
                const response = await API.post('/auth/refresh');
                if (response.success && response.data.token) {
                    API.setToken(response.data.token);
                }
            } catch (error) {
                console.error('Erro ao renovar token:', error);
            }
        }
    },

    /**
     * Inicia verificação periódica do token
     */
    startTokenRefresh() {
        // Verifica a cada 4 minutos
        setInterval(() => {
            if (this.isAuthenticated()) {
                this.refreshTokenIfNeeded();
            }
        }, 4 * 60 * 1000);
    }
};

// Exporta para uso global
window.Auth = Auth;