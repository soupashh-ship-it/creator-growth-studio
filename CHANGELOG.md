# Changelog

## v0.2.0 — Audit-gap completion (2026-10-01)

All features below are computed locally from stored data, consistent with the
project's honesty rules: no fabricated metrics, no invented search volume, and
no automatic publishing anywhere.

### New
- **Mobile thumbnail size test (§19)** — previews the thumbnail at four realistic
  feed sizes (desktop, sidebar, search, mobile) with readability warnings derived
  from measured pixel features, not guesses. (`Thumbnails` page)
- **Sponsor readiness & media kit (§68)** — an explainable operational score
  (recent views, upload activity, consistency, engagement, niche clarity) plus a
  copyable media-kit draft and pitch outline. Explicitly a draft: not a
  sponsorship promise, never auto-sent. (`Channel` page)
- **Early performance diagnosis (§53)** — names the likely limiting stage
  (packaging / content / discovery) by comparing a video's synced CTR and
  retention against the channel's own medians. Hypotheses with evidence, never
  claimed causes. (`Videos` page)
- **Goal progress tracking (§119)** — channel snapshots are now recorded on every
  platform sync, so numeric goals like "10k subscribers" show real 30-day change
  and remaining distance. No completion-date predictions.
- **PDF export (§69)** — reports export as PDF through a small dependency-free
  writer alongside CSV, JSON, Markdown and clipboard.
- **Command palette actions (§70)** — analyze video/thumbnail, generate titles,
  find competitor, connect flows and ask Copilot are now direct Ctrl+K actions.
- **Update check (§88)** — Developer Tools can query GitHub releases and report a
  newer version. Read-only by design: the app never downloads or installs
  anything itself.
- **Notification preferences (§120)** — per-type enable/disable; disabled types
  are neither recorded in the bell nor shown as toasts.

### Fixed
- The diagnosis baseline no longer includes the diagnosed video itself, so
  "weak CTR" really means weak relative to the rest of the channel.

### Developer
- New migration `0005_goal-progress` (`channel_snapshots`).
- Verification at this tag: typecheck ✓ · lint ✓ · **393 tests** ✓ · production
  build ✓ · smoke launch ✓.
