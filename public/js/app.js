/**
 * ============================================
 * APP PRINCIPAL
 * Inicialização e controle geral da aplicação
 * ============================================
 */

const App = {
    // Página atual
    currentPage: 'dashboard',

    // Módulos carregados
    modules: {
        dashboard: Dashboard,
        products: Products,
        services: Services,
        customers: Customers,
        conversations: Conversations
    },

    // Estado da aplicação
    state: {
        initialized: false,
        sidebarCollapsed: false,
        sidebarMobileOpen: false
    },

    // Parâmetros da navegação
    navParams: {},

    /**
     * Inicializa a aplicação
     */
    async init() {
        console.log('🚀 Inicializando aplicação...');

        try {
            // Inicializa API
            API.init();

            // Verifica autenticação
            const isAuthenticated = await Auth.init();

            if (isAuthenticated) {
                // Usuário logado - mostra painel
                this.showApp();
                await this.initializeApp();
            } else {
                // Usuário não logado - mostra login
                this.showLogin();
            }

            // Configura listeners globais
            this.setupGlobalListeners();

            this.state.initialized = true;
            console.log('✅ Aplicação inicializada!');

        } catch (error) {
            console.error('❌ Erro ao inicializar aplicação:', error);
            Toast.error('Erro ao inicializar aplicação');
        }
    },

    /**
     * Mostra tela de login
     */
    showLogin() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';

        // Configura formulário de login
        Auth.setupLoginForm();
    },

    /**
     * Mostra aplicação principal
     */
    showApp() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';

        // Configura botão de logout
        Auth.setupLogoutButton();
    },

    /**
     * Inicializa componentes da aplicação
     */
    async initializeApp() {
        // Atualiza data no header
        this.updateHeaderDate();

        // Inicializa Socket.IO
        this.initSocket();

        // Carrega status do WhatsApp
        this.loadWhatsAppStatus();

        // Carrega página inicial
        await this.loadPage('dashboard');

        // Configura navegação
        this.setupNavigation();

        // Configura sidebar
        this.setupSidebar();

        // Inicia verificação periódica do WhatsApp
        this.startWhatsAppStatusCheck();
    },

    /**
     * Inicializa Socket.IO
     */
    initSocket() {
        if (typeof io === 'undefined') {
            console.warn('Socket.IO não disponível');
            return;
        }

        try {
            window.Socket = io({
                transports: ['websocket', 'polling']
            });

            Socket.on('connect', () => {
                console.log('🔌 Socket.IO conectado');

                // Identifica como admin
                Socket.emit('admin:join', {
                    userId: Auth.getUserId(),
                    userName: Auth.getUserName()
                });
            });

            Socket.on('disconnect', () => {
                console.log('🔌 Socket.IO desconectado');
            });

            // Eventos globais
            Socket.on('whatsapp:status', (data) => {
                this.updateWhatsAppStatusUI(data.status === 'connected');
            });

            Socket.on('whatsapp:qr', (data) => {
                // Se estiver na página do WhatsApp, atualiza QR
                if (this.currentPage === 'whatsapp') {
                    this.showQRCode(data.qrCode);
                }
            });

            Socket.on('message:received', (data) => {
                // Atualiza badge de mensagens não lidas
                this.updateUnreadBadge();

                // Notificação
                if (document.hidden) {
                    this.showNotification('Nova mensagem', data.text || 'Você recebeu uma nova mensagem');
                }
            });

            Socket.on('stock:low', (data) => {
                Toast.warning(`Estoque baixo: ${data.product?.nome || 'Produto'}`);
            });

        } catch (error) {
            console.error('Erro ao inicializar Socket.IO:', error);
        }
    },

    /**
     * Configura navegação
     */
    setupNavigation() {
        // Links do menu
        document.querySelectorAll('.sidebar-nav a[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
            });
        });

        // Links gerais com data-page
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[data-page]');
            if (link && !link.closest('.sidebar-nav')) {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
            }
        });
    },

    /**
     * Navega para uma página
     * @param {string} page - Nome da página
     * @param {object} params - Parâmetros opcionais
     */
    async navigateTo(page, params = {}) {
        if (!page) return;

        console.log(`📄 Navegando para: ${page}`);

        // Salva parâmetros
        this.navParams = params;

        // Destrói módulo atual se existir
        if (this.modules[this.currentPage]?.destroy) {
            this.modules[this.currentPage].destroy();
        }

        // Atualiza página atual
        this.currentPage = page;

        // Atualiza menu
        this.updateActiveMenu(page);

        // Atualiza título
        this.updatePageTitle(page);

        // Carrega página
        await this.loadPage(page);

        // Fecha menu mobile
        this.closeMobileSidebar();

        // Atualiza URL (sem recarregar)
        const url = params && Object.keys(params).length > 0 
            ? `?page=${page}&${Utils.toQueryString(params)}`
            : `?page=${page}`;
        history.pushState({ page, params }, '', url);
    },

    /**
     * Carrega conteúdo da página
     * @param {string} page - Nome da página
     */
    async loadPage(page) {
        const content = document.getElementById('page-content');
        if (!content) return;

        // Mostra loading
        content.innerHTML = `
            <div class="page-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando...</p>
            </div>
        `;

        try {
            // Carrega template
            const template = document.getElementById(`template-${page}`);
            
            if (template) {
                content.innerHTML = template.innerHTML;
            } else {
                // Página sem template - carrega conteúdo padrão
                content.innerHTML = this.getDefaultPageContent(page);
            }

            // Inicializa módulo da página
            await this.initPageModule(page);

        } catch (error) {
            console.error(`Erro ao carregar página ${page}:`, error);
            content.innerHTML = `
                <div class="page-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h2>Erro ao carregar página</h2>
                    <p>${error.message}</p>
                    <button class="btn btn-primary" onclick="App.loadPage('${page}')">
                        <i class="fas fa-sync"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    /**
     * Inicializa módulo da página
     * @param {string} page - Nome da página
     */
    async initPageModule(page) {
        const module = this.modules[page];

        if (module && typeof module.init === 'function') {
            await module.init(this.navParams);
        } else {
            // Páginas sem módulo específico
            switch (page) {
                case 'whatsapp':
                    await this.initWhatsAppPage();
                    break;
                case 'settings':
                    await this.initSettingsPage();
                    break;
            }
        }
    },

    /**
     * Retorna conteúdo padrão para páginas sem template
     * @param {string} page - Nome da página
     * @returns {string} HTML da página
     */
    getDefaultPageContent(page) {
        const titles = {
            'whatsapp': 'WhatsApp',
            'settings': 'Configurações'
        };

        return `
            <div class="default-page">
                <h2>${titles[page] || page}</h2>
                <p>Conteúdo da página ${page}</p>
            </div>
        `;
    },

    /**
     * Atualiza menu ativo
     * @param {string} page - Página ativa
     */
    updateActiveMenu(page) {
        document.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.classList.toggle('active', link.dataset.page === page);
        });
    },

    /**
     * Atualiza título da página
     * @param {string} page - Nome da página
     */
    updatePageTitle(page) {
        const titles = {
            'dashboard': 'Dashboard',
            'products': 'Produtos',
            'services': 'Serviços',
            'customers': 'Clientes',
            'conversations': 'Conversas',
            'whatsapp': 'WhatsApp',
            'settings': 'Configurações'
        };

        const titleEl = document.getElementById('page-title');
        if (titleEl) {
            titleEl.textContent = titles[page] || page;
        }

        // Atualiza título do documento
        document.title = `${titles[page] || page} - Painel Admin`;
    },

    /**
     * Configura sidebar
     */
    setupSidebar() {
        // Toggle sidebar desktop
        const sidebarToggle = document.getElementById('sidebar-toggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                this.toggleSidebar();
            });
        }

        // Toggle sidebar mobile
        const mobileToggle = document.getElementById('mobile-menu-toggle');
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                this.toggleMobileSidebar();
            });
        }

        // Fecha sidebar ao clicar fora (mobile)
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const mobileToggle = document.getElementById('mobile-menu-toggle');
            
            if (this.state.sidebarMobileOpen && 
                sidebar && 
                !sidebar.contains(e.target) && 
                !mobileToggle?.contains(e.target)) {
                this.closeMobileSidebar();
            }
        });

        // Carrega estado salvo
        const savedState = Utils.storage.get('sidebar_collapsed', false);
        if (savedState) {
            this.toggleSidebar(true);
        }
    },

    /**
     * Toggle sidebar desktop
     * @param {boolean} collapsed - Estado forçado
     */
    toggleSidebar(collapsed = null) {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        this.state.sidebarCollapsed = collapsed !== null ? collapsed : !this.state.sidebarCollapsed;
        sidebar.classList.toggle('collapsed', this.state.sidebarCollapsed);

        // Salva estado
        Utils.storage.set('sidebar_collapsed', this.state.sidebarCollapsed);
    },

    /**
     * Toggle sidebar mobile
     */
    toggleMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) return;

        this.state.sidebarMobileOpen = !this.state.sidebarMobileOpen;
        sidebar.classList.toggle('mobile-open', this.state.sidebarMobileOpen);
    },

    /**
     * Fecha sidebar mobile
     */
    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('mobile-open');
            this.state.sidebarMobileOpen = false;
        }
    },

    /**
     * Atualiza data no header
     */
    updateHeaderDate() {
        const dateEl = document.getElementById('current-date');
        if (dateEl) {
            dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
                weekday: 'short',
                day: '2-digit',
                month: 'short'
            });
        }

        // Atualiza a cada minuto
        setTimeout(() => this.updateHeaderDate(), 60000);
    },

    /**
     * Carrega status do WhatsApp
     */
    async loadWhatsAppStatus() {
        try {
            const response = await API.whatsapp.getStatus();
            
            if (response.success) {
                this.updateWhatsAppStatusUI(response.data.connected);
            }
        } catch (error) {
            console.error('Erro ao carregar status do WhatsApp:', error);
            this.updateWhatsAppStatusUI(false);
        }
    },

    /**
     * Atualiza UI do status do WhatsApp
     * @param {boolean} connected - Se está conectado
     */
    updateWhatsAppStatusUI(connected) {
        // Status no header
        const statusEl = document.getElementById('whatsapp-status');
        if (statusEl) {
            statusEl.className = `whatsapp-status ${connected ? 'online' : 'offline'}`;
            statusEl.innerHTML = `
                <i class="fab fa-whatsapp"></i>
                <span>${connected ? 'Conectado' : 'Desconectado'}</span>
            `;
        }

        // Dot no menu
        const statusDot = document.getElementById('whatsapp-status-dot');
        if (statusDot) {
            statusDot.className = `status-dot ${connected ? 'online' : 'offline'}`;
        }
    },

    /**
     * Inicia verificação periódica do WhatsApp
     */
    startWhatsAppStatusCheck() {
        // Verifica a cada 30 segundos
        setInterval(() => {
            this.loadWhatsAppStatus();
        }, 30000);
    },

    /**
     * Inicializa página do WhatsApp
     */
    async initWhatsAppPage() {
        try {
            const response = await API.whatsapp.getStatus();
            
            if (response.success) {
                const { connected, phoneNumber, qrCode } = response.data;
                
                // Atualiza ícone de status
                const statusIcon = document.getElementById('wa-status-icon');
                if (statusIcon) {
                    statusIcon.className = `status-icon ${connected ? 'connected' : 'disconnected'}`;
                }

                // Atualiza título
                const statusTitle = document.getElementById('wa-status-title');
                if (statusTitle) {
                    statusTitle.textContent = connected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado';
                }

                // Atualiza subtítulo
                const statusSubtitle = document.getElementById('wa-status-subtitle');
                if (statusSubtitle) {
                    statusSubtitle.textContent = connected 
                        ? 'Seu bot está online e funcionando'
                        : 'Escaneie o QR Code para conectar';
                }

                // Mostra/oculta elementos
                const qrContainer = document.getElementById('qr-container');
                const connectedInfo = document.getElementById('connected-info');
                const btnLogout = document.getElementById('btn-wa-logout');

                if (connected) {
                    if (qrContainer) qrContainer.style.display = 'none';
                    if (connectedInfo) connectedInfo.style.display = 'block';
                    if (btnLogout) btnLogout.style.display = 'inline-flex';

                    // Preenche informações
                    const phoneEl = document.getElementById('wa-phone-number');
                    if (phoneEl) phoneEl.textContent = Utils.formatPhone(phoneNumber || '');

                    const connectedSince = document.getElementById('wa-connected-since');
                    if (connectedSince) connectedSince.textContent = response.data.lastConnected 
                        ? Utils.formatDate(response.data.lastConnected, true)
                        : '-';

                    const uptime = document.getElementById('wa-uptime');
                    if (uptime && response.data.uptime) {
                        uptime.textContent = Utils.formatDuration(Math.floor(response.data.uptime / 1000));
                    }
                } else {
                    if (qrContainer) qrContainer.style.display = 'block';
                    if (connectedInfo) connectedInfo.style.display = 'none';
                    if (btnLogout) btnLogout.style.display = 'none';

                    // Mostra QR Code se disponível
                    if (qrCode) {
                        this.showQRCode(qrCode);
                    } else {
                        // Solicita novo QR Code
                        this.requestQRCode();
                    }
                }
            }

            // Configura botões
            this.setupWhatsAppButtons();

            // Carrega estatísticas
            this.loadWhatsAppStats();

        } catch (error) {
            console.error('Erro ao inicializar página WhatsApp:', error);
            Toast.error('Erro ao carregar status do WhatsApp');
        }
    },

    /**
     * Mostra QR Code
     * @param {string} qrCode - String do QR Code
     */
    showQRCode(qrCode) {
        const qrContainer = document.getElementById('qr-code');
        if (!qrContainer || !qrCode) return;

        // Usa biblioteca QRCode para gerar imagem
        if (typeof QRCode !== 'undefined') {
            qrContainer.innerHTML = '';
            QRCode.toCanvas(qrContainer, qrCode, {
                width: 256,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }, (error) => {
                if (error) {
                    console.error('Erro ao gerar QR Code:', error);
                    qrContainer.innerHTML = '<p class="text-danger">Erro ao gerar QR Code</p>';
                }
            });
        } else {
            // Fallback - mostra como texto
            qrContainer.innerHTML = `<pre style="font-size: 6px; line-height: 6px;">${qrCode}</pre>`;
        }
    },

    /**
     * Solicita novo QR Code
     */
    async requestQRCode() {
        try {
            const response = await API.whatsapp.getQRCode();
            
            if (response.success && response.data.qrCode) {
                this.showQRCode(response.data.qrCode);
            }
        } catch (error) {
            console.error('Erro ao solicitar QR Code:', error);
        }
    },

    /**
     * Configura botões da página WhatsApp
     */
    setupWhatsAppButtons() {
        // Reiniciar
        const btnRestart = document.getElementById('btn-wa-restart');
        if (btnRestart) {
            btnRestart.addEventListener('click', async () => {
                btnRestart.disabled = true;
                btnRestart.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reiniciando...';
                
                try {
                    await API.whatsapp.restart();
                    Toast.success('WhatsApp reiniciado!');
                    setTimeout(() => this.initWhatsAppPage(), 2000);
                } catch (error) {
                    Toast.error('Erro ao reiniciar WhatsApp');
                } finally {
                    btnRestart.disabled = false;
                    btnRestart.innerHTML = '<i class="fas fa-sync"></i> Reiniciar Conexão';
                }
            });
        }

        // Logout
        const btnLogout = document.getElementById('btn-wa-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                const confirmed = await Modal.confirm(
                    'Desconectar WhatsApp',
                    'Tem certeza que deseja desconectar? Será necessário escanear o QR Code novamente.'
                );

                if (!confirmed) return;

                btnLogout.disabled = true;
                btnLogout.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desconectando...';

                try {
                    await API.whatsapp.logout();
                    Toast.success('WhatsApp desconectado!');
                    this.initWhatsAppPage();
                } catch (error) {
                    Toast.error('Erro ao desconectar');
                } finally {
                    btnLogout.disabled = false;
                    btnLogout.innerHTML = '<i class="fas fa-sign-out-alt"></i> Desconectar';
                }
            });
        }
    },

    /**
     * Carrega estatísticas do WhatsApp
     */
    async loadWhatsAppStats() {
        try {
            const response = await API.whatsapp.getStats();

            if (response.success && response.data) {
                const stats = response.data;

                const sentEl = document.getElementById('wa-messages-sent');
                if (sentEl) sentEl.textContent = Utils.formatNumber(stats.sent || 0);

                const receivedEl = document.getElementById('wa-messages-received');
                if (receivedEl) receivedEl.textContent = Utils.formatNumber(stats.received || 0);

                const autoEl = document.getElementById('wa-auto-responses');
                if (autoEl) autoEl.textContent = Utils.formatNumber(stats.autoResponses || stats.auto || 0);
            }
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
        }
    },

    /**
     * Inicializa página de configurações
     */
    async initSettingsPage() {
        try {
            // Carrega configurações atuais
            const response = await API.settings.get();

            if (response.success && response.data) {
                this.fillSettingsForm(response.data);
            }

            // Configura formulários
            this.setupSettingsForms();

        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            Toast.error('Erro ao carregar configurações');
        }
    },

    /**
     * Preenche formulários de configurações
     * @param {object} settings - Configurações
     */
    fillSettingsForm(settings) {
        // Loja
        if (settings.store) {
            document.getElementById('store-name').value = settings.store.name || '';
            document.getElementById('store-phone').value = settings.store.phone || '';
            document.getElementById('store-address').value = settings.store.address || '';
        }

        // Horário
        if (settings.schedule) {
            document.getElementById('schedule-start').value = settings.schedule.startTime || '08:00';
            document.getElementById('schedule-end').value = settings.schedule.endTime || '18:00';

            // Dias da semana
            const days = settings.schedule.workDays || [];
            document.querySelectorAll('#schedule-settings-form input[type="checkbox"]').forEach(cb => {
                cb.checked = days.includes(cb.value);
            });
        }

        // Bot
        if (settings.bot) {
            document.getElementById('bot-name').value = settings.bot.name || '';
            document.getElementById('bot-typing-delay').value = settings.bot.typingDelay || 1000;
            document.getElementById('bot-ai-enabled').checked = settings.bot.aiEnabled !== false;
        }

        // Conta
        if (Auth.user) {
            document.getElementById('account-name').value = Auth.getUserName();
            document.getElementById('account-email').value = Auth.getUserEmail();
        }
    },

    /**
     * Configura formulários de configurações
     */
    setupSettingsForms() {
        // Loja
        const storeForm = document.getElementById('store-settings-form');
        if (storeForm) {
            storeForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveStoreSettings();
            });
        }

        // Horário
        const scheduleForm = document.getElementById('schedule-settings-form');
        if (scheduleForm) {
            scheduleForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveScheduleSettings();
            });
        }

        // Bot
        const botForm = document.getElementById('bot-settings-form');
        if (botForm) {
            botForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveBotSettings();
            });
        }

        // Conta
        const accountForm = document.getElementById('account-settings-form');
        if (accountForm) {
            accountForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveAccountSettings();
            });
        }
    },

    /**
     * Salva configurações da loja
     */
    async saveStoreSettings() {
        try {
            const data = {
                name: document.getElementById('store-name').value,
                phone: document.getElementById('store-phone').value,
                address: document.getElementById('store-address').value
            };

            await API.settings.updateStore(data);
            Toast.success('Configurações da loja salvas!');
        } catch (error) {
            Toast.error('Erro ao salvar configurações');
        }
    },

    /**
     * Salva configurações de horário
     */
    async saveScheduleSettings() {
        try {
            const workDays = [];
            document.querySelectorAll('#schedule-settings-form input[type="checkbox"]:checked').forEach(cb => {
                workDays.push(cb.value);
            });

            const data = {
                startTime: document.getElementById('schedule-start').value,
                endTime: document.getElementById('schedule-end').value,
                workDays
            };

            await API.settings.updateSchedule(data);
            Toast.success('Horário de funcionamento salvo!');
        } catch (error) {
            Toast.error('Erro ao salvar horário');
        }
    },

    /**
     * Salva configurações do bot
     */
    async saveBotSettings() {
        try {
            const data = {
                name: document.getElementById('bot-name').value,
                typingDelay: parseInt(document.getElementById('bot-typing-delay').value) || 1000,
                aiEnabled: document.getElementById('bot-ai-enabled').checked
            };

            await API.settings.updateBot(data);
            Toast.success('Configurações do bot salvas!');
        } catch (error) {
            Toast.error('Erro ao salvar configurações do bot');
        }
    },

    /**
     * Salva configurações da conta
     */
    async saveAccountSettings() {
        try {
            const name = document.getElementById('account-name').value;
            const password = document.getElementById('account-password').value;

            // Atualiza nome
            if (name !== Auth.getUserName()) {
                await Auth.updateProfile({ nome: name });
            }

            // Atualiza senha se informada
            if (password) {
                // Solicita senha atual
                const currentPassword = await Modal.prompt(
                    'Confirmar Senha Atual',
                    '<input type="password" id="current-password" class="form-control" placeholder="Digite sua senha atual">',
                    {
                        confirmText: 'Confirmar',
                        getValue: () => document.getElementById('current-password')?.value
                    }
                );

                if (currentPassword) {
                    await Auth.changePassword(currentPassword, password);
                    document.getElementById('account-password').value = '';
                }
            }

            Toast.success('Conta atualizada!');
        } catch (error) {
            Toast.error(error.message || 'Erro ao atualizar conta');
        }
    },

    /**
     * Configura listeners globais
     */
    setupGlobalListeners() {
        // Login bem sucedido
        window.addEventListener('auth:login', () => {
            this.showApp();
            this.initializeApp();
        });

        // Logout
        window.addEventListener('auth:logout', () => {
            this.showLogin();
        });

        // Sessão expirada
        window.addEventListener('auth:expired', () => {
            Toast.error('Sessão expirada. Faça login novamente.');
        });

        // Navegação do histórico (botão voltar)
        window.addEventListener('popstate', (e) => {
            if (e.state?.page) {
                this.loadPage(e.state.page);
                this.updateActiveMenu(e.state.page);
                this.updatePageTitle(e.state.page);
                this.navParams = e.state.params || {};
            }
        });

        // Teclas de atalho
        document.addEventListener('keydown', (e) => {
            // Ctrl+K - Busca global
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                // Implementar busca global
            }

            // ESC - Fecha modais
            if (e.key === 'Escape') {
                Modal.close();
            }
        });

        // Visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                // Página voltou a ser visível - atualiza dados
                if (this.currentPage === 'conversations') {
                    Conversations.refresh();
                }
            }
        });
    },

    /**
     * Atualiza badge de mensagens não lidas
     */
    async updateUnreadBadge() {
        try {
            const badge = document.getElementById('unread-badge');
            if (!badge) return;

            // Conta mensagens não lidas
            const response = await API.conversations.list({ unreadOnly: true });
            
            if (response.success) {
                const count = response.total || 0;
                
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : count;
                    badge.style.display = 'inline-flex';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (error) {
            // Silencioso
        }
    },

    /**
     * Mostra notificação do sistema
     * @param {string} title - Título
     * @param {string} body - Corpo
     */
    showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: '/assets/icon.png'
            });
        }
    },

    /**
     * Solicita permissão para notificações
     */
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================

const Toast = {
    /**
     * Mostra toast
     * @param {string} type - Tipo (success, error, warning, info)
     * @param {string} message - Mensagem
     * @param {number} duration - Duração em ms
     */
    show(type, message, duration = 4000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const titles = {
            success: 'Sucesso',
            error: 'Erro',
            warning: 'Atenção',
            info: 'Informação'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">
                <i class="fas ${icons[type] || icons.info}"></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${titles[type] || 'Notificação'}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">
                <i class="fas fa-times"></i>
            </button>
        `;

        // Evento de fechar
        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.hide(toast);
        });

        container.appendChild(toast);

        // Auto-hide
        setTimeout(() => {
            this.hide(toast);
        }, duration);
    },

    hide(toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
        }, 300);
    },

    success(message, duration) {
        this.show('success', message, duration);
    },

    error(message, duration) {
        this.show('error', message, duration);
    },

    warning(message, duration) {
        this.show('warning', message, duration);
    },

    info(message, duration) {
        this.show('info', message, duration);
    }
};

