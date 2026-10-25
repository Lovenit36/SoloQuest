# SoloQuest — web app v2

A laptop-first city companion: choose a location, discover real places, build an itinerary, and meet people sharing the same place and time. React + TypeScript + Vinext, with a Cloudflare Worker API and persistent D1/SQLite storage.

**There is no runtime demo catalog, seeded person, simulated reply or automatic group membership.** Without provider keys, discovery shows a connection prompt. Without other registered users and shared plans, social matching and Chat stay empty. Test fixtures exist only in `scripts/test-*.mjs`; they are never loaded or seeded by the application.

## Start on your laptop

Install **Node.js 24 or newer**. Unzip into a folder, open a terminal there, then:

```sh
npm install
npm run setup
```

Setup creates the local database, applies migrations, and creates an ignored `.dev.vars` file with random signing and cleanup secrets. It does not insert any users, places or messages. Add your provider key(s) to `.dev.vars`, then run:

```sh
npm run dev:local
```

Open **http://127.0.0.1:5173**. The command binds to loopback, fails if that port is occupied, and runs cleanup every minute while the process stays open. Create a local account with an email and a password of at least 12 characters, then create your profile. Emails are local identifiers; this development-only account flow does not send verification emails or offer password reset.

Run setup again after source upgrades to apply new migrations. It keeps existing secrets and account data. Do not change already-applied migration files.

## Which keys you need

An AI key alone does **not** supply real venue photos or place listings.

| Environment variable | Purpose | Required? |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Google Places API (New): real recommendations, venue links, hours, photos | Yes, for place discovery and generated itineraries |
| `PLANNER_API_KEY` | OpenAI-compatible chat/completions API, ranks actual provider results | Optional |
| `PLANNER_MODEL` | Model ID available to your AI account | With the AI key |
| `PLANNER_BASE_URL` | Base URL ending in `/v1`, default `https://api.openai.com/v1` | Optional; HTTPS except loopback |
| `TICKETMASTER_API_KEY` | Actual ticketed events, event photos and ticket links | Optional |
| `OPEN_METEO_API_KEY` | Licensed commercial Open-Meteo geocoding and forecasts | Optional for noncommercial testing |
| `PLACE_TOKEN_SECRET` | Signs short-lived provider results before saving references | Setup generates this |
| `MAINTENANCE_SECRET` | Protects the cleanup endpoint | Setup generates this |
| `LOCAL_AUTH_ENABLED` | Real local email/password accounts, **only on loopback hosts** | `true` for local testing, `false` hosted |

### Google Places

1. Create/select a Google Cloud project, enable billing, and enable **Places API (New)**.
2. Create a server-side API key. Restrict the key to the required Places API. A browser referrer restriction is not appropriate for this server-side adapter; use the restrictions supported by your deployment.
3. Put the key after `GOOGLE_PLACES_API_KEY=` in `.dev.vars`. Restart the app.
4. Open **API connections** and refresh, then **Discover** and search. “Key configured” indicates presence only; a successful search verifies authorization, API enablement and billing.

Requests use Text Search (New), Place Details (New) and Place Photos (New). Field masks include price, ratings and hours and may incur paid request tiers. Set provider-side quotas/budget controls for your own testing. Photos are fetched through an authenticated server route; API keys are never sent to the browser. Author and Google Maps attribution appear beside the content. Missing photos remain explicitly unavailable.

Google content is not written into the account database: saved records contain place IDs and the user's own schedule/spending decisions. Current details and photos load on demand into memory. Discovery tokens expire after one hour; refresh results if a confirmation expires. Provider IDs are namespaced (`g:` for Google, `tm:` for Ticketmaster).

Official documentation:
- https://developers.google.com/maps/documentation/places/web-service/text-search
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/place-photos
- https://developers.google.com/maps/documentation/places/web-service/policies

### Optional AI

Set `PLANNER_API_KEY` and `PLANNER_MODEL` to your actual account credentials/model. `PLANNER_BASE_URL` defaults to the OpenAI API and also supports a compatible server. The model ranks **only** IDs returned by Places. Unknown model IDs are discarded; the server validates budget, dates, visit lengths, uniqueness and gaps. If the AI call fails, the UI explicitly identifies the rules-based fallback, which still uses live provider results. No chat messages or user profile are sent to the AI provider. Without an AI key, live-data planning still works.

### Optional events and weather

Ticketmaster: obtain a Discovery API key at https://developer.ticketmaster.com/ and set `TICKETMASTER_API_KEY`. The **Ticketed events** tab filters by the selected city and date and links directly to tickets. Events can be added to the itinerary at their actual start time. No tickets are purchased by SoloQuest.

