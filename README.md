Central de Atendimento (WhatsApp via UAZAPI v2)

## Requisitos
- Node.js 22+
- Docker + Docker Compose (para produção)

## Configuração
1) Copie o `.env.example` para `.env` e preencha os valores:

```bash
cp .env.example .env
```

Variáveis importantes:
- `UAZAPI_BASE_URL=https://varia.uazapi.com`
- `UAZAPI_INSTANCE_NAME=juninho`
- `UAZAPI_TOKEN=...`
- `SESSION_SECRET=...`
- `AGENT_VANDERLEI_PIN=...`
- `AGENT_GUSTAVO_PIN=...`

2) Rode em desenvolvimento:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

## Webhook (UAZAPI → Central)
Configure na UAZAPI o webhook apontando para:
- `https://prazer.varinteligencia.com/api/webhooks/uazapi`

O endpoint valida:
- `BaseUrl` == `UAZAPI_BASE_URL`
- `instanceName` == `UAZAPI_INSTANCE_NAME`
- `token` == `UAZAPI_TOKEN`

## Produção (Servidor próprio)
1) Instale Docker no servidor.
2) Crie um `.env` no servidor (baseado em `.env.example`).
3) Suba:

```bash
docker compose up -d --build
```

O Caddy vai provisionar TLS automaticamente para `prazer.varinteligencia.com`.

## Observação sobre endpoints UAZAPI
Se sua instância usa caminhos diferentes, ajuste:
- `UAZAPI_CHAT_FIND_PATH`
- `UAZAPI_MESSAGE_FIND_PATH`
- `UAZAPI_SEND_TEXT_PATH`

Este projeto foi alinhado com a spec `uazapiGO - WhatsApp API v2.1.0` (endpoints `/chat/find`, `/message/find`, `/send/text`).

## O que fica no banco
- `agents`: atendentes (Vanderlei/Gustavo)
- `chat_state`: status (pendente/resolvido), atribuição, tags

Não armazenamos o conteúdo das mensagens.
