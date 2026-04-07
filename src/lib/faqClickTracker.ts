/**
 * FAQ 클릭 추적 — localStorage 기반, 1시간 스냅샷
 *
 * 동작 방식:
 * - trackClick(): FAQ 항목이 펼쳐질 때 즉시 누적 저장
 * - getDisplayCounts(): 정렬·표시용 카운트 (1시간 캐시).
 *   클릭할 때마다 순서가 바뀌지 않고, 1시간마다 최신 집계를 반영.
 * - refreshSnapshot(): 1시간 인터벌 tick 시 호출 → 스냅샷 강제 갱신
 */

const CLICKS_KEY = 'ab_faq_clicks';
const SNAPSHOT_KEY = 'ab_faq_snapshot';
const SNAPSHOT_TTL = 60 * 60 * 1000; // 1시간

type ClickStore = Record<string, number>;

interface Snapshot {
  ts: number;
  counts: ClickStore;
}

function loadClicks(): ClickStore {
  try {
    return JSON.parse(localStorage.getItem(CLICKS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** FAQ 항목이 펼쳐질 때 호출 — 클릭 수 즉시 누적 (표시 순서는 미변경) */
export function trackClick(key: string): void {
  const clicks = loadClicks();
  clicks[key] = (clicks[key] ?? 0) + 1;
  localStorage.setItem(CLICKS_KEY, JSON.stringify(clicks));
}

/**
 * 표시용 클릭 카운트 반환 (1시간 캐시).
 * 이 값으로 FAQ 목록을 정렬하면 1시간마다만 순서가 바뀜.
 */
export function getDisplayCounts(): ClickStore {
  try {
    const snap: Snapshot = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null');
    if (snap && Date.now() - snap.ts < SNAPSHOT_TTL) return snap.counts;
  } catch {
    /* ignore */
  }
  return refreshSnapshot();
}

/** 스냅샷 강제 갱신 (1시간 인터벌 tick 시 호출) */
export function refreshSnapshot(): ClickStore {
  const counts = loadClicks();
  const snap: Snapshot = { ts: Date.now(), counts };
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  return counts;
}

/**
 * 상위 N개 key 반환 (스냅샷 기준).
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
