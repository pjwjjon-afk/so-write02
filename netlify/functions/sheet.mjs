// 모둠 6개의 내용을 Netlify Blobs에 저장하고 돌려주는 작은 서버 코드예요.
// 반(c=1~12)마다 따로 저장해요.
// GET  /api/sheet?c=3            → 3반의 모둠 내용 전체와 모둠 수(meta)
// PUT  /api/sheet?c=3&g=2        → 3반 2모둠 내용 저장 (본문: {"data": {...}})
// PUT  /api/sheet?c=3&meta=1     → 3반 모둠 수 저장 (본문: {"count": 8})
// PUT  /api/sheet?auth=1         → 초기화 비밀번호 확인 (본문: {"password": "0401"})
import { getStore } from "@netlify/blobs";

const DEFAULT_COUNT = 6;
const MAX = 12;
const MAX_CLASS = 12;
const MAX_BYTES = 100000;
// 초기화 비밀번호. 바꾸려면 Netlify의 환경 변수 RESET_PASSWORD를 설정하거나 아래 "0401"을 고쳐요.
const DEFAULT_RESET_PASSWORD = "0401";

export async function handle(req, store) {
  const url = new URL(req.url);
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });

  if (req.method === "PUT" && url.searchParams.get("auth")) {
    let body = null;
    try {
      body = JSON.parse(await req.text());
    } catch {}
    const given = String((body && body.password) || "");
    const expected = String((typeof process !== "undefined" && process.env && process.env.RESET_PASSWORD) || DEFAULT_RESET_PASSWORD);
    const ok = given === expected;
    if (!ok) await new Promise((resolve) => setTimeout(resolve, 700));
    return json({ ok }, ok ? 200 : 403);
  }

  const c = parseInt(url.searchParams.get("c"), 10);
  if (!(c >= 1 && c <= MAX_CLASS)) return json({ error: "반 번호가 맞지 않아요." }, 400);

  if (req.method === "GET") {
    const groups = {};
    const meta = await store.get(`c${c}meta`, { type: "json" });
    const count = Math.min(MAX, Math.max(DEFAULT_COUNT, meta?.count || DEFAULT_COUNT));
    await Promise.all(
      Array.from({ length: count }, (_, i) => i + 1).map(async (n) => {
        const rec = await store.get(`c${c}g${n}`, { type: "json" });
        if (rec) groups[n] = rec;
      })
    );
    return json({ groups, meta: meta || null, now: Date.now() });
  }

  if (req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: "내용이 너무 커요." }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "내용을 읽을 수 없어요." }, 400);
    }
    if (url.searchParams.get("meta")) {
      const count = parseInt(body && body.count, 10);
      if (!(count >= 1 && count <= MAX)) return json({ error: "모둠 수가 맞지 않아요." }, 400);
      const meta = { count, t: Date.now() };
      await store.setJSON(`c${c}meta`, meta);
      return json({ t: meta.t });
    }
    const n = parseInt(url.searchParams.get("g"), 10);
    if (!(n >= 1 && n <= MAX)) return json({ error: "모둠 번호가 맞지 않아요." }, 400);
    if (!body || typeof body.data !== "object" || body.data === null) {
      return json({ error: "내용이 비어 있어요." }, 400);
    }
    const rec = { data: body.data, t: Date.now() };
    await store.setJSON(`c${c}g${n}`, rec);
    return json({ t: rec.t });
  }

  return json({ error: "지원하지 않는 요청이에요." }, 405);
}

export default async (req) =>
  handle(req, getStore({ name: "haegyeol-sheet", consistency: "strong" }));

export const config = { path: "/api/sheet" };
