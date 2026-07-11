// Phase 3 pod-seating QA observation snippet.
// Paste into the DevTools console while on the AI Hub Live floor (:3100). It pulls the
// live roster through the app's own proxy, folds subagents to their session root the way
// the seating allocator does, and prints the EXPECTED pod picture so you can compare it
// against what the office renders (occupied pods, leads at anchors, members clustered,
// overflow roaming). Read-only: no side effects on the hub.

(async () => {
  const res = await fetch("/api/runtime/aihub", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pathname: "/api/live" }),
  });
  const snap = await res.json();
  const nodes = (snap.nodes || []).filter((n) => n.kind !== "hub");
  const links = snap.links || [];

  // parent = spawn-link source; subagents carry no session_id, so this is the only key.
  const parentById = new Map();
  for (const n of nodes) parentById.set(n.id, null);
  for (const l of links) {
    if (l.kind === "spawn" && parentById.has(l.target)) {
      parentById.set(l.target, l.source);
    }
  }
  const rootOf = (id) => {
    let cur = id;
    const seen = new Set();
    while (!seen.has(cur)) {
      seen.add(cur);
      const p = parentById.get(cur);
      if (!p || !parentById.has(p)) break;
      cur = p;
    }
    return cur;
  };

  const seatable = nodes.filter((n) => n.status !== "done");
  const groups = new Map();
  for (const n of seatable) {
    const root = rootOf(n.id);
    (groups.get(root) || groups.set(root, []).get(root)).push(n);
  }

  const labelById = new Map(nodes.map((n) => [n.id, n.label || n.id]));
  const POD_COUNT = 6;
  const MEMBER_DESKS = 3;
  const rows = [...groups.entries()].map(([root, members], i) => {
    const memberCount = members.length - 1; // minus the lead
    return {
      pod: i < POD_COUNT ? i : "ROAM (overflow session)",
      lead: labelById.get(root) || root,
      members: memberCount,
      seatedMembers: Math.min(memberCount, MEMBER_DESKS),
      roamingMembers: Math.max(0, memberCount - MEMBER_DESKS),
    };
  });

  console.log(
    `[phase3] nodes=${nodes.length} sessions/groups=${groups.size} → expected occupied pods=${Math.min(groups.size, POD_COUNT)}`,
  );
  console.table(rows);
})();
