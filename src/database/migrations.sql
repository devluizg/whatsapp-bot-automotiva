-- ============================================
-- MIGRATIONS - BOT WHATSAPP LOJA AUTOMOTIVA
-- ============================================
-- Execute este arquivo para criar o banco de dados
-- mysql -u root -p < src/database/migrations.sql
-- ============================================

-- Cria o banco de dados se não existir
CREATE DATABASE IF NOT EXISTS loja_automotiva
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- Usa o banco de dados
USE loja_automotiva;

-- ============================================
-- TABELA: usuarios
-- ============================================
-- Usuários do painel administrativo
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha VARCHAR(255) NOT NULL,
    role ENUM('admin', 'atendente', 'gerente') DEFAULT 'atendente',
    avatar_url VARCHAR(500),
    ativo TINYINT(1) DEFAULT 1,
    ultimo_acesso TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: categorias
-- ============================================
-- Categorias de produtos
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    icone VARCHAR(50),
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_nome (nome),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: produtos
-- ============================================
-- Catálogo de peças e produtos
-- ============================================
CREATE TABLE IF NOT EXISTS produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    categoria_id INT,
    preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    preco_promocional DECIMAL(10,2),
    custo DECIMAL(10,2),
    quantidade INT DEFAULT 0,
    quantidade_minima INT DEFAULT 5,
    marca VARCHAR(100),
    localizacao VARCHAR(100),
    veiculo_compativel TEXT,
    imagem_url VARCHAR(500),
    ativo TINYINT(1) DEFAULT 1,
    destaque TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_codigo (codigo),
    INDEX idx_nome (nome),
    INDEX idx_categoria (categoria_id),
    INDEX idx_ativo (ativo),
    INDEX idx_destaque (destaque),
    INDEX idx_quantidade (quantidade),
    INDEX idx_marca (marca),
    FULLTEXT idx_busca (nome, descricao, veiculo_compativel, marca),
    
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: categorias_servicos
-- ============================================
-- Categorias de serviços
-- ============================================
CREATE TABLE IF NOT EXISTS categorias_servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    icone VARCHAR(50),
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_nome (nome),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: servicos
-- ============================================
-- Serviços oferecidos pela loja
-- ============================================
CREATE TABLE IF NOT EXISTS servicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    categoria_id INT,
    preco DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    preco_promocional DECIMAL(10,2),
    duracao_estimada INT DEFAULT 60 COMMENT 'Duração em minutos',
    ativo TINYINT(1) DEFAULT 1,
    destaque TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_codigo (codigo),
    INDEX idx_nome (nome),
    INDEX idx_categoria (categoria_id),
    INDEX idx_ativo (ativo),
    INDEX idx_destaque (destaque),
    FULLTEXT idx_busca_servico (nome, descricao),
    
    FOREIGN KEY (categoria_id) REFERENCES categorias_servicos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: clientes
-- ============================================
-- Cadastro de clientes que interagem com o bot
-- ============================================
CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telefone VARCHAR(20) NOT NULL UNIQUE,
    nome VARCHAR(255),
    email VARCHAR(255),
    cpf VARCHAR(14),
    veiculo VARCHAR(255),
    placa VARCHAR(20),
    ano_veiculo VARCHAR(10),
    observacoes TEXT,
    total_interacoes INT DEFAULT 0,
    total_compras DECIMAL(10,2) DEFAULT 0.00,
    ultimo_contato TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_telefone (telefone),
    INDEX idx_nome (nome),
    INDEX idx_email (email),
    INDEX idx_placa (placa),
    INDEX idx_ultimo_contato (ultimo_contato)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: sessoes
