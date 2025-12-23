/**
 * ============================================
 * CONVERSAS
 * Chat em tempo real com clientes
 * ============================================
 */

const Conversations = {
    // Dados carregados
    data: {
        conversations: [],
        currentChat: null,
        messages: [],
        selectedPhone: null
    },

    // Estado
    state: {
        loading: false,
        sending: false,
        loadingMessages: false
    },

    // Intervalo de atualização
    refreshInterval: null,

    // Scroll automático
    autoScroll: true,

    /**
     * Inicializa o módulo de conversas
     */
    async init() {
        console.log('💬 Inicializando Conversas...');

        // Carrega lista de conversas
        await this.loadConversations();

        // Configura eventos
        this.setupEventListeners();

        // Configura Socket.IO para tempo real
        this.setupSocketEvents();

        // Verifica se há telefone nos parâmetros
        const params = Utils.getUrlParams();
        if (params.phone) {
            this.selectConversation(params.phone);
        }

        // Inicia atualização automática
        this.startAutoRefresh();
    },

    /**
     * Carrega lista de conversas
     */
    async loadConversations() {
        const container = document.getElementById('conversations-items');
        if (!container) return;

        if (this.state.loading) return;
        this.state.loading = true;

        // Mostra loading apenas se não tiver dados
        if (this.data.conversations.length === 0) {
            container.innerHTML = `
                <div class="loading-placeholder">
                    <i class="fas fa-spinner fa-spin"></i>
                    Carregando conversas...
                </div>
            `;
        }

        try {
            const response = await API.conversations.list({ limit: 50 });

            if (response.success) {
                this.data.conversations = response.data || [];
                this.renderConversationsList();
            }
        } catch (error) {
            console.error('Erro ao carregar conversas:', error);
            if (this.data.conversations.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-comments"></i>
                        <p>Erro ao carregar conversas</p>
                    </div>
                `;
            }
        } finally {
            this.state.loading = false;
        }
    },

    /**
     * Renderiza lista de conversas
     */
    renderConversationsList() {
        const container = document.getElementById('conversations-items');
        if (!container) return;

        const conversations = this.data.conversations;

        if (!conversations || conversations.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px; text-align: center;">
                    <i class="fas fa-comments" style="font-size: 3rem; opacity: 0.3; margin-bottom: 15px;"></i>
                    <p>Nenhuma conversa ainda</p>
                    <small class="text-muted">As conversas aparecerão aqui quando os clientes entrarem em contato</small>
                </div>
            `;
            return;
        }

        container.innerHTML = conversations.map(conv => this.renderConversationItem(conv)).join('');

        // Adiciona eventos de clique
        container.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                const phone = item.dataset.phone;
                this.selectConversation(phone);
            });
        });

        // Marca conversa atual como ativa
        if (this.data.selectedPhone) {
            const activeItem = container.querySelector(`[data-phone="${this.data.selectedPhone}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
            }
        }
    },

    /**
     * Renderiza um item da lista de conversas
     * @param {object} conv - Dados da conversa
     * @returns {string} HTML do item
     */
    renderConversationItem(conv) {
        const name = conv.nome || conv.name || 'Cliente';
        const phone = conv.telefone || conv.phone || '';
        const lastMessage = conv.ultima_mensagem || conv.lastMessage || '';
        const lastTime = conv.ultima_interacao || conv.lastInteraction || conv.updated_at;
        const unread = conv.nao_lidas || conv.unread || 0;
        const isOnline = conv.online || false;
        const inAttendance = conv.em_atendimento || conv.inAttendance || false;

        const avatarColor = Utils.stringToColor(name);
        const initials = Utils.getInitials(name);
        const isActive = this.data.selectedPhone === phone;

        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${inAttendance ? 'in-attendance' : ''}" 
                 data-phone="${phone}" data-id="${conv.id || ''}">
                <div class="conversation-avatar ${isOnline ? 'online' : ''}" style="background-color: ${avatarColor}">
                    ${initials}
                </div>
                <div class="conversation-info">
                    <div class="conversation-name">
                        ${Utils.escapeHtml(name)}
                        ${inAttendance ? '<i class="fas fa-headset text-primary" title="Em atendimento"></i>' : ''}
                    </div>
                    <div class="conversation-preview">${Utils.escapeHtml(Utils.truncate(lastMessage, 35))}</div>
                </div>
                <div class="conversation-meta">
                    <div class="conversation-time">${Utils.formatRelativeDate(lastTime)}</div>
                    ${unread > 0 ? `<div class="conversation-unread">${unread}</div>` : ''}
                </div>
            </div>
        `;
    },

    /**
     * Seleciona uma conversa
     * @param {string} phone - Telefone do cliente
     */
    async selectConversation(phone) {
        if (!phone) return;

        this.data.selectedPhone = phone;

        // Atualiza visual da lista
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.toggle('active', item.dataset.phone === phone);
        });

        // Carrega mensagens
        await this.loadMessages(phone);

        // Mostra área de chat (mobile)
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            chatContainer.classList.add('active');
        }
    },

    /**
     * Carrega mensagens de uma conversa
     * @param {string} phone - Telefone do cliente
     */
    async loadMessages(phone) {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;

        if (this.state.loadingMessages) return;
        this.state.loadingMessages = true;

        // Mostra loading
        chatContainer.innerHTML = `
            <div class="chat-placeholder">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Carregando mensagens...</p>
            </div>
        `;

        try {
            // Busca dados da conversa
            const convResponse = await API.conversations.getByPhone(phone);
            
            if (convResponse.success) {
                this.data.currentChat = convResponse.data;
            }

            // Busca mensagens
            const msgResponse = await API.conversations.getMessages(phone, { limit: 100 });

            if (msgResponse.success) {
                this.data.messages = msgResponse.data || [];
                this.renderChat();
            }
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            chatContainer.innerHTML = `
                <div class="chat-placeholder">
                    <i class="fas fa-exclamation-circle text-danger"></i>
                    <p>Erro ao carregar mensagens</p>
                    <button class="btn btn-primary btn-sm" onclick="Conversations.loadMessages('${phone}')">
                        Tentar novamente
                    </button>
                </div>
            `;
        } finally {
            this.state.loadingMessages = false;
        }
    },

    /**
     * Renderiza área de chat completa
     */
    renderChat() {
        const chatContainer = document.getElementById('chat-container');
        if (!chatContainer) return;

        const chat = this.data.currentChat;
        const messages = this.data.messages;
        const phone = this.data.selectedPhone;

        if (!chat && !phone) {
            chatContainer.innerHTML = `
                <div class="chat-placeholder">
                    <i class="fas fa-comments"></i>
                    <p>Selecione uma conversa para visualizar</p>
                </div>
            `;
            return;
        }

        const name = chat?.nome || chat?.name || Utils.formatPhone(phone);
        const avatarColor = Utils.stringToColor(name);
        const initials = Utils.getInitials(name);
        const isOnline = chat?.online || false;
        const inAttendance = chat?.em_atendimento || chat?.inAttendance || false;

        chatContainer.innerHTML = `
            <!-- Header do Chat -->
            <div class="chat-header">
                <div class="chat-header-info">
                    <button class="btn-icon-only btn-back-mobile" onclick="Conversations.closeChat()">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <div class="chat-header-avatar" style="background-color: ${avatarColor}">
                        ${initials}
                    </div>
                    <div>
                        <div class="chat-header-name">${Utils.escapeHtml(name)}</div>
                        <div class="chat-header-status">
                            ${isOnline ? '<span class="text-success"><i class="fas fa-circle"></i> Online</span>' : 
                              inAttendance ? '<span class="text-primary"><i class="fas fa-headset"></i> Em atendimento</span>' :
                              '<span class="text-muted">Offline</span>'}
                        </div>
                    </div>
                </div>
                <div class="chat-header-actions">
                    ${inAttendance ? `
                        <button class="btn btn-sm btn-outline btn-finish-attendance" onclick="Conversations.finishAttendance()">
                            <i class="fas fa-check"></i> Finalizar
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-primary btn-start-attendance" onclick="Conversations.startAttendance()">
                            <i class="fas fa-headset"></i> Assumir
                        </button>
                    `}
                    <button class="btn-icon-only" onclick="Conversations.openCustomerInfo()" title="Info do cliente">
                        <i class="fas fa-info-circle"></i>
                    </button>
                    <button class="btn-icon-only" onclick="Conversations.openWhatsApp('${phone}')" title="Abrir WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            </div>

            <!-- Mensagens -->
            <div class="chat-messages" id="chat-messages">
                ${this.renderMessages()}
            </div>

            <!-- Input de mensagem -->
            <div class="chat-input">
                <button class="btn-icon-only btn-emoji" title="Emojis">
                    <i class="fas fa-smile"></i>
                </button>
                <input 
                    type="text" 
                    id="message-input" 
                    placeholder="Digite uma mensagem..."
                    autocomplete="off"
                >
                <button class="btn-send" id="btn-send-message" title="Enviar">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        `;

        // Configura eventos do chat
        this.setupChatEvents();

        // Scroll para última mensagem
        this.scrollToBottom();
    },

    /**
     * Renderiza mensagens do chat
     * @returns {string} HTML das mensagens
     */
    renderMessages() {
        const messages = this.data.messages;

        if (!messages || messages.length === 0) {
            return `
                <div class="chat-empty">
                    <i class="fas fa-comment-dots"></i>
                    <p>Nenhuma mensagem ainda</p>
                </div>
            `;
        }

        // Agrupa mensagens por data
        const groupedMessages = this.groupMessagesByDate(messages);
        let html = '';

        for (const [date, msgs] of Object.entries(groupedMessages)) {
            html += `<div class="message-date-separator"><span>${date}</span></div>`;
            
            msgs.forEach(msg => {
                html += this.renderMessage(msg);
            });
        }

        return html;
    },

    /**
     * Agrupa mensagens por data
     * @param {array} messages - Lista de mensagens
     * @returns {object} Mensagens agrupadas
     */
    groupMessagesByDate(messages) {
        const groups = {};
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        messages.forEach(msg => {
            const msgDate = new Date(msg.timestamp || msg.created_at || msg.data);
            const dateString = msgDate.toDateString();
            
            let label;
            if (dateString === today) {
                label = 'Hoje';
            } else if (dateString === yesterday) {
                label = 'Ontem';
            } else {
                label = msgDate.toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long',
                    year: msgDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                });
            }

            if (!groups[label]) {
                groups[label] = [];
            }
            groups[label].push(msg);
        });

        return groups;
    },

    /**
     * Renderiza uma mensagem
     * @param {object} msg - Dados da mensagem
     * @returns {string} HTML da mensagem
     */
    renderMessage(msg) {
        const isOutgoing = msg.tipo === 'saida' || msg.type === 'outgoing' || msg.fromMe;
        const isBot = msg.origem === 'bot' || msg.source === 'bot';
        const isHuman = msg.origem === 'humano' || msg.source === 'human';
        const text = msg.mensagem || msg.message || msg.text || '';
        const time = new Date(msg.timestamp || msg.created_at || msg.data);
        const timeStr = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // Classe da mensagem
        let msgClass = isOutgoing ? 'outgoing' : 'incoming';
        
        // Indicador de quem enviou (bot ou humano)
        let senderBadge = '';
        if (isOutgoing) {
            if (isBot) {
                senderBadge = '<span class="message-sender-badge bot"><i class="fas fa-robot"></i> Bot</span>';
            } else if (isHuman) {
                senderBadge = '<span class="message-sender-badge human"><i class="fas fa-user"></i> Atendente</span>';
            }
        }

        // Processa texto para links e formatação
        const processedText = this.processMessageText(text);

        return `
            <div class="message ${msgClass}">
                ${senderBadge}
                <div class="message-text">${processedText}</div>
                <div class="message-time">
                    ${timeStr}
                    ${isOutgoing ? '<i class="fas fa-check-double"></i>' : ''}
                </div>
            </div>
        `;
    },

    /**
     * Processa texto da mensagem (links, formatação)
     * @param {string} text - Texto original
     * @returns {string} Texto processado
     */
    processMessageText(text) {
        if (!text) return '';

        // Escapa HTML
        let processed = Utils.escapeHtml(text);

        // Converte URLs em links
        processed = processed.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );

        // Converte *texto* em negrito
        processed = processed.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');

        // Converte _texto_ em itálico
        processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');

        // Converte ~texto~ em riscado
        processed = processed.replace(/~([^~]+)~/g, '<del>$1</del>');

        // Converte ```texto``` em código
        processed = processed.replace(/```([^`]+)```/g, '<code>$1</code>');

        // Converte quebras de linha
        processed = processed.replace(/\n/g, '<br>');

        return processed;
    },

    /**
     * Configura eventos do chat
     */
    setupChatEvents() {
        const input = document.getElementById('message-input');
        const btnSend = document.getElementById('btn-send-message');

        if (input) {
            // Enter para enviar
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // Foca no input
            input.focus();
        }

        if (btnSend) {
            btnSend.addEventListener('click', () => this.sendMessage());
        }

        // Scroll para detectar se usuário está no final
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.addEventListener('scroll', () => {
                const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
                this.autoScroll = scrollHeight - scrollTop - clientHeight < 100;
            });
        }
    },

    /**
     * Envia mensagem
     */
    async sendMessage() {
        const input = document.getElementById('message-input');
        if (!input) return;

        const message = input.value.trim();
        if (!message) return;

        if (this.state.sending) return;
        this.state.sending = true;

        const phone = this.data.selectedPhone;
        if (!phone) {
            Toast.error('Nenhuma conversa selecionada');
            this.state.sending = false;
            return;
        }

        // Limpa input
        input.value = '';

        // Adiciona mensagem temporária na UI
        this.addTempMessage(message);

        try {
            const response = await API.whatsapp.sendMessage(phone, message);

            if (response.success) {
                // Atualiza mensagem temporária para confirmada
                this.confirmTempMessage();
            } else {
                throw new Error(response.message || 'Erro ao enviar mensagem');
            }
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            Toast.error('Erro ao enviar mensagem');
            
            // Remove mensagem temporária ou marca como erro
            this.markTempMessageError();
        } finally {
            this.state.sending = false;
            input.focus();
        }
    },

    /**
     * Adiciona mensagem temporária na UI
     * @param {string} message - Texto da mensagem
     */
    addTempMessage(message) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const msgHtml = `
            <div class="message outgoing temp-message">
                <span class="message-sender-badge human"><i class="fas fa-user"></i> Você</span>
                <div class="message-text">${this.processMessageText(message)}</div>
                <div class="message-time">
                    ${time}
                    <i class="fas fa-clock sending-indicator"></i>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', msgHtml);
        this.scrollToBottom();
    },

    /**
     * Confirma mensagem temporária
     */
    confirmTempMessage() {
        const tempMsg = document.querySelector('.temp-message');
        if (tempMsg) {
            tempMsg.classList.remove('temp-message');
            const indicator = tempMsg.querySelector('.sending-indicator');
            if (indicator) {
                indicator.classList.remove('fa-clock');
                indicator.classList.add('fa-check-double');
            }
        }
    },

    /**
     * Marca mensagem temporária como erro
     */
    markTempMessageError() {
        const tempMsg = document.querySelector('.temp-message');
        if (tempMsg) {
            tempMsg.classList.add('error');
            const indicator = tempMsg.querySelector('.sending-indicator');
            if (indicator) {
                indicator.classList.remove('fa-clock');
                indicator.classList.add('fa-exclamation-circle', 'text-danger');
            }
        }
    },

    /**
     * Scroll para última mensagem
     */
    scrollToBottom() {
        if (!this.autoScroll) return;

        const container = document.getElementById('chat-messages');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    },

    /**
     * Fecha chat (mobile)
     */
    closeChat() {
        const chatContainer = document.getElementById('chat-container');
        if (chatContainer) {
            chatContainer.classList.remove('active');
        }
        this.data.selectedPhone = null;
        this.data.currentChat = null;
        this.data.messages = [];

        // Remove seleção da lista
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
    },

    /**
     * Inicia atendimento
     */
    async startAttendance() {
        const phone = this.data.selectedPhone;
        if (!phone) return;

        try {
            const response = await API.conversations.startAttendance(phone);

            if (response.success) {
                Toast.success('Atendimento iniciado!');
                
                // Atualiza UI
                if (this.data.currentChat) {
                    this.data.currentChat.em_atendimento = true;
                }
                this.renderChat();
                this.loadConversations();

                // Notifica via Socket
                if (typeof Socket !== 'undefined') {
                    Socket.emit('attendance:start', {
                        phone,
                        userId: Auth.getUserId(),
                        userName: Auth.getUserName()
                    });
                }
            } else {
                throw new Error(response.message || 'Erro ao iniciar atendimento');
            }
        } catch (error) {
            console.error('Erro ao iniciar atendimento:', error);
            Toast.error(error.message || 'Erro ao iniciar atendimento');
        }
    },

    /**
     * Finaliza atendimento
     */
    async finishAttendance() {
        const phone = this.data.selectedPhone;
        if (!phone) return;

        const notes = await Modal.prompt(
            'Finalizar Atendimento',
            `
                <div class="form-group">
                    <label>Observações (opcional)</label>
                    <textarea id="attendance-notes" class="form-control" rows="3" 
                        placeholder="Adicione observações sobre o atendimento..."></textarea>
                </div>
            `,
            {
                confirmText: 'Finalizar',
                onConfirm: async () => {
                    const notesValue = document.getElementById('attendance-notes')?.value || '';
                    
                    try {
                        const response = await API.conversations.finishAttendance(phone, notesValue);

                        if (response.success) {
                            Toast.success('Atendimento finalizado!');
                            
                            // Atualiza UI
                            if (this.data.currentChat) {
                                this.data.currentChat.em_atendimento = false;
                            }
                            this.renderChat();
                            this.loadConversations();

                            // Notifica via Socket
                            if (typeof Socket !== 'undefined') {
                                Socket.emit('attendance:finish', { phone });
                            }

                            return true;
                        } else {
                            throw new Error(response.message || 'Erro ao finalizar atendimento');
                        }
                    } catch (error) {
                        Toast.error(error.message || 'Erro ao finalizar atendimento');
                        return false;
                    }
                }
            }
        );
    },

    /**
     * Abre informações do cliente
     */
    openCustomerInfo() {
        const chat = this.data.currentChat;
        const phone = this.data.selectedPhone;

        if (chat?.cliente_id || chat?.customerId) {
            Customers.viewCustomerDetails(chat.cliente_id || chat.customerId);
        } else if (phone) {
            // Busca cliente pelo telefone
            const customer = Customers.findByPhone(phone);
            if (customer) {
                Customers.viewCustomerDetails(customer.id);
            } else {
                Toast.info('Cliente não encontrado no sistema');
            }
        }
    },

    /**
     * Abre WhatsApp Web
     * @param {string} phone - Telefone
     */
    openWhatsApp(phone) {
        if (!phone) return;
        
        const cleanPhone = phone.replace(/\D/g, '');
        const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        window.open(`https://wa.me/${fullPhone}`, '_blank');
    },

    /**
     * Configura event listeners gerais
     */
    setupEventListeners() {
        // Busca de conversas
        const searchInput = document.getElementById('conversations-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.filterConversations(e.target.value);
            }, 300));
        }
    },

    /**
     * Filtra conversas localmente
     * @param {string} query - Termo de busca
     */
    filterConversations(query) {
        const container = document.getElementById('conversations-items');
        if (!container) return;

        const items = container.querySelectorAll('.conversation-item');
        const queryLower = query.toLowerCase();

        items.forEach(item => {
            const name = item.querySelector('.conversation-name')?.textContent.toLowerCase() || '';
            const phone = item.dataset.phone || '';
            const preview = item.querySelector('.conversation-preview')?.textContent.toLowerCase() || '';

            const matches = name.includes(queryLower) || 
                           phone.includes(query) || 
                           preview.includes(queryLower);

            item.style.display = matches ? '' : 'none';
        });
    },

    /**
     * Configura eventos do Socket.IO
     */
    setupSocketEvents() {
        if (typeof Socket === 'undefined') return;

        // Nova mensagem recebida
        Socket.on('message:received', (data) => {
            this.onMessageReceived(data);
        });

        // Mensagem enviada (de outro admin)
        Socket.on('message:sent', (data) => {
            this.onMessageSent(data);
        });

        // Atendimento iniciado
        Socket.on('attendance:started', (data) => {
            this.onAttendanceStarted(data);
        });

        // Atendimento finalizado
        Socket.on('attendance:finished', (data) => {
            this.onAttendanceFinished(data);
        });

        // Cliente digitando
        Socket.on('customer:typing', (data) => {
            this.onCustomerTyping(data);
        });
    },

    /**
     * Callback para mensagem recebida
     * @param {object} data - Dados da mensagem
     */
    onMessageReceived(data) {
        const { phone, text, pushName, timestamp } = data;

        // Atualiza lista de conversas
        this.updateConversationInList(phone, text, timestamp, true);

        // Se for a conversa atual, adiciona mensagem
        if (this.data.selectedPhone === phone) {
            const msg = {
                tipo: 'entrada',
                mensagem: text,
                timestamp: timestamp || new Date().toISOString()
            };
            
            this.data.messages.push(msg);
            
            const container = document.getElementById('chat-messages');
            if (container) {
                container.insertAdjacentHTML('beforeend', this.renderMessage(msg));
                this.scrollToBottom();
            }
        }

        // Notificação sonora (se não for a conversa atual)
        if (this.data.selectedPhone !== phone) {
            this.playNotificationSound();
        }
    },

    /**
     * Callback para mensagem enviada
     * @param {object} data - Dados da mensagem
     */
    onMessageSent(data) {
        const { phone, text, timestamp } = data;

        // Atualiza lista
        this.updateConversationInList(phone, text, timestamp, false);
    },

    /**
     * Atualiza conversa na lista
     */
    updateConversationInList(phone, message, timestamp, isIncoming) {
        // Encontra conversa na lista
        const convIndex = this.data.conversations.findIndex(c => 
            (c.telefone || c.phone) === phone
        );

        if (convIndex >= 0) {
            // Atualiza
            this.data.conversations[convIndex].ultima_mensagem = message;
            this.data.conversations[convIndex].ultima_interacao = timestamp;
            if (isIncoming && this.data.selectedPhone !== phone) {
                this.data.conversations[convIndex].nao_lidas = 
                    (this.data.conversations[convIndex].nao_lidas || 0) + 1;
            }

            // Move para o topo
            const conv = this.data.conversations.splice(convIndex, 1)[0];
            this.data.conversations.unshift(conv);
        }

        // Re-renderiza lista
        this.renderConversationsList();
    },

    /**
     * Callback para atendimento iniciado
     */
    onAttendanceStarted(data) {
        if (data.phone === this.data.selectedPhone) {
            Toast.info(`${data.userName} assumiu este atendimento`);
            this.loadMessages(data.phone);
        }
        this.loadConversations();
    },

    /**
     * Callback para atendimento finalizado
     */
    onAttendanceFinished(data) {
        if (data.phone === this.data.selectedPhone) {
            Toast.info('Atendimento finalizado');
            this.loadMessages(data.phone);
        }
        this.loadConversations();
    },

    /**
     * Callback para cliente digitando
     */
    onCustomerTyping(data) {
        if (data.phone === this.data.selectedPhone) {
            // Mostra indicador de digitação
            const statusEl = document.querySelector('.chat-header-status');
            if (statusEl) {
                statusEl.innerHTML = '<span class="text-success"><i class="fas fa-keyboard"></i> Digitando...</span>';
                
                // Remove após 3 segundos
                setTimeout(() => {
                    if (this.data.currentChat) {
                        const isOnline = this.data.currentChat.online;
                        statusEl.innerHTML = isOnline ? 
                            '<span class="text-success"><i class="fas fa-circle"></i> Online</span>' :
                            '<span class="text-muted">Offline</span>';
                    }
                }, 3000);
            }
        }
    },

    /**
     * Toca som de notificação
     */
    playNotificationSound() {
        try {
            // Cria elemento de áudio
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleCAY7pmsqsKlkY2DfX19ho6Rko6JhIB5c29saWdnaWprbnF1eX2Bg4WHh4iIh4eFgn5.');
            audio.volume = 0.5;
            audio.play().catch(() => {});
        } catch (e) {
            // Ignora erros de áudio
        }
    },

    /**
     * Inicia atualização automática
     */
    startAutoRefresh() {
        this.stopAutoRefresh();
        
        // Atualiza lista a cada 30 segundos
        this.refreshInterval = setInterval(() => {
            this.loadConversations();
        }, 30000);
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
     * Recarrega dados
     */
    async refresh() {
        await this.loadConversations();
        if (this.data.selectedPhone) {
            await this.loadMessages(this.data.selectedPhone);
        }
    },

    /**
     * Cleanup ao sair da página
     */
    destroy() {
        this.stopAutoRefresh();
        this.data = {
            conversations: [],
            currentChat: null,
            messages: [],
            selectedPhone: null
        };
        this.state = {
            loading: false,
            sending: false,
            loadingMessages: false
        };
    }
};

// Exporta para uso global
window.Conversations = Conversations;