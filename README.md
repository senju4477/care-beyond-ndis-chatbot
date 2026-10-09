# Care Beyond Expectations chatbot

A custom text assistant for Care Beyond Expectations, designed to run as one Hostinger Node.js Web App and embed into the existing WordPress website. It can be adapted for other providers with separate business profiles and document collections.

## What is implemented

- Responsive standalone guide and floating website widget using the existing business logo.
- Curated public website information: ten listed supports, Melbourne service area, email, phone, business address and office hours.
- Shared official NDIS guidance with source links. Registration remains **unconfirmed** until the business verifies it.
- Answers from approved information without an API key. Optional OpenAI Responses API answers use retrieved records and validated source identifiers.
- Email enquiries to **info@carebeyondexp.com.au**, sent through authenticated Hostinger SMTP when configured. Visitors choose whether to share their conversation.
- Password-protected document manager supporting text PDFs, DOCX, TXT and Markdown; manual website refresh; per-provider document collections.
- No routine storage of chat transcripts or enquiries. Approved documents and AI request counts are stored in the configured data directory. SMTP receives an enquiry and any consented transcript; when enabled, OpenAI receives a question, recent conversation and relevant knowledge excerpts. `store:false` disables Responses application-state storage, but does not by itself provide zero data retention.
- Server-side keys, origin checks, input limits, email header validation, admin cookies, rate limits and persistent AI request caps.

## Confirmed business details

| Detail | Value |
| --- | --- |
| Enquiry email | info@carebeyondexp.com.au |
| Phone | 0459 157 002 |
| Business address | 55 Flemington Road, North Melbourne |
| Monday–Friday | 8am–5pm, Melbourne time |
| Saturday | 9am–1pm, Melbourne time |
| Sunday and public holidays | Confirm with the team |
| Service area | Melbourne and surrounding areas; individual suburb availability must be confirmed |
| Registration | Unconfirmed in this assistant, by owner instruction |

Website sources checked on 9 October 2026:

- https://carebeyondexp.com.au/
- https://carebeyondexp.com.au/our-services/
- https://carebeyondexp.com.au/contact/

The live site contains inconsistent legacy email/phone footer details and a registration claim. This assistant uses the owner's supplied email and address, the consistent main phone, published office hours and the owner's instruction to leave registration pending. It does not reproduce website testimonials or performance claims.

## Deploy on Hostinger

Create a separate Node.js Web App and connect `centredbycare.com.au` as its hosting domain. The chatbot continues to serve Care Beyond Expectations on `carebeyondexp.com.au`; this hosting address does not change its business profile. Import this project using Hostinger's supported repository or upload workflow. If uploading a ZIP, keep `package.json` at the project root. Use:

| Setting | Value |
| --- | --- |
| Node.js version | 22.x, at least 22.16 |
| Install | npm ci |
| Build command | npm run build |
| Output directory | dist |
| Start command, when available | npm start |
| Entry file, when an entry is requested | app/server.mjs |
| Listening address | 0.0.0.0 |
| Port | The PORT environment variable provided by Hostinger |

This is a Node server. The `dist` directory contains browser assets; serve it through the Node app to enable `/api/chat`, `/api/handoff` and `/api/admin/*`. The app does not require Docker, Workers, serverless functions, or SSH.

Set environment variables in Hostinger; **do not commit passwords or API keys**. `.env.example` is a complete non-secret starting point.

| Variable | Set to |
| --- | --- |
| NODE_ENV | production |
| SITE_URL | https://centredbycare.com.au |
| OPENAI_API_KEY | Your OpenAI API project key; leave blank for approved knowledge answers |
| OPENAI_MODEL | gpt-4.1-mini, or a tested compatible Responses model |
| SMTP_HOST | smtp.hostinger.com |
| SMTP_PORT | 465 |
| SMTP_SECURE | true |
| SMTP_USER | info@carebeyondexp.com.au |
| SMTP_PASSWORD | The mailbox password, entered only in Hostinger |
| SMTP_FROM | info@carebeyondexp.com.au |
| ADMIN_PASSWORD | A unique password of at least 16 characters |
| DATA_DIR | An app-writable persistent directory; default ./runtime-data |
| DEFAULT_TENANT | care-beyond |
| ALLOWED_ORIGINS | https://carebeyondexp.com.au,https://www.carebeyondexp.com.au |
| TRUST_PROXY | false; enable only when Hostinger's trusted proxy sanitises forwarding headers |
| AI_DAILY_LIMIT | 300, adjustable |
| AI_MONTHLY_LIMIT | 3000, adjustable |

