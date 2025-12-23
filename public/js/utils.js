/**
 * ============================================
 * UTILITÁRIOS
 * Funções auxiliares usadas em todo o sistema
 * ============================================
 */

const Utils = {
    /**
     * Formata valor para moeda brasileira
     * @param {number} value - Valor numérico
     * @returns {string} Valor formatado
     */
    formatCurrency(value) {
        if (value === null || value === undefined) return 'R$ 0,00';
        
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    },

    /**
     * Formata número de telefone
     * @param {string} phone - Número de telefone
     * @returns {string} Telefone formatado
     */
    formatPhone(phone) {
        if (!phone) return '';
        
        // Remove tudo que não é número
        const numbers = phone.replace(/\D/g, '');
        
        // Formato: (11) 99999-9999
        if (numbers.length === 11) {
            return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
        }
        
        // Formato: (11) 9999-9999
        if (numbers.length === 10) {
            return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
        }
        
        // Formato com código do país: +55 (11) 99999-9999
        if (numbers.length === 13 && numbers.startsWith('55')) {
            return `+55 (${numbers.slice(2, 4)}) ${numbers.slice(4, 9)}-${numbers.slice(9)}`;
        }
        
        return phone;
    },

    /**
     * Formata data para exibição
     * @param {string|Date} date - Data
     * @param {boolean} includeTime - Incluir hora
     * @returns {string} Data formatada
     */
    formatDate(date, includeTime = false) {
        if (!date) return '-';
        
        const d = new Date(date);
        
        if (isNaN(d.getTime())) return '-';
        
        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };
        
        if (includeTime) {
            options.hour = '2-digit';
            options.minute = '2-digit';
        }
        
        return d.toLocaleDateString('pt-BR', options);
    },

    /**
     * Formata data de forma relativa (há 5 minutos, ontem, etc)
     * @param {string|Date} date - Data
     * @returns {string} Data relativa
     */
    formatRelativeDate(date) {
        if (!date) return '-';
        
        const d = new Date(date);
        const now = new Date();
        const diffMs = now - d;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSeconds < 60) {
            return 'Agora mesmo';
        }
        
        if (diffMinutes < 60) {
            return `Há ${diffMinutes} min`;
        }
        
        if (diffHours < 24) {
            return `Há ${diffHours}h`;
        }
        
        if (diffDays === 1) {
            return 'Ontem';
        }
        
        if (diffDays < 7) {
            return `Há ${diffDays} dias`;
        }
        
        return this.formatDate(date);
    },

    /**
     * Formata tempo de duração (segundos para HH:MM:SS)
     * @param {number} seconds - Segundos
     * @returns {string} Tempo formatado
     */
    formatDuration(seconds) {
        if (!seconds || seconds < 0) return '00:00:00';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return [hours, minutes, secs]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    },

    /**
     * Trunca texto com reticências
     * @param {string} text - Texto
     * @param {number} maxLength - Tamanho máximo
     * @returns {string} Texto truncado
     */
    truncate(text, maxLength = 50) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        
        return text.substring(0, maxLength).trim() + '...';
    },

    /**
     * Capitaliza primeira letra
     * @param {string} text - Texto
     * @returns {string} Texto capitalizado
     */
    capitalize(text) {
        if (!text) return '';
        return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    },

    /**
     * Gera slug a partir de texto
     * @param {string} text - Texto
     * @returns {string} Slug
     */
    slugify(text) {
        if (!text) return '';
        
        return text
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '')
            .replace(/--+/g, '-');
    },

    /**
     * Debounce - atrasa execução de função
     * @param {Function} func - Função a ser executada
     * @param {number} wait - Tempo de espera em ms
     * @returns {Function} Função com debounce
     */
    debounce(func, wait = 300) {
        let timeout;
        
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Throttle - limita execução de função
     * @param {Function} func - Função a ser executada
     * @param {number} limit - Limite de tempo em ms
     * @returns {Function} Função com throttle
     */
    throttle(func, limit = 300) {
        let inThrottle;
        
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    /**
     * Escapa HTML para prevenir XSS
     * @param {string} text - Texto
     * @returns {string} Texto escapado
     */
    escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Copia texto para área de transferência
     * @param {string} text - Texto a copiar
     * @returns {Promise<boolean>} Sucesso
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // Fallback para navegadores antigos
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            
            try {
                document.execCommand('copy');
                return true;
            } catch (e) {
                return false;
            } finally {
                document.body.removeChild(textarea);
            }
        }
    },

    /**
     * Gera ID único
     * @returns {string} ID único
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    /**
     * Valida e-mail
     * @param {string} email - E-mail
     * @returns {boolean} É válido
     */
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * Valida telefone brasileiro
     * @param {string} phone - Telefone
     * @returns {boolean} É válido
     */
    isValidPhone(phone) {
        const numbers = phone.replace(/\D/g, '');
        return numbers.length >= 10 && numbers.length <= 13;
    },

    /**
     * Obtém parâmetros da URL
     * @param {string} param - Nome do parâmetro (opcional)
     * @returns {string|object} Valor ou todos os parâmetros
     */
    getUrlParams(param = null) {
        const params = new URLSearchParams(window.location.search);
        
        if (param) {
            return params.get(param);
        }
        
        const result = {};
        params.forEach((value, key) => {
            result[key] = value;
        });
        
        return result;
    },

    /**
     * Salva dados no localStorage
     * @param {string} key - Chave
     * @param {*} value - Valor
     */
    storage: {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                console.error('Erro ao salvar no localStorage:', error);
            }
        },
        
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('Erro ao ler do localStorage:', error);
                return defaultValue;
            }
        },
        
        remove(key) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error('Erro ao remover do localStorage:', error);
            }
        },
        
        clear() {
            try {
                localStorage.clear();
            } catch (error) {
                console.error('Erro ao limpar localStorage:', error);
            }
        }
    },

    /**
     * Faz download de arquivo
     * @param {string} content - Conteúdo do arquivo
     * @param {string} filename - Nome do arquivo
     * @param {string} type - Tipo MIME
     */
    downloadFile(content, filename, type = 'application/json') {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Exporta dados para CSV
     * @param {Array} data - Array de objetos
     * @param {string} filename - Nome do arquivo
     */
    exportToCsv(data, filename = 'export.csv') {
        if (!data || !data.length) return;
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(';'),
            ...data.map(row => 
                headers.map(header => {
                    let cell = row[header] ?? '';
                    // Escapa aspas e adiciona aspas se necessário
                    if (typeof cell === 'string' && (cell.includes(';') || cell.includes('"') || cell.includes('\n'))) {
                        cell = `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                }).join(';')
            )
        ].join('\n');
        
        // Adiciona BOM para UTF-8
        const bom = '\uFEFF';
        this.downloadFile(bom + csvContent, filename, 'text/csv;charset=utf-8');
    },

    /**
     * Formata bytes para tamanho legível
     * @param {number} bytes - Bytes
     * @returns {string} Tamanho formatado
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Obtém iniciais de um nome
     * @param {string} name - Nome completo
     * @returns {string} Iniciais
     */
    getInitials(name) {
        if (!name) return '?';
        
        return name
            .split(' ')
            .filter(n => n.length > 0)
            .slice(0, 2)
            .map(n => n[0].toUpperCase())
            .join('');
    },

    /**
     * Gera cor baseada em string (para avatares)
     * @param {string} str - String
     * @returns {string} Cor hexadecimal
     */
    stringToColor(str) {
        if (!str) return '#6b7280';
        
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const colors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
            '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'
        ];
        
        return colors[Math.abs(hash) % colors.length];
    },

    /**
     * Verifica se está em dispositivo móvel
     * @returns {boolean}
     */
    isMobile() {
        return window.innerWidth <= 768;
    },

    /**
     * Aguarda um tempo (Promise)
     * @param {number} ms - Milissegundos
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Scroll suave para elemento
     * @param {string|Element} target - Seletor ou elemento
     * @param {number} offset - Offset do topo
     */
    scrollTo(target, offset = 0) {
        const element = typeof target === 'string' 
            ? document.querySelector(target) 
            : target;
        
        if (element) {
            const top = element.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    },

    /**
     * Adiciona classe temporária a um elemento
     * @param {Element} element - Elemento
     * @param {string} className - Nome da classe
     * @param {number} duration - Duração em ms
     */
    addTempClass(element, className, duration = 1000) {
        element.classList.add(className);
        setTimeout(() => {
            element.classList.remove(className);
        }, duration);
    },

    /**
     * Parse de query string
     * @param {string} queryString - Query string
     * @returns {object} Objeto com parâmetros
     */
    parseQueryString(queryString) {
        const params = {};
        const searchParams = new URLSearchParams(queryString);
        
        searchParams.forEach((value, key) => {
            params[key] = value;
        });
        
        return params;
    },

    /**
     * Converte objeto para query string
     * @param {object} params - Parâmetros
     * @returns {string} Query string
     */
    toQueryString(params) {
        return Object.entries(params)
            .filter(([_, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
    },

    /**
     * Obtém data atual formatada
     * @returns {string} Data formatada
     */
    getCurrentDate() {
        return new Date().toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    },

    /**
     * Obtém hora atual formatada
     * @returns {string} Hora formatada
     */
    getCurrentTime() {
        return new Date().toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    /**
     * Verifica se está dentro do horário comercial
     * @param {string} start - Hora início (HH:MM)
     * @param {string} end - Hora fim (HH:MM)
     * @returns {boolean}
     */
    isBusinessHours(start = '08:00', end = '18:00') {
        const now = new Date();
        const [startHour, startMin] = start.split(':').map(Number);
        const [endHour, endMin] = end.split(':').map(Number);
        
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    },

    /**
     * Formata número com separador de milhares
     * @param {number} num - Número
     * @returns {string} Número formatado
     */
    formatNumber(num) {
        if (num === null || num === undefined) return '0';
        return new Intl.NumberFormat('pt-BR').format(num);
    },

    /**
     * Calcula porcentagem
     * @param {number} value - Valor
     * @param {number} total - Total
     * @returns {number} Porcentagem
     */
    percentage(value, total) {
        if (!total) return 0;
        return Math.round((value / total) * 100);
    },

    /**
     * Agrupa array por propriedade
     * @param {Array} array - Array de objetos
     * @param {string} key - Chave para agrupar
     * @returns {object} Objeto agrupado
     */
    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if (!result[groupKey]) {
                result[groupKey] = [];
            }
            result[groupKey].push(item);
            return result;
        }, {});
    },

    /**
     * Ordena array de objetos
     * @param {Array} array - Array de objetos
     * @param {string} key - Chave para ordenar
     * @param {string} order - Ordem (asc/desc)
     * @returns {Array} Array ordenado
     */
    sortBy(array, key, order = 'asc') {
        return [...array].sort((a, b) => {
            let valueA = a[key];
            let valueB = b[key];
            
            // Trata strings
            if (typeof valueA === 'string') {
                valueA = valueA.toLowerCase();
                valueB = valueB.toLowerCase();
            }
            
            if (order === 'asc') {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            } else {
                return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
            }
        });
    },

    /**
     * Remove duplicatas de array
     * @param {Array} array - Array
     * @param {string} key - Chave para comparar (opcional)
     * @returns {Array} Array sem duplicatas
     */
    unique(array, key = null) {
        if (key) {
            const seen = new Set();
            return array.filter(item => {
                const value = item[key];
                if (seen.has(value)) return false;
                seen.add(value);
                return true;
            });
        }
        return [...new Set(array)];
    },

    /**
     * Verifica se objeto está vazio
     * @param {object} obj - Objeto
     * @returns {boolean}
     */
    isEmpty(obj) {
        if (!obj) return true;
        if (Array.isArray(obj)) return obj.length === 0;
        if (typeof obj === 'object') return Object.keys(obj).length === 0;
        return false;
    },

    /**
     * Deep clone de objeto
     * @param {object} obj - Objeto
     * @returns {object} Clone
     */
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (error) {
            return obj;
        }
    },

    /**
     * Merge profundo de objetos
     * @param {object} target - Objeto alvo
     * @param {object} source - Objeto fonte
     * @returns {object} Objeto merged
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] instanceof Object && key in target) {
                result[key] = this.deepMerge(target[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
};

// Exporta para uso global
window.Utils = Utils;