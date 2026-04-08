/**
 * FAQ 클릭 추적 — Cloudflare Worker(KV) 기반 전체 사용자 통합 집계
 *
 * 동작 방식:
 * - trackClick(): FAQ 펼칠 때 Worker에 POST + localStorage 백업
 * - fetchGlobalCounts(): Worker에서 전체 집계 fetch → 메모리 캐시 (1시간)
 * - getDisplayCounts(): 캐시된 집계 반환 (동기, 초기 로딩 전엔 localStorage 폴백)
 * - refreshSnapshot(): 1시간 인터벌 tick 시 호출 → Worker에서 최신 집계 가져오기
 */

const CLICKS_KEY = 'ab_faq_clicks'; // localStorage 폴백용
const SNAPSHOT_KEY = 'ab_faq_snapshot';
const SNAPSHOT_TTL = 60 * 60 * 1000; // 1시간

const API_BASE = import.meta.env.VITE_FAQ_CLICKS_URL ?? '';

type ClickStore = Record<string, number>;

interface Snapshot {
  ts: number;
  counts: ClickStore;
}

// ── 메모리 캐시 ────────────────────────────────────────────────
let cachedCounts: ClickStore = {};
let cacheTs = 0;

// ── localStorage 폴백 ──────────────────────────────────────────
function loadLocalClicks(): ClickStore {
  try {
    return JSON.parse(localStorage.getItem(CLICKS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function loadLocalSnapshot(): Snapshot | null {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

// ── Worker API 호출 ────────────────────────────────────────────
async function postClick(key: string): Promise<void> {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
  } catch {
    /* 네트워크 실패 시 무시 — localStorage에 이미 저장됨 */
  }
}

async function fetchRemoteCounts(): Promise<ClickStore | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}/clicks`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── 공개 API ───────────────────────────────────────────────────

/** FAQ 항목이 펼쳐질 때 호출 — Worker + localStorage 동시 기록 */
export function trackClick(key: string): void {
  // localStorage 백업 (오프라인 폴백)
  const clicks = loadLocalClicks();
  clicks[key] = (clicks[key] ?? 0) + 1;
  localStorage.setItem(CLICKS_KEY, JSON.stringify(clicks));

  // Worker에 비동기 전송 (fire-and-forget)
  postClick(key);
}

/**
 * Worker에서 전체 사용자 통합 집계를 가져와 캐시에 저장.
 * 초기 로딩 시 및 1시간 인터벌에서 호출.
 */
export async function fetchGlobalCounts(): Promise<ClickStore> {
  const remote = await fetchRemoteCounts();

  if (remote) {
    cachedCounts = remote;
    cacheTs = Date.now();
    // localStorage 스냅샷도 갱신 (다음 동기 호출용)
    const snap: Snapshot = { ts: cacheTs, counts: remote };
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
    return remote;
  }

  // Worker 실패 시 localStorage 폴백
  return loadLocalClicks();
}

/**
 * 표시용 클릭 카운트 반환 (동기).
 * 메모리 캐시 → localStorage 스냅샷 → localStorage raw 순으로 폴백.
 */
export function getDisplayCounts(): ClickStore {
  // 메모리 캐시가 유효하면 반환
  if (cacheTs && Date.now() - cacheTs < SNAPSHOT_TTL) {
    return cachedCounts;
  }

  // localStorage 스냅샷 확인
  const snap = loadLocalSnapshot();
  if (snap && Date.now() - snap.ts < SNAPSHOT_TTL) {
    cachedCounts = snap.counts;
    cacheTs = snap.ts;
    return snap.counts;
  }

  // 폴백: localStorage raw
  return loadLocalClicks();
}

/** 스냅샷 강제 갱신 (1시간 인터벌 tick 시 호출) — 비동기 */
export async function refreshSnapshot(): Promise<ClickStore> {
  return fetchGlobalCounts();
}

/**
 * 상위 N개 key 반환 (캐시 기준).
 * @param allKeys  전체 FAQ key 배열 (Notion id 또는 질문 텍스트)
 * @param n        반환 개수
 * @param fallback 클릭 데이터 없을 때 사용할 순서
 */
export function getTopKeys(allKeys: string[], n: number, fallback: string[] = []): string[] {
  const counts = getDisplayCounts();
  const hasData = allKeys.some((k) => (counts[k] ?? 0) > 0);

  if (!hasData) {
    return [...new Set([...fallback, ...allKeys])].slice(0, n);
  }

  return [...allKeys].sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0)).slice(0, n);
}
