# 🚗 Bot WhatsApp - Loja Automotiva

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Bot de atendimento automatizado para lojas automotivas via WhatsApp**

Responda seus clientes automaticamente com informações de produtos em estoque, 24 horas por dia, 7 dias por semana.

[Instalação](#-instalação) • [Funcionalidades](#-funcionalidades) • [Configuração](#️-configuração) • [Suporte](#-suporte)

</div>

---

## 📋 Funcionalidades

<table>
<tr>
<td width="50%">

### 🤖 Automação
- ✅ Atendimento automático 24/7
- ✅ Menu interativo inteligente
- ✅ Respostas instantâneas
- ✅ Registro automático de clientes

</td>
<td width="50%">

### 🔍 Consultas
- ✅ Busca de produtos em estoque
- ✅ Pesquisa por nome de peça
- ✅ Busca por veículo compatível
- ✅ Preços e disponibilidade

</td>
</tr>
<tr>
<td width="50%">

### 📊 Gestão
- ✅ Histórico de conversas
- ✅ Relatórios de atendimento
- ✅ Logs detalhados
- ✅ Backup de credenciais

</td>
<td width="50%">

### 👤 Atendimento Humano
- ✅ Encaminhamento inteligente
- ✅ Fila de atendimento
- ✅ Notificações para equipe
- ✅ Transição suave bot → humano

</td>
</tr>
</table>

---

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Descrição | Versão |
|------------|-----------|--------|
| **Node.js** | Runtime JavaScript | ^18.0.0 |
| **Baileys** | Biblioteca WhatsApp Web | ^6.0.0 |
| **MySQL** | Banco de dados relacional | ^8.0.0 |
| **dotenv** | Gerenciamento de variáveis de ambiente | ^16.0.0 |
| **Pino** | Sistema de logs de alta performance | ^8.0.0 |

---

## 📁 Estrutura do Projeto

```
whatsapp-bot-automotiva/
│
├── 📂 src/
│   ├── 📂 config/           # Configurações do sistema
│   │   ├── database.js      # Config do banco de dados
│   │   └── whatsapp.js      # Config do WhatsApp
│   │
│   ├── 📂 database/          # Gerenciamento de dados
│   │   ├── connection.js    # Conexão MySQL
│   │   └── migrations.sql   # Scripts SQL
│   │
│   ├── 📂 handlers/          # Processadores de mensagens
│   │   ├── messageHandler.js
│   │   └── commandHandler.js
│   │
│   ├── 📂 services/          # Lógica de negócio
│   │   ├── productService.js
│   │   ├── customerService.js
│   │   └── searchService.js
│   │
│   ├── 📂 utils/             # Funções auxiliares
│   │   ├── logger.js
│   │   └── formatter.js
│   │
│   └── 📄 index.js           # Ponto de entrada
│
├── 📂 logs/                  # Arquivos de log
├── 📂 auth/                  # Credenciais WhatsApp
├── 📄 .env                   # Variáveis de ambiente
├── 📄 .env.example           # Exemplo de configuração
├── 📄 package.json           # Dependências do projeto
└── 📄 README.md              # Este arquivo
```

---

## 🚀 Instalação

### Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- ✅ **Node.js** 18 ou superior ([Download](https://nodejs.org/))
- ✅ **MySQL** 8.0 ou superior ([Download](https://dev.mysql.com/downloads/))
- ✅ **NPM** ou **Yarn** (incluído com Node.js)
- ✅ **Git** (opcional, para clonar o repositório)

### Passo a Passo

#### 1️⃣ Clone ou acesse o projeto

```bash
cd whatsapp-bot-automotiva
```

#### 2️⃣ Instale as dependências

```bash
npm install
```

#### 3️⃣ Configure as variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Edite o arquivo `.env` com suas configurações:

```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_NAME=loja_automotiva

# Configurações do Bot
BOT_NAME=AutoBot
STORE_NAME=Auto Peças XYZ
PHONE_NUMBER=+5511999999999

# Ambiente
NODE_ENV=production
```

#### 4️⃣ Crie o banco de dados

```bash
# Acesse o MySQL
mysql -u root -p

# Execute o script de criação
source src/database/migrations.sql
```

Ou diretamente:

```bash
mysql -u root -p < src/database/migrations.sql
```

#### 5️⃣ Inicie o bot

```bash
npm start
```

#### 6️⃣ Escaneie o QR Code

Um QR Code aparecerá no terminal. Escaneie com o WhatsApp da loja:

1. Abra o WhatsApp
2. Vá em **Configurações** → **Aparelhos conectados**
3. Toque em **Conectar um aparelho**
4. Aponte a câmera para o QR Code no terminal

✅ **Pronto!** Seu bot está online e pronto para atender clientes.

---

## ⚙️ Configuração

### Variáveis de Ambiente (`.env`)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `DB_HOST` | Host do servidor MySQL | `localhost` ou `127.0.0.1` |
| `DB_PORT` | Porta do MySQL | `3306` |
| `DB_USER` | Usuário do banco de dados | `root` |
| `DB_PASSWORD` | Senha do banco de dados | `senha123` |
| `DB_NAME` | Nome do banco de dados | `loja_automotiva` |
| `BOT_NAME` | Nome do bot | `AutoBot` |
| `STORE_NAME` | Nome da sua loja | `Auto Peças XYZ` |
| `PHONE_NUMBER` | Número do WhatsApp (opcional) | `+5511999999999` |

---

## 💬 Comandos do Bot

### Comandos Disponíveis

| Comando | Ação | Exemplo |
|---------|------|---------|
| `oi` / `olá` / `menu` | Exibe o menu principal | `oi` |
| `1` | Lista produtos em estoque | `1` |
| `2` | Inicia busca por peça | `2` |
| `3` | Falar com atendente humano | `3` |
| `buscar [termo]` | Busca peça pelo nome | `buscar filtro de óleo` |
| `veiculo [modelo]` | Busca por veículo compatível | `veiculo gol g5` |
| `ajuda` | Exibe ajuda e comandos | `ajuda` |

### Fluxo de Conversação

```
Cliente: oi
Bot: Olá! Bem-vindo à Auto Peças XYZ 👋

     📋 Menu Principal:
     
     1️⃣ Ver produtos em estoque
     2️⃣ Buscar uma peça específica
     3️⃣ Falar com atendente
     
     Digite o número da opção desejada.

Cliente: 2
Bot: 🔍 Digite o nome da peça que você procura:

Cliente: filtro de óleo
Bot: 📦 Encontrei 3 produtos:
     
     1. Filtro de Óleo Mann W719/30
        💰 R$ 45,90
        ✅ Em estoque (12 unidades)
     
     2. Filtro de Óleo Bosch 0451103033
        💰 R$ 38,50
        ✅ Em estoque (8 unidades)
     ...
```

---

## 📊 Banco de Dados

### Estrutura das Tabelas

#### 📦 `produtos`
Catálogo de peças e acessórios automotivos

```sql
CREATE TABLE produtos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(255) NOT NULL,
    codigo VARCHAR(50) UNIQUE,
    categoria VARCHAR(100),
    preco DECIMAL(10,2),
    estoque INT DEFAULT 0,
    descricao TEXT,
    veiculos_compativeis TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 👤 `clientes`
Cadastro de clientes que interagiram com o bot

```sql
CREATE TABLE clientes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    telefone VARCHAR(20) UNIQUE NOT NULL,
    nome VARCHAR(255),
    primeira_interacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultima_interacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 💬 `conversas`
Histórico completo de mensagens

```sql
CREATE TABLE conversas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cliente_id INT,
    mensagem TEXT,
    tipo ENUM('recebida', 'enviada'),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
```

#### 🎫 `atendimentos`
Fila de atendimento humano

```sql
CREATE TABLE atendimentos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    cliente_id INT,
    status ENUM('aguardando', 'em_atendimento', 'finalizado'),
    motivo TEXT,
    atendente VARCHAR(100),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);
```

---

## 🔧 Comandos Úteis

```bash
# Iniciar o bot em produção
npm start

# Iniciar em modo desenvolvimento (com auto-reload)
npm run dev

# Executar migrations do banco de dados
npm run migrate

# Verificar logs do sistema
npm run logs

# Limpar cache e credenciais (reconectar WhatsApp)
npm run reset

# Executar testes
npm test

# Verificar saúde do sistema
npm run health-check
```

---

## ⚠️ Avisos Importantes

> **🚨 ATENÇÃO: Leia com cuidado antes de usar**

### ⚡ Recomendações Críticas

1. **📱 Use um número exclusivo para o bot**
   - Não use seu número pessoal ou principal da loja
   - Recomendamos um chip dedicado apenas para o bot

2. **🔐 Segurança das credenciais**
   - Faça backup regular da pasta `auth/`
   - Nunca compartilhe arquivos da pasta `auth/`
   - Adicione `auth/` no `.gitignore`

3. **⚖️ Baileys não é oficial**
   - A biblioteca Baileys não é oficialmente suportada pelo WhatsApp
   - Existe risco de banimento da conta
   - Use por sua conta e risco

4. **💾 Backup de dados**
   - Faça backup diário do banco de dados
   - Mantenha cópias dos logs importantes
   - Configure rotinas automáticas de backup

5. **🔄 Atualizações**
   - Mantenha as dependências atualizadas
   - Monitore os logs para erros
   - Teste em ambiente de desenvolvimento primeiro

---

## 🐛 Problemas Comuns

### ❌ QR Code não aparece

**Solução:**
```bash
# Limpe as credenciais antigas
rm -rf auth/

# Reinicie o bot
npm start
```

---

### ❌ Erro de conexão com MySQL

**Possíveis causas:**
- MySQL não está rodando
- Usuário ou senha incorretos no `.env`
- Banco de dados não foi criado

**Soluções:**
```bash
# Verifique se o MySQL está rodando
sudo systemctl status mysql

# Reinicie o MySQL se necessário
sudo systemctl restart mysql

# Teste a conexão manualmente
mysql -u root -p -h localhost

# Verifique as credenciais no .env
cat .env | grep DB_
```

---

### ❌ Bot desconecta sozinho

**Causas comuns:**
- WhatsApp Web aberto no navegador
- Conexão de internet instável
- Múltiplos dispositivos conectados

**Soluções:**
- ✅ Feche o WhatsApp Web em todos os navegadores
- ✅ Verifique a estabilidade da conexão
- ✅ Desconecte outros dispositivos do WhatsApp

---

### ❌ Mensagens não são enviadas

**Verifique:**
```bash
# Logs do sistema
tail -f logs/bot.log

# Status da conexão
npm run health-check

# Reinicie o bot
npm restart
```

---

### ❌ Erro "Cannot find module"

**Solução:**
```bash
# Reinstale as dependências
rm -rf node_modules package-lock.json
npm install
```

---

## 📈 Monitoramento e Logs

### Visualizar logs em tempo real

```bash
# Todos os logs
tail -f logs/bot.log

# Apenas erros
tail -f logs/error.log

# Últimas 100 linhas
tail -n 100 logs/bot.log
```

### Estrutura de Logs

```
logs/
├── bot.log          # Logs gerais do sistema
├── error.log        # Apenas erros
├── messages.log     # Histórico de mensagens
└── database.log     # Queries do banco
```

---

## 🔒 Segurança

### Boas Práticas

- ✅ Nunca commite o arquivo `.env`
- ✅ Use senhas fortes no MySQL
- ✅ Mantenha as dependências atualizadas
- ✅ Limite o acesso ao servidor
- ✅ Configure firewall adequadamente
- ✅ Faça backups regulares
- ✅ Monitore logs de segurança

---

## 📝 Licença

```
MIT License

Copyright (c) 2024 Bot WhatsApp Loja Automotiva

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Uso livre para fins comerciais e pessoais.**

---

## 🤝 Contribuindo

Contribuições são bem-vindas! Siga estes passos:

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/MinhaFeature`)
3. Commit suas mudanças (`git commit -m 'Adiciona MinhaFeature'`)
4. Push para a branch (`git push origin feature/MinhaFeature`)
5. Abra um Pull Request

---

## 👨‍💻 Suporte

### 💬 Precisa de ajuda?

- 📧 **Email:** suporte@seuprojeto.com
- 💬 **Issues:** [Abra uma issue no GitHub](https://github.com/seu-usuario/whatsapp-bot-automotiva/issues)
- 📖 **Documentação:** [Wiki do projeto](https://github.com/seu-usuario/whatsapp-bot-automotiva/wiki)

### 🐛 Encontrou um bug?

Por favor, inclua na sua issue:
- Descrição detalhada do problema
- Passos para reproduzir
- Logs relevantes
- Versão do Node.js e do sistema operacional

---

## 🎯 Roadmap

### 🚀 Próximas funcionalidades

- [ ] Dashboard web para gerenciamento
- [ ] Integração com sistemas de ERP
- [ ] Envio de orçamentos em PDF
- [ ] Agendamento de serviços
- [ ] Notificações de promoções
- [ ] Suporte a múltiplos idiomas
- [ ] IA para respostas mais inteligentes
- [ ] Integração com pagamento online

---

## 📊 Status do Projeto

![Status](https://img.shields.io/badge/status-ativo-success.svg)
![Maintenance](https://img.shields.io/badge/maintenance-sim-brightgreen.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

---

<div align="center">

### ⭐ Se este projeto te ajudou, deixe uma estrela!

**Desenvolvido com ❤️ para lojistas automotivos**

---

🚗 **Bot WhatsApp - Loja Automotiva** © 2024

</div>