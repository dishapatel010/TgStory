# TGStory

## Overview

TGStory is a Telegram bot that allows users to share images & videos within chats using Mini Apps.

## Setting Up a Mini App in BotFather

1. **Create Bot:**
   - Start a chat with `@BotFather`.
   - Use `/newbot` and follow the prompts.

2. **Configure Mini App:**
   - Create web app for bot: `/newapp` and follow the prompts.

## Direct Links for Mini Apps

- Open Mini App: `https://t.me/botusername/appname`
- With `startapp` parameter: `https://t.me/botusername/appname?startapp=command`
- With `startapp` and compact mode: `https://t.me/botusername/appname?startapp=command&mode=compact`

## Deployment Instructions for TGStory

1. **Deploy `story.js` to Cloudflare Worker.**
2. **Create KV Namespace:**
   - Name it `IMAGES`.
3. **Bind KV Namespace to Worker.**
4. **Set Environment Variables:**
   - `TOKEN`: Your bot token.
   - `DOMAIN`: Worker URL, e.g., `https://example.subdomain.workers.dev/`
5. **Set Webhook:**
   ```
   https://api.telegram.org/botTOKEN/setWebhook?url=https://example.subdomain.workers.dev/bot
   ```

6. **Done!** Start sending images to the bot.
