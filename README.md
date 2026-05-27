# vroom-api

Backend voor **Vroom** — multi-user trip- en brandstof-tracker.

- **Runtime:** Node 22+
- **Framework:** Hono (TypeScript, ESM)
- **DB:** PostgreSQL 16 via Drizzle ORM
- **Auth:** magic-link via Resend, sessie-cookies
- **Docs:** OpenAPI 3.1 op `/docs` (Scalar UI)

## Stack

```
src/
  index.ts            Hono bootstrap, CORS, logger, OpenAPI/Scalar
  env.ts              Zod-gevalideerde env-vars
  db/
    schema.ts         Drizzle schema (users, sessions, magic_links, groepen, groep_leden)
    client.ts         Postgres connection-pool
    migrate.ts        Migratie-runner
  auth/
    sessions.ts       Sessie creatie/lookup + cookie helpers
    magic-link.ts     Magic-link creatie + verzending via Resend
    middleware.ts     requireUser middleware
  lib/
    errors.ts         AppError + global error handler
    tokens.ts         Random tokens + SHA-256 hashing
  routes/
    health.ts         GET /health
    auth.ts           POST /auth/magic-link, GET /auth/callback, POST /auth/logout
    me.ts             GET /me
```

## Setup

### 1. Postgres lokaal

Installeer Postgres 16+ via de [installer voor Windows](https://www.postgresql.org/download/windows/) en maak een database aan:

```sql
create user vroom with password 'vroom';
create database vroom owner vroom;
```

Verbinden via DBeaver: host `localhost`, port `5432`, db `vroom`, user `vroom`, pw `vroom`.

### 2. Resend account

1. Maak een account op [resend.com](https://resend.com)
2. Verifieer een sender-domain (bv. `mail.ingmarvanrheenen.nl`) — Resend laat zien welke DNS-records je moet zetten
3. Maak een API key onder _API Keys_
4. Tijdens development is `RESEND_API_KEY` optioneel; zonder key wordt de link in de console gelogd

### 3. Env + install

```bash
cp .env.example .env
# vul DATABASE_URL en (optioneel) RESEND_API_KEY in

npm install
npm run db:generate     # genereer migratie uit schema
npm run db:migrate      # voer migratie uit op de DB
npm run dev             # tsx watch, herstart bij wijzigingen
```

API draait op `http://localhost:3001`. Docs op `http://localhost:3001/docs`.

## Magic-link flow testen

```bash
curl -X POST http://localhost:3001/auth/magic-link \
  -H 'Content-Type: application/json' \
  -d '{"email":"jij@voorbeeld.nl"}'
```

Zonder `RESEND_API_KEY` zie je de link in de server-console. Klik erop in de browser — je wordt geredirect naar `APP_URL` met een sessie-cookie. Test:

```bash
curl http://localhost:3001/me \
  -H "Cookie: vroom_session=<token-uit-set-cookie-header>"
```

## Tests

```bash
npm test            # alle tests (maakt automatisch de vroom_test database aan)
npm run test:watch  # watch-mode tijdens ontwikkeling
```

Tests draaien tegen een **aparte** `vroom_test` database via Hono's `app.request()` — geen draaiende server nodig. Een vangnet weigert te draaien als de DATABASE_URL niet "test" bevat, zodat dev-data nooit wordt gewist. Drie lagen:

- **Unit** (`test/unit/`) — pure functies
- **Functioneel** (`test/*.test.ts`) — elke endpoint tegen de echte DB
- **Security** (`test/security.test.ts`) — auth-verplichting, cross-tenant toegang (IDOR), rol-escalatie, invite/magic-link-misbruik, injection, token-hashing, hardening-headers, rate limiting

## Code-kwaliteit

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run format       # prettier --write
npm run format:check # prettier --check (zoals CI)
```

## CI/CD

Twee GitHub Actions workflows draaien op elke push en PR naar `Develop` en `main`:

- **CI** (`.github/workflows/ci.yml`) — typecheck + lint + format-check, en de testsuite tegen een Postgres service-container
- **Security** (`.github/workflows/security.yml`) — `npm audit` (faalt op high+), gitleaks secret-scan, semgrep SAST, en dependency-review op PR's

## Deploy naar aaPanel

1. Clone repo op de server (`~/apps/vroom-api`)
2. `npm ci --omit=dev` (na een `npm run build` lokaal of op de server)
3. Maak `.env` met productie-waarden (`SESSION_COOKIE_SECURE=true`, productie-URLs, echte Resend-key)
4. `npm run db:migrate`
5. `pm2 start ecosystem.config.cjs && pm2 save`
6. Plak `nginx.conf.example` in aaPanel's Nginx-config voor `vroom-api.ingmarvanrheenen.nl`, vraag SSL aan via Let's Encrypt

## Beslissingen

- **Postgres, niet SQLite:** multi-user vanaf dag 1 en JSONB voor flexibele auto-meta-velden
- **Drizzle, niet Prisma:** geen runtime-generatie, schema = TS, migraties zijn leesbare SQL
- **Hono, niet Express/Fastify:** TS-native, klein, OpenAPI ingebakken via `@hono/zod-openapi`
- **Magic-link, geen wachtwoorden:** UX past beter op gedeeld familie/vrienden-gebruik
- **Token hashing:** zowel sessie-tokens als magic-link-tokens worden alleen als SHA-256 hash opgeslagen
