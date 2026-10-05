# CLIP-AUTOFILL PROTOCOL (agents only; dense on purpose)
Agents: Claude Code (cc), Codex (cx). Repo: duckling (Duckler).
SCOPE (only this): when a card arrives from the web-clip extension and user chose NO collection, auto-add it to best-matching collection(s). Nothing else. No tags, no contentType, no LLM, no review inbox, no old-card batch, no popup UI, no in-collection features.
This file: docs/ai-coop/PROTOCOL.md ; state: docs/ai-coop/STATE.jsonl (append-only). User checklist (PT) stays outside the repo in ai-coop/.

## 0 BOOT (every session, in order)
1. read this file.
2. `tail -n 3 docs/ai-coop/STATE.jsonl` -> L. empty => start at 1.1.
3. `git status --short; git log --oneline -5`. L.head != HEAD or unexpected dirty tree => trust git, append {"k":"drift"}, inspect diff first.
4. read ONLY L.files + plan block for L.next. No repo-wide reads.
5. append {"k":"start","a":<me>,"t":T,"ctx":<pct>}.

## 1 CONTEXT BUDGET
Measure: cc `/context`; cx remaining-% in status. Unmeasurable: P = tool_calls + 5*(reads>400 lines); P>=40 == 60%, P>=60 == 75%.
- <60%: normal.  >=60%: finish current task only, no new reads/tasks.
- >=75% or unsure or harness warning: STOP, HANDOFF.
- Checkpoint (append state line) after EVERY finished task. Crash must lose <=1 task.
- Pipe logs through `tail -40` / grep errors. One task <= ~15% ctx; split if bigger.

## 2 STATE LINE (one JSON/line)
k: start|ckpt|handoff|drift|block|done   a: cc|cx   t: task id   st: ok|part|fail|blk
did:[<=5 terse]  next: exact first action  files:[paths for next]  head: git sha  tests: pass|fail|none|winonly
ctx: pct  blk: null|str  dec:["D<n>:.."]  ts: ISO

## 3 HANDOFF
1. compiling state (`npx tsc --noEmit -p <pkg>`; cloud cannot run vitest/vite).
2. `git add -A; git -c core.autocrlf=input commit -m "autofill(<t>): <what> [wip]"` + harness attribution trailer. Push only when the user asks (Windows checkout can push; cloud cannot).
3. append k=handoff; next must work for an agent with zero memory.
4. add 1 line to PROGRESS.md "Clip autofill": `<t> <st> head=<sha> next=<next>`.
5. final message exactly: `HANDOFF READY | <t> | <st> | next: <next> | needs-you: <none|item>` then stop.

## 4 INVARIANTS (tests must enforce)
I1 User choice wins: if capture has any user-selected collection (or card is not a fresh clip) => do NOTHING. Add-only; never remove membership; never touch title/note/highlight/caption/tags/manual membership.
I2 Opt-in: settings.autofillClips=false default. Off => zero network, zero UI, zero extra page text sent.
I3 Send minimal: title,url,domain,highlight,note,caption, page excerpt (meta description + first 1500 chars). NEVER images, tokens, other cards' content. Collection profiles computed/stored locally.
I3b ZERO RETENTION (owner requirement, 2026-10-05): the Worker keeps nothing. No KV/R2/D1/DO/Vectorize/Cache for content, no console.log/Workers Logs of request or response bodies, no Logpush of bodies; return the embedding and drop it. Rate-limit state holds only a hashed install id + counter. Workers AI does not store inputs/outputs or train on them unless a storage service is attached (developers.cloudflare.com/workers-ai/platform/data-usage/). Client side: pageExcerpt is used once for classification and NEVER persisted on the card, in Dexie, backups or exports; the extension queue drops it with the capture after the library acknowledges delivery.
I4 Any failure/offline/timeout(>5s) => silently do nothing (card already saved first; classification is post-save, async).
I5 Undo => remember (cardId,collectionId) rejection; never re-add. 
I6 Uncertain => do nothing. Thresholds: score>=T_ADD and margin>=T_MARGIN over 2nd; max 3 collections. Low text (<~40 useful chars) => nothing.
I7 PT+EN: multilingual embeddings; collection description placeholder "User-made collection" == empty.
I8 Don't break: capture queue, captureProtocol zod (new field optional, backward-compatible), backup v2 strict parse, Obsidian export, Dexie (additive only).
I9 CSP/_headers stay strict; extension manifest: no new required host_permissions. (Exists already: OPTIONAL `<all_urls>` the user grants from the panel for highlights/screenshots; reuse it, add nothing broader.) Page excerpt via the panel's existing page read (it already reads og/meta description), no new perms.

