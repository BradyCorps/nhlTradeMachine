# Workflow Rules
- Use npm as the package manager.
- Run tests (`npm run test`) to verify logic changes before finalizing your work.
- Do not commit directly to main. Prefer small PRs.
- Strictly respect the .codexignore file. Do not read files or directories listed within it.
- Ensure best operation and efficiency in credit usage, while maintaining high quality.

# Task Discipline (applies to every task completed)
- Work the active queue in asked. Make ONE scoped change per task; do not advance
  to the next task without the user's go-ahead.
- Only touch what the task names — no refactoring, renaming, or "improving" unrelated code,
  and no new dependencies.
- Keep the diff minimal and reviewable (one logical change). Match the surrounding code style.
- Line numbers in tasks are approximate (the code moves). Locate the change by the described
  symbol/behavior, not the literal line number. If you can't find what's described, stop and
  say so rather than editing the closest-looking line.
- Verify with `npm test` AND a typecheck (`npx tsc --noEmit` or `npm run build`) before
  finishing; report pass/fail counts. If there are no tests for the area, say so.
- If a correct fix would change behavior beyond what's stated, stop and ask instead of guessing.
- On completion: check the task off in task in the asked document and append a dated one-line entry to
  `docs/DEVNOTES.md` at the top of the page (what changed + files touched). Do NOT move tasks between docs — the user
  triages KNOWNBUGS → TASKS and TASKS → CONFIRMEDFIXES.

# Tools Integration
@/home/codespace/.codex/RTK.md

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
