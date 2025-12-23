/**
 * ============================================
 * DASHBOARD
 * Página inicial com estatísticas e resumos
 * ============================================
 */

const Dashboard = {
    // Instâncias dos gráficos
    charts: {
        messages: null,
        categories: null
    },

    // Dados carregados
    data: {
        stats: null,
        recentConversations: [],
        lowStockProducts: []
    },

    // Intervalo de atualização automática
    refreshInterval: null,

    /**
     * Inicializa o dashboard
     */
    async init() {
        console.log('📊 Inicializando Dashboard...');

        // Carrega dados
        await this.loadData();

        // Configura gráficos
        this.setupCharts();

        // Configura eventos
        this.setupEventListeners();

        // Inicia atualização automática (a cada 60 segundos)
        this.startAutoRefresh();
    },

    /**
     * Carrega todos os dados do dashboard
     */
    async loadData() {
        try {
            // Mostra loading
            this.showLoading();

            // Carrega estatísticas
            await this.loadStats();

            // Carrega conversas recentes
            await this.loadRecentConversations();

            // Carrega produtos com estoque baixo
            await this.loadLowStockProducts();

        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            Toast.error('Erro ao carregar dados do dashboard');
        }
    },

    /**
     * Carrega estatísticas principais
     */
    async loadStats() {
        try {
            const response = await API.dashboard.getStats();

            if (response.success) {
                this.data.stats = response.data;
                this.updateStatsCards();
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
            // Usa dados padrão em caso de erro
            this.data.stats = {
                produtos: 0,
                servicos: 0,
                clientes: 0,
                conversasHoje: 0
            };
            this.updateStatsCards();
        }
    },

    /**
     * Atualiza os cards de estatísticas
     */
    updateStatsCards() {
        const stats = this.data.stats;

        // Produtos
        const statProducts = document.getElementById('stat-products');
        if (statProducts) {
            this.animateNumber(statProducts, stats.produtos || stats.products || 0);
        }

        // Serviços
        const statServices = document.getElementById('stat-services');
        if (statServices) {
            this.animateNumber(statServices, stats.servicos || stats.services || 0);
        }

        // Clientes
        const statCustomers = document.getElementById('stat-customers');
        if (statCustomers) {
            this.animateNumber(statCustomers, stats.clientes || stats.customers || 0);
        }

        // Conversas hoje
        const statConversations = document.getElementById('stat-conversations');
        if (statConversations) {
            this.animateNumber(statConversations, stats.conversasHoje || stats.conversationsToday || 0);
        }
    },

    /**
     * Anima número de 0 até o valor final
     * @param {Element} element - Elemento HTML
     * @param {number} finalValue - Valor final
     */
    animateNumber(element, finalValue) {
        const duration = 1000;
        const start = 0;
        const increment = finalValue / (duration / 16);
        let current = start;

        const animate = () => {
            current += increment;
            if (current < finalValue) {
                element.textContent = Math.floor(current);
                requestAnimationFrame(animate);
            } else {
                element.textContent = Utils.formatNumber(finalValue);
            }
        };

        animate();
    },

    /**
     * Carrega conversas recentes
     */
    async loadRecentConversations() {
        const container = document.getElementById('recent-conversations');
        if (!container) return;

        try {
            const response = await API.conversations.list({ limit: 5 });

            if (response.success) {
                this.data.recentConversations = response.data || [];
                this.renderRecentConversations();
            }
        } catch (error) {
            console.error('Erro ao carregar conversas:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>Nenhuma conversa recente</p>
                </div>
            `;
        }
    },

    /**
     * Renderiza lista de conversas recentes
     */
    renderRecentConversations() {
        const container = document.getElementById('recent-conversations');
        if (!container) return;

        const conversations = this.data.recentConversations;

        if (!conversations || conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <p>Nenhuma conversa recente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = conversations.map(conv => `
            <div class="activity-item" data-phone="${conv.telefone || conv.phone}">
                <div class="activity-avatar" style="background-color: ${Utils.stringToColor(conv.nome || conv.telefone)}">
                    ${Utils.getInitials(conv.nome || conv.telefone)}
                </div>
                <div class="activity-content">
                    <div class="activity-title">${Utils.escapeHtml(conv.nome || Utils.formatPhone(conv.telefone || conv.phone))}</div>
                    <div class="activity-subtitle">${Utils.escapeHtml(Utils.truncate(conv.ultimaMensagem || conv.lastMessage || 'Sem mensagens', 40))}</div>
                </div>
                <div class="activity-time">${Utils.formatRelativeDate(conv.ultimaInteracao || conv.lastInteraction)}</div>
            </div>
        `).join('');

        // Adiciona eventos de clique
        container.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', () => {
                const phone = item.dataset.phone;
                if (phone) {
                    // Navega para conversas
                    App.navigateTo('conversations', { phone });
                }
            });
            item.style.cursor = 'pointer';
        });
    },

    /**
     * Carrega produtos com estoque baixo
     */
    async loadLowStockProducts() {
        const container = document.getElementById('low-stock-products');
        if (!container) return;

        try {
            const response = await API.products.getLowStock(5);

            if (response.success) {
                this.data.lowStockProducts = response.data || [];
                this.renderLowStockProducts();
            }
        } catch (error) {
            console.error('Erro ao carregar estoque baixo:', error);
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle text-success"></i>
                    <p>Estoque em dia!</p>
                </div>
            `;
        }
    },

    /**
     * Renderiza lista de produtos com estoque baixo
     */
    renderLowStockProducts() {
        const container = document.getElementById('low-stock-products');
        if (!container) return;

        const products = this.data.lowStockProducts;

        if (!products || products.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-check-circle text-success"></i>
                    <p>Estoque em dia!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = products.map(product => `
            <div class="activity-item" data-id="${product.id}">
                <div class="activity-avatar" style="background-color: var(--warning-bg); color: var(--warning);">
                    <i class="fas fa-exclamation"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">${Utils.escapeHtml(product.nome || product.name)}</div>
                    <div class="activity-subtitle">
                        Código: ${Utils.escapeHtml(product.codigo || product.code || '-')}
                    </div>
                </div>
                <div class="activity-meta">
                    <span class="stock-low">${product.quantidade || product.stock || 0} un</span>
                </div>
            </div>
        `).join('');

        // Adiciona eventos de clique
        container.querySelectorAll('.activity-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                if (id) {
                    // Navega para produtos
                    App.navigateTo('products', { id });
                }
            });
            item.style.cursor = 'pointer';
        });
    },

    /**
     * Configura os gráficos
     */
    setupCharts() {
        this.setupMessagesChart();
        this.setupCategoriesChart();
    },

    /**
     * Configura gráfico de mensagens por dia
     */
    async setupMessagesChart() {
        const canvas = document.getElementById('messages-chart');
        if (!canvas) return;

        // Destroi gráfico anterior se existir
        if (this.charts.messages) {
            this.charts.messages.destroy();
        }

        // Dados do gráfico (pode vir da API)
        let labels = [];
        let dataReceived = [];
        let dataSent = [];

        try {
            const response = await API.dashboard.getChartData('week');
            
            if (response.success && response.data) {
                labels = response.data.labels || [];
                dataReceived = response.data.received || [];
                dataSent = response.data.sent || [];
            }
        } catch (error) {
            console.error('Erro ao carregar dados do gráfico:', error);
        }

        // Se não tiver dados, usa dados de exemplo
        if (labels.length === 0) {
            const today = new Date();
            for (let i = 6; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('pt-BR', { weekday: 'short' }));
                dataReceived.push(Math.floor(Math.random() * 50) + 10);
                dataSent.push(Math.floor(Math.random() * 40) + 5);
            }
        }

        // Cria gráfico
        this.charts.messages = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Recebidas',
                        data: dataReceived,
                        backgroundColor: 'rgba(59, 130, 246, 0.8)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Enviadas',
                        data: dataSent,
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(51, 65, 85, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(51, 65, 85, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            stepSize: 10
                        }
                    }
                }
            }
        });
    },

    /**
     * Configura gráfico de produtos por categoria
     */
    async setupCategoriesChart() {
        const canvas = document.getElementById('categories-chart');
        if (!canvas) return;

        // Destroi gráfico anterior se existir
        if (this.charts.categories) {
            this.charts.categories.destroy();
        }

        // Dados do gráfico
        let labels = [];
        let data = [];
        let colors = [];

        try {
            const response = await API.products.getStatistics();
            
            if (response.success && response.data && response.data.byCategory) {
                response.data.byCategory.forEach((cat, index) => {
                    labels.push(cat.nome || cat.name || 'Sem categoria');
                    data.push(cat.total || cat.count || 0);
                    colors.push(this.getChartColor(index));
                });
            }
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }

        // Se não tiver dados, usa dados de exemplo
        if (labels.length === 0) {
            labels = ['Óleos', 'Filtros', 'Freios', 'Suspensão', 'Elétrica'];
            data = [25, 18, 15, 12, 10];
            colors = labels.map((_, i) => this.getChartColor(i));
        }

        // Cria gráfico
        this.charts.categories = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: '#1e293b',
                    borderWidth: 3,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#94a3b8',
                            usePointStyle: true,
                            padding: 15,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((context.raw / total) * 100);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    /**
     * Retorna cor para o gráfico baseado no índice
     * @param {number} index - Índice
     * @returns {string} Cor
     */
    getChartColor(index) {
        const colors = [
            'rgba(59, 130, 246, 0.8)',   // Azul
            'rgba(16, 185, 129, 0.8)',   // Verde
            'rgba(245, 158, 11, 0.8)',   // Amarelo
            'rgba(239, 68, 68, 0.8)',    // Vermelho
            'rgba(139, 92, 246, 0.8)',   // Roxo
            'rgba(6, 182, 212, 0.8)',    // Ciano
            'rgba(236, 72, 153, 0.8)',   // Rosa
            'rgba(20, 184, 166, 0.8)',   // Teal
            'rgba(249, 115, 22, 0.8)',   // Laranja
            'rgba(99, 102, 241, 0.8)'    // Indigo
        ];
        
        return colors[index % colors.length];
    },

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Links para outras páginas
        document.querySelectorAll('[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                if (page) {
                    App.navigateTo(page);
                }
            });
        });

        // Escuta eventos do Socket.IO para atualizações em tempo real
        if (typeof Socket !== 'undefined') {
            // Nova mensagem recebida
            Socket.on('message:received', (data) => {
                this.onNewMessage(data);
            });

            // Atualização de estoque
            Socket.on('stock:updated', (data) => {
                this.loadLowStockProducts();
            });

            // Alerta de estoque baixo
            Socket.on('stock:low', (data) => {
                this.loadLowStockProducts();
                Toast.warning(`Estoque baixo: ${data.product?.nome || 'Produto'}`);
            });
        }
    },

    /**
     * Callback para nova mensagem recebida
     * @param {object} data - Dados da mensagem
     */
    onNewMessage(data) {
        // Atualiza contador de conversas
        const statConversations = document.getElementById('stat-conversations');
        if (statConversations) {
            const current = parseInt(statConversations.textContent.replace(/\D/g, '')) || 0;
            statConversations.textContent = Utils.formatNumber(current + 1);
        }

        // Recarrega conversas recentes
        this.loadRecentConversations();
    },

    /**
     * Mostra estado de loading
     */
    showLoading() {
        const containers = [
            'recent-conversations',
            'low-stock-products'
        ];

        containers.forEach(id => {
            const container = document.getElementById(id);
            if (container) {
                container.innerHTML = `
                    <div class="loading-placeholder">
                        <i class="fas fa-spinner fa-spin"></i>
                        Carregando...
                    </div>
                `;
            }
        });
    },

    /**
     * Inicia atualização automática
     */
    startAutoRefresh() {
        // Para intervalo anterior se existir
        this.stopAutoRefresh();

        // Atualiza a cada 60 segundos
        this.refreshInterval = setInterval(() => {
            this.refresh();
        }, 60000);
    },

    /**
     * Para atualização automática
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },

    /**
     * Atualiza dados do dashboard
     */
    async refresh() {
        console.log('🔄 Atualizando dashboard...');
        
        try {
            await Promise.all([
                this.loadStats(),
                this.loadRecentConversations(),
                this.loadLowStockProducts()
            ]);
        } catch (error) {
            console.error('Erro ao atualizar dashboard:', error);
        }
    },

    /**
     * Destrói o dashboard (cleanup)
     */
    destroy() {
        // Para atualização automática
        this.stopAutoRefresh();

        // Destroi gráficos
        if (this.charts.messages) {
            this.charts.messages.destroy();
            this.charts.messages = null;
        }

        if (this.charts.categories) {
            this.charts.categories.destroy();
            this.charts.categories = null;
        }

        // Limpa dados
        this.data = {
            stats: null,
            recentConversations: [],
            lowStockProducts: []
        };
    }
};

// Exporta para uso global
window.Dashboard = Dashboard;