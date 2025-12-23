/**
 * ============================================
 * CLIENTES
 * Listagem e gerenciamento de clientes
 * ============================================
 */

const Customers = {
    // Dados carregados
    data: {
        customers: [],
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
        status: ''
    },

    // Cliente selecionado
    selectedCustomer: null,

    /**
     * Inicializa o módulo de clientes
     */
    async init() {
        console.log('👥 Inicializando Clientes...');

        // Carrega clientes
        await this.loadCustomers();

        // Configura eventos
        this.setupEventListeners();
    },

    /**
     * Carrega lista de clientes
     */
    async loadCustomers() {
        const tbody = document.getElementById('customers-tbody');
        if (!tbody) return;

        // Mostra loading
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="loading-cell">
                    <i class="fas fa-spinner fa-spin"></i>
                    Carregando clientes...
                </td>
            </tr>
        `;

        try {
            const params = {
                page: this.data.pagination.page,
                limit: this.data.pagination.limit,
                search: this.filters.search,
                status: this.filters.status
            };

            const response = await API.customers.list(params);

            if (response.success) {
                this.data.customers = response.data || [];
                this.data.pagination = {
                    page: response.page || 1,
                    limit: response.limit || 20,
                    total: response.total || 0,
                    totalPages: response.totalPages || 1
                };

                this.renderCustomers();
                this.renderPagination();
            }
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cell">
                        <i class="fas fa-exclamation-circle text-danger"></i>
                        Erro ao carregar clientes
                        <br><br>
                        <button class="btn btn-primary btn-sm" onclick="Customers.loadCustomers()">
                            <i class="fas fa-sync"></i> Tentar novamente
                        </button>
                    </td>
                </tr>
            `;
        }
    },

    /**
     * Renderiza tabela de clientes
     */
    renderCustomers() {
        const tbody = document.getElementById('customers-tbody');
        if (!tbody) return;

        const customers = this.data.customers;

        if (!customers || customers.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-cell">
                        <i class="fas fa-users" style="font-size: 3rem; opacity: 0.3; margin-bottom: 15px;"></i>
                        <p>Nenhum cliente encontrado</p>
                        <small class="text-muted">Os clientes aparecerão aqui quando entrarem em contato via WhatsApp</small>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = customers.map(customer => this.renderCustomerRow(customer)).join('');

        // Adiciona eventos aos botões
        this.setupRowEvents();
    },

    /**
     * Renderiza uma linha da tabela
     * @param {object} customer - Dados do cliente
     * @returns {string} HTML da linha
     */
    renderCustomerRow(customer) {
        const name = customer.nome || customer.name || 'Cliente';
        const phone = customer.telefone || customer.phone || '';
        const lastInteraction = customer.ultima_interacao || customer.lastInteraction || customer.updated_at;
        const totalConversations = customer.total_conversas || customer.totalConversations || customer.total_mensagens || 0;
        const status = customer.status || 'ativo';
        const isInAttendance = customer.em_atendimento || customer.inAttendance || false;

        // Cor do avatar baseada no nome
        const avatarColor = Utils.stringToColor(name);
        const initials = Utils.getInitials(name);

        // Status badge
        let statusBadge = '';
        if (isInAttendance) {
            statusBadge = '<span class="status-badge active"><i class="fas fa-headset"></i> Em atendimento</span>';
        } else if (status === 'aguardando') {
            statusBadge = '<span class="status-badge low-stock"><i class="fas fa-clock"></i> Aguardando</span>';
        } else {
            statusBadge = '<span class="status-badge active"><i class="fas fa-check"></i> Ativo</span>';
        }

        return `
            <tr data-id="${customer.id}" data-phone="${phone}">
                <td>
                    <div class="customer-cell">
                        <div class="customer-avatar" style="background-color: ${avatarColor}">
                            ${initials}
                        </div>
                        <div class="customer-info">
                            <div class="customer-name">${Utils.escapeHtml(name)}</div>
                            ${customer.email 
                                ? `<div class="customer-email">${Utils.escapeHtml(customer.email)}</div>` 
                                : ''
                            }
                        </div>
                    </div>
                </td>
                <td>
                    <a href="tel:${phone}" class="phone-link">
                        <i class="fab fa-whatsapp text-success"></i>
                        ${Utils.formatPhone(phone)}
                    </a>
                </td>
                <td>
                    <span title="${Utils.formatDate(lastInteraction, true)}">
                        ${Utils.formatRelativeDate(lastInteraction)}
                    </span>
                </td>
                <td>
                    <span class="conversation-count">
                        <i class="fas fa-comments"></i>
                        ${totalConversations}
                    </span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon-only btn-view" title="Ver detalhes" data-id="${customer.id}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon-only btn-chat" title="Ver conversa" data-phone="${phone}">
                            <i class="fas fa-comments"></i>
                        </button>
                        <button class="btn-icon-only btn-whatsapp" title="Abrir WhatsApp" data-phone="${phone}">
                            <i class="fab fa-whatsapp"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    },

    /**
     * Configura eventos das linhas da tabela
     */
    setupRowEvents() {
        // Botões de ver detalhes
        document.querySelectorAll('#customers-tbody .btn-view').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.viewCustomerDetails(id);
            });
        });

        // Botões de ver conversa
        document.querySelectorAll('#customers-tbody .btn-chat').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const phone = btn.dataset.phone;
                this.openConversation(phone);
            });
        });

        // Botões de abrir WhatsApp
        document.querySelectorAll('#customers-tbody .btn-whatsapp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const phone = btn.dataset.phone;
                this.openWhatsApp(phone);
            });
        });

        // Clique na linha para ver detalhes
        document.querySelectorAll('#customers-tbody tr[data-id]').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.dataset.id;
                this.viewCustomerDetails(id);
            });
            row.style.cursor = 'pointer';
        });
    },

    /**
     * Renderiza paginação
     */
    renderPagination() {
        const container = document.getElementById('customers-pagination');
        if (!container) return;

        const { page, totalPages, total } = this.data.pagination;

        if (totalPages <= 1) {
            container.innerHTML = `
                <span class="pagination-info">${total} cliente(s)</span>
            `;
            return;
        }

        let html = '';

        // Botão anterior
        html += `
            <button class="pagination-btn" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // Páginas
        const maxVisible = 5;
        let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);

        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            html += `<button class="pagination-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">
                    ${i}
                </button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
            html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        // Botão próximo
        html += `
            <button class="pagination-btn" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        // Info
        html += `
            <span class="pagination-info">
                ${total} cliente(s)
            </span>
        `;

        container.innerHTML = html;

        // Eventos de paginação
        container.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!btn.disabled) {
                    this.goToPage(parseInt(btn.dataset.page));
                }
            });
        });
    },

    /**
     * Vai para página específica
     * @param {number} page - Número da página
     */
    goToPage(page) {
        this.data.pagination.page = page;
        this.loadCustomers();
    },

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Campo de busca
        const searchInput = document.getElementById('customers-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.filters.search = e.target.value;
                this.data.pagination.page = 1;
                this.loadCustomers();
            }, 300));
        }

        // Botão exportar
        const btnExport = document.getElementById('btn-export-customers');
        if (btnExport) {
            btnExport.addEventListener('click', () => this.exportCustomers());
        }
    },

    /**
     * Exibe detalhes do cliente
     * @param {number} id - ID do cliente
     */
    async viewCustomerDetails(id) {
        try {
            Toast.info('Carregando detalhes...');

            const response = await API.customers.getById(id);

            if (!response.success) {
                throw new Error(response.message || 'Cliente não encontrado');
            }

            const customer = response.data;
            this.selectedCustomer = customer;

            // Carrega histórico de conversas
            let history = [];
            try {
                const historyResponse = await API.customers.getHistory(id);
                if (historyResponse.success) {
                    history = historyResponse.data || [];
                }
            } catch (e) {
                console.error('Erro ao carregar histórico:', e);
            }

            // Monta conteúdo do modal
            const name = customer.nome || customer.name || 'Cliente';
            const phone = customer.telefone || customer.phone || '';
            const email = customer.email || '';
            const avatarColor = Utils.stringToColor(name);
            const initials = Utils.getInitials(name);

            const content = `
                <div class="customer-details">
                    <div class="customer-header">
                        <div class="customer-avatar-large" style="background-color: ${avatarColor}">
                            ${initials}
                        </div>
                        <div class="customer-main-info">
                            <h2>${Utils.escapeHtml(name)}</h2>
                            <p class="phone">
                                <i class="fab fa-whatsapp"></i>
                                ${Utils.formatPhone(phone)}
                            </p>
                            ${email ? `<p class="email"><i class="fas fa-envelope"></i> ${Utils.escapeHtml(email)}</p>` : ''}
                        </div>
                    </div>

                    <div class="customer-stats">
                        <div class="stat-item">
                            <i class="fas fa-comments"></i>
                            <div>
                                <strong>${customer.total_conversas || customer.totalConversations || 0}</strong>
                                <span>Conversas</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-envelope"></i>
                            <div>
                                <strong>${customer.total_mensagens || customer.totalMessages || 0}</strong>
                                <span>Mensagens</span>
                            </div>
                        </div>
                        <div class="stat-item">
                            <i class="fas fa-calendar"></i>
                            <div>
                                <strong>${Utils.formatDate(customer.created_at || customer.createdAt)}</strong>
                                <span>Primeiro contato</span>
                            </div>
                        </div>
                    </div>

                    ${customer.observacoes || customer.notes ? `
                        <div class="customer-notes">
                            <h4><i class="fas fa-sticky-note"></i> Observações</h4>
                            <p>${Utils.escapeHtml(customer.observacoes || customer.notes)}</p>
                        </div>
                    ` : ''}

                    ${customer.veiculos || customer.vehicles ? `
                        <div class="customer-vehicles">
                            <h4><i class="fas fa-car"></i> Veículos</h4>
                            <p>${Utils.escapeHtml(customer.veiculos || customer.vehicles)}</p>
                        </div>
                    ` : ''}

                    ${history.length > 0 ? `
                        <div class="customer-history">
                            <h4><i class="fas fa-history"></i> Últimas interações</h4>
                            <div class="history-list">
                                ${history.slice(0, 5).map(h => `
                                    <div class="history-item">
                                        <span class="history-date">${Utils.formatDate(h.data || h.date, true)}</span>
                                        <span class="history-text">${Utils.escapeHtml(Utils.truncate(h.mensagem || h.message || '', 50))}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                <style>
                    .customer-details { padding: 10px 0; }
                    .customer-header { display: flex; align-items: center; gap: 20px; margin-bottom: 25px; }
                    .customer-avatar-large { 
                        width: 80px; height: 80px; border-radius: 50%; 
                        display: flex; align-items: center; justify-content: center;
                        color: white; font-size: 2rem; font-weight: 600;
                    }
                    .customer-main-info h2 { margin: 0 0 10px; color: var(--text-primary); }
                    .customer-main-info p { margin: 5px 0; color: var(--text-secondary); display: flex; align-items: center; gap: 8px; }
                    .customer-main-info .phone i { color: var(--success); }
                    .customer-stats { 
                        display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;
                        background: var(--bg-primary); border-radius: var(--border-radius); padding: 20px;
                        margin-bottom: 20px;
                    }
                    .stat-item { display: flex; align-items: center; gap: 12px; }
                    .stat-item i { font-size: 1.5rem; color: var(--primary); }
                    .stat-item strong { display: block; font-size: 1.2rem; color: var(--text-primary); }
                    .stat-item span { font-size: 0.8rem; color: var(--text-muted); }
                    .customer-notes, .customer-vehicles, .customer-history { margin-top: 20px; }
                    .customer-notes h4, .customer-vehicles h4, .customer-history h4 { 
                        font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 10px;
                        display: flex; align-items: center; gap: 8px;
                    }
                    .customer-notes h4 i, .customer-vehicles h4 i, .customer-history h4 i { color: var(--primary); }
                    .customer-notes p, .customer-vehicles p { color: var(--text-primary); line-height: 1.6; }
                    .history-list { display: flex; flex-direction: column; gap: 8px; }
                    .history-item { 
                        display: flex; justify-content: space-between; align-items: center;
                        padding: 10px; background: var(--bg-primary); border-radius: var(--border-radius);
                    }
                    .history-date { font-size: 0.8rem; color: var(--text-muted); }
                    .history-text { color: var(--text-primary); font-size: 0.9rem; }
                </style>
            `;

            // Abre modal
            await Modal.show(
                'Detalhes do Cliente',
                content,
                {
                    size: 'lg',
                    buttons: [
                        {
                            text: '<i class="fas fa-comments"></i> Ver Conversa',
                            class: 'btn btn-primary',
                            action: () => {
                                Modal.close();
                                this.openConversation(phone);
                            }
                        },
                        {
                            text: '<i class="fab fa-whatsapp"></i> Abrir WhatsApp',
                            class: 'btn btn-success',
                            action: () => {
                                this.openWhatsApp(phone);
                            }
                        },
                        {
                            text: 'Fechar',
                            class: 'btn btn-outline',
                            action: () => Modal.close()
                        }
                    ]
                }
            );

        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            Toast.error(error.message || 'Erro ao carregar detalhes do cliente');
        }
    },

    /**
     * Abre a conversa do cliente
     * @param {string} phone - Telefone do cliente
     */
    openConversation(phone) {
        if (!phone) {
            Toast.error('Telefone não informado');
            return;
        }

        // Navega para página de conversas com o telefone selecionado
        App.navigateTo('conversations', { phone });
    },

    /**
     * Abre WhatsApp Web com o número
     * @param {string} phone - Telefone
     */
    openWhatsApp(phone) {
        if (!phone) {
            Toast.error('Telefone não informado');
            return;
        }

        // Remove formatação
        const cleanPhone = phone.replace(/\D/g, '');
        
        // Adiciona código do país se não tiver
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        
        // Abre WhatsApp Web
        window.open(`https://wa.me/${fullPhone}`, '_blank');
    },

    /**
     * Exporta clientes para CSV
     */
    async exportCustomers() {
        try {
            Toast.info('Gerando exportação...');

            const response = await API.customers.list({ limit: 10000 });

            if (response.success && response.data) {
                const customers = response.data;

                // Formata dados para CSV
                const csvData = customers.map(c => ({
                    Nome: c.nome || c.name || '',
                    Telefone: c.telefone || c.phone || '',
                    Email: c.email || '',
                    'Total Conversas': c.total_conversas || c.totalConversations || 0,
                    'Total Mensagens': c.total_mensagens || c.totalMessages || 0,
                    'Primeira Interação': Utils.formatDate(c.created_at || c.createdAt),
                    'Última Interação': Utils.formatDate(c.ultima_interacao || c.lastInteraction || c.updated_at),
                    Observações: c.observacoes || c.notes || '',
                    Veículos: c.veiculos || c.vehicles || ''
                }));

                Utils.exportToCsv(csvData, `clientes_${new Date().toISOString().split('T')[0]}.csv`);
                Toast.success('Exportação concluída!');
            }
        } catch (error) {
            console.error('Erro ao exportar:', error);
            Toast.error('Erro ao exportar clientes');
        }
    },

    /**
     * Busca cliente por telefone
     * @param {string} phone - Telefone
     * @returns {object|null} Cliente encontrado
     */
    findByPhone(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        return this.data.customers.find(c => {
            const customerPhone = (c.telefone || c.phone || '').replace(/\D/g, '');
            return customerPhone === cleanPhone || customerPhone.endsWith(cleanPhone) || cleanPhone.endsWith(customerPhone);
        });
    },

    /**
     * Obtém estatísticas de clientes
     * @returns {object} Estatísticas
     */
    getStatistics() {
        const customers = this.data.customers;
        
        // Clientes ativos (interagiram nos últimos 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const activeCustomers = customers.filter(c => {
            const lastInteraction = new Date(c.ultima_interacao || c.lastInteraction || c.updated_at);
            return lastInteraction >= thirtyDaysAgo;
        });

        // Total de mensagens
        const totalMessages = customers.reduce((sum, c) => sum + (c.total_mensagens || c.totalMessages || 0), 0);

        return {
            total: customers.length,
            active: activeCustomers.length,
            inactive: customers.length - activeCustomers.length,
            totalMessages
        };
    },

    /**
     * Recarrega lista de clientes
     */
    async refresh() {
        await this.loadCustomers();
    },

    /**
     * Limpa filtros
     */
    clearFilters() {
        this.filters = {
            search: '',
            status: ''
        };

        // Limpa campos
        const searchInput = document.getElementById('customers-search');
        if (searchInput) searchInput.value = '';

        // Volta para primeira página
        this.data.pagination.page = 1;

        // Recarrega
        this.loadCustomers();
    },

    /**
     * Cleanup ao sair da página
     */
    destroy() {
        this.data = {
            customers: [],
            pagination: {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0
            }
        };
        this.filters = {
            search: '',
            status: ''
        };
        this.selectedCustomer = null;
    }
};

// Exporta para uso global
window.Customers = Customers;