-- ============================================
-- Gerencia o estado das conversas
-- ============================================
CREATE TABLE IF NOT EXISTS sessoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telefone VARCHAR(20) NOT NULL UNIQUE,
    estado VARCHAR(50) DEFAULT 'idle',
    dados JSON,
    contexto_ia JSON COMMENT 'Contexto para a IA manter histórico',
    expira_em TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_telefone (telefone),
    INDEX idx_estado (estado),
    INDEX idx_expira (expira_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: conversas
-- ============================================
-- Histórico de todas as mensagens
-- ============================================
CREATE TABLE IF NOT EXISTS conversas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT,
    telefone VARCHAR(20) NOT NULL,
    mensagem TEXT NOT NULL,
    tipo ENUM('entrada', 'saida') NOT NULL,
    origem ENUM('bot', 'ia', 'humano', 'cliente') DEFAULT 'cliente',
    lida TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_cliente (cliente_id),
    INDEX idx_telefone (telefone),
    INDEX idx_tipo (tipo),
    INDEX idx_origem (origem),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: atendimentos
-- ============================================
-- Fila de atendimento humano
-- ============================================
CREATE TABLE IF NOT EXISTS atendimentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT,
    telefone VARCHAR(20) NOT NULL,
    motivo TEXT,
    status ENUM('aguardando', 'em_atendimento', 'finalizado', 'cancelado') DEFAULT 'aguardando',
    prioridade INT DEFAULT 0,
    atendente_id INT,
    atendente VARCHAR(100),
    iniciado_em TIMESTAMP NULL,
    finalizado_em TIMESTAMP NULL,
    avaliacao INT,
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cliente (cliente_id),
    INDEX idx_telefone (telefone),
    INDEX idx_status (status),
    INDEX idx_prioridade (prioridade),
    INDEX idx_atendente (atendente_id),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (atendente_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: pedidos
-- ============================================
-- Pedidos e orçamentos
-- ============================================
CREATE TABLE IF NOT EXISTS pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero VARCHAR(20) UNIQUE,
    cliente_id INT,
    telefone VARCHAR(20) NOT NULL,
    tipo ENUM('orcamento', 'pedido', 'venda') DEFAULT 'orcamento',
    status ENUM('rascunho', 'aguardando', 'aprovado', 'em_andamento', 'concluido', 'cancelado') DEFAULT 'rascunho',
    subtotal DECIMAL(10,2) DEFAULT 0.00,
    desconto DECIMAL(10,2) DEFAULT 0.00,
    total DECIMAL(10,2) DEFAULT 0.00,
    forma_pagamento VARCHAR(50),
    observacoes TEXT,
    data_aprovacao TIMESTAMP NULL,
    data_conclusao TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_numero (numero),
    INDEX idx_cliente (cliente_id),
    INDEX idx_telefone (telefone),
    INDEX idx_tipo (tipo),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: itens_pedido
-- ============================================
-- Itens de cada pedido
-- ============================================
CREATE TABLE IF NOT EXISTS itens_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    tipo ENUM('produto', 'servico') NOT NULL,
    produto_id INT,
    servico_id INT,
    descricao VARCHAR(255),
    quantidade INT DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    desconto DECIMAL(10,2) DEFAULT 0.00,
    subtotal DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_pedido (pedido_id),
    INDEX idx_produto (produto_id),
    INDEX idx_servico (servico_id),
    
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE SET NULL,
    FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: agendamentos
-- ============================================
-- Agendamento de serviços
-- ============================================
CREATE TABLE IF NOT EXISTS agendamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cliente_id INT,
    telefone VARCHAR(20) NOT NULL,
    servico_id INT,
    pedido_id INT,
    data_agendamento DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fim TIME,
    status ENUM('agendado', 'confirmado', 'em_andamento', 'concluido', 'cancelado', 'nao_compareceu') DEFAULT 'agendado',
    veiculo VARCHAR(255),
    placa VARCHAR(20),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_cliente (cliente_id),
    INDEX idx_servico (servico_id),
    INDEX idx_data (data_agendamento),
    INDEX idx_status (status),
    
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE SET NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: promocoes
-- ============================================
-- Promoções ativas
-- ============================================
CREATE TABLE IF NOT EXISTS promocoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('produto', 'servico', 'categoria', 'geral') DEFAULT 'produto',
    produto_id INT,
    servico_id INT,
    categoria_id INT,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    desconto_percentual DECIMAL(5,2),
    desconto_valor DECIMAL(10,2),
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_produto (produto_id),
    INDEX idx_servico (servico_id),
    INDEX idx_datas (data_inicio, data_fim),
    INDEX idx_ativo (ativo),
    
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    FOREIGN KEY (servico_id) REFERENCES servicos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: configuracoes
-- ============================================
-- Configurações gerais do sistema
-- ============================================
CREATE TABLE IF NOT EXISTS configuracoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chave VARCHAR(100) NOT NULL UNIQUE,
    valor TEXT,
    tipo ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
    descricao VARCHAR(255),
    editavel TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_chave (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: logs_sistema
-- ============================================
-- Logs de ações do sistema
-- ============================================
CREATE TABLE IF NOT EXISTS logs_sistema (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('info', 'warning', 'error', 'debug') DEFAULT 'info',
    modulo VARCHAR(50),
    acao VARCHAR(100),
    descricao TEXT,
    dados JSON,
    usuario_id INT,
    ip VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_tipo (tipo),
    INDEX idx_modulo (modulo),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABELA: importacoes
-- ============================================
-- Histórico de importações de arquivos
-- ============================================
CREATE TABLE IF NOT EXISTS importacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo ENUM('produtos', 'servicos', 'clientes') NOT NULL,
    arquivo VARCHAR(255),
    total_registros INT DEFAULT 0,
    registros_sucesso INT DEFAULT 0,
    registros_erro INT DEFAULT 0,
    erros JSON,
    usuario_id INT,
    status ENUM('processando', 'concluido', 'erro') DEFAULT 'processando',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_tipo (tipo),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DADOS INICIAIS: usuário admin
-- ============================================
-- Senha padrão: admin123 (bcrypt hash)
INSERT INTO usuarios (nome, email, senha, role) VALUES
('Administrador', 'admin@loja.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- ============================================
-- DADOS INICIAIS: categorias
-- ============================================
INSERT INTO categorias (nome, descricao, icone) VALUES
('Filtros', 'Filtros de óleo, ar, combustível e cabine', '🔧'),
('Freios', 'Pastilhas, discos, lonas e componentes de freio', '🛑'),
('Suspensão', 'Amortecedores, molas, bandejas e pivôs', '🔩'),
('Motor', 'Peças de motor, correias, velas e bombas', '⚙️'),
('Elétrica', 'Baterias, alternadores, motores de partida', '⚡'),
('Iluminação', 'Faróis, lanternas, lâmpadas e LEDs', '💡'),
('Óleo e Fluidos', 'Óleos de motor, câmbio, fluido de freio', '🛢️'),
('Acessórios', 'Tapetes, capas, organizadores e outros', '🎨'),
('Pneus', 'Pneus novos e remold de diversas marcas', '🔘'),
('Lataria', 'Para-choques, capôs, portas e retrovisores', '🚗')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

-- ============================================
-- DADOS INICIAIS: categorias de serviços
-- ============================================
INSERT INTO categorias_servicos (nome, descricao, icone) VALUES
('Manutenção Preventiva', 'Revisões e manutenções programadas', '🔧'),
('Manutenção Corretiva', 'Reparos e consertos em geral', '🛠️'),
('Elétrica Automotiva', 'Serviços elétricos e eletrônicos', '⚡'),
('Ar Condicionado', 'Manutenção e recarga de A/C', '❄️'),
('Suspensão e Direção', 'Alinhamento, balanceamento e reparos', '🔩'),
('Freios', 'Troca e reparo de sistema de freios', '🛑'),
('Injeção Eletrônica', 'Diagnóstico e limpeza de injeção', '💻'),
('Funilaria e Pintura', 'Reparos de lataria e pintura', '🎨')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

-- ============================================
-- DADOS INICIAIS: serviços
-- ============================================
INSERT INTO servicos (codigo, nome, descricao, categoria_id, preco, duracao_estimada) VALUES
('SRV001', 'Troca de Óleo', 'Troca de óleo do motor com filtro incluso', 1, 89.90, 30),
('SRV002', 'Revisão Completa', 'Revisão de 20 itens com checklist completo', 1, 199.90, 120),
('SRV003', 'Troca de Pastilhas de Freio', 'Troca de pastilhas dianteiras ou traseiras', 6, 79.90, 45),
('SRV004', 'Alinhamento e Balanceamento', 'Alinhamento de direção e balanceamento das 4 rodas', 5, 120.00, 60),
('SRV005', 'Diagnóstico Eletrônico', 'Leitura de códigos de falha com scanner', 7, 80.00, 30),
('SRV006', 'Higienização de Ar Condicionado', 'Limpeza e higienização do sistema de A/C', 4, 99.90, 45),
('SRV007', 'Troca de Correia Dentada', 'Troca de correia com tensor', 2, 250.00, 180),
('SRV008', 'Recarga de Ar Condicionado', 'Recarga de gás R134a', 4, 180.00, 60),
('SRV009', 'Troca de Bateria', 'Substituição de bateria com descarte correto', 3, 50.00, 20),
('SRV010', 'Troca de Amortecedores', 'Troca de par de amortecedores dianteiros ou traseiros', 5, 150.00, 120)
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- ============================================
-- DADOS INICIAIS: produtos de exemplo
-- ============================================
INSERT INTO produtos (codigo, nome, descricao, categoria_id, preco, quantidade, marca, veiculo_compativel) VALUES
('FLT001', 'Filtro de Óleo', 'Filtro de óleo de alta qualidade', 1, 35.90, 50, 'Tecfil', 'Gol, Parati, Saveiro 1.6 1.8'),
('FLT002', 'Filtro de Ar', 'Filtro de ar do motor', 1, 45.00, 30, 'Fram', 'Onix, Prisma 1.0 1.4'),
('FLT003', 'Filtro de Combustível', 'Filtro de combustível flex', 1, 55.00, 25, 'Bosch', 'Universal'),
('FLT004', 'Filtro de Cabine', 'Filtro de ar condicionado', 1, 40.00, 40, 'Mann', 'HB20, Creta'),
('FRE001', 'Pastilha de Freio Dianteira', 'Jogo de pastilhas dianteiras', 2, 89.90, 20, 'Cobreq', 'Gol G5, G6, Fox'),
('FRE002', 'Disco de Freio Dianteiro', 'Disco ventilado dianteiro', 2, 159.90, 15, 'Fremax', 'Civic 2012-2016'),
('FRE003', 'Fluido de Freio DOT4', 'Fluido de freio 500ml', 2, 32.00, 60, 'Bosch', 'Universal'),
('SUS001', 'Amortecedor Dianteiro', 'Amortecedor dianteiro pressurizado', 3, 189.90, 12, 'Cofap', 'Corsa, Celta, Prisma'),
('SUS002', 'Kit Batente e Coifa', 'Kit completo amortecedor', 3, 75.00, 18, 'Sampel', 'Gol, Fox, Voyage'),
('MOT001', 'Vela de Ignição', 'Vela de ignição iridium', 4, 45.00, 100, 'NGK', 'Universal'),
('MOT002', 'Correia Dentada', 'Correia dentada do comando', 4, 65.00, 20, 'Gates', 'Uno, Palio Fire'),
('MOT003', 'Bomba de Água', 'Bomba de água do motor', 4, 120.00, 10, 'Urba', 'Gol 1.0 8V'),
('ELE001', 'Bateria 60Ah', 'Bateria automotiva 60Ah', 5, 350.00, 8, 'Moura', 'Universal'),
('ELE002', 'Alternador', 'Alternador recondicionado', 5, 280.00, 5, 'Bosch', 'Fiat Uno, Palio'),
('OLE001', 'Óleo Motor 5W30 Sintético', 'Óleo sintético 1 litro', 7, 42.00, 80, 'Mobil', 'Universal'),
('OLE002', 'Óleo Motor 15W40 Mineral', 'Óleo mineral 1 litro', 7, 25.00, 100, 'Lubrax', 'Universal'),
('ACE001', 'Tapete Borracha Universal', 'Jogo 4 peças', 8, 89.90, 15, 'Borcol', 'Universal'),
('ACE002', 'Capa Banco Couro Sintético', 'Jogo completo', 8, 199.90, 10, 'Car+', 'Universal')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

-- ============================================
-- DADOS INICIAIS: promoções de exemplo
-- ============================================
INSERT INTO promocoes (tipo, produto_id, titulo, descricao, desconto_percentual, data_inicio, data_fim) VALUES
('produto', 1, 'Filtro de Óleo em Promoção', 'Aproveite o desconto especial!', 15.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY)),
('produto', 5, 'Semana do Freio', 'Pastilhas com desconto', 10.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 7 DAY)),
('produto', 15, 'Troca de Óleo', 'Óleo sintético com preço especial', 20.00, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY))
ON DUPLICATE KEY UPDATE titulo = VALUES(titulo);

-- ============================================
-- DADOS INICIAIS: configurações
-- ============================================
INSERT INTO configuracoes (chave, valor, tipo, descricao) VALUES
('loja_nome', 'Auto Peças XYZ', 'string', 'Nome da loja'),
('loja_telefone', '5591986177169', 'string', 'Telefone principal'),
('loja_endereco', 'Rua Exemplo, 123 - Centro', 'string', 'Endereço da loja'),
('loja_horario', '08:00 às 18:00', 'string', 'Horário de funcionamento'),
('loja_dias_funcionamento', 'Segunda a Sábado', 'string', 'Dias de funcionamento'),
('bot_mensagem_boas_vindas', 'Olá! Bem-vindo à nossa loja! Como posso ajudar?', 'string', 'Mensagem de boas-vindas'),
('bot_mensagem_fora_horario', 'Estamos fora do horário de atendimento. Retornaremos em breve!', 'string', 'Mensagem fora do horário'),
('bot_tempo_sessao', '30', 'number', 'Tempo de sessão em minutos'),
('ia_ativa', 'true', 'boolean', 'Se a IA está ativa'),
('ia_temperatura', '0.7', 'number', 'Temperatura da IA (0-1)'),
('ia_max_tokens', '500', 'number', 'Máximo de tokens por resposta'),
('notificar_estoque_baixo', 'true', 'boolean', 'Notificar quando estoque estiver baixo'),
('email_notificacoes', 'admin@loja.com', 'string', 'E-mail para notificações')
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

-- ============================================
-- FIM DAS MIGRATIONS
-- ============================================

SELECT '✅ Banco de dados criado com sucesso!' AS status;
SELECT CONCAT('👤 Usuários cadastrados: ', COUNT(*)) AS info FROM usuarios;
SELECT CONCAT('📦 Produtos cadastrados: ', COUNT(*)) AS info FROM produtos;
SELECT CONCAT('🔧 Serviços cadastrados: ', COUNT(*)) AS info FROM servicos;
SELECT CONCAT('📁 Categorias de produtos: ', COUNT(*)) AS info FROM categorias;
SELECT CONCAT('📁 Categorias de serviços: ', COUNT(*)) AS info FROM categorias_servicos;
SELECT CONCAT('🔥 Promoções ativas: ', COUNT(*)) AS info FROM promocoes WHERE ativo = 1;
SELECT CONCAT('⚙️ Configurações: ', COUNT(*)) AS info FROM configuracoes;