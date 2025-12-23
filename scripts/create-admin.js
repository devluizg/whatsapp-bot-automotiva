/**
 * Script para criar usuário administrador
 * Execute: node scripts/create-admin.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function createAdmin() {
    console.log('🔧 Criando usuário administrador...\n');

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'loja_automotiva'
    });

    try {
        // Cria tabela de usuários se não existir
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                role ENUM('admin', 'gerente', 'atendente') DEFAULT 'atendente',
                ativo TINYINT(1) DEFAULT 1,
                avatar_url VARCHAR(255) NULL,
                ultimo_acesso DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        console.log('✅ Tabela usuarios verificada/criada');

        // Hash da senha "admin123"
        const senha = await bcrypt.hash('admin123', 10);

        // Verifica se já existe admin
        const [existing] = await connection.execute(
            'SELECT id FROM usuarios WHERE email = ?',
            ['admin@loja.com']
        );

        if (existing.length > 0) {
            // Atualiza senha do admin existente
            await connection.execute(
                'UPDATE usuarios SET senha = ?, ativo = 1 WHERE email = ?',
                [senha, 'admin@loja.com']
            );
            console.log('✅ Senha do admin atualizada');
        } else {
            // Cria novo admin
            await connection.execute(`
                INSERT INTO usuarios (nome, email, senha, role, ativo) 
                VALUES (?, ?, ?, ?, ?)
            `, ['Administrador', 'admin@loja.com', senha, 'admin', 1]);
            console.log('✅ Usuário admin criado');
        }

        console.log('\n════════════════════════════════════════');
        console.log('   🎉 USUÁRIO ADMIN CONFIGURADO!');
        console.log('════════════════════════════════════════');
        console.log('');
        console.log('   📧 E-mail: admin@loja.com');
        console.log('   🔑 Senha:  admin123');
        console.log('');
        console.log('════════════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        
        if (error.code === 'ER_NO_SUCH_TABLE') {
            console.log('\n💡 Dica: Execute o script de criação do banco primeiro.');
        }
    } finally {
        await connection.end();
    }
}

createAdmin();