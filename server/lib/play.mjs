// Can this flow be played end to end? Pure: no files, no network. The same rule lives on the portal
// (design-portal packages/shared/src/play.ts), which is the reference: the two are kept identical so
// the designer's agent and the portal agree on what a dead end is, and the conformance suite pins
// them together (pilot/suite: playGaps, playAgree).
//
// Vocabulary
// - node: a screen of kind "state" (never Main or a component sheet); its device variants are one node
// - edge: a transition whose ends are both nodes of this flow; a transition to a screen this version
//   does not carry (waived, missing, unavailable) is "dangling"
// - start: the first entry point's step, at its Default (or first present) state; without entry
//   points, the first step
// - transient: Loading and Submitting; play auto-advances from them, they are never dead ends
// - terminal: a node of a `result` step, a node that leads to another flow (`flow.next[].from`), or
//   a node the designer declared in `flow.play.exits` with a reason
// - dead end: a non-transient, non-terminal node with no outgoing edge; Error, Validation and Empty
//   count like any other node, they must link to their recovery
// - unreachable: a step with present nodes that no path from the start reaches; a step counts as
//   reached when any of its nodes is (its other states are variants play offers in place)

export const TRANSIENT_STATES = ["Loading", "Submitting"];

const stepOfId = (id) => String(id).slice(0, 2);
export const isTransientState = (state) => !!state && TRANSIENT_STATES.includes(state);

/** The node play opens for a step: Default when present, else the step's first present state. */
export function startOfStep(m, stepN) {
  const nodes = (m.screens || []).filter((s) => s.kind === "state" && s.step === stepN);
  if (!nodes.length) return null;
  return (nodes.find((s) => s.state === "Default") ?? nodes[0]).id;
}

/** Where play starts: the first entry point (a step or a screen id), else the first step. */
export function startOf(m) {
  const screens = m.screens || [];
  const byId = new Set(screens.filter((s) => s.kind === "state").map((s) => s.id));
  for (const e of m.entryPoints ?? []) {
    if (byId.has(e.to)) return e.to;
    const n = stepOfId(e.to);
    if (/^\d{2}$/.test(n)) {
      const id = startOfStep(m, n);
      if (id) return id;
    }
  }
  const steps = [...(m.steps || [])].sort((a, b) => String(a.n).localeCompare(String(b.n)));
  for (const st of steps) {
    const id = startOfStep(m, st.n);
    if (id) return id;
  }
  const first = screens.find((s) => s.kind === "state");
  return first?.id ?? null;
}

/** Where auto-advance goes from a transient node: Loading → the step's Default; Submitting → the
 *  Default's first edge into another step, else the step's Success, else Default. null = stay. */
export function autoAdvanceTarget(m, id) {
  const screens = m.screens || [];
  const transitions = m.transitions || [];
  const s = screens.find((x) => x.id === id);
  if (!s || !isTransientState(s.state) || !s.step) return null;
  const nodes = new Set(screens.filter((x) => x.kind === "state").map((x) => x.id));
  const dflt = screens.find(
    (x) => x.kind === "state" && x.step === s.step && x.state === "Default",
  );
  if (s.state === "Loading") return dflt && dflt.id !== id ? dflt.id : null;
  // Submitting: first, a transition declared from this very screen (e.g. "sent" → next step)
  const own = transitions.find(
    (t) => t.from === id && nodes.has(t.to) && stepOfId(t.to) !== s.step && t.to !== id,
  );
  if (own) return own.to;
  const fromDefault = dflt
    ? transitions.find((t) => t.from === dflt.id && nodes.has(t.to) && stepOfId(t.to) !== s.step)
    : undefined;
  if (fromDefault) return fromDefault.to;
  const success = screens.find(
    (x) => x.kind === "state" && x.step === s.step && x.state === "Success",
  );
  if (success) return success.id;
  return dflt && dflt.id !== id ? dflt.id : null;
}

/**
 * `{ ready, start, deadEnds[{screen,step,state}], unreachable[{step,id}], dangling[{from,on,to}],
 *    exits[{screen,reason}] }` over a manifest view: `steps`, `screens`, `transitions`,
 * `entryPoints` and `flow.{next,play}`.
 */
