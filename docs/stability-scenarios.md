# Stability Scenario Pack — `POST /api/generate`

This pack documents stable, repeatable scenarios for `POST /api/generate` in `app/api/generate/route.ts`.

## Scope and assumptions

- Endpoint expects `Content-Type: application/json`.
- Endpoint supports both input modes:
  - Shortcut mode: `{ "message": string }`
  - Chat mode: `{ "messages": [{ "role": "user"|"assistant", "content": string }] }`
- Success response shape: `{ ok: true, data: ... }`.
- Error response shape: `{ ok: false, error: { code, message } }`.
- Some responses depend on runtime conditions (missing env, upstream AI behavior), so those are marked **documented-only**.

---

## 1) Success — minimal valid `message`

- **Name:** Success with single valid message
- **Input payload (short):**
  ```json
  { "message": "לקוח מבקש תור למחר בבוקר" }
  ```
- **Expected HTTP status:** `200`
- **Expected ok:** `true`
- **Expected error.code (if error):** N/A
- **Why it matters:** Baseline happy-path validation for the main flow.
- **Execution note:** This scenario is part of the Stability Scenario Pack, but it runs only when `OPENAI_API_KEY` is set and upstream is available; therefore it is **not** part of the default deterministic runner execution.

## 2) 400 — invalid JSON body

- **Name:** Malformed JSON
- **Input payload (short):**
  ```json
  { "message": "hello"
  ```
- **Expected HTTP status:** `400`
- **Expected ok:** `false`
- **Expected error.code (if error):** validation error code as implemented (do not rely on a specific code for 400).
- **Why it matters:** Confirms parse-guard around `request.json()` and client input hygiene.

## 3) 400 — missing both `message` and usable `messages`

- **Name:** Missing input fields
- **Input payload (short):**
  ```json
  {}
  ```
- **Expected HTTP status:** `400`
- **Expected ok:** `false`
- **Expected error.code (if error):** validation error code as implemented (do not rely on a specific code for 400).
- **Why it matters:** Verifies contract enforcement when neither accepted input mode is provided.

## 4) 400 — invalid role in `messages`

- **Name:** Invalid `messages[].role`
- **Input payload (short):**
  ```json
  {
    "messages": [{ "role": "system", "content": "טקסט" }]
  }
  ```
- **Expected HTTP status:** `400`
- **Expected ok:** `false`
- **Expected error.code (if error):** validation error code as implemented (do not rely on a specific code for 400).
- **Why it matters:** Ensures only allowed roles (`user`/`assistant`) are accepted.

## 5) 400 — length violation in `messages[].content`

- **Name:** Message content too long
- **Input payload (short):**
  ```json
  {
    "messages": [{ "role": "user", "content": "x...x" }]
  }
  ```
  > Use content length `> 4000` chars after trim.
- **Expected HTTP status:** `400`
- **Expected ok:** `false`
- **Expected error.code (if error):** validation error code as implemented (do not rely on a specific code for 400).
- **Why it matters:** Protects endpoint constraints and prevents oversized prompt payloads.

## 6) 400 — no user message in conversation

- **Name:** `messages` without any user turn
- **Input payload (short):**
  ```json
  {
    "messages": [{ "role": "assistant", "content": "שלום" }]
  }
  ```
- **Expected HTTP status:** `400`
- **Expected ok:** `false`
- **Expected error.code (if error):** validation error code as implemented (do not rely on a specific code for 400).
- **Why it matters:** Verifies rule that at least one user message must exist.

## 7) 500 — missing API key (local setup check)

- **Name:** OpenAI API key not configured
- **Input payload (short):**
  ```json
  { "message": "בדיקה" }
  ```
- **Expected HTTP status:** `500`
- **Expected ok:** `false`
- **Expected error.code (if error):** `MISSING_API_KEY`
- **Why it matters:** Confirms explicit configuration failure path before upstream call.
- **Execution note:** For local verification, unset `OPENAI_API_KEY` in `.env.local` and restart server.

## 8) 502 — upstream failure (documented-only)

- **Name:** Upstream OpenAI failure
- **Input payload (short):**
  ```json
  { "message": "בדיקה רגילה" }
  ```
- **Expected HTTP status:** `502`
- **Expected ok:** `false`
- **Expected error.code (if error):** `UPSTREAM_ERROR`
- **Why it matters:** Captures resilience behavior when provider call fails.
- **Execution note:** **Documented-only** by default; do not force unsafe outages. Reproduce only via safe, controlled methods (e.g., temporary invalid key in isolated local test).

## 9) 422 — invalid model output (documented-only)

- **Name:** Model returns non-conforming structured output
- **Input payload (short):**
  ```json
  { "message": "בדיקה רגילה" }
  ```
- **Expected HTTP status:** `422`
- **Expected ok:** `false`
- **Expected error.code (if error):** `MODEL_OUTPUT_INVALID`
- **Why it matters:** Ensures strict response validation and schema/state guards are enforced.
- **Execution note:** **Documented-only** in normal environments, because this is hard to reproduce reliably without intentionally forcing malformed model output or bypassing schema constraints.

---

## Quick usage tip

Use this pack as a smoke/regression checklist during local testing and before release.

- Run deterministic checks: `npm run stability`
- Run deterministic + success scenario: `npm run stability:all` (requires `OPENAI_API_KEY`)

The default deterministic runner excludes the `200` success scenario unless explicitly enabled in an environment with `OPENAI_API_KEY` configured. For documented-only scenarios (`422`, usually `502`), keep them as expected-behavior references unless you have a safe, controlled way to simulate them.
