import { getStore } from "@netlify/blobs";

export const config = { path: "/api/*" };

const SCORE_PIN = () => process.env.SCORE_PIN || "";
const ADMIN_PIN = () => process.env.ADMIN_PIN || "";

const DEFAULT_CONFIG = {
  title: "Ponz's 60th Round",
  honoree: "Ponz",
  cap: true,
  sub: "",
  course: "Turtle Creek Club (Blue)",
  teams: [
    { id: "A", name: "Team A" },
    { id: "B", name: "Team B" },
  ],
  pct: 100,
  players: [
    { id: "p1", name: "Luke", team: "A", hcp: 8 },
    { id: "p2", name: "Kyle", team: "A", hcp: 0 },
    { id: "p3", name: "Jeff", team: "A", hcp: 10 },
    { id: "p4", name: "Dickie", team: "A", hcp: 31 },
    { id: "p5", name: "Will", team: "B", hcp: 14 },
    { id: "p6", name: "Gilman", team: "B", hcp: 14 },
    { id: "p7", name: "Chris Vincze", team: "B", hcp: 18 },
    { id: "p8", name: "Mac", team: "B", hcp: 4 },
  ],
  par: [5, 4, 3, 4, 4, 4, 5, 3, 4, 4, 4, 4, 5, 3, 4, 5, 3, 4],
  si: [11, 1, 17, 13, 5, 3, 9, 15, 7, 2, 12, 4, 6, 18, 14, 10, 16, 8],
  yds: [533, 399, 142, 355, 372, 385, 542, 178, 394, 421, 384, 416, 506, 147, 344, 493, 181, 391],
  pairs: null,
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const store = () => getStore({ name: "round60", consistency: "strong" });

async function getConfig(s) {
  return { ...DEFAULT_CONFIG, ...((await s.get("config", { type: "json" })) || {}) };
}

async function getScores(s, cfg) {
  const out = {};
  await Promise.all(
    cfg.players.map(async (p) => {
      out[p.id] = (await s.get("score:" + p.id, { type: "json" })) || Array(18).fill(null);
    })
  );
  return out;
}

function cleanConfig(c) {
  const str = (v, n) => String(v ?? "").slice(0, n);
  const teams = [0, 1].map((i) => ({
    id: i === 0 ? "A" : "B",
    name: str(c.teams?.[i]?.name, 30) || (i === 0 ? "Team A" : "Team B"),
  }));
  const players = (c.players || []).slice(0, 12).map((p, i) => ({
    id: str(p.id, 10) || "p" + (i + 1),
    name: str(p.name, 30) || "Player " + (i + 1),
    team: p.team === "B" ? "B" : "A",
    hcp: Math.max(0, Math.min(54, Math.round(Number(p.hcp) || 0))),
  }));
  const par = Array.from({ length: 18 }, (_, i) => {
    const v = Math.round(Number(c.par?.[i]));
    return v >= 3 && v <= 6 ? v : 4;
  });
  const si = Array.from({ length: 18 }, (_, i) => {
    const v = Math.round(Number(c.si?.[i]));
    return v >= 1 && v <= 18 ? v : i + 1;
  });
  const pct = Math.max(0, Math.min(150, Math.round(Number(c.pct ?? 100))));
  const yds = Array.from({ length: 18 }, (_, i) => { const v = Math.round(Number(c.yds?.[i])); return v > 0 && v < 800 ? v : 0; });
  return { honoree: str(c.honoree, 30), cap: c.cap !== false, title: str(c.title, 60), sub: str(c.sub, 80), course: str(c.course, 60), teams, pct, players, par, si, yds, pairs: null };
}

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/^\/api\/?/, "");
  const s = store();
  const flags = { pinRequired: !!SCORE_PIN(), adminRequired: true };

  try {
    if (req.method === "GET" && path === "state") {
      const cfg = await getConfig(s);
      return json({ config: cfg, scores: await getScores(s, cfg), ...flags });
    }
    if (req.method !== "POST") return json({ error: "not found" }, 404);

    const body = await req.json().catch(() => ({}));
    const pin = String(body.pin || "");
    const okScore = !SCORE_PIN() || pin === SCORE_PIN() || (ADMIN_PIN() && pin === ADMIN_PIN());
    const okAdmin = !!ADMIN_PIN() && pin === ADMIN_PIN();
    const okDraw = okAdmin;

    if (path === "auth") {
      const ok = body.kind === "admin" ? okAdmin : body.kind === "draw" ? okDraw : okScore;
      if (!ok && body.kind !== "score" && !ADMIN_PIN()) return json({ error: "ADMIN_PIN is not set in Netlify" }, 401);
      return ok ? json({ ok: true }) : json({ error: "bad pin" }, 401);
    }

    if (path === "score") {
      if (!okScore) return json({ error: "bad pin" }, 401);
      const cfg = await getConfig(s);
      const ids = new Set(cfg.players.map((p) => p.id));
      const byPlayer = {};
      for (const e of Array.isArray(body.entries) ? body.entries : []) {
        const h = Number(e.hole);
        const v = e.value === null ? null : Number(e.value);
        if (!ids.has(e.pid) || !Number.isInteger(h) || h < 0 || h > 17) continue;
        if (v !== null && (!Number.isInteger(v) || v < 1 || v > 20)) continue;
        (byPlayer[e.pid] ||= []).push([h, v]);
      }
      for (const [pid, list] of Object.entries(byPlayer)) {
        const arr = (await s.get("score:" + pid, { type: "json" })) || Array(18).fill(null);
        for (const [h, v] of list) arr[h] = v;
        await s.setJSON("score:" + pid, arr);
      }
      return json({ ok: true });
    }

    if (path === "config") {
      if (!okAdmin) return json({ error: "bad pin" }, 401);
      const prev = await getConfig(s);
      const next = cleanConfig(body.config || {});
      const keep = new Set(next.players.map((p) => p.id));
      const ok = prev.pairs && prev.pairs.every((x) => keep.has(x[0]) && keep.has(x[1]));
      next.pairs = ok ? prev.pairs : null;
      await s.setJSON("config", next);
      return json({ ok: true });
    }

    if (path === "draw") {
      if (!okDraw) return json({ error: "bad pin" }, 401);
      const cfg = await getConfig(s);
      const ids = cfg.players.map((p) => p.id);
      const buf = new Uint32Array(ids.length);
      crypto.getRandomValues(buf);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = buf[i] % (i + 1);
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      const pairs = [];
      for (let i = 0; i + 1 < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
      await s.setJSON("config", { ...cfg, pairs });
      return json({ ok: true, pairs });
    }

    if (path === "reset") {
      if (!okAdmin) return json({ error: "bad pin" }, 401);
      const cfg = await getConfig(s);
      await Promise.all(cfg.players.map((p) => s.delete("score:" + p.id)));
      if (body.pairs) await s.setJSON("config", { ...cfg, pairs: null });
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};
