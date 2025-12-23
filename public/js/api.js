/**
 * ============================================
 * API CLIENT
 * Comunicação com o backend
 * ============================================
 * 
 * ATUALIZADO: Adicionado endpoint getQR() para WhatsApp
 */

const API = {
    // URL base da API
    baseUrl: '/api',
    
    // Token de autenticação
    token: null,

    /**
     * Inicializa o cliente API
     */
    init() {
        // Recupera token do localStorage
        this.token = Utils.storage.get('auth_token');
    },

    /**
     * Define o token de autenticação
     * @param {string} token - JWT token
     */
    setToken(token) {
        this.token = token;
        Utils.storage.set('auth_token', token);
    },

    /**
     * Remove o token de autenticação
     */
    clearToken() {
        this.token = null;
        Utils.storage.remove('auth_token');
    },

    /**
     * Verifica se está autenticado
     * @returns {boolean}
     */
    isAuthenticated() {
        return !!this.token;
    },

    /**
     * Faz requisição HTTP
     * @param {string} endpoint - Endpoint da API
     * @param {object} options - Opções da requisição
     * @returns {Promise<object>} Resposta da API
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        // Headers padrão
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Adiciona token se existir
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Configuração da requisição
        const config = {
            method: options.method || 'GET',
            headers,
            ...options
        };

        // Adiciona body se existir
        if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
            config.body = JSON.stringify(options.body);
        } else if (options.body instanceof FormData) {
            // Remove Content-Type para FormData (o browser define automaticamente)
            delete config.headers['Content-Type'];
            config.body = options.body;
        }

        try {
            const response = await fetch(url, config);
            
            // Tenta fazer parse do JSON
            let data;
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            // Verifica erros de autenticação
            if (response.status === 401) {
                this.clearToken();
                window.dispatchEvent(new CustomEvent('auth:expired'));
                throw new Error('Sessão expirada. Faça login novamente.');
            }

            // Verifica outros erros
            if (!response.ok) {
                throw new Error(data.message || `Erro ${response.status}`);
            }

            return data;
        } catch (error) {
            // Erro de rede
            if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                throw new Error('Erro de conexão. Verifique sua internet.');
            }
            throw error;
        }
    },

    /**
     * GET request
     * @param {string} endpoint - Endpoint
     * @param {object} params - Query params
     * @returns {Promise<object>}
     */
    async get(endpoint, params = {}) {
        let url = endpoint;
        
        // Adiciona query params
        const queryString = Utils.toQueryString(params);
        if (queryString) {
            url += `?${queryString}`;
        }

        return this.request(url, { method: 'GET' });
    },

    /**
     * POST request
     * @param {string} endpoint - Endpoint
     * @param {object} data - Dados
     * @returns {Promise<object>}
     */
    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: data
        });
    },

    /**
     * PUT request
     * @param {string} endpoint - Endpoint
     * @param {object} data - Dados
     * @returns {Promise<object>}
     */
    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: data
        });
    },

    /**
     * PATCH request
     * @param {string} endpoint - Endpoint
     * @param {object} data - Dados
     * @returns {Promise<object>}
     */
    async patch(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: data
        });
    },

    /**
     * DELETE request
     * @param {string} endpoint - Endpoint
     * @returns {Promise<object>}
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    // ============================================
    // AUTH
    // ============================================
    
    auth: {
        /**
         * Faz login
         * @param {string} email - E-mail
         * @param {string} password - Senha
         * @returns {Promise<object>}
         */
        async login(email, password) {
            const response = await API.post('/auth/login', { email, password });
            
            if (response.success && response.data.token) {
                API.setToken(response.data.token);
            }
            
            return response;
        },

        /**
         * Faz logout
         * @returns {Promise<object>}
         */
        async logout() {
            try {
                await API.post('/auth/logout');
            } catch (error) {
                // Ignora erros no logout
            }
            API.clearToken();
        },

        /**
         * Verifica token
         * @returns {Promise<object>}
         */
        async verify() {
            return API.get('/auth/verify');
        },

        /**
         * Obtém dados do usuário logado
         * @returns {Promise<object>}
         */
        async me() {
            return API.get('/auth/me');
        },

        /**
         * Atualiza senha
         * @param {string} currentPassword - Senha atual
         * @param {string} newPassword - Nova senha
         * @returns {Promise<object>}
         */
        async changePassword(currentPassword, newPassword) {
            return API.post('/auth/change-password', {
                currentPassword,
                newPassword
            });
        }
    },

    // ============================================
    // DASHBOARD
    // ============================================
    
    dashboard: {
        /**
         * Obtém estatísticas do dashboard
         * @returns {Promise<object>}
         */
        async getStats() {
            return API.get('/dashboard/stats');
        },

        /**
         * Obtém dados dos gráficos
         * @param {string} period - Período (week, month, year)
         * @returns {Promise<object>}
         */
        async getChartData(period = 'week') {
            return API.get('/dashboard/charts', { period });
        },

        /**
         * Obtém atividades recentes
         * @param {number} limit - Limite
         * @returns {Promise<object>}
         */
        async getRecentActivity(limit = 10) {
            return API.get('/dashboard/activity', { limit });
        }
    },

    // ============================================
    // PRODUTOS
    // ============================================
    
    products: {
        /**
         * Lista produtos
         * @param {object} params - Parâmetros de busca/paginação
         * @returns {Promise<object>}
         */
        async list(params = {}) {
            return API.get('/products', params);
        },

        /**
         * Busca produto por ID
         * @param {number} id - ID do produto
         * @returns {Promise<object>}
         */
        async getById(id) {
            return API.get(`/products/${id}`);
        },

        /**
         * Busca produtos
         * @param {string} query - Termo de busca
         * @param {number} limit - Limite
         * @returns {Promise<object>}
         */
        async search(query, limit = 10) {
            return API.get('/products/search', { q: query, limit });
        },

        /**
         * Cria produto
         * @param {object} data - Dados do produto
         * @returns {Promise<object>}
         */
        async create(data) {
            return API.post('/products', data);
        },

        /**
         * Atualiza produto
         * @param {number} id - ID do produto
         * @param {object} data - Dados a atualizar
         * @returns {Promise<object>}
         */
        async update(id, data) {
            return API.put(`/products/${id}`, data);
        },

        /**
         * Atualiza estoque
         * @param {number} id - ID do produto
         * @param {number} quantity - Quantidade
         * @param {string} operation - Operação (set, add, subtract)
         * @returns {Promise<object>}
         */
        async updateStock(id, quantity, operation = 'set') {
            return API.patch(`/products/${id}/stock`, { quantity, operation });
        },

        /**
         * Remove produto
         * @param {number} id - ID do produto
         * @returns {Promise<object>}
         */
        async delete(id) {
            return API.delete(`/products/${id}`);
        },

        /**
         * Alterna destaque
         * @param {number} id - ID do produto
         * @returns {Promise<object>}
         */
        async toggleFeatured(id) {
            return API.patch(`/products/${id}/toggle-featured`);
        },

        /**
         * Alterna status ativo
         * @param {number} id - ID do produto
         * @returns {Promise<object>}
         */
        async toggleActive(id) {
            return API.patch(`/products/${id}/toggle-active`);
        },

        /**
         * Obtém produtos com estoque baixo
         * @param {number} limit - Limite
         * @returns {Promise<object>}
         */
        async getLowStock(limit = 20) {
            return API.get('/products/low-stock', { limit });
        },

        /**
         * Obtém estatísticas de produtos
         * @returns {Promise<object>}
         */
        async getStatistics() {
            return API.get('/products/statistics');
        },

        /**
         * Exporta produtos
         * @returns {Promise<object>}
         */
        async export() {
            return API.get('/products/export/json');
        }
    },

    // ============================================
    // CATEGORIAS
    // ============================================
    
    categories: {
        /**
         * Lista categorias
         * @returns {Promise<object>}
         */
        async list() {
            return API.get('/products/categories/all');
        },

        /**
         * Busca categoria por ID
         * @param {number} id - ID da categoria
         * @returns {Promise<object>}
         */
        async getById(id) {
            return API.get(`/products/categories/${id}`);
        },

        /**
         * Cria categoria
         * @param {object} data - Dados da categoria
         * @returns {Promise<object>}
         */
        async create(data) {
            return API.post('/products/categories', data);
        },

        /**
         * Atualiza categoria
         * @param {number} id - ID da categoria
         * @param {object} data - Dados a atualizar
         * @returns {Promise<object>}
         */
        async update(id, data) {
            return API.put(`/products/categories/${id}`, data);
        },

        /**
         * Remove categoria
         * @param {number} id - ID da categoria
         * @returns {Promise<object>}
         */
        async delete(id) {
            return API.delete(`/products/categories/${id}`);
        }
    },

    // ============================================
    // SERVIÇOS
    // ============================================
    
    services: {
        /**
         * Lista serviços
         * @param {object} params - Parâmetros de busca/paginação
         * @returns {Promise<object>}
         */
        async list(params = {}) {
            return API.get('/services', params);
        },

        /**
         * Busca serviço por ID
         * @param {number} id - ID do serviço
         * @returns {Promise<object>}
         */
        async getById(id) {
            return API.get(`/services/${id}`);
        },

        /**
         * Busca serviços
         * @param {string} query - Termo de busca
         * @returns {Promise<object>}
         */
        async search(query) {
            return API.get('/services/search', { q: query });
        },

        /**
         * Cria serviço
         * @param {object} data - Dados do serviço
         * @returns {Promise<object>}
         */
        async create(data) {
            return API.post('/services', data);
        },

        /**
         * Atualiza serviço
         * @param {number} id - ID do serviço
         * @param {object} data - Dados a atualizar
         * @returns {Promise<object>}
         */
        async update(id, data) {
            return API.put(`/services/${id}`, data);
        },

        /**
         * Remove serviço
         * @param {number} id - ID do serviço
         * @returns {Promise<object>}
         */
        async delete(id) {
            return API.delete(`/services/${id}`);
        },

        /**
         * Alterna status ativo
         * @param {number} id - ID do serviço
         * @returns {Promise<object>}
         */
        async toggleActive(id) {
            return API.patch(`/services/${id}/toggle-active`);
        }
    },

    // ============================================
    // CLIENTES
    // ============================================
    
    customers: {
        /**
         * Lista clientes
         * @param {object} params - Parâmetros de busca/paginação
         * @returns {Promise<object>}
         */
        async list(params = {}) {
            return API.get('/customers', params);
        },

        /**
         * Busca cliente por ID
         * @param {number} id - ID do cliente
         * @returns {Promise<object>}
         */
        async getById(id) {
            return API.get(`/customers/${id}`);
        },

        /**
         * Busca cliente por telefone
         * @param {string} phone - Telefone
         * @returns {Promise<object>}
         */
        async getByPhone(phone) {
            return API.get(`/customers/phone/${phone}`);
        },

        /**
         * Busca clientes
         * @param {string} query - Termo de busca
         * @returns {Promise<object>}
         */
        async search(query) {
            return API.get('/customers/search', { q: query });
        },

        /**
         * Atualiza cliente
         * @param {number} id - ID do cliente
         * @param {object} data - Dados a atualizar
         * @returns {Promise<object>}
         */
        async update(id, data) {
            return API.put(`/customers/${id}`, data);
        },

        /**
         * Obtém histórico de conversas do cliente
         * @param {number} id - ID do cliente
         * @returns {Promise<object>}
         */
        async getHistory(id) {
            return API.get(`/customers/${id}/history`);
        },

        /**
         * Exporta clientes
         * @returns {Promise<object>}
         */
        async export() {
            return API.get('/customers/export');
        }
    },

    // ============================================
    // CONVERSAS
    // ============================================
    
    conversations: {
        /**
         * Lista conversas
         * @param {object} params - Parâmetros
         * @returns {Promise<object>}
         */
        async list(params = {}) {
            return API.get('/conversations', params);
        },

        /**
         * Busca conversa por telefone
         * @param {string} phone - Telefone
         * @returns {Promise<object>}
         */
        async getByPhone(phone) {
            return API.get(`/conversations/${phone}`);
        },

        /**
         * Obtém mensagens de uma conversa
         * @param {string} phone - Telefone
         * @param {object} params - Parâmetros
         * @returns {Promise<object>}
         */
        async getMessages(phone, params = {}) {
            return API.get(`/conversations/${phone}/messages`, params);
        },

        /**
         * Obtém conversas ativas (em atendimento)
         * @returns {Promise<object>}
         */
        async getActive() {
            return API.get('/conversations/active');
        },

        /**
         * Obtém fila de atendimento
         * @returns {Promise<object>}
         */
        async getQueue() {
            return API.get('/conversations/queue');
        },

        /**
         * Inicia atendimento
         * @param {string} phone - Telefone
         * @returns {Promise<object>}
         */
        async startAttendance(phone) {
            return API.post(`/conversations/${phone}/start`);
        },

        /**
         * Finaliza atendimento
         * @param {string} phone - Telefone
         * @param {string} notes - Observações
         * @returns {Promise<object>}
         */
        async finishAttendance(phone, notes = '') {
            return API.post(`/conversations/${phone}/finish`, { notes });
        },

        /**
         * Transfere atendimento
         * @param {string} phone - Telefone
         * @param {number} toUserId - ID do usuário destino
         * @returns {Promise<object>}
         */
        async transfer(phone, toUserId) {
            return API.post(`/conversations/${phone}/transfer`, { toUserId });
        }
    },

    // ============================================
    // WHATSAPP - ATUALIZADO
    // ============================================
    
    whatsapp: {
        /**
         * Obtém status da conexão
         * @returns {Promise<object>}
         */
        async getStatus() {
            return API.get('/whatsapp/status');
        },

        /**
         * Obtém QR Code (novo endpoint /qr)
         * Retorna QR Code em base64 pronto para exibir
         * @returns {Promise<object>}
         */
        async getQR() {
            return API.get('/whatsapp/qr');
        },

        /**
         * Obtém QR Code (endpoint antigo /qrcode)
         * Mantido para compatibilidade
         * @returns {Promise<object>}
         */
        async getQRCode() {
            return API.get('/whatsapp/qrcode');
        },

        /**
         * Obtém informações do dispositivo
         * @returns {Promise<object>}
         */
        async getInfo() {
            return API.get('/whatsapp/info');
        },

        /**
         * Conecta ao WhatsApp
         * @returns {Promise<object>}
         */
        async connect() {
            return API.post('/whatsapp/connect');
        },

        /**
         * Desconecta do WhatsApp
         * @returns {Promise<object>}
         */
        async disconnect() {
            return API.post('/whatsapp/disconnect');
        },

        /**
         * Reinicia conexão
         * @returns {Promise<object>}
         */
        async restart() {
            return API.post('/whatsapp/restart');
        },

        /**
         * Faz logout do WhatsApp
         * @returns {Promise<object>}
         */
        async logout() {
            return API.post('/whatsapp/logout');
        },

        /**
         * Envia mensagem
         * @param {string} phone - Telefone
         * @param {string} message - Mensagem
         * @returns {Promise<object>}
         */
        async sendMessage(phone, message) {
            return API.post('/whatsapp/send', { phone, message });
        },

        /**
         * Envia mensagem em massa
         * @param {array} phones - Lista de telefones
         * @param {string} message - Mensagem
         * @returns {Promise<object>}
         */
        async sendBulk(phones, message) {
            return API.post('/whatsapp/send-bulk', { phones, message });
        },

        /**
         * Envia mídia
         * @param {string} phone - Telefone
         * @param {string} mediaUrl - URL da mídia
         * @param {string} caption - Legenda
         * @param {string} type - Tipo (image, video, document, audio)
         * @returns {Promise<object>}
         */
        async sendMedia(phone, mediaUrl, caption = '', type = 'image') {
            return API.post('/whatsapp/send-media', { phone, mediaUrl, caption, type });
        },

        /**
         * Envia localização
         * @param {string} phone - Telefone
         * @param {number} latitude - Latitude
         * @param {number} longitude - Longitude
         * @param {string} name - Nome do local
         * @param {string} address - Endereço
         * @returns {Promise<object>}
         */
        async sendLocation(phone, latitude, longitude, name = '', address = '') {
            return API.post('/whatsapp/send-location', { phone, latitude, longitude, name, address });
        },

        /**
         * Envia contato
         * @param {string} phone - Telefone destino
         * @param {object} contact - Dados do contato {name, phone}
         * @returns {Promise<object>}
         */
        async sendContact(phone, contact) {
            return API.post('/whatsapp/send-contact', { phone, contact });
        },

        /**
         * Verifica se número existe
         * @param {string} phone - Telefone
         * @returns {Promise<object>}
         */
        async checkNumber(phone) {
            return API.post('/whatsapp/check-number', { phone });
        },

        /**
         * Verifica múltiplos números
         * @param {array} phones - Lista de telefones
         * @returns {Promise<object>}
         */
        async checkNumbers(phones) {
            return API.post('/whatsapp/check-numbers', { phones });
        },

        /**
         * Obtém perfil de um contato
         * @param {string} phone - Telefone
         * @returns {Promise<object>}
         */
        async getProfile(phone) {
            return API.get(`/whatsapp/profile/${phone}`);
        },

        /**
         * Obtém foto de perfil de um contato
         * @param {string} phone - Telefone
         * @returns {Promise<object>}
         */
        async getProfilePicture(phone) {
            return API.get(`/whatsapp/profile-picture/${phone}`);
        },

        /**
         * Obtém estatísticas
         * @returns {Promise<object>}
         */
        async getStats() {
            return API.get('/whatsapp/stats');
        },

        /**
         * Obtém estatísticas de mensagens
         * @param {string} period - Período (today, week, month)
         * @returns {Promise<object>}
         */
        async getMessageStats(period = 'today') {
            return API.get('/whatsapp/stats/messages', { period });
        },

        /**
         * Lista grupos
         * @returns {Promise<object>}
         */
        async getGroups() {
            return API.get('/whatsapp/groups');
        },

        /**
         * Obtém informações de um grupo
         * @param {string} groupId - ID do grupo
         * @returns {Promise<object>}
         */
        async getGroupInfo(groupId) {
            return API.get(`/whatsapp/groups/${groupId}`);
        },

        /**
         * Lista templates de mensagem
         * @returns {Promise<object>}
         */
        async getTemplates() {
            return API.get('/whatsapp/templates');
        },

        /**
         * Cria template de mensagem
         * @param {object} data - Dados do template
         * @returns {Promise<object>}
         */
        async createTemplate(data) {
            return API.post('/whatsapp/templates', data);
        },

        /**
         * Atualiza template de mensagem
         * @param {number} id - ID do template
         * @param {object} data - Dados a atualizar
         * @returns {Promise<object>}
         */
        async updateTemplate(id, data) {
            return API.put(`/whatsapp/templates/${id}`, data);
        },

        /**
         * Remove template de mensagem
         * @param {number} id - ID do template
         * @returns {Promise<object>}
         */
        async deleteTemplate(id) {
            return API.delete(`/whatsapp/templates/${id}`);
        },

        /**
         * Obtém configurações do WhatsApp
         * @returns {Promise<object>}
         */
        async getConfig() {
            return API.get('/whatsapp/config');
        },

        /**
         * Atualiza configurações do WhatsApp
         * @param {object} data - Dados de configuração
         * @returns {Promise<object>}
         */
        async updateConfig(data) {
            return API.put('/whatsapp/config', data);
        }
    },

    // ============================================
    // CONFIGURAÇÕES
    // ============================================
    
    settings: {
        /**
         * Obtém configurações
         * @returns {Promise<object>}
         */
        async get() {
            return API.get('/settings');
        },

        /**
         * Atualiza configurações
         * @param {object} data - Dados
         * @returns {Promise<object>}
         */
        async update(data) {
            return API.put('/settings', data);
        },

        /**
         * Obtém configurações da loja
         * @returns {Promise<object>}
         */
        async getStore() {
            return API.get('/settings/store');
        },

        /**
         * Atualiza configurações da loja
         * @param {object} data - Dados
         * @returns {Promise<object>}
         */
        async updateStore(data) {
            return API.put('/settings/store', data);
        },

        /**
         * Obtém configurações do bot
         * @returns {Promise<object>}
         */
        async getBot() {
            return API.get('/settings/bot');
        },

        /**
         * Atualiza configurações do bot
         * @param {object} data - Dados
         * @returns {Promise<object>}
         */
        async updateBot(data) {
            return API.put('/settings/bot', data);
        },

        /**
         * Obtém horário de funcionamento
         * @returns {Promise<object>}
         */
        async getSchedule() {
            return API.get('/settings/schedule');
        },

        /**
         * Atualiza horário de funcionamento
         * @param {object} data - Dados
         * @returns {Promise<object>}
         */
        async updateSchedule(data) {
            return API.put('/settings/schedule', data);
        }
    },

    // ============================================
    // IMPORTAÇÃO
    // ============================================
    
    import: {
        /**
         * Importa produtos de arquivo
         * @param {File} file - Arquivo
         * @returns {Promise<object>}
         */
        async products(file) {
            const formData = new FormData();
            formData.append('file', file);

            return API.request('/import/products', {
                method: 'POST',
                body: formData
            });
        },

        /**
         * Importa serviços de arquivo
         * @param {File} file - Arquivo
         * @returns {Promise<object>}
         */
        async services(file) {
            const formData = new FormData();
            formData.append('file', file);

            return API.request('/import/services', {
                method: 'POST',
                body: formData
            });
        },

        /**
         * Obtém template de importação
         * @param {string} type - Tipo (products, services)
         * @returns {Promise<object>}
         */
        async getTemplate(type) {
            return API.get(`/import/template/${type}`);
        }
    },

    // ============================================
    // HEALTH CHECK
    // ============================================
    
    /**
     * Verifica saúde do servidor
     * @returns {Promise<object>}
     */
    async health() {
        return this.get('/health');
    }
};

// Inicializa API
API.init();

// Exporta para uso global
window.API = API;
