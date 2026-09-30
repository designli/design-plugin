// The play check (server/lib/play.mjs): pure, no files. The same cases as the portal's
// apps/api/test/play.test.ts, so the two implementations cannot drift apart.
//   node --test "server/test/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  playCheck,
  startOf,
  autoAdvanceTarget,
  isTransientState,
  TRANSIENT_STATES,
  mergeTransitions,
  nextWithFrom,
} from "../lib/play.mjs";

const screen = (id) => {
  const [step, stepId, ...rest] = id.split("-");
  return {
    id,
    kind: "state",
    title: id,
    step,
    stepId,
    state: rest.join("-"),
    interactive: false,
    includes: [],
    devices: { desktop: { file: `screens/${id}.html`, w: 1440, h: 900, sha256: "x" } },
  };
};
const flow = (o) => ({
  steps: (o.steps || []).map((s) => ({ ...s, states: [] })),
  screens: [
    {
      id: "Main",
      kind: "map",
      title: "map",
      step: null,
      stepId: null,
      state: null,
      interactive: false,
      includes: [],
      devices: {},
    },
    ...(o.screens || []).map(screen),
  ],
  transitions: (o.transitions ?? []).map(([from, on, to]) => ({ from, on, to })),
  entryPoints: o.entryPoints ?? [],
  flow: { next: o.next ?? [], play: o.exits ? { exits: o.exits } : undefined },
});
const linear = flow({
  steps: [
    { n: "01", id: "Client", kind: "choice" },
    { n: "02", id: "Details", kind: "form" },
    { n: "03", id: "Sent", kind: "result" },
  ],
  screens: [
    "01-Client-Default",
    "01-Client-Loading",
    "02-Details-Default",
    "02-Details-Error",
    "03-Sent-Success",
  ],
  transitions: [
    ["01-Client-Default", "Continue", "02-Details-Default"],
    ["02-Details-Default", "Send", "03-Sent-Success"],
    ["02-Details-Error", "Try again", "02-Details-Default"],
  ],
  entryPoints: [{ from: "Navbar", to: "01-Client" }],
});

test("ready when every non-transient screen leads on and every step is reached", () => {
  const r = playCheck(linear);
  assert.equal(r.ready, true);
  assert.equal(r.start, "01-Client-Default");
  assert.deepEqual(r.deadEnds, []);
  assert.deepEqual(r.unreachable, []);
  assert.deepEqual(r.dangling, []);
});

test("a result step is terminal, Loading and Submitting are transient", () => {
  const r = playCheck(linear);
  const ids = r.deadEnds.map((d) => d.screen);
  assert.ok(!ids.includes("03-Sent-Success"));
  assert.ok(!ids.includes("01-Client-Loading"));
  assert.deepEqual(TRANSIENT_STATES, ["Loading", "Submitting"]);
  assert.equal(isTransientState("Submitting"), true);
  assert.equal(isTransientState("Error"), false);
  assert.equal(isTransientState(null), false);
});

test("an Error state without a way out is a dead end", () => {
  const m = {
    ...linear,
    transitions: linear.transitions.filter((t) => t.from !== "02-Details-Error"),
  };
  const r = playCheck(m);
  assert.equal(r.ready, false);
  assert.deepEqual(r.deadEnds, [{ screen: "02-Details-Error", step: "02", state: "Error" }]);
});

test("a declared exit or a link into another flow makes a screen terminal", () => {
  const base = {
    steps: [
      { n: "01", id: "Home", kind: "info" },
      { n: "02", id: "Help", kind: "info" },
    ],
    screens: ["01-Home-Default", "02-Help-Default"],
    transitions: [["01-Home-Default", "Help", "02-Help-Default"]],
  };
  assert.deepEqual(
    playCheck(flow(base)).deadEnds.map((d) => d.screen),
    ["02-Help-Default"],
  );
  assert.equal(
    playCheck(flow({ ...base, exits: { "02-Help-Default": "the user closes the app" } })).ready,
    true,
  );
  assert.equal(
    playCheck(flow({ ...base, next: [{ flow: "billing", on: "Pay", from: "02-Help-Default" }] }))
      .ready,
    true,
  );
  assert.deepEqual(playCheck(flow({ ...base, exits: { "02-Help-Default": "" } })).exits, [
    { screen: "02-Help-Default", reason: "" },
  ]);
});

