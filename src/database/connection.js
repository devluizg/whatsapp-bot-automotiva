/**
 * ============================================
 * CONEXÃO COM BANCO DE DADOS
 * ============================================
 * 
 * Pool de conexões MySQL com funções auxiliares.
 */

const mysql = require('mysql2/promise');
const { config } = require('../config/database');
const logger = require('../utils/logger');

// Pool de conexões
let pool = null;

/**
 * Inicializa o pool de conexões
 * @returns {object} Pool de conexões MySQL
 */
async function initPool() {
    if (pool) {
        return pool;
    }

    try {
        pool = mysql.createPool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            waitForConnections: config.waitForConnections,
            connectionLimit: config.connectionLimit,
            queueLimit: config.queueLimit,
            charset: config.charset,
            timezone: config.timezone,
            multipleStatements: true, // Permite múltiplas queries (para migrations)
        });

        // Testa a conexão
        const connection = await pool.getConnection();
        logger.info(`✅ Conectado ao MySQL: ${config.host}:${config.port}/${config.database}`);
        connection.release();

        return pool;
    } catch (error) {
        logger.error('❌ Erro ao conectar ao MySQL:', error.message);
        throw error;
    }
}

/**
 * Obtém o pool de conexões
 * @returns {object} Pool de conexões
 */
function getPool() {
    if (!pool) {
        throw new Error('Pool não inicializado. Chame initPool() primeiro.');
    }
    return pool;
}

/**
 * Executa uma query SQL
 * @param {string} sql - Query SQL
 * @param {array} params - Parâmetros da query
 * @returns {array} Resultado da query
 */
async function query(sql, params = []) {
    try {
        const poolConnection = getPool();
        const [results] = await poolConnection.execute(sql, params);
        return results;
    } catch (error) {
        logger.error('❌ Erro na query:', error.message);
        logger.error('SQL:', sql);
        logger.error('Params:', params);
        throw error;
    }
}

/**
 * Executa uma query SQL raw (permite múltiplas statements)
 * @param {string} sql - Query SQL
 * @returns {array} Resultado da query
 */
async function queryRaw(sql) {
    try {
        const poolConnection = getPool();
        const [results] = await poolConnection.query(sql);
        return results;
    } catch (error) {
        logger.error('❌ Erro na query raw:', error.message);
        throw error;
    }
}

/**
 * Executa uma query e retorna o primeiro resultado
 * @param {string} sql - Query SQL
 * @param {array} params - Parâmetros da query
 * @returns {object|null} Primeiro resultado ou null
 */
async function queryOne(sql, params = []) {
    const results = await query(sql, params);
    return results.length > 0 ? results[0] : null;
}

/**
 * Busca com paginação
 * @param {string} table - Nome da tabela
 * @param {object} options - Opções de busca
 * @returns {object} Resultados e informações de paginação
 */