// ============================================
// MODAL HELPER
// ============================================

const Modal = {
    currentModal: null,
    confirmCallback: null,

    /**
     * Mostra modal genérico
     * @param {string} title - Título
     * @param {string} content - Conteúdo HTML
     * @param {object} options - Opções
     */
    async show(title, content, options = {}) {
        return new Promise((resolve) => {
            // Cria modal
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-container ${options.size === 'lg' ? 'modal-lg' : options.size === 'sm' ? 'modal-sm' : ''}">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" data-close-modal>
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    ${options.buttons ? `
                        <div class="modal-footer">
                            ${options.buttons.map(btn => `
                                <button class="${btn.class || 'btn btn-outline'}" data-action="${btn.action ? 'custom' : 'close'}">
                                    ${btn.text}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;

            document.body.appendChild(modal);
            this.currentModal = modal;

            // Eventos
            modal.querySelector('.modal-overlay').addEventListener('click', () => {
                this.close();
                resolve(null);
            });

            modal.querySelector('.modal-close').addEventListener('click', () => {
                this.close();
                resolve(null);
            });

            // Botões customizados
            if (options.buttons) {
                modal.querySelectorAll('.modal-footer button').forEach((btn, index) => {
                    btn.addEventListener('click', async () => {
                        const buttonConfig = options.buttons[index];
                        if (buttonConfig.action) {
                            const result = await buttonConfig.action();
                            if (result !== false) {
                                this.close();
                                resolve(result);
                            }
                        } else {
                            this.close();
                            resolve(null);
                        }
                    });
                });
            }
        });
    },

    /**
     * Modal de confirmação
     * @param {string} title - Título
     * @param {string} message - Mensagem
     * @returns {Promise<boolean>}
     */
    async confirm(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal');
            if (!modal) {
                resolve(window.confirm(message));
                return;
            }

            const modalTitle = document.getElementById('confirm-modal-title');
            const modalMessage = document.getElementById('confirm-modal-message');
            const btnConfirm = document.getElementById('btn-confirm-action');

            if (modalTitle) modalTitle.textContent = title;
            if (modalMessage) modalMessage.innerHTML = message;

            modal.classList.add('active');
            this.currentModal = modal;

            // Callback de confirmação
            this.confirmCallback = resolve;

            // Evento do botão confirmar
            const handleConfirm = () => {
                modal.classList.remove('active');
                resolve(true);
                btnConfirm.removeEventListener('click', handleConfirm);
            };

            btnConfirm.addEventListener('click', handleConfirm);

            // Evento de fechar
            modal.querySelectorAll('[data-close-modal]').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.classList.remove('active');
                    resolve(false);
                }, { once: true });
            });

            modal.querySelector('.modal-overlay').addEventListener('click', () => {
                modal.classList.remove('active');
                resolve(false);
            }, { once: true });
        });
    },

    /**
     * Modal com prompt/input
     * @param {string} title - Título
     * @param {string} content - Conteúdo HTML
     * @param {object} options - Opções
     */
    async prompt(title, content, options = {}) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-container">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" data-close-modal>
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        ${content}
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-outline" data-close-modal>Cancelar</button>
                        <button class="btn btn-primary" id="prompt-confirm">${options.confirmText || 'Confirmar'}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.currentModal = modal;

            // Eventos de fechar
            modal.querySelector('.modal-overlay').addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });

            modal.querySelectorAll('[data-close-modal]').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.remove();
                    resolve(null);
                });
            });

            // Evento de confirmar
            modal.querySelector('#prompt-confirm').addEventListener('click', async () => {
                if (options.onConfirm) {
                    const result = await options.onConfirm();
                    if (result !== false) {
                        modal.remove();
                        resolve(result);
                    }
                } else if (options.getValue) {
                    const value = options.getValue();
                    modal.remove();
                    resolve(value);
                } else {
                    modal.remove();
                    resolve(true);
                }
            });

            // Foca no primeiro input
            setTimeout(() => {
                const input = modal.querySelector('input, textarea, select');
                if (input) input.focus();
            }, 100);
        });
    },

    /**
     * Fecha modal atual
     */
    close() {
        if (this.currentModal) {
            this.currentModal.classList.remove('active');
            
            // Remove se for modal dinâmico
            if (!this.currentModal.id) {
                setTimeout(() => {
                    this.currentModal.remove();
                }, 300);
            }
            
            this.currentModal = null;
        }
    }
};

// ============================================
// INICIALIZAÇÃO
// ============================================

// Aguarda DOM estar pronto
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Exporta para uso global
window.App = App;
window.Toast = Toast;
window.Modal = Modal;