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
- PostgreSQL (`pg`) no Railway
- SQLite (`better-sqlite3`) como fallback local
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
- `DATABASE_URL`: conexao Postgres (quando presente, app usa Postgres)
- `IMAGES_DIR`: caminho do volume de imagens (padrao `/images`)
- `NODE_ENV=production`

## Deploy no Railway

1. Suba este repositorio para GitHub.
2. No Railway, crie um novo projeto e conecte o repo.
3. Adicione um banco Postgres no mesmo projeto Railway.
4. No service `ecosistema-omega`, em **Variables**, clique em **Add Variable** no card roxo e selecione a variavel do Postgres (`DATABASE_URL`).
5. Configure tambem:
   - `SESSION_SECRET` com um valor forte.
   - `NODE_ENV=production`
   - `IMAGES_DIR=/images` (se estiver usando volume)
6. Railway detecta Node automaticamente e executa `npm start`.

## Imagens no volume

Se voce criou um volume em `/images`, salve os arquivos com estes nomes:

- `/images/logo.png`
- `/images/aurora.png`

O sistema tenta usar esses arquivos automaticamente e aplica fallback local se nao existirem.

Tambem e possivel enviar imagens direto no painel admin:

- Menu `Novo` > aba `Configuracao`
- Upload rapido de `Logo` e `Aurora`
- Upload livre para outras imagens (gera URL `/images/...`)

## Observacao importante sobre "manter o link"

O sistema carrega os apps externos via `iframe`, mantendo o link do Ecossistema.

Se algum app bloquear incorporacao via `X-Frame-Options` ou `Content-Security-Policy`, ele nao abre no `iframe`. Nesses casos, use o botao "Abrir em nova aba".
