/**
 * AlbumBuddy Notices - Notion DB 연동
 * 페이지: https://makestar.notion.site/337c0f4dd8c8802f9a10d04db3ca97c7
 *
 * 구조: 루트 페이지 안에 collection_view(DB)로 공지 항목 관리
 * - 상태(w<bc): '게시됨' 인 항목만 노출
 * - 선택(|e{a): 영문 / 일어 / 국문 / 중문 — 언어 식별에 사용
 *
 * 그룹화 방식: LANG_GROUPS 하드코딩 없이 DB 정렬 순서로 동적 감지.
 * DB에서 같은 언어가 재등장하는 시점을 새 그룹의 시작으로 판단하여
 * 연속된 언어 변형 항목들을 자동으로 같은 그룹으로 묶음.
 */

const SPACE_ID = 'a88e0dce-491e-409a-ad13-77f7a9030ca9';
const COLLECTION_ID = '33ac0f4d-d8c8-8026-9c7e-000b0e436dfc';
const COLLECTION_VIEW_ID = '33ac0f4d-d8c8-808c-b3eb-000cad98c7d6';

export type NoticeLang = 'ko' | 'en' | 'ja' | 'zh-CN';

/** NoticeLang → DB 언어 선택값 매핑 */
const LANG_TO_DB: Record<NoticeLang, string> = {
  ko: '국문',
  en: '영문',
  ja: '일어',
  'zh-CN': '중문',
};

export interface NoticePost {
  id: string;
  title: string;
  date: string;
  slug: string;
  dbLang: string; // DB '선택' 필드 (영문/일어/국문/중문)
  groupIdx: number; // 같은 내용의 언어 변형 그룹 인덱스
  category: string; // DB '카테고리' 필드 (일반 공지/약관/이용법)
}

/**
 * DB 정렬 순서 기반 동적 그룹화.
 * 현재 그룹에 이미 같은 언어가 있으면 새 그룹을 시작.
 * 예) [국문, 영문, 일어, 국문, 영문] → [0, 0, 0, 1, 1]
 */
function assignGroupIdx(posts: Array<{ dbLang: string }>): number[] {
  const result: number[] = [];
  let groupIdx = 0;
  const seen = new Set<string>();

  for (const p of posts) {
    if (seen.has(p.dbLang)) {
      groupIdx++;
      seen.clear();
    }
    seen.add(p.dbLang);
    result.push(groupIdx);
  }
  return result;
}

/**
 * 현재 언어에 맞는 변형 하나씩만 추출.
 * 우선순위: 현재 언어 → 영문 → 첫 번째 항목
 * 중국어처럼 DB에 해당 언어 버전이 없으면 영문으로 폴백.
 */
export function filterPostsByLang(posts: NoticePost[], lang: NoticeLang): NoticePost[] {
  const dbLang = LANG_TO_DB[lang];
  const fallback = LANG_TO_DB['en'];

  const groupOrder = [...new Set(posts.map((p) => p.groupIdx))];
  const byGroup = new Map<number, NoticePost[]>();
  for (const p of posts) {
    if (!byGroup.has(p.groupIdx)) byGroup.set(p.groupIdx, []);
    byGroup.get(p.groupIdx)!.push(p);
  }

  return groupOrder.map((idx) => {
    const group = byGroup.get(idx)!;
    const selected =
      group.find((p) => p.dbLang === dbLang) ??
      group.find((p) => p.dbLang === fallback) ??
      group[0];

    // 날짜는 항상 영문 버전 기준 (영문 없으면 선택된 항목의 날짜 사용)
    const enDate = group.find((p) => p.dbLang === LANG_TO_DB['en'])?.date;
    return { ...selected, date: enDate ?? selected.date };
  });
}

export interface NoticeDetail {
  title: string;
  date: string;
  contentHtml: string;
}