## 5 REPO FACTS
- workspaces: apps/web (React+Vite PWA, CF Pages), apps/extension (MV3), packages/shared (captureProtocol.ts), functions/ (Pages Functions), wrangler.jsonc, apps/web/public/_headers.
- Dexie `visual-library-db` schema versions 2-5 (IndexedDB reports a higher internal number). cards: tags,note,title,caption,sourceUrl,color,links,ocr,pdf.text; collections have cardIds (+parentId), description. `buildSearchText` exists. `rankCollections` (CollectionPicker.tsx) only sorts by NAME for the picker: there is no semantic ranking yet. Capture receipt flow: extensionBridge.ts + cardDb.ts (capture -> card in one transaction); legacy link import: extensionCapture.ts.
- No server identity (D1 API off). Auth = per-install HMAC token.
- Cloud shell: no npm install, no github. Only tsc. Tests => tests=winonly (user runs on Windows). Windows checkout (Claude Code desktop): full npm test/lint/build/Playwright smokes run locally; record tests=pass|fail there. Commit with -c core.autocrlf=input.
- Extension = Chrome/Edge side panel (popup.html/popup.js, plain JS) + background.ts (bundled). Panel already autofills title/caption/tags from page meta and PRESELECTS LAST-USED COLLECTIONS (see D6).
- UI: PS2 schematic, fast, motion on actions only, no visible scrollbars.

## 6 DECISIONS
D1 provider: Workers AI `@cf/baai/bge-m3` behind interface `Embedder` (swappable, mockable). User may override.
D2 auth: HMAC per-install token (secret CLASSIFY_TOKEN_SECRET), CF rate-limit binding, cap 200 calls/day/install.
D3 profile(collection) = normalize(mean(emb of member cards, cap last 50)) blended with emb(name+description). <3 members => name/desc only and stricter T_ADD.
D4 defaults T_ADD=0.45 T_MARGIN=0.08 (cosine, to calibrate on 30-50 real clips in 2.4). 
D5 zero retention as I3b (owner, 2026-10-05).
D6 conflict: the panel's last-used-collection preselect means captures rarely arrive with NO collection, so autofill would never run. When autofill is ON, the panel must not preselect (start empty, show 'Auto' hint); when OFF keep current behaviour. Implement in 2.1.
Blocked on user decision => k=block, next=`ask user: q`, proceed with default only if reversible.

## 7 PLAN
S1 core + backend
 1.1 shared: optional `pageExcerpt` in capture schema (+ backward compat tests); types AutofillResult.
 1.2 shared: collectionProfile(), rankForClip(), decide() (I1,I5,I6) pure + unit tests (user selection => none; rejection memory; low-text; margin).
 1.3 functions/api/embed: Embedder iface + workers-ai impl + mock; token verify, rate limit, size caps; no logging. tests with mock.
 1.4 wrangler.jsonc AI binding + secrets doc in PROGRESS.md. [tsc ok]
S2 integration + tuning
 2.1 extension: send pageExcerpt (meta desc + 1500 chars) only if autofill enabled setting reachable (bridge setting sync); minimal perms.
 2.2 web: on capture receipt, after save, async autofill (I4), local profile cache (Dexie additive), rejection store.
 2.3 web: setting toggle + disclosure (PT/EN); toast "Adicionado a X · Desfazer"; small "auto" mark on card; undo (I5).
 2.4 tune: user supplies 30-50 real clips w/ expected collection (docs/ai-coop/tuning.json); agent computes hit/miss/abstain; set T_ADD/T_MARGIN so wrong-add ~<=3%. report in PROGRESS.md.
 2.5 checklist of manual browser tests for user in PROGRESS.md.

## 8 DONE per task
compiles + invariant test + state line + commit. tests=winonly with exact command in PROGRESS.md if not runnable.

## 9 STYLE
Terse. Final msg = HANDOFF READY line only. Ask user only via k=block + needs-you.
