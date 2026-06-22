# Environment Context
- This environment is a headless GitHub Codespace. 
- DO NOT start the development server (`npm run dev`) or attempt to `curl localhost` to verify UI changes. 
- The user will handle all visual and UI testing manually in the browser. 

# Workflow Rules
- Use npm as the package manager.
- Run tests (`npm run test`) to verify logic changes before finalizing your work.
- Do not commit directly to main. Prefer small PRs.
- Strictly respect the .codexignore file. Do not read files or directories listed within it.
- Ensure best operation and efficiency in credit usage, while maintaining high quality.

# Task Discipline (applies to every docs/TASKS.md item)
- Work the active queue in `docs/TASKS.md`. Make ONE scoped change per task; do not advance
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
- On completion: check the task off in `docs/TASKS.md` and append a dated one-line entry to
  `docs/DEVNOTES.md` at the top of the page (what changed + files touched). Do NOT move tasks between docs — the user
  triages KNOWNBUGS → TASKS and TASKS → CONFIRMEDFIXES.

# Tools Integration
@/home/codespace/.codex/RTK.md