City search uses Open-Meteo/GeoNames and preserves coordinates, country and IANA timezone. Weather uses the same selected coordinates. Free endpoints are suitable for eligible noncommercial testing; a commercial deployment should use the appropriate subscription/key. See https://open-meteo.com/en/docs/geocoding-api and https://open-meteo.com/en/terms. Search and weather failures produce an unavailable state, never invented results.

## How meeting people works

1. Create a profile, confirm adult eligibility and opt in to social discovery.
2. Switch to **Social** mode.
3. Add a real place or event to your itinerary. Edit that stop and enable **Share this place and time**.
4. **Meet people** displays other users who shared the exact same provider place/event ID and whose visits overlap by at least 15 minutes. It reveals only that overlap and their public profile, not their full day, budget or email.
5. **Connect one-to-one** creates a personal connection request. The other person accepts while their itinerary overlap still exists. This creates a permanent personal chat.
6. The group section displays only groups for your shared places and hourly time windows. Click **Join group** to join immediately. There is **no host, owner, leader, approval or join request**. The first eligible user can join an empty group.

Matching is by exact canonical provider ID, not a fuzzy place name. A ticketed event and a general venue listing have different IDs, intentionally keeping event attendance separate from a venue visit. Matching uses UTC timestamps converted from the itinerary's local timezone. Times that do not exist during a daylight-saving transition are rejected; ambiguous fall-back times use the earlier occurrence.

### Group lifetime

Each group has a deterministic ID for `(place ID, UTC hour)`. Its **24-hour lifetime runs from 12 hours before to 12 hours after that hour**. Future groups show when they open; they cannot be joined early. Within that window, each participant must have a shared stop overlapping the hour by at least 15 minutes. Stops spanning multiple hours can offer multiple windows.

At expiry, the UI removes the selected chat and its messages; all server read/send paths deny access regardless of whether the deletion sweep has run. Cleanup physically deletes the group, memberships and message rows. No app archive or recovery endpoint exists. This does not guarantee deletion from provider backups or from screenshots another person took.

- Local: `npm run dev:local` sweeps once a minute, including while all browser tabs are closed.
- Standalone Worker: the exported `scheduled` handler and generated Wrangler `triggers.crons` configure a 15-minute sweep. Confirm the trigger is active with your host.
- Any host: authenticated app activity also sweeps expired groups. An external scheduler may POST `/api/maintenance` with `Authorization: Bearer <MAINTENANCE_SECRET>`. No secret belongs in the URL.
- **Sites hosting:** the source includes the Worker cron declaration, but unattended cron provisioning by Sites has not been verified. Access expires on time; until a background trigger is confirmed, physical cleanup also occurs on the next authenticated request. Configure an authenticated external scheduler for a guaranteed idle-deletion interval.

Unsharing, deleting or moving a matching stop immediately revokes that group's membership in the same database transaction as the plan change. Switching to Solo clears all shared stops and group access. A group remains for its other members until expiry. Optional goodbye text is authored by the leaving user; there are no automated replies.

### One Chat inbox

**Chat** starts empty. It lists joined temporary groups and accepted personal connections only. Personal chats survive changed itineraries and expired outings. Blocking removes the direct room/history and prevents further matching/contact. The blocker leaves any shared group containing that person; blocks are checked both ways. You can unblock through My profile. Messages poll every five seconds; this is real multi-user messaging, not a WebSocket implementation. Pagination supports older messages and message sends use idempotent client IDs to avoid duplicate retries.

## Two-person end-to-end test

Use a normal browser and an incognito window (or two browser profiles), both pointing to the **same** local server. Two tabs in the same profile share a session and do not represent separate users.

1. Register account A and account B with different emails. Create both profiles and opt in to social discovery.
2. Choose the same city, date, provider listing and overlapping future visit time. For immediate group testing, select a time within the next 12 hours.
3. Switch both to Social and share that stop. Both should see each other under Meet people.
4. Join the same hourly group from A. Chat contains one empty group; B is not a member yet.
5. Join from B. No approval screen appears. Send a message from A and observe it in B within five seconds. Reply from B.
6. Send a personal connection request from A; accept from B. Open the personal chat and send a message.
7. Unshare A's stop: its group disappears, while the personal chat stays. Re-share and rejoin if desired.
8. To inspect expiry without waiting a day, use the isolated API test suite, which advances its clock and asserts actual row deletion. Do not modify the production clock or another user's data.
9. Refresh both browsers and restart the server. Profiles, saved plans and unexpired conversations persist in `.wrangler/state`.

## Project structure