export function playCheck(m) {
  const nodes = (m.screens || []).filter((s) => s.kind === "state" && s.step);
  const byId = new Map(nodes.map((s) => [s.id, s]));
  const kindOf = new Map((m.steps || []).map((s) => [s.n, s.kind]));
  const exitsDeclared = m.flow?.play?.exits ?? {};
  const leadsOut = new Set((m.flow?.next ?? []).map((n) => n.from).filter(Boolean));
  const exits = Object.entries(exitsDeclared)
    .filter(([id]) => byId.has(id))
    .map(([screen, reason]) => ({ screen, reason: String(reason ?? "") }));
  const terminal = (id) =>
    kindOf.get(stepOfId(id)) === "result" || id in exitsDeclared || leadsOut.has(id);

  const dangling = [];
  const out = new Map();
  for (const t of m.transitions ?? []) {
    if (!byId.has(t.from)) continue;
    if (!byId.has(t.to)) {
      dangling.push({ from: t.from, on: t.on, to: t.to });
      // a defect already; the source still "leads somewhere" for the dead-end rule
      out.set(t.from, out.get(t.from) ?? []);
      continue;
    }
    if (t.to === t.from) continue;
    out.set(t.from, [...(out.get(t.from) ?? []), t.to]);
  }

  const deadEnds = nodes
    .filter((s) => !isTransientState(s.state) && !terminal(s.id) && !out.has(s.id))
    .map((s) => ({ screen: s.id, step: s.step, state: s.state ?? "" }));

  const start = startOf(m);
  const reachedSteps = new Set();
  if (start) {
    const queue = [stepOfId(start)];
    while (queue.length) {
      const n = queue.shift();
      if (reachedSteps.has(n)) continue;
      reachedSteps.add(n);
      for (const s of nodes)
        if (s.step === n)
          for (const to of out.get(s.id) ?? []) {
            const tn = stepOfId(to);
            if (!reachedSteps.has(tn)) queue.push(tn);
          }
    }
  }
  const stepsWithNodes = [...new Set(nodes.map((s) => s.step))].sort();
  const unreachable = stepsWithNodes
    .filter((n) => !reachedSteps.has(n))
    .map((n) => ({
      step: n,
      id:
        (m.steps || []).find((s) => s.n === n)?.id ?? nodes.find((s) => s.step === n).stepId ?? "",
    }));

  return {
    ready: !deadEnds.length && !unreachable.length && !dangling.length,
    start,
    deadEnds,
    unreachable,
    dangling,
    exits,
  };
}

// ---- the manifest view, shared by the bundle and the gaps ----
/**
 * The transitions a version carries: the declared ones as they are, plus the ones inferred from the
 * screens' own links when both ends are screens the version has. The bundle and `gaps` call this
 * same helper, so the readiness the designer sees is the readiness the portal computes.
 */
export function mergeTransitions(declared = [], inferred = [], known = new Set()) {
  const out = [...declared];
  for (const t of inferred)
    if (
      known.has(t.from) &&
      known.has(t.to) &&
      !out.some((x) => x.from === t.from && x.to === t.to && (x.on === t.on || !t.on))
    )
      out.push(t);
  return out;
}
/**
 * The journey links with the screen each one sits on: a declared `next` entry keeps its own `from`,
 * and one without it takes the lowest screen id whose link resolves into that flow's folder (the
 * label first, then any link into it). One entry per connector, so the journey map draws one arrow;
 * a sibling state carrying the same link is not marked, and needs its own link or a declared exit.
 */
export function nextWithFrom(declared = [], crossLinks = []) {
  const pick = (flow, on) => {
    const ids = crossLinks.filter((l) => l.flow === flow);
    const sameLabel = ids.filter((l) => l.on === on).map((l) => l.from);
    const any = ids.map((l) => l.from);
    const from = (sameLabel.length ? sameLabel : any).sort()[0];
    return from ?? null;
  };
  return declared.map((l) => {
    const on = String(l.on ?? "");
    const from = l.from || pick(l.flow, on);
    return { flow: l.flow, on, ...(from ? { from } : {}) };
  });
}
