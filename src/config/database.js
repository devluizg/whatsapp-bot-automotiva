/**
 * ============================================
 * CONFIGURAÇÕES DO BANCO DE DADOS
 * ============================================
 * 
 * Este arquivo exporta as configurações de conexão
 * com o MySQL, lidas das variáveis de ambiente.
 */

require('dotenv').config();

const databaseConfig = {
    // Configurações de conexão
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'loja_automotiva',

    // Configurações do pool de conexões
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    // Configurações adicionais
    charset: 'utf8mb4',
    timezone: '-03:00',

    // Habilita múltiplas queries em uma chamada
    multipleStatements: true
};

// Configurações para diferentes ambientes
const environments = {
    development: {
        ...databaseConfig,
        debug: true
    },

    production: {
        ...databaseConfig,
        debug: false,
        connectionLimit: 20
    },

    test: {
        ...databaseConfig,
        database: 'loja_automotiva_test',
        debug: false
    }
};

// Define qual ambiente usar
const currentEnv = process.env.NODE_ENV || 'development';

module.exports = {
    config: environments[currentEnv] || environments.development,
    
    // Exporta também configurações individuais se necessário
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    database: databaseConfig.database
};