// ── 유틸 ─────────────────────────────────────────────────────
function toUuid(id: string): string {
  const c = id.replace(/-/g, '');
  return c.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function toSlug(id: string): string {
  return id.replace(/-/g, '');
}

function richTextToPlain(rt: any[] | undefined): string {
  return rt?.map((s: any) => s[0]).join('') ?? '';
}

function formatTs(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function getV(block: any): any {
  return block?.value?.value ?? block?.value ?? {};
}

// dev: Vite 프록시(/notion-api), prod: Cloudflare Worker URL
const NOTION_BASE = import.meta.env.DEV
  ? '/notion-api'
  : (import.meta.env.VITE_NOTION_PROXY_URL ?? '');

async function notionPost(endpoint: string, body: object): Promise<any> {
  const res = await fetch(`${NOTION_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Notion ${endpoint} → ${res.status}`);
  return res.json();
}

// ── 공지 목록 ─────────────────────────────────────────────────
export async function getNoticePosts(): Promise<NoticePost[]> {
  const result = await notionPost('queryCollection', {
    collection: { id: COLLECTION_ID, spaceId: SPACE_ID },
    collectionView: { id: COLLECTION_VIEW_ID, spaceId: SPACE_ID },
    query2: { aggregations: [{ property: 'title', aggregator: 'count' }] },
    loader: {
      type: 'reducer',
      reducers: { collection_group_results: { type: 'results', limit: 100 } },
      searchQuery: '',
      userTimeZone: 'Asia/Seoul',
    },
  });

  const blocks = result.recordMap?.block ?? {};
  const blockIds: string[] =
    result.result?.reducerResults?.collection_group_results?.blockIds ?? [];

  // 1단계: 게시됨 항목만 추출 (DB 순서 유지, 그룹화 기준)
  const raw: Array<{
    id: string;
    title: string;
    date: string;
    slug: string;
    dbLang: string;
    createdAt: number;
    category: string;
  }> = [];

  for (const id of blockIds) {
    const v = getV(blocks[id]);
    if (!v?.type) continue;

    const title = richTextToPlain(v.properties?.title);
    if (!title) continue;

    const status = (v.properties?.['w<bc'] ?? []).map((s: any) => s[0]).join('');
    if (status !== '게시됨') continue;

    const dbLang = (v.properties?.['|e{a'] ?? (v.properties?.[':dNa'] ?? [])).map((s: any) => s[0]).join('') || '영문';
    const category = (v.properties?.['=^pP'] ?? []).map((s: any) => s[0]).join('') || '';
    const createdAt: number = v.created_time ?? 0;
    const date = createdAt ? formatTs(createdAt) : '';
    const slug = toSlug(id);
    raw.push({ id, title, date, slug, dbLang, createdAt, category });
  }

  // 2단계: DB 순서 기준으로 동적 그룹 인덱스 부여
  const groupIdxs = assignGroupIdx(raw);

  // 3단계: 그룹별로 모아서 대표 날짜(첫 항목 createdAt) 기준 최신순 정렬
  const groupMap = new Map<number, typeof raw>();
  const groupOrder: number[] = [];
  const groupTs = new Map<number, number>();

  for (let i = 0; i < raw.length; i++) {
    const idx = groupIdxs[i];
    if (!groupMap.has(idx)) {
      groupMap.set(idx, []);
      groupOrder.push(idx);
      groupTs.set(idx, raw[i].createdAt);
    }
    groupMap.get(idx)!.push(raw[i]);
  }

  groupOrder.sort((a, b) => groupTs.get(b)! - groupTs.get(a)!);

  // 4단계: 정렬된 그룹 순서로 펼쳐서 NoticePost[] 반환
  // newGroupIdx = 정렬 후 위치 (같은 그룹 내 모든 항목이 동일한 값 공유)
  return groupOrder.flatMap((originalIdx, newGroupIdx) =>
    groupMap.get(originalIdx)!.map((r) => ({
      id: r.id,
      title: r.title,
      date: r.date,
      slug: r.slug,
      dbLang: r.dbLang,
      groupIdx: newGroupIdx,
      category: r.category,
    })),
  );
}

// ── 공지 상세 ─────────────────────────────────────────────────
export async function getNoticeDetail(slug: string): Promise<NoticeDetail> {
  const uuid = slug.length === 32 ? toUuid(slug) : slug;

  const chunk = await notionPost('loadPageChunk', {
    pageId: uuid,
    limit: 300,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false,
  });

  const blocks = chunk.recordMap?.block ?? {};
  const rootV = getV(blocks[uuid]);

  const title = richTextToPlain(rootV.properties?.title);
  const date = rootV.created_time ? formatTs(rootV.created_time) : '';

  const contentIds: string[] = rootV.content ?? [];
  const contentBlocks = contentIds.map((id) => getV(blocks[id])).filter((v) => v.type);

  return { title, date, contentHtml: renderBlocks(contentBlocks, chunk.recordMap, blocks) };
}

// ── 블록 → HTML ───────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rtHtml(rt: any[] | undefined): string {
  if (!rt?.length) return '';
  return rt
    .map((seg: any) => {
      const [text, decs] = seg;
      let s = esc(String(text)).replace(/\n/g, '<br/>');
      if (decs) {
        for (const d of decs) {
          switch (d[0]) {
            case 'b':
              s = `<strong>${s}</strong>`;
              break;
            case 'i':
              s = `<em>${s}</em>`;
              break;
            case '_':
              s = `<u>${s}</u>`;
              break;
            case 's':
              s = `<s>${s}</s>`;
              break;
            case 'c':
              s = `<code style="background:#f1f3f5;padding:2px 4px;border-radius:3px;font-size:13px">${s}</code>`;
              break;
            case 'a':
              s = `<a href="${esc(d[1])}" style="color:#6204fb;text-decoration:underline" target="_blank" rel="noopener">${s}</a>`;
              break;
          }
        }
      }
      return s;
    })
    .join('');
}

function renderBlocks(blocks: any[], recordMap: any, allBlocks: Record<string, any> = {}): string {
  let html = '';
  let inList: 'ul' | 'ol' | null = null;

  for (const v of blocks) {
    if (v.type !== 'bulleted_list' && v.type !== 'numbered_list' && inList) {
      html += inList === 'ul' ? '</ul>' : '</ol>';
      inList = null;
    }
    switch (v.type) {
      case 'text':
        html += rtHtml(v.properties?.title) ? `<p>${rtHtml(v.properties?.title)}</p>` : '<br/>';
        break;
      case 'header':
        html += `<h1>${rtHtml(v.properties?.title)}</h1>`;
        break;
      case 'sub_header':
        html += `<h2>${rtHtml(v.properties?.title)}</h2>`;
        break;
      case 'sub_sub_header':
        html += `<h3>${rtHtml(v.properties?.title)}</h3>`;
        break;
      case 'bulleted_list': {
        if (inList !== 'ul') {
          if (inList) html += '</ol>';
          html += '<ul>';
          inList = 'ul';
        }
        const bChildren = (v.content ?? [])
          .map((id: string) => getV(allBlocks[id]))
          .filter((c: any) => c.type);
        const bNested = bChildren.length ? renderBlocks(bChildren, recordMap, allBlocks) : '';
        html += `<li>${rtHtml(v.properties?.title)}${bNested}</li>`;
        break;
      }
      case 'numbered_list': {
        if (inList !== 'ol') {
          if (inList) html += '</ul>';
          html += '<ol>';
          inList = 'ol';
        }
        const nChildren = (v.content ?? [])
          .map((id: string) => getV(allBlocks[id]))
          .filter((c: any) => c.type);
        const nNested = nChildren.length ? renderBlocks(nChildren, recordMap, allBlocks) : '';
        html += `<li>${rtHtml(v.properties?.title)}${nNested}</li>`;
        break;
      }
      case 'image': {
        const url = recordMap?.signed_urls?.[v.id] ?? v.properties?.source?.[0]?.[0] ?? '';
        const cap = richTextToPlain(v.properties?.caption);
        html += `<figure><img src="${esc(url)}" alt="${esc(cap)}" style="max-width:100%;border-radius:8px"/>${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
        break;
      }
      case 'quote':
        html += `<blockquote>${rtHtml(v.properties?.title)}</blockquote>`;
        break;
      case 'callout':
        html += `<div class="callout">${v.format?.page_icon ? `<span>${v.format.page_icon}</span> ` : ''}${rtHtml(v.properties?.title)}</div>`;
        break;
      case 'divider':
        html += '<hr/>';
        break;
      case 'bookmark': {
        const bUrl = v.properties?.link?.[0]?.[0] ?? '';
        html += `<a href="${esc(bUrl)}" target="_blank" rel="noopener" style="color:#6204fb;text-decoration:underline">${esc(bUrl)}</a>`;
        break;
      }
    }
  }
  if (inList) html += inList === 'ul' ? '</ul>' : '</ol>';
  return html;
}
