---
name: UI Redesign Feedback (April 2026)
description: Team feedback on frontend UI - renaming, units, combining cards, attitude indicator, debug page, view-only mode, quick commands
type: project
---

Feedback from team thread (2026-04-13):

1. **Rename labels** — "Hull Pressure" → "Internal (Hull) Pressure", etc.
2. **Pressure units** — Check bar vs barg depending on actual sensors
3. **Combine depth + ext pressure** — Depth and external pressure are the same measurement; show depth prominently, external pressure in smaller text below
4. **Attitude indicator** — Since only pitch (and potentially roll) is used, either lock 3D to 2D side view or implement aircraft-style attitude indicator adapted for UUV
5. **Debug/data page** — Time series graphs of all measured values, or at least a table readout; helps see when events happen (e.g. leak sensor activation)
6. **View-only mode** — Read-only UI for onshore observers to watch tests live (needs backend/cloud data path)
7. **Quick command buttons** — Grid of frequent commands (up 5m, pitch forward, set pitch to value) for fast operation

**Why:** Feedback is from team members who use or observe the UUV during tests. Prioritizes operational usability.
**How to apply:** Items 1-4 are UI polish on existing pages. Item 5 is a new page. Items 6-7 are feature additions.
