# Troubleshooting

Common problems and their fixes. The app is designed so no single integration
failure crashes it (spec §81) — most issues appear as a labelled state on the
relevant connection card or panel.

---

## AI providers

### "ChatGPT: not configured / not eligible"
- The ChatGPT **plan usage** flow is available to open-source/local apps and
  requires an **eligible Plus/Pro** account. If your account is not eligible, the
  app says so and offers Gemini or local AI instead — it will never silently
  switch you to a paid API.
- Make sure you are on the latest build; the flow uses OpenAI's official
  open-source sign-in SDK. See `INTEGRATION_AUDIT.md` §1.

### "Gemini CLI not installed"
1. Install Gemini CLI per Google's instructions.
2. Run `gemini` once in a terminal and complete the Google sign-in.
3. Return to Settings → Connections → Gemini → **Detect Again**.

### Gemini requests fail
- Exit codes are surfaced: `1` API failure, `42` bad input, `53` turn limit
  exceeded. Re-run with a smaller prompt or retry.
- Model selection in headless mode can behave inconsistently; choose a model in
  Settings or leave it on Auto.

### Ollama / LM Studio "Not detected"
- Ollama: confirm it serves `http://localhost:11434` and that you have pulled a
  model (`ollama pull <model>`).
- LM Studio: start the local server in LM Studio (`http://localhost:1234/v1`).

---

## Platform connections

### YouTube "Authentication expired"
- Tokens expire or can be revoked (password change, user disconnect). Click
  **Reconnect** to re-authorize. Refresh tokens are stored in Windows Credential
  Manager, never in files.

### YouTube `redirect_uri_mismatch`
- The OAuth client must have the **exact** loopback redirect the app shows
  registered (e.g. `http://127.0.0.1:<port>`). Re-copy the value from the
  connection card into your Google Cloud OAuth client.

### YouTube "Quota reached"
- The default is 10,000 units/day per project; a **search costs 100 units**.
  Reduce manual searches, lower refresh frequency (Settings → Background
  refresh), or request a quota increase from Google. Cached data remains
  available offline.

### Twitch "401 Unauthorized"
- Twitch tokens can be revoked when the user changes password or disconnects the
  app. Reconnect via Device Code Grant. Third-party apps validate tokens against
  `/validate`; the connection card shows the result.

### OBS "Not running"
- Requires **OBS Studio 28+** (obs-websocket v5 is built in). Enable the
  websocket server and set a password; enter it in Settings → Connections → OBS.
- This feature is optional — the core app runs without it.

---

## Data

### A metric shows "Not available"
- That is intentional (§66): the app never invents analytics. Connect the
  relevant platform, refresh, or import a CSV (§128) if the API cannot expose the
  historical range you want.

### Numbers look stale
- Check the **freshness badge** (§137). Use the section's **↻ Refresh** control
  (§138) or lower the background-refresh interval (respecting quotas).

### I see "MOCK DATA"
- Development previews are labelled visibly (§93). Production builds never
  display mock fixtures.

---

## Privacy & secrets

### Where are my tokens?
- In **Windows Credential Manager**, never in the database or logs. "Disconnect"
  removes them.

### Something sensitive in a log?
- That is a bug. Use Settings → Advanced → Logs → **Copy diagnostics** (they are
  redacted) and report it. No token/code/cookie/password should ever reach disk.

---

## Diagnostics

Settings → Advanced → **Developer Tools** (§89) shows: provider health, platform
API status, database status, authentication status, job queue, cache, and raw
errors. Settings → Advanced → Logs offers **Copy diagnostics** and **Open logs
folder**.
