# TextMij

TextMij is a free business-to-customer messaging service with a REST API and a lightweight web and mobile client. Businesses send updates and confirmations to unique device IDs, and customers can reply directly—no phone number or email required for customers.

## Project scope

- A device registers with a display name and receives an ID such as `7483-RGY-RCH`.
- A new phone means a new ID and a fresh chat history, by design.
- Businesses register with an email address and business name and receive a free API key.
- Customers and businesses can use the same web client; a Capacitor-style shell will package it as a mobile app.
- Three main pages: Home (device ID), Conversations (one per business), and Settings, plus the conversation view.
- Initially, businesses send a text template containing a title and content. Customers reply with text.
- Business and customer text limits start at 1 KB each and must be independently configurable. Image replies and their separate limits remain to be specified.
- Basic messaging stays free. Businesses may later pay for priority or additional features.

Device IDs are public delivery addresses, not authentication credentials. The future client must authenticate its device session before it can access messages.

## Current implementation

This repository contains the deployment foundation and the first responsive web client:

- A dependency-free Node.js 24 HTTP server and a light Dutch interface for desktop and phone.
- Home with an example device code, a searchable company inbox, settings, and a chat view.
- Working local example replies, unread state, per-conversation mute preferences, profile editing, and settings persistence.
- A UTF-8-aware 1 KB customer reply limit, with independent business/customer limit settings in the client model.
- Company-theme variables scoped to the chat panel, keeping the rest of the app neutral.
- `GET /api/health` reports service status and the running Git revision.
- A non-root Docker container and production Compose configuration.
- PR tests, container smoke tests, and automatic production deployment after successful checks on `main`.
- Shared-Caddy routing with health checks and failure recovery.

The interface is explicitly a **preview**: company conversations and the code are examples, and replies are stored in this browser only. Real device registration, server-side message storage, messaging endpoints, business authentication, push notifications, and the mobile shell are still to be implemented. Preview codes are not real delivery addresses.

## Local development

With Node.js 24 and Python 3 installed:

```sh
npm start
npm run dev
npm test
python3 -m unittest discover -s tests -v
```

The web entry point is at `http://localhost:3000` and health is at `http://localhost:3000/api/health`. Use either `npm start` for the server or `npm run dev` to restart it automatically when source changes. No npm dependencies need to be installed.

See [DEPLOY.md](DEPLOY.md) for GitHub secrets, variables, shared-server prerequisites, and the deployment flow.
