# GO Schedule

A stateless Telegram bot for GO Transit schedules between:

- `Union to Maple`
- `Maple to Union`

The bot runs as a Cloudflare Worker webhook in `telegram-worker/`. It calls the GO Transit Journey API when a Telegram user selects a route or sends a command.

See `telegram-worker/README.md` for setup, deployment, webhook registration, and private-chat restrictions.
