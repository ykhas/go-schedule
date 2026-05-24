# Agent Notes

## Current Architecture

This repo currently hosts a stateless Telegram bot for GO Transit schedules.

- Runtime: Cloudflare Worker in `telegram-worker/`.
- Public URL: `$WORKER_URL`.
- Telegram integration: webhook registered with `setWebhook` and protected by Telegram's `X-Telegram-Bot-Api-Secret-Token` header.
- Schedule source: GO Transit Journey API.
- Supported routes: Union Station GO to Maple GO and Maple GO to Union Station GO.
- Time behavior: user-selected time is shifted back 30 minutes before calling the GO API.
- Persistence: Cloudflare KV is used only for a daily request counter. No message text, user profile, or schedule results are stored.

The main Worker implementation is `telegram-worker/src/index.js`.

## Commands

Run these from `telegram-worker/` unless a command uses an explicit `--config` path.

```sh
npm install
npm run deploy
npm run set-webhook
```

If this machine does not have system Node installed, the local ignored Node toolchain can be used:

```sh
PATH=/Users/Shared/sv-dankpad/go-schedule/.tools/node/bin:$PATH npm --prefix telegram-worker install
PATH=/Users/Shared/sv-dankpad/go-schedule/.tools/node/bin:$PATH npx wrangler deploy --config telegram-worker/wrangler.toml
```

To inspect live Worker traffic:

```sh
PATH=/Users/Shared/sv-dankpad/go-schedule/.tools/node/bin:$PATH npx wrangler tail --config telegram-worker/wrangler.toml
```

## Cloudflare Configuration

`telegram-worker/wrangler.toml` is intentionally ignored because it is local deployment config.

The checked-in template is `telegram-worker/wrangler.toml.example`:

```toml
name = "your-worker-name"
main = "src/index.js"
compatibility_date = "2026-05-23"

[observability]
enabled = true
```

The current local Worker name is `<worker-name>`.

## Secrets

Never commit real secrets. The local secret file is:

```text
telegram-worker/secrets.yaml
```

The checked-in template is:

```text
telegram-worker/secrets-example.yaml
```

Expected secret names:

- `GO_TRANSIT_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `ALLOWED_CHAT_IDS` optional allowlist

Cloudflare secrets must be set with Wrangler:

```sh
npx wrangler secret put GO_TRANSIT_API_KEY
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

`TELEGRAM_WEBHOOK_SECRET` should be a long random value and must match the secret used when calling Telegram `setWebhook`.

`ALLOWED_CHAT_IDS` is optional. If set, it is a comma-separated allowlist, for example:

```text
123456789,987654321
```

The Worker allows any Telegram chat when `ALLOWED_CHAT_IDS` is unset. Abuse is capped by the global daily KV rate limit.

## Rate Limiting

The Worker uses a `RATE_LIMIT_KV` namespace to cap authenticated Telegram webhook updates.

Configured template limit:

```text
500 requests per Toronto calendar day
```

Create the namespace:

```sh
npx wrangler kv namespace create RATE_LIMIT_KV --config telegram-worker/wrangler.toml
```

Then add the returned namespace ID to local `telegram-worker/wrangler.toml`.

The checked-in example includes:

```toml
[vars]
DAILY_REQUEST_LIMIT = "500"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "replace-with-kv-namespace-id"
```

## Webhook Setup

After deploying, register the Telegram webhook:

```sh
read -rsp "Telegram bot token: " TELEGRAM_BOT_TOKEN
echo
read -rsp "Telegram webhook secret: " TELEGRAM_WEBHOOK_SECRET
echo
read -rp "Worker URL: " WORKER_URL
export TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET WORKER_URL
npm run set-webhook
```

Verify the public health check with the Worker URL from local secrets:

```sh
curl -fsS $WORKER_URL
```

Verify Telegram webhook state:

```sh
curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

Do not paste command output if it includes a real bot token or other secret.

## Commit Safety

Before committing, run:

```sh
git status --short --ignored
```

Keep these untracked or ignored:

- `.tools/`
- `.wrangler/`
- `telegram-worker/.wrangler/`
- `telegram-worker/node_modules/`
- `telegram-worker/secrets.yaml`
- `telegram-worker/wrangler.toml`

Safe files to commit from the Worker setup normally include:

- `.gitignore`
- `AGENTS.md`
- `telegram-worker/README.md`
- `telegram-worker/secrets-example.yaml`
- `telegram-worker/wrangler.toml.example`
- `telegram-worker/src/index.js`
- `telegram-worker/scripts/set-webhook.mjs`
- `telegram-worker/package.json`
- `telegram-worker/package-lock.json`

Review unrelated deletions or modifications before staging.

## Security Notes

The Worker requires `GO_TRANSIT_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and the `RATE_LIMIT_KV` binding before processing Telegram updates.

For private friends/family use without collecting chat IDs, keep the global daily cap low. `500` requests per day is reasonable for a small group.

The Worker should not log Telegram message text, chat IDs, API keys, or full upstream request URLs containing the GO API key.

Cloudflare Workers Free limits help cap accidental traffic, but abuse can still burn daily quota or upstream API quota. Treat the bot username and invite links as semi-public once shared.
