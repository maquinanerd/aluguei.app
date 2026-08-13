export const AlugueiCompactionPlugin = async () => {
  return {
    "experimental.session.compacting": async (_input, output) => {
      output.prompt = `
Create a minimal continuation checkpoint for the Aluguei.app autonomous development session.

The repository is the durable source of truth. Do not reproduce documentation that can be referenced by path.

Preserve ONLY:
1. Current orchestration phase and exact active task.
2. Acceptance criteria already completed in the current phase.
3. Files currently modified or intentionally pending.
4. Important decisions made in this session that are NOT yet persisted in docs.
5. Current focused test/build/lint/typecheck status, with only unresolved failures.
6. External blockers and their exact status.
7. Git branch and last relevant commit.
8. Exact next executable action.

Do NOT preserve:
- old tool outputs or command logs;
- resolved errors;
- completed diffs;
- repeated product descriptions;
- full documentation contents;
- dependency-install output;
- successful test output beyond a terse status;
- information already persisted in AGENTS.md, docs/, orchestration/, tests or code.

Prefer references such as docs/EXECUTION_STATE.md or a source path instead of restating their contents.
Keep the checkpoint concise and directly executable by the next agent.
`;
    },
  };
};
