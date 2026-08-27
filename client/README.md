# HEI Chatbot Client

React frontend for the HEI 2.0 chatbot (Create React App + CRACO, rendered with
`react-native-web`). It talks to the Quart/LangGraph backend in
`llama_chatbot_server_mini`, which grounds every answer in a persisted vector
index.

The whole UI is one component: [`src/HeiChatClientV3.jsx`](src/HeiChatClientV3.jsx).

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Scripts](#scripts)
- [Project structure](#project-structure)
- [Backend endpoints](#backend-endpoints)
- [The /chat request](#the-chat-request)
- [SSE events](#sse-events)
- [Retrieval modes](#retrieval-modes)
- [Response styles](#response-styles)
- [Themes](#themes)
- [UI surfaces](#ui-surfaces)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js 18+ and npm
- A running backend (`python app.py` in `llama_chatbot_server_mini`) reachable
  from the client, with both vector indexes built:
  - `hvaerinnafor` — article-only index (~100 articles)
  - `hvaerinnafor_unified` — hybrid index (~100 articles + ~9000 ung.no Q&A
    pairs, cross-pollinated)

## Setup

```powershell
# Backend in a separate terminal — serves on http://localhost:80
python app.py

# Client
cd client
npm install
npm start
```

The dev server runs on http://localhost:3000 and points at
`http://localhost:80`. A production build points at the Azure web app instead;
both are hard-coded in [HeiChatClientV3.jsx:53-60](src/HeiChatClientV3.jsx#L53-L60).

## Scripts

Run inside `client/`:

| Command         | What it does                                             |
| --------------- | -------------------------------------------------------- |
| `npm start`     | CRA dev server via CRACO, with hot reload                |
| `npm run build` | Minified production bundle in `client/build/`            |
| `npm test`      | Test runner in watch mode (no test files at the moment)  |

[`craco.config.js`](craco.config.js) only enables the automatic JSX runtime.
It must stay in this directory: CRACO resolves its config from the directory the
command runs in and aborts with *"Config file not found"* if there is none.

## Project structure

```
client/
├── craco.config.js          CRACO/Babel config (required — see above)
├── public/                  index.html template, favicon, manifest
└── src/
    ├── index.js             ReactDOM entry point
    ├── App.js               ThemeProvider + HeiChatClientV3
    ├── App.css              html/body/#root sizing, theme CSS variables
    ├── index.css            base typography reset
    ├── HeiChatClientV3.jsx  the entire chat UI (~3300 lines)
    ├── assets/images/       logo, typing-animation frames, thumb icons
    └── theme/
        ├── ThemeContext.jsx ThemeProvider + useTheme, persists to localStorage
        └── themes.js        the five colour themes
```

## Backend endpoints

| Call             | When                                   | Purpose |
| ---------------- | -------------------------------------- | ------- |
| `GET /healthz`   | Polled on mount every 2 s until ready  | Backend reports `{ ready, message }` while it loads indexes; a banner shows the message until `ready` is true ([:1137](src/HeiChatClientV3.jsx#L1137)) |
| `GET /documents` | When the user opens the "Kilder" panel | Returns `{ documents: [...] }` — the articles the bot can draw on ([:666](src/HeiChatClientV3.jsx#L666)) |
| `POST /examples` | On the landing screen                  | Agent `hvaerinnafor_examples` streams back topic categories with example questions ([:695](src/HeiChatClientV3.jsx#L695)) |
| `POST /chat`     | Every user turn                        | The question. Streams the answer back as SSE ([:1344](src/HeiChatClientV3.jsx#L1344)) |

Each turn aborts the previous one through an `AbortController`, so switching
questions mid-stream cancels the in-flight request instead of interleaving two
answers.

## The /chat request

```
POST {webserverEndPoint}/chat
Content-Type: application/json
Cache-Control: no-cache
Accept: text/event-stream
```

| Field                    | Source                                                                     | Example |
| ------------------------ | -------------------------------------------------------------------------- | ------- |
| `messages`               | the current input only — no client-side history                            | `[{ role: 'user', content: '…' }]` |
| `session_id`             | `chatId`, a uuid v4 generated per page load                                | `"f7c1…e9"` |
| `clientType`             | constant                                                                    | `"HEI"` |
| `agent`                  | `hvaerinnafor`, or `hvaerinnafor_related_qa` for a clicked related question | `"hvaerinnafor"` |
| `similarity_top_k`       | constant                                                                    | `"5"` |
| `similarity_cutoff`      | constant                                                                    | `"0.75"` |
| `claims_valid_threshold` | constant — fraction of claims that must be supported by sources            | `"1.0"` |
| `vectorIndex`            | from the active [retrieval mode](#retrieval-modes)                          | `"hvaerinnafor_unified"` |
| `stream`                 | constant                                                                    | `true` |
| `from_related_q`         | `true` when the user clicked a suggested follow-up                          | `false` |
| `from_node_id`           | source node id when `from_related_q`, else `null`                           | `null` |
| `response_style`         | **omitted** on `auto`; otherwise the forced [style](#response-styles)       | `"warm"` |

The constants live at [HeiChatClientV3.jsx:66-69](src/HeiChatClientV3.jsx#L66-L69).

### Reproducing a request with curl

```powershell
$body = '{
  "messages": [{ "role": "user", "content": "Kan jeg slutte pa videregaende?" }],
  "session_id": "debug-session-001",
  "clientType": "HEI",
  "agent": "hvaerinnafor",
  "similarity_top_k": "5",
  "similarity_cutoff": "0.75",
  "claims_valid_threshold": "1.0",
  "vectorIndex": "hvaerinnafor_unified",
  "stream": true,
  "from_related_q": false,
  "from_node_id": null
}'

curl.exe -N -X POST http://localhost:80/chat -H "Content-Type: application/json" -H "Accept: text/event-stream" --data-raw $body
```

Swap `vectorIndex` to `hvaerinnafor` to reproduce **Art** mode, and add
`"response_style": "warm"` to force a rewrite style.

## SSE events

The stream is parsed line by line in `handleStream`
([:862](src/HeiChatClientV3.jsx#L862)). Lines starting with `:` are heartbeats
and ignored; `data: [DONE]` and an `event: "done"` payload both mark the end,
but the reader deliberately keeps reading until the server closes the
connection — bailing out early makes the backend log a client abort.

Each JSON payload carries an `event` name; the text is read from
`structured_answer_delta`, `delta` or `text`, whichever is present.

| `event`                       | Effect on the UI |
| ----------------------------- | ---------------- |
| `examples_categories`         | Topic cards on the landing screen (only on the `/examples` stream) |
| `refined query`               | The rewritten/standalone version of the question, shown above the answer |
| `answer`                      | Main answer text, appended and revealed with a typewriter effect |
| `short_answer`                | Condensed answer variant |
| `similar` / `related queries` | Suggested follow-up questions ("Jeg kan også svare på:") |
| `query_status`                | JSON blob with pipeline status — severity, stance, retrieval details |
| `systeminfo`                  | Debug lines collected per turn, shown in the expandable system-info section |
| `refs` / `references`         | Markdown list of the sources used for the answer |
| `done`                        | Marks the end of the stream |

Unknown events are ignored.

## Retrieval modes

`vectorIndex` selects which persisted index the backend's main retriever loads.
The mode is picked in the **Modus** panel and sent with the next question;
earlier turns keep whatever they were sent under.

| Pill    | Key       | `vectorIndex`          | What it means |
| ------- | --------- | ---------------------- | ------------- |
| **Art** | `art`     | `hvaerinnafor`         | Article-only retrieval — the original, pre-unified behaviour |
| **Hyb** | `unified` | `hvaerinnafor_unified` | Every query hits the unified index. **Default** — cleanest A/B signal |

Defined at [HeiChatClientV3.jsx:79-83](src/HeiChatClientV3.jsx#L79-L83).

### Glossary

The in-app `(i)` toggle next to the mode pills explains the indexes
([:110-126](src/HeiChatClientV3.jsx#L110-L126)):

- **artikkel-indeksen** — ~100 article pages.
- **spørsmål&svar-indeksen** — ~9000 ung.no Q&A pairs, indexed on their own
  without article text.
- **hybrid-indeksen** — both of the above indexed together and cross-pollinated,
  so each article is enriched with related Q&A.

## Response styles

The server's `apply_response_style` node rewrites the grounded answer in one of
four tones. Normally it picks the tone itself from `(severity, stance)`; the
**Stil** pills can force one for A/B testing and quality review
([HeiChatClientV3.jsx:101-108](src/HeiChatClientV3.jsx#L101-L108)).

| Pill        | `response_style` | Effect |
| ----------- | ---------------- | ------ |
| **Auto**    | *(omitted)*      | Server routes on severity + stance. **Default** |
| **Fakta**   | `factual`        | Skips the rewrite entirely — raw grounded answer |
| **Vennlig** | `warm`           | Light normalisation, knowledgeable-friend tone |
| **Støtte**  | `supportive`     | Explicit validation, written for the affected party |
| **Krise**   | `crisis`         | Support first, help resources early, kept short |

`Auto` is the safe production setting. Forcing `factual` on a serious question
produces a cold answer to a situation that needs support, so use the overrides
deliberately.

## Themes

Five themes ship in [`theme/themes.js`](src/theme/themes.js): **Lys** (default),
**Mørk**, **Sjø**, **Lavendel** and **Fersken**. `ThemeProvider` persists the
choice under the `hei-theme` localStorage key and mirrors the background and
text colour onto the `--app-bg` / `--app-text` CSS variables plus a `data-theme`
attribute on `<html>`, so plain CSS can follow the active theme. The picker sits
in the **Innstillinger** drawer.

## UI surfaces

- **Landing screen** — topic cards built from the `/examples` categories.
  Colours cycle through `TOPIC_PALETTE`; the one-line blurb under each title is
  looked up in `TOPIC_BLURBS` by title, so a new server-side category shows up
  without a blurb until it is added there
  ([:139-149](src/HeiChatClientV3.jsx#L139-L149)).
- **Answer turn** — refined query, streamed answer, expandable sources, related
  questions, expandable status and system-info sections.
- **Kilder panel** — the article list from `/documents`.
- **Innstillinger drawer** — theme picker and help.
- **Modus panel** — retrieval mode and response style pills, opened from the
  "Modus" pill in the input row; collapsed it just summarises the current
  selection.
- **Thumbs up/down** — recorded in component state per turn only. Nothing is
  sent to the server yet.
- **Server-not-ready banner** — driven by `/healthz` polling.

## Troubleshooting

**Stale assets or misbehaving hot reload**

```powershell
Remove-Item -Recurse -Force .\node_modules\.cache
```

**`craco: Config file not found`** — `craco.config.js` is missing from
`client/`. It must sit next to `package.json`.

**Answers never arrive, banner says the server is loading** — the backend is
still building its indexes, or `webserverEndPoint` points somewhere
unreachable. Check `GET http://localhost:80/healthz` directly.
