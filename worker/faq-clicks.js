/**
 * FAQ 클릭 집계 Cloudflare Worker (KV 기반)
 *
 * 배포 방법:
 * 1. Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. 이 코드를 붙여넣기
 * 3. Settings → Variables → KV Namespace Bindings에서
 *    변수명 "FAQ_CLICKS", 새 KV 네임스페이스 생성 후 바인딩
 * 4. Worker URL을 GitHub repo vars에 VITE_FAQ_CLICKS_URL로 등록
 *
 * KV 구조: key = FAQ ID/질문 텍스트, value = 클릭 수 (숫자 문자열)
 *
 * 엔드포인트:
 *   POST /click   { key: string }  → 클릭 +1
 *   GET  /clicks                   → 전체 집계 { [key]: count }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    // POST /click — 클릭 수 +1
    if (request.method === 'POST' && url.pathname === '/click') {
      try {
        const { key } = await request.json();
        if (!key || typeof key !== 'string') {
          return json({ error: 'key is required' }, 400);
        }

        const current = parseInt(await env.FAQ_CLICKS.get(key) || '0', 10);
        await env.FAQ_CLICKS.put(key, String(current + 1));
        return json({ ok: true });
      } catch {
        return json({ error: 'invalid request' }, 400);
      }
    }

    // GET /clicks — 전체 집계 반환
    if (request.method === 'GET' && url.pathname === '/clicks') {
      const result = {};
      let cursor = undefined;

      // KV list는 최대 1000개씩 반환, 페이지네이션 처리
      do {
        const list = await env.FAQ_CLICKS.list({ cursor });
        for (const { name } of list.keys) {
          const val = await env.FAQ_CLICKS.get(name);
          result[name] = parseInt(val || '0', 10);
        }
        cursor = list.list_complete ? undefined : list.cursor;
      } while (cursor);

      return json(result);
    }

    return json({ error: 'not found' }, 404);
  },
};
