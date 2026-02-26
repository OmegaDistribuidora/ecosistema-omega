# Ecossistema Omega

Portal unificado para acesso aos sistemas da empresa com:

- Login unico e controle de acesso por usuario
- Painel administrativo para criar usuarios
- Cadastro de sistemas (nome + link) com permissao por usuario
- Tema dark customizavel (cores, logo, imagem de fundo)
- Abertura dos sistemas dentro da interface (iframe) para manter o link principal

## Credenciais iniciais

- Usuario: `admin`
- Senha: `Omega@123`

## Stack

- Node.js
- Express + EJS
- SQLite (`better-sqlite3`)
- Sessao persistida em SQLite (`connect-sqlite3`)

## Rodar local

```bash
npm install
npm run start
```

A aplicacao abre em `http://localhost:3000`.

## Variaveis de ambiente

- `PORT`: porta do servidor (Railway define automaticamente)
- `SESSION_SECRET`: segredo da sessao (obrigatorio em producao)
- `NODE_ENV=production`

## Deploy no Railway

1. Suba este repositorio para GitHub.
2. No Railway, crie um novo projeto e conecte o repo.
3. Configure as variaveis:
   - `SESSION_SECRET` com um valor forte.
   - `NODE_ENV=production`
4. Railway detecta Node automaticamente e executa `npm start`.

## Observacao importante sobre "manter o link"

O sistema carrega os apps externos via `iframe`, mantendo o link do Ecossistema.

Se algum app bloquear incorporacao via `X-Frame-Options` ou `Content-Security-Policy`, ele nao abre no `iframe`. Nesses casos, use o botao "Abrir em nova aba".
