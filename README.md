# Ecossistema Omega

Portal unificado para acesso aos sistemas internos da empresa, com autenticação centralizada, controle de permissões por usuário e painel administrativo para gestão de módulos.

## Visão Geral

O sistema funciona como uma camada central de acesso:

- autentica usuários no Ecossistema
- exibe apenas os sistemas liberados para cada usuário
- registra histórico de acesso ao Ecossistema e aos módulos
- permite administração de usuários, sistemas e permissões
- suporta handoff SSO para sistemas integrados

## Funcionalidades

- login com sessão persistida
- dashboard com carrossel de cards dos sistemas liberados
- histórico de acessos
- troca de senha do usuário autenticado
- painel admin para:
  - criar e editar usuários
  - criar e editar sistemas
  - definir acessos por sistema
  - configurar imagens dos cards
  - visualizar mapeamentos SSO
- checagem de disponibilidade dos sistemas
- upload e uso de imagens locais para cards e identidade visual

## Stack

- Node.js
- Express
- EJS
- PostgreSQL via `pg`
- SQLite via `better-sqlite3` como fallback local
- `express-session`
- `multer`
- `jsonwebtoken`

## Estrutura Principal

Arquivos centrais:

- `server.js`: rotas, autenticação, sessão, renderização e integração entre camadas
- `src/db.js`: inicialização do banco, queries e regras de persistência
- `public/styles.css`: estilos globais
- `public/app.js`: comportamento do login, carrossel e formulários administrativos

Views principais:

- `views/login.ejs`
- `views/dashboard.ejs`
- `views/change-password.ejs`
- `views/admin-home.ejs`
- `views/admin-users.ejs`
- `views/admin-systems.ejs`
- `views/admin-history.ejs`
- `views/admin-mappings.ejs`

## Rotas Principais

Autenticação:

- `GET /login`
- `POST /login`
- `POST /logout`

Usuário autenticado:

- `GET /dashboard`
- `GET /go/:systemId`
- `GET /account/password`
- `POST /account/password`

Admin:

- `GET /admin`
- `GET /admin/users`
- `GET /admin/systems`
- `GET /admin/history`
- `GET /admin/mappings`

## Banco de Dados

O sistema suporta dois modos:

- PostgreSQL em ambientes com `DATABASE_URL`
- SQLite para execução local sem banco externo

Tabelas utilizadas:

- `users`
- `systems`
- `user_system_access`
- `user_system_links`
- `settings`
- `historico`

## Rodar Localmente

Instalação:

```bash
npm install
```

Execução:

```bash
npm start
```

Aplicação disponível em:

```text
http://localhost:3000
```

## Variáveis de Ambiente

Variáveis utilizadas pelo projeto:

- `PORT`
- `NODE_ENV`
- `SESSION_SECRET`
- `DATABASE_URL`
- `IMAGES_DIR`

O sistema também pode usar variáveis adicionais de integração SSO, quando essa funcionalidade estiver habilitada para algum módulo.

## Imagens e Assets

O projeto usa assets locais em `public/assets` e também suporta imagens servidas por `/images`.

Em produção, o diretório de imagens pode ser apontado por `IMAGES_DIR`.

## Deploy

Fluxo recomendado:

1. publicar o repositório no GitHub
2. conectar o repositório ao Railway
3. configurar variáveis de ambiente do serviço
4. apontar o banco PostgreSQL do projeto
5. publicar as alterações pela branch principal

## Observações

- o sistema local e o ambiente de produção podem ter quantidades diferentes de módulos cadastrados; por isso, mudanças visuais devem sempre ser testadas com responsividade real
- o README não documenta credenciais, segredos, chaves ou detalhes operacionais sensíveis
