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

This repository currently contains the deployment foundation, not the messaging product:

- A dependency-free Node.js 24 HTTP server and a placeholder web entry point.
- `GET /api/health` reports service status and the running Git revision.
- A non-root Docker container and production Compose configuration.
- PR tests, container smoke tests, and automatic production deployment after successful checks on `main`.
- Shared-Caddy routing with health checks and failure recovery.

Registration, message storage, messaging endpoints, business authentication, push notifications, and the mobile shell are still to be implemented.

## Local development

With Node.js 24 and Python 3 installed:

```sh
npm start
npm test
python3 -m unittest discover -s tests -v
```

The web entry point is at `http://localhost:3000` and health is at `http://localhost:3000/api/health`. No npm dependencies need to be installed.

See [DEPLOY.md](DEPLOY.md) for GitHub secrets, variables, shared-server prerequisites, and the deployment flow.