Verify whether your deployment workflow preserves `DATA_DIR` across redeployments. Back it up before redeploying. If a release replaces local storage, use a durable location supported by your hosting. File-backed counters and in-memory admin sessions/rate limits suit a single Node process; use a shared database/session store before scaling to multiple processes or hosts. Add an OpenAI project spending cap as an additional cost control.

Hostinger SMTP reference: https://www.hostinger.com/support/4305847-set-up-hostinger-email-on-your-applications-and-devices/

## Add the widget to WordPress

After deploying the Node.js app at `https://centredbycare.com.au`, add this script to the Care Beyond Expectations WordPress website at `https://carebeyondexp.com.au`, using an Elementor HTML widget or your site's footer/custom-code facility:

```html
<script src="https://centredbycare.com.au/embed.js" data-tenant="care-beyond" defer></script>
```

The widget is isolated in an iframe. The Node app's allowed origins and frame policy already include the Care Beyond website; set `SITE_URL` to the deployed Node origin. The private ChatGPT review is for the owner to inspect and is not suitable for a public WordPress embed. Use the Hostinger app address for real website visitors.

## Manage documents

Open `/admin` (or `/admin.html`) on the Hostinger app, sign in with `ADMIN_PASSWORD`, select the provider and upload an approved document. Text-based PDFs and DOCX files are extracted on the server. Scanned PDFs need OCR first. Documents are limited to 5 MB and 150,000 extracted characters; keep them concise for accurate retrieval. The stored content is readable server-side and must not contain participant records or confidential material.

The shared NDIS summaries live in `data/ndis.json`. Check the official source before changing each record and update `reviewedAt`. Shared guidance and imported documents older than 120 days are excluded from server answers. Curated business profile facts remain available and should be reviewed whenever they change. Source links and review dates remain visible. This first release uses lexical retrieval rather than semantic embeddings; ambiguous questions may require a clearer question or human handoff.

## Add another provider

Copy `data/tenants/care-beyond.json` to a new file, use a unique lowercase `id`, and replace all business details, origin allowlists, website URLs and services. Restart the Node app. The shared NDIS guidance is reused, but uploaded documents are stored under separate provider identifiers. Embed with the new `data-tenant` value. Business facts are configuration-driven; the front-end logo and default display labels are Care Beyond branding and should be adapted for a new branded client release. The current owner dashboard administers all configured providers; separate customer logins/billing are not implemented.

## Verification and activation

`npm test` verifies contact/registration guards, sourced answers, unknown/funding handoff, API input and origin checks, authenticated document ingestion, consented SMTP routing, failure handling, JSON AI schema/citation validation, budget limits and actual PDF/DOCX extraction. `npm run build` packages the browser assets. Dependencies are pinned; the argparse override removes a vulnerable unused Mammoth CLI dependency path. The application uses Mammoth's library API, not its CLI.

Before installing the widget for visitors:

1. Configure the real app address and secrets, then confirm `/api/health` returns `{ "ok": true }`.
2. Ask a question that uses AI, such as “Explain the different plan management options”, and verify the sources against the official page.
3. Send a consented enquiry yourself and confirm it arrives in the mailbox and Reply-To addresses you correctly. SMTP acceptance alone is not proof of inbox delivery.
4. Review the full page and widget on desktop/mobile, including keyboard navigation and email fallback.

The private review uses curated knowledge answers and email drafts. No live AI call, real SMTP delivery, Hostinger deployment or WordPress installation has been performed. Browser visual QA could not be run in the build environment; the responsive layout was inspected in source and the backend was functionally tested.

## Development

```sh
npm ci
npm run build
npm test
npm start
```

The app binds to `0.0.0.0` and `process.env.PORT` in production. Node 22.16+ is required for the optional environment-file start flag and supported document parsing. Secrets are read from the environment. Avoid exposing the admin password in logs, files or chat.

OpenAI implementation references:

- https://developers.openai.com/api/docs/guides/migrate-to-responses
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
