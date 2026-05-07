# Scrape Screeps Docs to Local Markdown

**Goal:** Fetch complete Screeps API reference and guide pages, convert to clean Markdown, save locally for offline reference.

**Key Decisions:**
- One `.md` file per API class (58 total) → `.ai/api-reference/`
- Guide pages flat by URL → `.ai/guides/` (with `contributed/` subfolder)
- Include code examples from docs as fenced ` ```js ` blocks
- Skip: legal pages (ToS, Privacy), admin pages (Community Servers, PTR), meta docs (Contribution Rules, Private Server MongoDB)
- Script lives in `.ai/scripts/scrape-docs.mjs` (NOT `.local-scripts/` — that's a Steam symlink)

**Progress:**
- [x] Create scraper script (Node.js, no external deps) — `.ai/scripts/scrape-docs.mjs`
- [x] Fetch API reference page (~52 h1 sections found)
- [x] Split by section (regex on `<h1 id="...">` anchors)
- [x] Convert HTML → Markdown for API (preserves code examples)
- [x] Fetch guide pages (22 total from docs.screeps.com)
- [x] Convert HTML → Markdown for guides
- [x] Generate README.md index files for both directories
- [x] Verify all files created + spot-check content

**Results:**
- API Reference: 54 files (52 class/object sections + 2 from splitting), ~10KB total markdown
  - Largest: Constants.md (1,594 lines) — full constant definitions
  - Medium: Creep.md (971 lines), Room.md (583 lines) — core gameplay objects
  - All include method signatures, params, return codes, and JS code examples
- Guides: 25 files (22 pages + contributed/subfolder with 3 articles)
  - Gameplay (10): introduction, creeps, control, defense, respawn, start-areas, resources, market, invaders, power
  - Scripting (8): scripting-basics, global-objects, modules, debugging, game-loop, commit, simultaneous-actions, cpu-limit
  - Other (4): architecture, auth-tokens, third-party, contributed/
- Skipped: tos.html, privacy-policy.html, community-servers.html, ptr.html (legal/admin, not bot-relevant)

**Key Technical Notes:**
- Node.js 25 fetch API used (no external dependencies)
- HTML → Markdown conversion handles: headers, code blocks (with language tags), tables, lists, links, inline code
- Section extraction: regex on `<h1 id="...">` to split single-page API reference into 52 files by class
- Filenames: use dots for nested classes (e.g., `Game.map.visual.md`)
