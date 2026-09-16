#!/usr/bin/env node
/**
 * PreToolUse guard for Bash: blocks commands that would replace the pinned
 * impeccable build (npx impeccable ... install/update, skills update/link/uninstall).
 * The plugin's own installer (install-impeccable.mjs) is always allowed.
 * Everything else: exit 0 with no opinion.
 */
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let cmd = "";
  try {
    cmd = String(JSON.parse(raw).tool_input?.command ?? "");
  } catch {
    process.exit(0);
  }
  if (/install-impeccable\.mjs/.test(cmd)) process.exit(0);
  const touchesInstall =
    /\bimpeccable(@[\w.\-^~>=<]+)?\s+(skills\s+(install|update|uninstall|link)|install|update|uninstall)\b/.test(
      cmd,
    ) || /\bskills\s+add\s+\S*impeccable/.test(cmd);
  if (!touchesInstall) process.exit(0);
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "impeccable is pinned to 3.5.0 by the designli-design plugin. Do not update or reinstall it with npx; " +
          "run node <plugin>/scripts/install-impeccable.mjs --project . --check (or --force to reinstall) instead.",
      },
    }),
  );
  process.exit(0);
});
