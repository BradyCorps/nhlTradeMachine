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
- Upon reaching 40% credit usage, please respond to the following questions at the end and add them to DEVNOTES.md
    * What are you least confident about right now?
    * What’s the biggest thing I’m missing about the situation right now. What don’t I realize? 

## Task Discipline (applies to every TASKS.md item)
- Make ONE scoped change per task. Do not advance to the next task without the user's go-ahead.
- Only touch what the task names — no refactoring/renaming unrelated code, no new dependencies.
- Keep the diff minimal and reviewable (one logical change). Match surrounding style.
- Line numbers in tasks are approximate; locate by the described symbol/behavior, and if you
  can't find it, stop and say so rather than editing the closest-looking line.
- Verify with `npm test` AND a typecheck (`npx tsc --noEmit` or `npm run build`) before finishing;
  report pass/fail counts.
- If a correct fix would change behavior beyond what's stated, stop and ask.
- On completion: check the task off in docs/TASKS.md and append a dated one-line entry to
  docs/DEVNOTES.md (what changed + files). Do NOT move tasks between docs.
    
# Tools Integration
@/home/codespace/.codex/RTK.md