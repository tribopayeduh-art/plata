# ZeroBet: 11 jogos PG SOFT e capas

Os 11 clientes originais extraídos estão em `public/<id>`. As novas capas ficam em `public/games/pg/`. O catálogo usa PG SOFT e coloca esses jogos em Em destaque. O código de lançamento local começa com `local-pg-`, separado dos jogos externos.

## Rodar no Windows

Use Node.js 22.12 ou superior, preferencialmente Node.js 24. Baixe o ZIP para Downloads e execute esta linha no CMD:

```cmd
cd /d "%USERPROFILE%\Downloads" && (if not exist "zerobet-pg-soft-11-jogos" mkdir "zerobet-pg-soft-11-jogos") && tar -xf "zerobet-pg-soft-11-jogos.zip" -C "zerobet-pg-soft-11-jogos" && cd "zerobet-pg-soft-11-jogos" && npm ci && npm start
```

Abra `http://localhost:3000`. O catálogo e as capas aparecem sem iGameWin. O lançamento com saldo exige login e a configuração administrativa abaixo.

## Conectar a carteira Firebase

O arquivo enviado não contém uma conta de serviço Firebase Admin. A configuração pública do navegador não autoriza o servidor a debitar ou creditar jogadores. Sem a conta de serviço, o jogo informa que a carteira precisa ser configurada; não cria saldo fictício.

Obtenha o JSON da conta de serviço do mesmo projeto Firebase utilizado pela ZeroBet. Guarde esse arquivo localmente, sem publicá-lo. Na pasta do projeto execute, substituindo o caminho pelo nome real do seu JSON:

```cmd
node scripts/configurar-pg-firebase.mjs "%USERPROFILE%\Downloads\chave-firebase.json" && npm run pg:check
```

O configurador preserva o projeto, grava a chave em `secrets/`, ativa Firebase e gera `PG_SESSION_SECRET` em `.env.local`. `pg:check` verifica somente leitura: não altera usuários ou saldos. Reinicie `npm start` após configurar.

Publique as regras e os índices da base Firestore utilizada pela plataforma com a sua conta Firebase:

```cmd
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project ai-studio-applet-webapp-6ac28
```

O nome da base está em `firebase.json`; confira se continua correspondendo à sua base. Os índices do histórico podem levar alguns minutos para ficar disponíveis. Preserve outros índices que já existam no projeto.

Para produção: `npm run build`, depois `npm start` com `NODE_ENV=production` e a porta desejada em `PORT`. Mantenha `server/`, `public/`, `dist/` e as configurações do servidor juntos. O ZIP contém o código e todos os recursos; `dist` é gerado pelo build.

## Carteira e registros

- O saldo vem de `users/{uid}.walletBalance`, com compatibilidade com `balance`. Os espelhos `balance` e `realBalance` seguem o modelo já usado pela ZeroBet; o metadado `bonusBalance` é preservado.
- Cada giro lê o jogador, valida a aposta, debita e credita o resultado na mesma transação Firestore. A carteira é compartilhada entre os 11 jogos.
- O recibo em `pg_rounds` evita repetir cobranças. O resultado e as continuações ficam em `pg_game_states`. Ambos têm escrita exclusiva do servidor.
- A sessão é assinada e vinculada ao jogador e ao jogo, com validade de seis horas. Cookies e valores enviados pelo navegador não definem o saldo.
- Apostas e prêmios entram no histórico como BET e WIN, além das movimentações `user_bet` e `user_win`. Não são depósitos e não contam como vendas de PIX.
- O saldo da plataforma é consultado novamente após os giros e quando o perfil muda. Ajustes externos de saldo atualizam o cliente do jogo quando ele está livre de um giro em andamento.
- O worker de cada jogo fica na sua pasta e preserva o worker da plataforma.
- O administrador pode alterar capa, nome, destaque e disponibilidade pelo catálogo. O RTP exibido para o motor local corresponde à configuração local de 20%.

Os clientes visuais vieram do arquivo enviado. O servidor de resultados é uma implementação local baseada nas respostas extraídas, com RTP teórico de 20%, conforme pedido anterior. Não é uma conexão com o servidor oficial da PG SOFT. Recursos de bônus especiais não foram integralmente portados; as apostas de base e a continuação em cascata disponível em Butterfly Blossom estão implementadas.

## Correções da carteira existente

A sincronização de perfil agora exige autenticação e não aceita saldo ou privilégio administrativo vindo do navegador. O lançamento externo usa o saldo atual, sem restaurar dinheiro a partir de uma soma histórica de depósitos. O callback externo exige `Authorization: Bearer <segredo>` ou `agent_token`, validado contra `IGW_CALLBACK_SECRET` quando definido ou contra o token do agente existente. Confira esse contrato antes de usar callbacks de outros fornecedores.

## Validação e limites

`npm run pg:test`: onze jogos, saldo insuficiente, prêmios, cascata, isolamento entre jogadores, repetição do mesmo giro, concorrência, cookie forjado, expiração, conta bloqueada, comunicação com a plataforma e worker. Os testes usam uma base transacional isolada; não mexem no Firebase real.

Também passaram a compilação TypeScript/Vite, a checagem sintática do admin e o parser do catálogo. As 11 capas foram inspecionadas e estão referenciadas no projeto. Os prompts usados na geração integrada estão em `CAPAS-PG-PROMPTS.json`.

A carteira real ainda precisa ser validada após fornecer a conta de serviço. A inicialização completa não foi verificada neste ambiente: a revisão automática bloqueou o servidor existente por possível acesso externo à Dotfy. A abertura visual completa dos 11 clientes no navegador não foi confirmada neste teste. Esta entrega não publica nem altera a instalação online.
