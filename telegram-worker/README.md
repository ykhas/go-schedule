# GO Schedule Telegram Bot

Stateless Telegram bot for the Union <-> Maple GO schedule. It runs as a Cloudflare Worker webhook and calls the GO Journey API.

## Why This Shape

- Telegram gives you the phone UI without installing a separate client.
- Cloudflare Workers Free has a hard daily request limit, so accidental traffic fails instead of becoming an open-ended bill.
- The Worker stores only a daily request counter in Cloudflare KV.
- A global daily request limit caps abuse without collecting chat IDs.

## Commands

- `/start` or `/help` shows the two route buttons.
- `/u` shows Union to Maple from now.
- `/m` shows Maple to Union from now.
- Use the `Pick date/time` buttons to reply with a Toronto date/time.
- Date/time replies can be `now`, `today 5pm`, `tomorrow 7:30am`, `May 25 8:15am`, or `2026-05-25 10:00`.
- `/u 2026-05-23 10:00` shows Union to Maple for a specific Toronto date/time.
- `/m 2026-05-23 10:00` shows Maple to Union for a specific Toronto date/time.
- `/u today 5pm` and `/m tomorrow 7:30am` also work.

The GO API request uses the selected time minus 30 minutes.

## Setup

1. Create a Telegram bot with BotFather and keep the bot token private.
2. Install dependencies:

   ```sh
   cd telegram-worker
   npm install
   ```

3. Log in to Cloudflare:

   ```sh
   npx wrangler login
   ```

4. Store secrets:

   ```sh
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put GO_TRANSIT_API_KEY
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
   ```

   Use any long random value for `TELEGRAM_WEBHOOK_SECRET`.

5. Create the KV namespace used for the daily request limit:

   ```sh
   npx wrangler kv namespace create RATE_LIMIT_KV
   ```

   Add the returned namespace ID to `wrangler.toml` under `[[kv_namespaces]]`.

6. Optional: restrict who can use the bot if you later decide to collect chat IDs:

   ```sh
   npx wrangler secret put ALLOWED_CHAT_IDS
   ```

   Use a comma-separated list, for example `123456789,987654321`.

7. Deploy:

   ```sh
   npm run deploy
   ```

8. Set the Telegram webhook, replacing the URL with the deployed Worker URL. Avoid putting real secrets directly in your shell history:

   ```sh
   read -rsp "Telegram bot token: " TELEGRAM_BOT_TOKEN
   echo
   read -rsp "Telegram webhook secret: " TELEGRAM_WEBHOOK_SECRET
   echo
   read -rp "Worker URL: " WORKER_URL
   export TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET WORKER_URL
   npm run set-webhook
   ```

Now open the bot in Telegram and send `/start`.
