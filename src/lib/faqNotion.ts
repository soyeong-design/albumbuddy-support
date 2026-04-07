/**
 * AlbumBuddy FAQ — Notion DB 연동
 * DB: https://makestar.notion.site/e13c0f4dd8c883e195f481a3ba103b8f
 *
 * DB 구조: 언어별 별도 컬럼
 *   title     → 한글 질문 (항상 존재)
 *   한글 답변  → 한글 답변
 *   영어질문   → English question
 *   영어답변   → English answer
 *   중국어질문  → 中文问题
 *   중국어답변  → 中文答案
 *   카테고리   → 카테고리 (select)
 *   view count → 버튼 (무시)
 *   일어질문/일어답변 → 추가 예정
 */

const PAGE_UUID = 'e13c0f4d-d8c8-83e1-95f4-81a3ba103b8f';
const COLLECTION_ID = '054c0f4d-d8c8-8224-8d97-870a22aa5886';
const VIEW_UUID = 'e17c0f4d-d8c8-82d6-8e04-8819673bf06b';
const SPACE_ID = 'a88e0dce-491e-409a-ad13-77f7a9030ca9';

export interface FaqNotionItem {
  id: string;
  /** 언어 코드 → 질문 텍스트 */
  questions: Partial<Record<string, string>>;
  /** 언어 코드 → 답변 텍스트 */
  answers: Partial<Record<string, string>>;
  category: string;
}

// ── 세션 내 캐시 (2분) ──────────────────────────────────────────
let _cacheTs = 0;
let _cacheItems: FaqNotionItem[] = [];
const CACHE_TTL = 2 * 60 * 1000;

// ── 유틸 ───────────────────────────────────────────────────────
function toUuid(id: string): string {
  const c = id.replace(/-/g, '');
  return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
}

function toSlug(uuid: string): string {
  return uuid.replace(/-/g, '');
}

function richText(rt: any[] | undefined): string {
  if (!rt?.length) return '';
  return rt.map((seg: any) => (Array.isArray(seg) ? seg[0] : '')).join('');
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

// ── Schema에서 프로퍼티 ID 탐색 (이름 키워드 매칭) ──────────────
function findById(schema: Record<string, any>, keywords: string[]): string {
  for (const [id, def] of Object.entries<any>(schema)) {
    if ((def.type ?? '') === 'button') continue;
    const name = (def.name ?? '').replace(/\s/g, '').toLowerCase();
    if (keywords.some((k) => name.includes(k.replace(/\s/g, '').toLowerCase()))) return id;
  }
  return '';
}

// ── Collection 동적 발견 ────────────────────────────────────────
interface CollectionInfo {
  collectionId: string;
  viewId: string;
  spaceId: string;
}

async function discoverCollection(): Promise<CollectionInfo> {
  const chunk = await notionPost('loadPageChunk', {
    pageId: PAGE_UUID,
    limit: 50,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false,
  });
  const blocks = chunk.recordMap?.block ?? {};
  const getVal = (b: any) => b?.value?.value ?? b?.value ?? {};
  const root = getVal(blocks[PAGE_UUID]);

  if (root.type === 'collection_view_page' && root.collection_id) {
    return {
      collectionId: root.collection_id,
      viewId: VIEW_UUID,
      spaceId: root.space_id ?? SPACE_ID,
    };
  }
  for (const id of root.content ?? []) {
    const b = getVal(blocks[id]);
    if ((b.type === 'collection_view_page' || b.type === 'collection_view') && b.collection_id) {
      return {
        collectionId: b.collection_id,
        viewId: (b.view_ids ?? [])[0] ?? VIEW_UUID,
        spaceId: b.space_id ?? SPACE_ID,
      };
    }
  }
  return { collectionId: COLLECTION_ID, viewId: VIEW_UUID, spaceId: SPACE_ID };
}

// ── FAQ 목록 fetch ──────────────────────────────────────────────
export async function fetchFaqItems(): Promise<FaqNotionItem[]> {
  if (Date.now() - _cacheTs < CACHE_TTL && _cacheItems.length > 0) return _cacheItems;

  const result = await notionPost('queryCollection', {
    collection: { id: COLLECTION_ID, spaceId: SPACE_ID },
    collectionView: { id: VIEW_UUID, spaceId: SPACE_ID },
    query2: { aggregations: [{ property: 'title', aggregator: 'count' }] },
    loader: {
      type: 'reducer',
      reducers: { collection_group_results: { type: 'results', limit: 300 } },
      searchQuery: '',
      userTimeZone: 'Asia/Seoul',
    },
  });

  const blocks = result.recordMap?.block ?? {};
  const collections = result.recordMap?.collection ?? {};
  const blockIds: string[] =
    result.result?.reducerResults?.collection_group_results?.blockIds ?? [];

  const colVal =
    collections[COLLECTION_ID]?.value?.value ?? collections[COLLECTION_ID]?.value ?? {};
  const schema: Record<string, any> = colVal.schema ?? {};

  // 언어별 질문/답변 프로퍼티 ID 탐색
  const koAId = findById(schema, ['한글답변', '한글 답변', '국문답변']);
  const enQId = findById(schema, ['영어질문', '영문질문', '영어 질문', '영문 질문']);
  const enAId = findById(schema, ['영어답변', '영문답변', '영어 답변', '영문 답변']);
  const zhQId = findById(schema, ['중국어질문', '중문질문', '중국어 질문', '중문 질문']);
  const zhAId = findById(schema, ['중국어답변', '중문답변', '중국어 답변', '중문 답변']);
  const jaQId = findById(schema, ['일본어질문', '일어질문', '일본어 질문', '일어 질문']);
  const jaAId = findById(schema, ['일본어답변', '일어답변', '일본어 답변', '일어 답변']);
  const catId = findById(schema, ['카테고리', 'category']);

  const getVal = (b: any) => b?.value?.value ?? b?.value ?? {};
  const items: FaqNotionItem[] = [];

  for (const id of blockIds) {
    const v = getVal(blocks[id]);
    if (!v?.type) continue;

    const koQ = richText(v.properties?.title);
    if (!koQ) continue;

    items.push({
      id: toSlug(id),
      questions: {
        ko: koQ,
        en: enQId ? richText(v.properties?.[enQId]) : '',
        'zh-CN': zhQId ? richText(v.properties?.[zhQId]) : '',
        ja: jaQId ? richText(v.properties?.[jaQId]) : '',
      },
      answers: {
        ko: koAId ? richText(v.properties?.[koAId]) : '',
        en: enAId ? richText(v.properties?.[enAId]) : '',
        'zh-CN': zhAId ? richText(v.properties?.[zhAId]) : '',
        ja: jaAId ? richText(v.properties?.[jaAId]) : '',
      },
      category: catId ? richText(v.properties?.[catId]) : '',
    });
  }

  _cacheTs = Date.now();
  _cacheItems = items;
  return items;
}

/** 캐시 무효화 (강제 새로고침) */
export function invalidateFaqCache(): void {
  _cacheTs = 0;
}