```text
app/page.tsx             Laptop UI and real API client
app/api/                Auth, state, providers, planning, matching and chats
app/privacy, app/terms  Operator-editable privacy and usage notices
lib/providers.ts        Google Places / Ticketmaster / geocoding adapters
lib/planner.ts          Deterministic schedule validation and assembly
lib/server.ts           Atomic state save, revision guard, shared-stop index
lib/social.ts           Eligibility, mutual connections, membership and blocks
lib/auth.ts             Hosted identity and loopback-only local sessions
lib/cleanup.ts          Temporary-chat deletion
lib/time.ts             Timezone conversion, overlap and group windows
db/schema.ts            Relational schema
drizzle/                Forward-only SQL migrations and Drizzle metadata
worker/index.ts         Fetch and scheduled Worker entrypoints
scripts/                Local setup, migration, runtime and integration tests
```

`accounts` stores private validated JSON state with a revision and atomic write token. `shared_stops`, `chat_rooms`, `room_members`, `chat_messages`, `connections` and `user_blocks` enforce social access independently of user-editable JSON. `local_credentials` stores salted PBKDF2 hashes; sessions store only SHA-256 token hashes with expiry. `request_limits` and `reports` support rate limits and stored reports.

The original blueprint's FastAPI/Supabase/Postgres stack is **not** included. This is the complete implemented React/Vinext + Worker/D1 project, not a second unimplemented backend. There is no paid routing/transit API, reservation engine, verified identity service, staffed moderation or notification delivery service.

## Build, checks and deployment

```sh
npm run typecheck
npm test
npm run build
```

Tests run real route logic and SQL against isolated in-memory SQLite with test-only request identity and provider fixtures. Coverage includes account isolation, optimistic concurrency, signed place references, venue bounds, exact time overlap, direct ownerless joining, mutual personal connections, message idempotency/pagination, unsharing/Solo revocation, expiry deletion, blocks, account deletion, real local login/session hashing, legacy migration, provider failure modes, budget schedules and timezone/DST handling. They do not prove live credentials or replace an independent security review before a public rollout.

For **Sites**, retain the existing project's identity and D1 binding when updating its checkout. Set keys as server runtime environment variables using Sites settings. Hosted identity is the platform-provided ChatGPT identity; local email/password registration refuses non-loopback hosts even if accidentally enabled. The existing hosted Site remains owner-private until its owner changes sharing. A second person cannot test the private hosted Site without being granted access.

The downloadable ZIP intentionally omits the original Site project ID, credentials, dependencies, build output, database files and sessions. `.openai/hosting.json` retains the required `DB` declaration for local use and can receive a new Site identity on import. It includes all source, migrations, lockfile, assets, scripts and example configuration. `npm install` restores dependencies. The supplied pnpm lockfile is available if you prefer pnpm.

Self-hosting the Worker outside Sites requires your own verified identity gateway/authentication adapter: never trust user-supplied `oai-authenticated-*` headers on a public origin. Local auth is deliberately not a public registration service. Provision D1, apply migrations, configure secrets, confirm scheduled cleanup and implement your production identity integration before opening that deployment to users.

## Data and operational boundaries

- Account writes are validated and revision-checked; stale tabs get a conflict instead of overwriting another save. Refresh a stale tab before editing again.
- No full itinerary is exposed in social APIs. Access is checked on every read/send. Group membership cannot be changed through account JSON.
- Direct chats are persistent, not end-to-end encrypted. The application database operator has access to stored records.
- Account deletion removes the user's profile, plan, references, sent messages, direct chats, connections and reports. Other members' group messages remain until expiry.
- Reports are stored for the operator; no live moderation team is connected. Public operations require an actual abuse handling process and operator-specific privacy/terms/contact details.
- Unknown provider prices are not presented as free admission. Budgets are user spending allowances; suggested durations and 30-minute gaps are planning defaults, not verified travel times. Regular hours may differ on holidays.
- Changing location clears the current day and its group memberships. Bookmarks and personal connections remain. Currency is independently editable; there is no automatic foreign exchange conversion.
- The two bundled photographs are decorative travel inspiration, explicitly labelled where appropriate. All result photos come from their actual connected provider. DM Sans and Manrope load from Google Fonts, with local system-font fallbacks.
- Upgrading a legacy v1 account preserves its profile and discards the old simulated places/chats. There is no automatic conversion of invented people into real accounts.

## Validation in this delivery

TypeScript checking and production builds passed. The planner suite covers 450 constraint combinations plus edge cases; the API suite covers 80 assertions; provider adapters cover 26 assertions. The browser preview was visually checked on a laptop layout, including navigation, empty chats, provider setup and the location error state. External live geocoding/provider requests were restricted in the build workspace, and no paid provider keys were supplied. Complete the two-person walkthrough above after configuring your own keys to validate live provider access and browser-to-browser messaging in your environment.
