/**
 * ============================================
 * PRODUTOS
 * CRUD completo de produtos
 * ============================================
 */

const Products = {
    // Dados carregados
    data: {
        products: [],
        categories: [],
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
        categoria: '',
        ativo: ''
    },

    // Produto sendo editado
    currentProduct: null,

    /**
     * Inicializa o módulo de produtos
     */
    async init() {
        console.log('📦 Inicializando Produtos...');

        // Carrega categorias
        await this.loadCategories();

        // Carrega produtos
        await this.loadProducts();

        // Configura eventos
        this.setupEventListeners();
    },

    /**
     * Carrega lista de categorias
     */
    async loadCategories() {
        try {
            const response = await API.categories.list();

            if (response.success) {
                this.data.categories = response.data || [];
                this.populateCategorySelects();
            }
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
            this.data.categories = [];
        }
    },

    /**
     * Popula selects de categoria
     */
    populateCategorySelects() {
        const categories = this.data.categories;

        // Select do filtro
        const filterSelect = document.getElementById('products-category-filter');
        if (filterSelect) {
            filterSelect.innerHTML = `
                <option value="">Todas as categorias</option>
                ${categories.map(cat => `
                    <option value="${cat.id}">${Utils.escapeHtml(cat.nome || cat.name)}</option>
                `).join('')}
            `;
        }

        // Select do formulário
        const formSelect = document.getElementById('product-category');
        if (formSelect) {
            formSelect.innerHTML = `
                <option value="">Selecione...</option>
                ${categories.map(cat => `
                    <option value="${cat.id}">${Utils.escapeHtml(cat.nome || cat.name)}</option>
                `).join('')}
            `;
        }
    },

    /**
     * Carrega lista de produtos
     */
    async loadProducts() {
        const tbody = document.getElementById('products-tbody');
        if (!tbody) return;

        // Mostra loading
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="loading-cell">
                    <i class="fas fa-spinner fa-spin"></i>
                    Carregando produtos...
                </td>
            </tr>
        `;

        try {
            const params = {
                page: this.data.pagination.page,
                limit: this.data.pagination.limit,
                search: this.filters.search,
                categoria: this.filters.categoria,
                ativo: this.filters.ativo
            };

            const response = await API.products.list(params);

            if (response.success) {
                this.data.products = response.data || [];
                this.data.pagination = {
                    page: response.page || 1,
                    limit: response.limit || 20,
                    total: response.total || 0,
                    totalPages: response.totalPages || 1
                };

                this.renderProducts();
                this.renderPagination();
            }
        } catch (error) {
            console.error('Erro ao carregar produtos:', error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        <i class="fas fa-exclamation-circle text-danger"></i>
                        Erro ao carregar produtos
                    </td>
                </tr>
            `;
        }
    },

    /**
     * Renderiza tabela de produtos
     */
    renderProducts() {
        const tbody = document.getElementById('products-tbody');
        if (!tbody) return;

        const products = this.data.products;

        if (!products || products.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-cell">
                        <i class="fas fa-box-open"></i>
                        <p>Nenhum produto encontrado</p>
                        <button class="btn btn-primary btn-sm" id="btn-add-product-empty">
                            <i class="fas fa-plus"></i> Adicionar Produto
                        </button>
                    </td>
                </tr>
            `;

            // Evento do botão
            const btnAdd = document.getElementById('btn-add-product-empty');
            if (btnAdd) {
                btnAdd.addEventListener('click', () => this.openModal());
            }
            return;
        }

        tbody.innerHTML = products.map(product => this.renderProductRow(product)).join('');

        // Adiciona eventos aos botões
        this.setupRowEvents();
    },

    /**
     * Renderiza uma linha da tabela
     * @param {object} product - Dados do produto
     * @returns {string} HTML da linha
     */
    renderProductRow(product) {
        const isLowStock = (product.quantidade || 0) <= (product.quantidade_minima || 5);
        const hasPromotion = product.preco_promocional && product.preco_promocional < product.preco;

        // Encontra nome da categoria
        const category = this.data.categories.find(c => c.id === product.categoria_id);
        const categoryName = category ? (category.nome || category.name) : '-';

        return `
            <tr data-id="${product.id}">
                <td>
                    <code>${Utils.escapeHtml(product.codigo || product.code || '-')}</code>
                </td>
                <td>
                    <div class="product-cell">
                        <div class="product-image">
                            ${product.imagem 
                                ? `<img src="${product.imagem}" alt="${product.nome}">`
                                : `<i class="fas fa-box"></i>`
                            }
                        </div>
                        <div class="product-info">
                            <div class="product-name">${Utils.escapeHtml(product.nome || product.name)}</div>
                            ${product.marca ? `<div class="product-code">${Utils.escapeHtml(product.marca)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${Utils.escapeHtml(categoryName)}</td>
                <td>
                    ${hasPromotion 
                        ? `<span class="price-old">${Utils.formatCurrency(product.preco)}</span>
                           <span class="price">${Utils.formatCurrency(product.preco_promocional)}</span>`
                        : `<span class="price">${Utils.formatCurrency(product.preco || product.price)}</span>`
                    }
                </td>
                <td>
                    <span class="${isLowStock ? 'stock-low' : 'stock-ok'}">
                        ${product.quantidade || product.stock || 0} un
                    </span>
                </td>
                <td>
                    <div class="status-badges">
                        ${product.ativo !== false 
                            ? `<span class="status-badge active"><i class="fas fa-check"></i> Ativo</span>`
                            : `<span class="status-badge inactive"><i class="fas fa-times"></i> Inativo</span>`
                        }
                        ${product.destaque 
                            ? `<span class="status-badge featured"><i class="fas fa-star"></i></span>`
                            : ''
                        }
                        ${isLowStock 
                            ? `<span class="status-badge low-stock"><i class="fas fa-exclamation"></i></span>`
                            : ''
                        }
                    </div>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="btn-icon-only btn-edit" title="Editar" data-id="${product.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon-only btn-stock" title="Ajustar Estoque" data-id="${product.id}">
                            <i class="fas fa-boxes"></i>
                        </button>
                        <button class="btn-icon-only btn-danger btn-delete" title="Excluir" data-id="${product.id}">
                            <i class="fas fa-trash"></i>
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
        // Botões de editar
        document.querySelectorAll('#products-tbody .btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.editProduct(id);
            });
        });

        // Botões de estoque
        document.querySelectorAll('#products-tbody .btn-stock').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.adjustStock(id);
            });
        });

        // Botões de excluir
        document.querySelectorAll('#products-tbody .btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                this.deleteProduct(id);
            });
        });

        // Clique na linha para editar
        document.querySelectorAll('#products-tbody tr[data-id]').forEach(row => {
            row.addEventListener('dblclick', () => {
                const id = row.dataset.id;
                this.editProduct(id);
            });
        });
    },

    /**
     * Renderiza paginação
     */
    renderPagination() {
        const container = document.getElementById('products-pagination');
        if (!container) return;

        const { page, totalPages, total } = this.data.pagination;

        if (totalPages <= 1) {
            container.innerHTML = '';
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
                ${total} produto(s)
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
        this.loadProducts();
    },

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Botão adicionar produto
        const btnAdd = document.getElementById('btn-add-product');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => this.openModal());
        }

        // Campo de busca
        const searchInput = document.getElementById('products-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce((e) => {
                this.filters.search = e.target.value;
                this.data.pagination.page = 1;
                this.loadProducts();
            }, 300));
        }

        // Filtro de categoria
        const categoryFilter = document.getElementById('products-category-filter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => {
                this.filters.categoria = e.target.value;
                this.data.pagination.page = 1;
                this.loadProducts();
            });
        }

        // Botão salvar produto
        const btnSave = document.getElementById('btn-save-product');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.saveProduct());
        }

        // Formulário (enter para salvar)
        const form = document.getElementById('product-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveProduct();
            });
        }

        // Fechar modal
        document.querySelectorAll('#product-modal [data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        // Fechar modal clicando no overlay
        const modalOverlay = document.querySelector('#product-modal .modal-overlay');
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
     * Abre modal de produto
     * @param {object} product - Produto para edição (opcional)
     */
    openModal(product = null) {
        const modal = document.getElementById('product-modal');
        const title = document.getElementById('product-modal-title');
        const form = document.getElementById('product-form');

        if (!modal || !form) return;

        // Limpa formulário
        form.reset();
        this.currentProduct = product;

        if (product) {
            // Modo edição
            title.textContent = 'Editar Produto';
            this.fillForm(product);
        } else {
            // Modo criação
            title.textContent = 'Novo Produto';
            document.getElementById('product-id').value = '';
            document.getElementById('product-active').checked = true;
        }

        // Mostra modal
        modal.classList.add('active');

        // Foca no primeiro campo
        setTimeout(() => {
            document.getElementById('product-code').focus();
        }, 100);
    },

    /**
     * Fecha modal de produto
     */
    closeModal() {
        const modal = document.getElementById('product-modal');
        if (modal) {
            modal.classList.remove('active');
            this.currentProduct = null;
        }
    },

    /**
     * Preenche formulário com dados do produto
     * @param {object} product - Dados do produto
     */
    fillForm(product) {
        document.getElementById('product-id').value = product.id || '';
        document.getElementById('product-code').value = product.codigo || product.code || '';
        document.getElementById('product-name').value = product.nome || product.name || '';
        document.getElementById('product-description').value = product.descricao || product.description || '';
        document.getElementById('product-category').value = product.categoria_id || product.categoryId || '';
        document.getElementById('product-price').value = product.preco || product.price || '';
        document.getElementById('product-sale-price').value = product.preco_promocional || product.salePrice || '';
        document.getElementById('product-stock').value = product.quantidade || product.stock || 0;
        document.getElementById('product-min-stock').value = product.quantidade_minima || product.minStock || 5;
        document.getElementById('product-brand').value = product.marca || product.brand || '';
        document.getElementById('product-vehicles').value = product.veiculos_compativeis || product.vehicles || '';
        document.getElementById('product-featured').checked = product.destaque || false;
        document.getElementById('product-active').checked = product.ativo !== false;
    },

    /**
     * Obtém dados do formulário
     * @returns {object} Dados do produto
     */
    getFormData() {
        return {
            id: document.getElementById('product-id').value || null,
            codigo: document.getElementById('product-code').value.trim(),
            nome: document.getElementById('product-name').value.trim(),
            descricao: document.getElementById('product-description').value.trim(),
            categoria_id: document.getElementById('product-category').value || null,
            preco: parseFloat(document.getElementById('product-price').value) || 0,
            preco_promocional: parseFloat(document.getElementById('product-sale-price').value) || null,
            quantidade: parseInt(document.getElementById('product-stock').value) || 0,
            quantidade_minima: parseInt(document.getElementById('product-min-stock').value) || 5,
            marca: document.getElementById('product-brand').value.trim(),
            veiculos_compativeis: document.getElementById('product-vehicles').value.trim(),
            destaque: document.getElementById('product-featured').checked,
            ativo: document.getElementById('product-active').checked
        };
    },

    /**
     * Valida dados do formulário
     * @param {object} data - Dados do produto
     * @returns {boolean} É válido
     */
    validateForm(data) {
        if (!data.codigo) {
            Toast.error('Código é obrigatório');
            document.getElementById('product-code').focus();
            return false;
        }

        if (!data.nome) {
            Toast.error('Nome é obrigatório');
            document.getElementById('product-name').focus();
            return false;
        }

        if (!data.preco || data.preco <= 0) {
            Toast.error('Preço deve ser maior que zero');
            document.getElementById('product-price').focus();
            return false;
        }

        if (data.preco_promocional && data.preco_promocional >= data.preco) {
            Toast.error('Preço promocional deve ser menor que o preço normal');
            document.getElementById('product-sale-price').focus();
            return false;
        }

        if (data.quantidade < 0) {
            Toast.error('Quantidade não pode ser negativa');
            document.getElementById('product-stock').focus();
            return false;
        }

        return true;
    },

    /**
     * Salva produto (criar ou atualizar)
     */
    async saveProduct() {
        const data = this.getFormData();

        // Valida
        if (!this.validateForm(data)) return;

        const btnSave = document.getElementById('btn-save-product');
        const originalText = btnSave.innerHTML;

        try {
            // Desabilita botão
            btnSave.disabled = true;
            btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

            let response;

            if (data.id) {
                // Atualizar
                response = await API.products.update(data.id, data);
            } else {
                // Criar
                delete data.id;
                response = await API.products.create(data);
            }

            if (response.success) {
                Toast.success(data.id ? 'Produto atualizado!' : 'Produto criado!');
                this.closeModal();
                this.loadProducts();
            } else {
                throw new Error(response.message || 'Erro ao salvar produto');
            }
        } catch (error) {
            console.error('Erro ao salvar produto:', error);
            Toast.error(error.message || 'Erro ao salvar produto');
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = originalText;
        }
    },

    /**
     * Edita produto
     * @param {number} id - ID do produto
     */
    async editProduct(id) {
        try {
            Toast.info('Carregando produto...');

            const response = await API.products.getById(id);

            if (response.success) {
                this.openModal(response.data);
            } else {
                throw new Error(response.message || 'Produto não encontrado');
            }
        } catch (error) {
            console.error('Erro ao carregar produto:', error);
            Toast.error(error.message || 'Erro ao carregar produto');
        }
    },

    /**
     * Exclui produto
     * @param {number} id - ID do produto
     */
    async deleteProduct(id) {
        // Encontra produto na lista
        const product = this.data.products.find(p => p.id == id);
        const productName = product ? (product.nome || product.name) : 'este produto';

        const confirmed = await Modal.confirm(
            'Excluir Produto',
            `Tem certeza que deseja excluir "${productName}"?<br><small class="text-muted">Esta ação não pode ser desfeita.</small>`
        );

        if (!confirmed) return;

        try {
            const response = await API.products.delete(id);

            if (response.success) {
                Toast.success('Produto excluído!');
                this.loadProducts();
            } else {
                throw new Error(response.message || 'Erro ao excluir produto');
            }
        } catch (error) {
            console.error('Erro ao excluir produto:', error);
            Toast.error(error.message || 'Erro ao excluir produto');
        }
    },

    /**
     * Ajusta estoque do produto
     * @param {number} id - ID do produto
     */
    async adjustStock(id) {
        // Encontra produto na lista
        const product = this.data.products.find(p => p.id == id);
        if (!product) {
            Toast.error('Produto não encontrado');
            return;
        }

        const currentStock = product.quantidade || product.stock || 0;
        const productName = product.nome || product.name;

        // Cria modal de ajuste de estoque
        const result = await Modal.prompt(
            'Ajustar Estoque',
            `
            <div class="form-group">
                <label><strong>${Utils.escapeHtml(productName)}</strong></label>
                <p class="text-muted">Estoque atual: ${currentStock} unidades</p>
            </div>
            <div class="form-group">
                <label>Operação</label>
                <select id="stock-operation" class="form-control">
                    <option value="set">Definir quantidade</option>
                    <option value="add">Adicionar ao estoque</option>
                    <option value="subtract">Remover do estoque</option>
                </select>
            </div>
            <div class="form-group">
                <label>Quantidade</label>
                <input type="number" id="stock-quantity" class="form-control" min="0" value="0" required>
            </div>
            `,
            {
                confirmText: 'Atualizar',
                onConfirm: async () => {
                    const operation = document.getElementById('stock-operation').value;
                    const quantity = parseInt(document.getElementById('stock-quantity').value) || 0;

                    if (quantity < 0) {
                        Toast.error('Quantidade deve ser positiva');
                        return false;
                    }

                    if (operation === 'subtract' && quantity > currentStock) {
                        Toast.error('Quantidade maior que o estoque disponível');
                        return false;
                    }

                    try {
                        const response = await API.products.updateStock(id, quantity, operation);

                        if (response.success) {
                            Toast.success('Estoque atualizado!');
                            this.loadProducts();
                            return true;
                        } else {
                            throw new Error(response.message || 'Erro ao atualizar estoque');
                        }
                    } catch (error) {
                        Toast.error(error.message || 'Erro ao atualizar estoque');
                        return false;
                    }
                }
            }
        );
    },

    /**
     * Exporta produtos para CSV
     */
    async exportProducts() {
        try {
            Toast.info('Gerando exportação...');

            const response = await API.products.export();

            if (response.success && response.data) {
                const products = response.data;

                // Formata dados para CSV
                const csvData = products.map(p => ({
                    Código: p.codigo || p.code || '',
                    Nome: p.nome || p.name || '',
                    Categoria: p.categoria_nome || p.categoryName || '',
                    Preço: p.preco || p.price || 0,
                    'Preço Promocional': p.preco_promocional || p.salePrice || '',
                    Estoque: p.quantidade || p.stock || 0,
                    Marca: p.marca || p.brand || '',
                    Ativo: p.ativo !== false ? 'Sim' : 'Não',
                    Destaque: p.destaque ? 'Sim' : 'Não'
                }));

                Utils.exportToCsv(csvData, `produtos_${new Date().toISOString().split('T')[0]}.csv`);
                Toast.success('Exportação concluída!');
            }
        } catch (error) {
            console.error('Erro ao exportar:', error);
            Toast.error('Erro ao exportar produtos');
        }
    },

    /**
     * Recarrega lista de produtos
     */
    async refresh() {
        await this.loadProducts();
    },

    /**
     * Limpa filtros
     */
    clearFilters() {
        this.filters = {
            search: '',
            categoria: '',
            ativo: ''
        };

        // Limpa campos
        const searchInput = document.getElementById('products-search');
        if (searchInput) searchInput.value = '';

        const categoryFilter = document.getElementById('products-category-filter');
        if (categoryFilter) categoryFilter.value = '';

        // Volta para primeira página
        this.data.pagination.page = 1;

        // Recarrega
        this.loadProducts();
    },

    /**
     * Cleanup ao sair da página
     */
    destroy() {
        this.data = {
            products: [],
            categories: [],
            pagination: {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 0
            }
        };
        this.filters = {
            search: '',
            categoria: '',
            ativo: ''
        };
        this.currentProduct = null;
    }
};

// Exporta para uso global
window.Products = Products;