# GO Schedule Telegram Bot

Stateless Telegram bot for the Union <-> Maple GO schedule. It runs as a Cloudflare Worker webhook and calls the same GO Journey API as the iOS app.

## Why This Shape

- Telegram gives you the phone UI without installing or signing an iOS app.
- Cloudflare Workers Free has a hard daily request limit, so accidental traffic fails instead of becoming an open-ended bill.
- The Worker is stateless: no database, no cache, no user records.
- `ALLOWED_CHAT_IDS` can restrict use to only your Telegram chats.

## Commands

- `/start` or `/help` shows the two route buttons.
- `/u` shows Union to Maple from now.
- `/m` shows Maple to Union from now.
- `/u 2026-05-23 10:00` shows Union to Maple for a specific Toronto date/time.
- `/m 2026-05-23 10:00` shows Maple to Union for a specific Toronto date/time.

The GO API request still uses the selected time minus 30 minutes, matching the Swift app.

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

5. Optional but recommended: restrict who can use the bot. Message your bot once, then temporarily deploy without this value and send `/start`; the bot will show your chat ID if blocked. Then set:

   ```sh
   npx wrangler secret put ALLOWED_CHAT_IDS
   ```

   Use a comma-separated list, for example `123456789,987654321`.

6. Deploy:

   ```sh
   npm run deploy
   ```

7. Set the Telegram webhook, replacing the URL with the deployed Worker URL:

   ```sh
   TELEGRAM_BOT_TOKEN='bot-token' \
   TELEGRAM_WEBHOOK_SECRET='same-random-secret' \
   WORKER_URL='https://go-schedule-bot.your-subdomain.workers.dev' \
   npm run set-webhook
   ```

Now open the bot in Telegram and send `/start`.
