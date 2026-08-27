# HEI 2.0 — chat client

Frontend for the AI chatbot in **«Hva er innafor» 2.0 (HEI 2.0)**, developed by
Helsedirektoratet. It lets Norwegian youth aged 13–19 ask anonymous questions
about bodies, feelings, relationships, sexuality and sexual health, and answers
them from Helsedirektoratet's own editorial content instead of the open web.

Every answer is grounded in retrieved source material (≈100 articles plus
≈9000 ung.no Q&A pairs), classified by severity on the server, and rewritten in
a tone that matches the situation — so a question about something serious gets
support and a referral to a help service rather than a cold, factual reply.

This repository contains **only the client**. The backend lives in
[`llama_chatbot_server_mini`](../llama_chatbot_server_mini) and owns retrieval,
severity classification, safety routing and answer generation.

---

## Repository layout

| Path         | What it holds                                                        |
| ------------ | -------------------------------------------------------------------- |
| `client/`    | The React app (Create React App + CRACO). See [client/README.md](client/README.md). |
| `design/`    | Design references — redesign mock-up, slide deck, colour palette.     |
| `.github/`   | Azure Static Web Apps CI/CD workflow.                                 |

The app is a single UI: [`client/src/HeiChatClientV3.jsx`](client/src/HeiChatClientV3.jsx).
Earlier `v1`/`v2` variants and the runtime variant switcher were removed — see
[git history](#history) if you need them back.

## Quick start

```powershell
# 1. Backend, from the llama_chatbot_server_mini repo (separate terminal)
python app.py            # serves on http://localhost:80

# 2. Client
cd client
npm install
npm start                # http://localhost:3000
```

In development the client talks to `http://localhost:80`; in a production build
it targets the Azure web app. Both are hard-coded in
[`HeiChatClientV3.jsx`](client/src/HeiChatClientV3.jsx#L53-L60).

## How it fits together

```
HeiChatClientV3 (React, react-native-web)
   │
   │  GET  /healthz     → is the server done loading indexes?
   │  GET  /documents   → list of source articles ("Kilder" panel)
   │  POST /examples    → topic cards on the landing screen
   │  POST /chat        → the question itself
   │
   ▼  ← Server-Sent Events (answer, refs, related queries, status, systeminfo)
Quart backend (llama_chatbot_server_mini)
   └── LangGraph workflow: retrieve → ground → classify severity → rewrite style
```

The answer streams back as SSE and is rendered progressively with a typewriter
effect. Details of the payload and every event the client understands are in
[client/README.md](client/README.md).

## Deployment

Pushes to `main` trigger
[`.github/workflows/azure-static-web-apps-ashy-smoke-00a394503.yml`](.github/workflows/azure-static-web-apps-ashy-smoke-00a394503.yml),
which builds `./client` and publishes `client/build` to Azure Static Web Apps.
`CI: false` is set so build warnings don't fail the job.

## History

The repo previously shipped three parallel UIs (`HeiChatClient.jsx`,
`HeiChatClientV2.jsx`, `HeiChatClientV3.jsx`) behind a `localStorage`-backed
`v1/v2/v3` toggle, plus several `HeiChatClient copy*.jsx` scratch files. Only V3
is kept. Everything removed is still reachable in git:

```powershell
git log --diff-filter=D --name-only   # find the commit that deleted a file
git show <commit>^:client/src/HeiChatClientV2.jsx
```
