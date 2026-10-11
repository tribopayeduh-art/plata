# Integração ZeroBet ↔ API PG

Os jogos PG anteriores foram substituídos pelos 11 jogos da API própria. As demais integrações permanecem para outros provedores.

## Configuração pronta
PG_API_URL e PG_API_TOKEN estão no .env.local do servidor. O token está vinculado à integração Firebase criada para este pacote. ID em PG-INTEGRACAO-ID.txt. Não compartilhe .env.local nem publique esse arquivo no GitHub.
Banco necessário: projeto ai-studio-applet-webapp-6ac28 / Firestore ai-studio-zerobet-510360dd-257a-4327-a126-726b12c9c6d1. Frontend, backend e API devem usar este mesmo banco.

## Fluxo
1. Jogador entra pela autenticação Firebase da bet.
2. Navegador envia seu idToken ao POST /api/game_launch com game_code local-pg-ID e provider_code PGSOFT.
3. O backend valida o jogador e usa req.user.uid, sem aceitar outro player_id enviado pelo navegador.
4. O servidor chama POST /api/pg/v1/launch com Bearer PG_API_TOKEN.
5. O iframe abre a URL recebida em tela cheia.
6. A API debita aposta e credita prêmio por transação no mesmo documento users/UID. O frontend acompanha esse documento com onSnapshot; o próximo giro lê o saldo atual. Nenhuma cópia de saldo é transferida para a iGameWin neste fluxo PG.

## Saldo
Campos principais: walletBalance, balance e realBalance. Não altere o saldo apenas no navegador. A integração Firebase não usa callback externo. Aposta/prêmio têm recibo idempotente no servidor da API.

## Documentação
Abra /docs/pg-api.html e /docs/pg-openapi.json. GET /api/pg/v1/games, POST /balance e POST /launch; bodies e HMAC do modo externo estão descritos ali. O site API está atualmente público, e seus endpoints de integração exigem Bearer. Administração exige conta ChatGPT proprietária.

## Executar
Node 24 recomendado. Execute npm ci, npm run build e npm start. Abra http://localhost:3000. A bet local precisa de internet para Firebase e para a API publicada.

## Validação
Compilação, verificações administrativas e testes isolados de catálogo/identidade/origem passaram. A autenticação e o catálogo dos 11 jogos também foram testados contra a API publicada. Confirmação visual completa dos jogos ainda é necessária. Nenhum teste realizou apostas ou movimentou saldo real.

## Atualização mobile
Barra de nome/minimizar/fechar removida. Desktop usa overlay direto no body com Voltar discreto. Celulares e tablets abrem a URL PG na página inteira, sem iframe; use o Voltar do navegador para retornar à bet. Conexão tem prazo, renovação do token Firebase em 401 e uma repetição segura de abertura em falha transitória.
