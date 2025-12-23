/**
 * ============================================
 * SERVIÇOS
 * CRUD completo de serviços
 * ============================================
 */

const Services = {
    // Dados carregados
    data: {
        services: [],
        pagination: {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0
        }
    },

    // Filtros atuais
    filters: {
        search: '',
        ativo: ''
    },

    // Serviço sendo editado
    currentService: null,

    /**
     * Inicializa o módulo de serviços
     */
    async init() {
        console.log('🔧 Inicializando Serviços...');

        // Carrega serviços
        await this.loadServices();

        // Configura eventos
        this.setupEventListeners();
    },

    /**
     * Carrega lista de serviços
     */
    async loadServices() {
        const container = document.getElementById('services-grid');
        if (!container) return;

        // Mostra loading
        container.innerHTML = `
            <div class="loading-placeholder" style="grid-column: 1 / -1;">
                <i class="fas fa-spinner fa-spin"></i>
                Carregando serviços...
            </div>
        `;

        try {
            const params = {
                page: this.data.pagination.page,
                limit: this.data.pagination.limit,
                search: this.filters.search,
                ativo: this.filters.ativo
            };

            const response = await API.services.list(params);

            if (response.success) {
                this.data.services = response.data || [];
                this.data.pagination = {
                    page: response.page || 1,
                    limit: response.limit || 20,
                    total: response.total || 0,
                    totalPages: response.totalPages || 1
                };

                this.renderServices();
            }
        } catch (error) {
            console.error('Erro ao carregar serviços:', error);
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-exclamation-circle text-danger"></i>
                    <p>Erro ao carregar serviços</p>
                    <button class="btn btn-primary btn-sm" onclick="Services.loadServices()">
                        <i class="fas fa-sync"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    /**
     * Renderiza grid de serviços
     */
    renderServices() {
        const container = document.getElementById('services-grid');
        if (!container) return;

        const services = this.data.services;

        if (!services || services.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
                    <i class="fas fa-wrench" style="font-size: 4rem; opacity: 0.3; margin-bottom: 20px;"></i>
                    <p>Nenhum serviço encontrado</p>
                    <button class="btn btn-primary" id="btn-add-service-empty">
                        <i class="fas fa-plus"></i> Adicionar Serviço
                    </button>
                </div>
            `;

            // Evento do botão
            const btnAdd = document.getElementById('btn-add-service-empty');
            if (btnAdd) {
                btnAdd.addEventListener('click', () => this.openModal());
            }
            return;
        }

        container.innerHTML = services.map(service => this.renderServiceCard(service)).join('');

        // Adiciona eventos aos cards
        this.setupCardEvents();
    },

    /**
     * Renderiza um card de serviço
     * @param {object} service - Dados do serviço
     * @returns {string} HTML do card
     */
    renderServiceCard(service) {
        const priceMin = service.preco_minimo || service.priceMin || service.preco || 0;
        const priceMax = service.preco_maximo || service.priceMax || null;
        const duration = service.duracao_estimada || service.duration || service.tempo_estimado || null;
        const isActive = service.ativo !== false;

        // Formata preço
        let priceDisplay = Utils.formatCurrency(priceMin);
        if (priceMax && priceMax > priceMin) {
            priceDisplay = `${Utils.formatCurrency(priceMin)} <span>a</span> ${Utils.formatCurrency(priceMax)}`;
        }

        // Ícone baseado no nome do serviço
        const icon = this.getServiceIcon(service.nome || service.name);

        return `
            <div class="service-card ${!isActive ? 'inactive' : ''}" data-id="${service.id}">
                <div class="service-header">
                    <div class="service-icon">
                        <i class="${icon}"></i>
                    </div>
                    <div class="service-status">
                        ${isActive 
                            ? '<span class="status-badge active"><i class="fas fa-check"></i></span>'
                            : '<span class="status-badge inactive"><i class="fas fa-times"></i></span>'
                        }
                    </div>
                </div>
                
                <h3 class="service-name">${Utils.escapeHtml(service.nome || service.name)}</h3>
                
                <p class="service-description">
                    ${Utils.escapeHtml(Utils.truncate(service.descricao || service.description || 'Sem descrição', 100))}
                </p>
                
                <div class="service-meta">
                    <div class="service-price">${priceDisplay}</div>
                    ${duration 
                        ? `<div class="service-duration"><i class="fas fa-clock"></i> ${Utils.escapeHtml(duration)}</div>`
                        : ''
                    }
                </div>
                
                <div class="service-actions">
                    <button class="btn btn-sm btn-outline btn-edit" data-id="${service.id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn btn-sm btn-outline btn-toggle" data-id="${service.id}" title="${isActive ? 'Desativar' : 'Ativar'}">
                        <i class="fas fa-${isActive ? 'eye-slash' : 'eye'}"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-danger btn-delete" data-id="${service.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * Retorna ícone baseado no nome do serviço
     * @param {string} name - Nome do serviço
     * @returns {string} Classe do ícone
     */
    getServiceIcon(name) {
        if (!name) return 'fas fa-wrench';

        const nameLower = name.toLowerCase();

        // Mapeamento de palavras-chave para ícones
        const iconMap = {
            'óleo': 'fas fa-oil-can',
            'oleo': 'fas fa-oil-can',
            'troca de óleo': 'fas fa-oil-can',
            'filtro': 'fas fa-filter',
            'freio': 'fas fa-compact-disc',
            'pastilha': 'fas fa-compact-disc',
            'disco': 'fas fa-compact-disc',
            'suspensão': 'fas fa-car-side',
            'suspensao': 'fas fa-car-side',
            'amortecedor': 'fas fa-car-side',
            'alinhamento': 'fas fa-compress-arrows-alt',
            'balanceamento': 'fas fa-sync',
            'pneu': 'fas fa-circle',
            'bateria': 'fas fa-car-battery',
            'elétric': 'fas fa-bolt',
            'eletric': 'fas fa-bolt',
            'ar condicionado': 'fas fa-snowflake',
            'ar-condicionado': 'fas fa-snowflake',
            'higienização': 'fas fa-spray-can',
            'limpeza': 'fas fa-spray-can',
            'lavagem': 'fas fa-tint',
            'polimento': 'fas fa-gem',
            'cristalização': 'fas fa-gem',
            'motor': 'fas fa-cogs',
            'correia': 'fas fa-circle-notch',
            'embreagem': 'fas fa-cog',
            'câmbio': 'fas fa-cog',
            'cambio': 'fas fa-cog',
            'injeção': 'fas fa-syringe',
            'injecao': 'fas fa-syringe',
            'diagnóstico': 'fas fa-laptop',
            'diagnostico': 'fas fa-laptop',
            'scanner': 'fas fa-laptop',
            'revisão': 'fas fa-clipboard-check',
            'revisao': 'fas fa-clipboard-check',
            'inspeção': 'fas fa-search',
            'inspecao': 'fas fa-search',
            'funilaria': 'fas fa-hammer',
            'pintura': 'fas fa-paint-roller',
            'vidro': 'fas fa-window-maximize',
            'parabrisa': 'fas fa-window-maximize',
            'farol': 'fas fa-lightbulb',
            'luz': 'fas fa-lightbulb',
            'lâmpada': 'fas fa-lightbulb',
            'escapamento': 'fas fa-wind',
            'silenciador': 'fas fa-volume-mute',
            'radiador': 'fas fa-temperature-high',
            'arrefecimento': 'fas fa-temperature-low',
            'direção': 'fas fa-steering-wheel',
            'direcao': 'fas fa-steering-wheel',
            'reboque': 'fas fa-truck-pickup',
            'socorro': 'fas fa-ambulance',
            'guincho': 'fas fa-truck-pickup'
        };

        // Procura por palavra-chave no nome
        for (const [keyword, icon] of Object.entries(iconMap)) {
            if (nameLower.includes(keyword)) {
                return icon;
            }
        }

        // Ícone padrão
        return 'fas fa-wrench';
    },

    /**
     * Configura eventos dos cards
     */
    setupCardEvents() {
        // Botões de editar
        document.querySelectorAll('#services-grid .btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.editService(id);
            });
        });

        // Botões de toggle status
        document.querySelectorAll('#services-grid .btn-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.toggleServiceStatus(id);
            });
        });

        // Botões de excluir
        document.querySelectorAll('#services-grid .btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.deleteService(id);
            });
        });

        // Clique no card para editar
        document.querySelectorAll('#services-grid .service-card').forEach(card => {
            card.addEventListener('dblclick', () => {
                const id = card.dataset.id;
                this.editService(id);
            });
        });
    },

    /**
     * Configura event listeners gerais
     */
    setupEventListeners() {
        // Botão adicionar serviço
        const btnAdd = document.getElementById('btn-add-service');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => this.openModal());
        }

        // Campo de busca
        const searchInput = document.getElementById('services-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.filters.search = e.target.value;
                this.data.pagination.page = 1;
                this.loadServices();
            }, 300));
        }

        // Botão salvar serviço
        const btnSave = document.getElementById('btn-save-service');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.saveService());
        }

        // Formulário (enter para salvar)
        const form = document.getElementById('service-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveService();
            });
        }

        // Fechar modal
        document.querySelectorAll('#service-modal [data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        // Fechar modal clicando no overlay
        const modalOverlay = document.querySelector('#service-modal .modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', () => this.closeModal());
        }

        // Tecla ESC fecha modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    },

    /**
     * Abre modal de serviço
     * @param {object} service - Serviço para edição (opcional)
     */
    openModal(service = null) {
        const modal = document.getElementById('service-modal');
        const title = document.getElementById('service-modal-title');
        const form = document.getElementById('service-form');

        if (!modal || !form) return;

        // Limpa formulário
        form.reset();
        this.currentService = service;

        if (service) {
            // Modo edição
            title.textContent = 'Editar Serviço';
            this.fillForm(service);
        } else {
            // Modo criação
            title.textContent = 'Novo Serviço';
            document.getElementById('service-id').value = '';
            document.getElementById('service-active').checked = true;
        }

        // Mostra modal
        modal.classList.add('active');

        // Foca no primeiro campo
        setTimeout(() => {
            document.getElementById('service-name').focus();
        }, 100);
    },

    /**
     * Fecha modal de serviço
     */
    closeModal() {
        const modal = document.getElementById('service-modal');
        if (modal) {
            modal.classList.remove('active');
            this.currentService = null;
        }
    },

    /**
     * Preenche formulário com dados do serviço
     * @param {object} service - Dados do serviço
     */
    fillForm(service) {
        document.getElementById('service-id').value = service.id || '';
        document.getElementById('service-name').value = service.nome || service.name || '';
        document.getElementById('service-description').value = service.descricao || service.description || '';
        document.getElementById('service-price-min').value = service.preco_minimo || service.priceMin || service.preco || '';
        document.getElementById('service-price-max').value = service.preco_maximo || service.priceMax || '';
        document.getElementById('service-duration').value = service.duracao_estimada || service.duration || service.tempo_estimado || '';
        document.getElementById('service-active').checked = service.ativo !== false;
    },

    /**
     * Obtém dados do formulário
     * @returns {object} Dados do serviço
     */
    getFormData() {
        const priceMin = parseFloat(document.getElementById('service-price-min').value) || 0;
        const priceMax = parseFloat(document.getElementById('service-price-max').value) || null;

        return {
            id: document.getElementById('service-id').value || null,
            nome: document.getElementById('service-name').value.trim(),
            descricao: document.getElementById('service-description').value.trim(),
            preco_minimo: priceMin,
            preco_maximo: priceMax && priceMax > priceMin ? priceMax : null,
            duracao_estimada: document.getElementById('service-duration').value.trim(),
            ativo: document.getElementById('service-active').checked
        };
    },

    /**
     * Valida dados do formulário
     * @param {object} data - Dados do serviço
     * @returns {boolean} É válido
     */
    validateForm(data) {
        if (!data.nome) {
            Toast.error('Nome é obrigatório');
            document.getElementById('service-name').focus();
            return false;
        }

        if (!data.preco_minimo || data.preco_minimo <= 0) {
            Toast.error('Preço mínimo deve ser maior que zero');
            document.getElementById('service-price-min').focus();
            return false;
        }

        if (data.preco_maximo && data.preco_maximo < data.preco_minimo) {
            Toast.error('Preço máximo deve ser maior que o preço mínimo');
            document.getElementById('service-price-max').focus();
            return false;
        }

        return true;
    },

    /**
     * Salva serviço (criar ou atualizar)
     */
    async saveService() {
        const data = this.getFormData();

        // Valida
        if (!this.validateForm(data)) return;

        const btnSave = document.getElementById('btn-save-service');
        const originalText = btnSave.innerHTML;

        try {
            // Desabilita botão
            btnSave.disabled = true;
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

            let response;

            if (data.id) {
                // Atualizar
                response = await API.services.update(data.id, data);
            } else {
                // Criar
                delete data.id;
                response = await API.services.create(data);
            }

            if (response.success) {
                Toast.success(data.id ? 'Serviço atualizado!' : 'Serviço criado!');
                this.closeModal();
                this.loadServices();
            } else {
                throw new Error(response.message || 'Erro ao salvar serviço');
            }
        } catch (error) {
            console.error('Erro ao salvar serviço:', error);
            Toast.error(error.message || 'Erro ao salvar serviço');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalText;
        }
    },

    /**
     * Edita serviço
     * @param {number} id - ID do serviço
     */
    async editService(id) {
        try {
            Toast.info('Carregando serviço...');

            const response = await API.services.getById(id);

            if (response.success) {
                this.openModal(response.data);
            } else {
                throw new Error(response.message || 'Serviço não encontrado');
            }
        } catch (error) {
            console.error('Erro ao carregar serviço:', error);
            Toast.error(error.message || 'Erro ao carregar serviço');
        }
    },

    /**
     * Alterna status do serviço (ativo/inativo)
     * @param {number} id - ID do serviço
     */
    async toggleServiceStatus(id) {
        // Encontra serviço na lista
        const service = this.data.services.find(s => s.id == id);
        if (!service) {
            Toast.error('Serviço não encontrado');
            return;
        }

        const isActive = service.ativo !== false;
        const action = isActive ? 'desativar' : 'ativar';
        const serviceName = service.nome || service.name;

        const confirmed = await Modal.confirm(
            `${Utils.capitalize(action)} Serviço`,
            `Tem certeza que deseja ${action} "${serviceName}"?`
        );

        if (!confirmed) return;

        try {
            const response = await API.services.toggleActive(id);

            if (response.success) {
                Toast.success(`Serviço ${isActive ? 'desativado' : 'ativado'}!`);
                this.loadServices();
            } else {
                throw new Error(response.message || `Erro ao ${action} serviço`);
            }
        } catch (error) {
            console.error(`Erro ao ${action} serviço:`, error);
            Toast.error(error.message || `Erro ao ${action} serviço`);
        }
    },

    /**
     * Exclui serviço
     * @param {number} id - ID do serviço
     */
    async deleteService(id) {
        // Encontra serviço na lista
        const service = this.data.services.find(s => s.id == id);
        const serviceName = service ? (service.nome || service.name) : 'este serviço';

        const confirmed = await Modal.confirm(
            'Excluir Serviço',
            `Tem certeza que deseja excluir "${serviceName}"?<br><small class="text-muted">Esta ação não pode ser desfeita.</small>`
        );

        if (!confirmed) return;

        try {
            const response = await API.services.delete(id);

            if (response.success) {
                Toast.success('Serviço excluído!');
                this.loadServices();
            } else {
                throw new Error(response.message || 'Erro ao excluir serviço');
            }
        } catch (error) {
            console.error('Erro ao excluir serviço:', error);
            Toast.error(error.message || 'Erro ao excluir serviço');
        }
    },

    /**
     * Exporta serviços para CSV
     */
    async exportServices() {
        try {
            Toast.info('Gerando exportação...');

            const response = await API.services.list({ limit: 1000 });

            if (response.success && response.data) {
                const services = response.data;

                // Formata dados para CSV
                const csvData = services.map(s => ({
                    Nome: s.nome || s.name || '',
                    Descrição: s.descricao || s.description || '',
                    'Preço Mínimo': s.preco_minimo || s.priceMin || s.preco || 0,
                    'Preço Máximo': s.preco_maximo || s.priceMax || '',
                    Duração: s.duracao_estimada || s.duration || s.tempo_estimado || '',
                    Ativo: s.ativo !== false ? 'Sim' : 'Não'
                }));

                Utils.exportToCsv(csvData, `servicos_${new Date().toISOString().split('T')[0]}.csv`);
                Toast.success('Exportação concluída!');
            }
        } catch (error) {
            console.error('Erro ao exportar:', error);
            Toast.error('Erro ao exportar serviços');
        }
    },

    /**
     * Recarrega lista de serviços
     */
    async refresh() {
        await this.loadServices();
    },

    /**
     * Limpa filtros
     */
    clearFilters() {
        this.filters = {
            search: '',
            ativo: ''
        };

        // Limpa campos
        const searchInput = document.getElementById('services-search');
        if (searchInput) searchInput.value = '';

        // Volta para primeira página
        this.data.pagination.page = 1;

        // Recarrega
        this.loadServices();
    },

    /**
     * Busca serviços por termo
     * @param {string} query - Termo de busca
     * @returns {array} Serviços encontrados
     */
    searchLocal(query) {
        if (!query) return this.data.services;

        const queryLower = query.toLowerCase();
        return this.data.services.filter(service => {
            const name = (service.nome || service.name || '').toLowerCase();
            const description = (service.descricao || service.description || '').toLowerCase();
            return name.includes(queryLower) || description.includes(queryLower);
        });
    },

    /**
     * Ordena serviços
     * @param {string} field - Campo para ordenar
     * @param {string} order - Ordem (asc/desc)
     */
    sortServices(field, order = 'asc') {
        this.data.services = Utils.sortBy(this.data.services, field, order);
        this.renderServices();
    },

    /**
     * Obtém serviço por ID
     * @param {number} id - ID do serviço
     * @returns {object|null} Serviço ou null
     */
    getServiceById(id) {
        return this.data.services.find(s => s.id == id) || null;
    },

    /**
     * Obtém estatísticas de serviços
     * @returns {object} Estatísticas
     */
    getStatistics() {
        const services = this.data.services;
        const active = services.filter(s => s.ativo !== false);
        const inactive = services.filter(s => s.ativo === false);

        // Calcula média de preços
        const prices = active.map(s => s.preco_minimo || s.priceMin || s.preco || 0).filter(p => p > 0);
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

        return {
            total: services.length,
            active: active.length,
            inactive: inactive.length,
            averagePrice: avgPrice
        };
    },

    /**
     * Cleanup ao sair da página
     */
    destroy() {
        this.data = {
            services: [],
            pagination: {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0
            }
        };
        this.filters = {
            search: '',
            ativo: ''
        };
        this.currentService = null;
    }
};

// Exporta para uso global
window.Services = Services;