test("a step no path reaches is unreachable; waived-only steps are not", () => {
  const m = flow({
    steps: [
      { n: "01", id: "A", kind: "info" },
      { n: "02", id: "B", kind: "info" },
      { n: "03", id: "C", kind: "result" },
      { n: "04", id: "D", kind: "info" },
    ],
    screens: ["01-A-Default", "02-B-Default", "03-C-Default"],
    transitions: [
      ["01-A-Default", "Go", "03-C-Default"],
      ["02-B-Default", "Go", "03-C-Default"],
    ],
  });
  const r = playCheck(m);
  assert.deepEqual(r.unreachable, [{ step: "02", id: "B" }]);
  assert.deepEqual(r.deadEnds, []);
});

test("a transition to a screen the version does not carry is dangling, not a dead end", () => {
  const m = flow({
    steps: [
      { n: "01", id: "A", kind: "info" },
      { n: "02", id: "B", kind: "result" },
    ],
    screens: ["01-A-Default"],
    transitions: [["01-A-Default", "Go", "02-B-Default"]],
  });
  const r = playCheck(m);
  assert.deepEqual(r.dangling, [{ from: "01-A-Default", on: "Go", to: "02-B-Default" }]);
  assert.deepEqual(r.deadEnds, []);
  assert.equal(r.ready, false);
});

test("finds the start from an entry point naming a step, a screen, or nothing", () => {
  assert.equal(startOf(linear), "01-Client-Default");
  assert.equal(
    startOf({ ...linear, entryPoints: [{ from: "x", to: "02-Details-Error" }] }),
    "02-Details-Error",
  );
  assert.equal(startOf({ ...linear, entryPoints: [] }), "01-Client-Default");
  const noDefault = flow({
    steps: [{ n: "01", id: "A", kind: "data" }],
    screens: ["01-A-Loading", "01-A-Empty"],
  });
  assert.equal(startOf(noDefault), "01-A-Loading");
});

test("auto-advances Loading to Default and Submitting along the primary path", () => {
  assert.equal(autoAdvanceTarget(linear, "01-Client-Loading"), "01-Client-Default");
  const m = flow({
    steps: [
      { n: "01", id: "Pay", kind: "confirmation" },
      { n: "02", id: "Done", kind: "result" },
    ],
    screens: ["01-Pay-Default", "01-Pay-Submitting", "01-Pay-Success", "02-Done-Success"],
    transitions: [
      ["01-Pay-Default", "Pay", "01-Pay-Submitting"],
      ["01-Pay-Submitting", "paid", "02-Done-Success"],
    ],
  });
  assert.equal(autoAdvanceTarget(m, "01-Pay-Submitting"), "02-Done-Success");
  m.transitions = m.transitions.filter((t) => t.from !== "01-Pay-Submitting");
  assert.equal(autoAdvanceTarget(m, "01-Pay-Submitting"), "01-Pay-Success");
  assert.equal(autoAdvanceTarget(m, "01-Pay-Default"), null);
});

test("the transition merge keeps the declared ones and drops inferred ends the version lacks", () => {
  const known = new Set(["01-A-Default", "02-B-Default"]);
  const merged = mergeTransitions(
    [{ from: "01-A-Default", on: "declared", to: "02-B-Default" }],
    [
      { from: "01-A-Default", on: "declared", to: "02-B-Default" }, // same edge, not repeated
      { from: "01-A-Default", on: "Skip", to: "03-C-Default" }, // unknown end, dropped
      { from: "02-B-Default", on: "Back", to: "01-A-Default" },
    ],
    known,
  );
  assert.deepEqual(merged, [
    { from: "01-A-Default", on: "declared", to: "02-B-Default" },
    { from: "02-B-Default", on: "Back", to: "01-A-Default" },
  ]);
});

test("a journey link takes the lowest screen id whose link resolves into that flow", () => {
  const cross = [
    { from: "04-History-Loading", flow: "create-an-event", on: "Create another event" },
    { from: "04-History-Default", flow: "create-an-event", on: "Create another event" },
    { from: "02-Ticket-Default", flow: "help-centre", on: "Help" },
  ];
  assert.deepEqual(
    nextWithFrom(
      [
        { flow: "create-an-event", on: "Create another event" },
        { flow: "help-centre", on: "Help centre" }, // no link with that label: any link into it
        { flow: "gone", on: "Nowhere" },
        { flow: "help-centre", on: "Help", from: "09-Kept-Default" },
      ],
      cross,
    ),
    [
      { flow: "create-an-event", on: "Create another event", from: "04-History-Default" },
      { flow: "help-centre", on: "Help centre", from: "02-Ticket-Default" },
      { flow: "gone", on: "Nowhere" },
      { flow: "help-centre", on: "Help", from: "09-Kept-Default" },
    ],
  );
});