async function paginate(table, options = {}) {
    const {
        page = 1,
        limit = 10,
        where = '',
        whereParams = [],
        orderBy = 'id DESC',
        select = '*'
    } = options;

    const offset = (page - 1) * limit;

    // Query para contar total
    let countSql = `SELECT COUNT(*) as total FROM ${table}`;
    if (where) {
        countSql += ` WHERE ${where}`;
    }

    // Query para buscar dados
    let dataSql = `SELECT ${select} FROM ${table}`;
    if (where) {
        dataSql += ` WHERE ${where}`;
    }
    dataSql += ` ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;

    try {
        const [countResult] = await query(countSql, whereParams);
        const total = countResult.total;
        const data = await query(dataSql, whereParams);

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };
    } catch (error) {
        logger.error(`❌ Erro na paginação de ${table}:`, error.message);
        throw error;
    }
}

/**
 * Busca registros com filtro LIKE
 * @param {string} table - Nome da tabela
 * @param {string} column - Coluna para buscar
 * @param {string} search - Termo de busca
 * @param {object} options - Opções adicionais
 * @returns {array} Resultados encontrados
 */
async function search(table, column, searchTerm, options = {}) {
    const {
        select = '*',
        limit = 50,
        extraWhere = '',
        extraParams = [],
        orderBy = 'id DESC'
    } = options;

    let sql = `SELECT ${select} FROM ${table} WHERE ${column} LIKE ?`;
    const params = [`%${searchTerm}%`];

    if (extraWhere) {
        sql += ` AND ${extraWhere}`;
        params.push(...extraParams);
    }

    sql += ` ORDER BY ${orderBy} LIMIT ${limit}`;

    return await query(sql, params);
}

/**
 * Busca em múltiplas colunas
 * @param {string} table - Nome da tabela
 * @param {array} columns - Colunas para buscar
 * @param {string} searchTerm - Termo de busca
 * @param {object} options - Opções adicionais
 * @returns {array} Resultados encontrados
 */
async function searchMultiple(table, columns, searchTerm, options = {}) {
    const {
        select = '*',
        limit = 50,
        extraWhere = '',
        extraParams = [],
        orderBy = 'id DESC'
    } = options;

    const likeConditions = columns.map(col => `${col} LIKE ?`).join(' OR ');
    const params = columns.map(() => `%${searchTerm}%`);

    let sql = `SELECT ${select} FROM ${table} WHERE (${likeConditions})`;

    if (extraWhere) {
        sql += ` AND ${extraWhere}`;
        params.push(...extraParams);
    }

    sql += ` ORDER BY ${orderBy} LIMIT ${limit}`;

    return await query(sql, params);
}

/**
 * Conta registros na tabela
 * @param {string} table - Nome da tabela
 * @param {string} where - Condição WHERE (opcional)
 * @param {array} whereParams - Parâmetros do WHERE
 * @returns {number} Total de registros
 */
async function count(table, where = '', whereParams = []) {
    let sql = `SELECT COUNT(*) as total FROM ${table}`;
    if (where) {
        sql += ` WHERE ${where}`;
    }

    const result = await queryOne(sql, whereParams);
    return result ? result.total : 0;
}

/**
 * Verifica se um registro existe
 * @param {string} table - Nome da tabela
 * @param {string} where - Condição WHERE
 * @param {array} whereParams - Parâmetros do WHERE
 * @returns {boolean} Se existe ou não
 */
async function exists(table, where, whereParams = []) {
    const total = await count(table, where, whereParams);
    return total > 0;
}

/**
 * Busca um registro por ID
 * @param {string} table - Nome da tabela
 * @param {number} id - ID do registro
 * @returns {object|null} Registro ou null
 */
async function findById(table, id) {
    return await queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
}

/**
 * Busca registros por condição
 * @param {string} table - Nome da tabela
 * @param {string} where - Condição WHERE
 * @param {array} whereParams - Parâmetros do WHERE
 * @returns {array} Registros encontrados
 */
async function findWhere(table, where, whereParams = []) {
    return await query(`SELECT * FROM ${table} WHERE ${where}`, whereParams);
}

/**
 * Insere um registro e retorna o ID inserido
 * @param {string} table - Nome da tabela
 * @param {object} data - Dados para inserir
 * @returns {number} ID do registro inserido
 */
async function insert(table, data) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

    try {
        const poolConnection = getPool();
        const [result] = await poolConnection.execute(sql, values);
        logger.info(`✅ Inserido em ${table}: ID ${result.insertId}`);
        return result.insertId;
    } catch (error) {
        logger.error(`❌ Erro ao inserir em ${table}:`, error.message);
        throw error;
    }
}

/**
 * Insere múltiplos registros de uma vez
 * @param {string} table - Nome da tabela
 * @param {array} dataArray - Array de objetos para inserir
 * @returns {number} Número de registros inseridos
 */
async function insertMany(table, dataArray) {
    if (!dataArray || dataArray.length === 0) {
        return 0;
    }

    const keys = Object.keys(dataArray[0]);
    const placeholders = `(${keys.map(() => '?').join(', ')})`;
    const allPlaceholders = dataArray.map(() => placeholders).join(', ');
    const allValues = dataArray.flatMap(data => Object.values(data));

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${allPlaceholders}`;

    try {
        const poolConnection = getPool();
        const [result] = await poolConnection.execute(sql, allValues);
        logger.info(`✅ Inseridos ${result.affectedRows} registros em ${table}`);
        return result.affectedRows;
    } catch (error) {
        logger.error(`❌ Erro ao inserir múltiplos em ${table}:`, error.message);
        throw error;
    }
}

/**
 * Insere ou atualiza (upsert)
 * @param {string} table - Nome da tabela
 * @param {object} data - Dados para inserir/atualizar
 * @param {array} updateFields - Campos para atualizar em caso de duplicata
 * @returns {number} ID do registro
 */
async function upsert(table, data, updateFields = []) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');

    let sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

    if (updateFields.length > 0) {
        const updateClause = updateFields.map(field => `${field} = VALUES(${field})`).join(', ');
        sql += ` ON DUPLICATE KEY UPDATE ${updateClause}`;
    }

    try {
        const poolConnection = getPool();
        const [result] = await poolConnection.execute(sql, values);
        logger.info(`✅ Upsert em ${table}: ID ${result.insertId}`);
        return result.insertId;
    } catch (error) {
        logger.error(`❌ Erro no upsert em ${table}:`, error.message);
        throw error;
    }
}

/**
 * Atualiza registros na tabela
 * @param {string} table - Nome da tabela
 * @param {object} data - Dados para atualizar
 * @param {string} where - Condição WHERE
 * @param {array} whereParams - Parâmetros do WHERE
 * @returns {number} Número de registros afetados
 */
async function update(table, data, where, whereParams = []) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map(key => `${key} = ?`).join(', ');

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${where}`;

    try {
        const poolConnection = getPool();
        const [result] = await poolConnection.execute(sql, [...values, ...whereParams]);
        logger.info(`✅ Atualizado em ${table}: ${result.affectedRows} registro(s)`);
        return result.affectedRows;
    } catch (error) {
        logger.error(`❌ Erro ao atualizar ${table}:`, error.message);
        throw error;
    }
}

/**
 * Remove registros da tabela
 * @param {string} table - Nome da tabela
 * @param {string} where - Condição WHERE
 * @param {array} whereParams - Parâmetros do WHERE
 * @returns {number} Número de registros removidos
 */
async function remove(table, where, whereParams = []) {
    const sql = `DELETE FROM ${table} WHERE ${where}`;

    try {
        const poolConnection = getPool();
        const [result] = await poolConnection.execute(sql, whereParams);
        logger.info(`✅ Removido de ${table}: ${result.affectedRows} registro(s)`);
        return result.affectedRows;
    } catch (error) {
        logger.error(`❌ Erro ao remover de ${table}:`, error.message);
        throw error;
    }
}

/**
 * Executa uma transação
 * @param {function} callback - Função que recebe a conexão
 * @returns {any} Resultado do callback
 */
async function transaction(callback) {
    const poolConnection = getPool();
    const connection = await poolConnection.getConnection();

    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        logger.error('❌ Transação revertida:', error.message);
        throw error;
    } finally {
        connection.release();
    }
}

/**
 * Fecha o pool de conexões
 */
async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('🔌 Pool de conexões encerrado');
    }
}

/**
 * Verifica se a conexão está ativa
 * @returns {boolean} Status da conexão
 */
async function isConnected() {
    try {
        const poolConnection = getPool();
        const connection = await poolConnection.getConnection();
        connection.release();
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Retorna estatísticas do banco
 * @returns {object} Estatísticas
 */
async function getStats() {
    try {
        const tables = ['produtos', 'servicos', 'clientes', 'conversas', 'atendimentos', 'pedidos'];
        const stats = {};

        for (const table of tables) {
            try {
                stats[table] = await count(table);
            } catch (e) {
                stats[table] = 0;
            }
        }

        return stats;
    } catch (error) {
        logger.error('❌ Erro ao obter estatísticas:', error.message);
        return {};
    }
}

/**
 * Executa as migrations do banco de dados
 */
async function migrate() {
    const fs = require('fs');
    const path = require('path');

    try {
        await initPool();

        const migrationPath = path.join(__dirname, 'migrations.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Usa queryRaw para permitir múltiplas statements
        await queryRaw(sql);

        logger.info('✅ Migrations executadas com sucesso!');
    } catch (error) {
        logger.error('❌ Erro ao executar migrations:', error.message);
        throw error;
    } finally {
        await closePool();
    }
}

module.exports = {
    initPool,
    getPool,
    query,
    queryRaw,
    queryOne,
    paginate,
    search,
    searchMultiple,
    count,
    exists,
    findById,
    findWhere,
    insert,
    insertMany,
    upsert,
    update,
    remove,
    transaction,
    closePool,
    isConnected,
    getStats,
    migrate,
};