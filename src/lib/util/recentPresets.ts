/**
 * 示例图表「最近使用」：记录最近点用的图类目 key（来自 @mermaid-js/examples
 * 的英文 Record key），localStorage 持久化。不可信存储加载期白名单校验。
 */

const RECENT_KEY = 'presetRecent';
const MAX_RECENT = 6;

export const loadRecentPresets = (): string[] => {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
};

/** 记录一次使用（去重置顶，最多 6 条；返回最新列表）。 */
export const pushRecentPreset = (key: string): string[] => {
  const next = [key, ...loadRecentPresets().filter((item) => item !== key)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
};

/** 清空（当前无 UI 入口，测试与排障用）。 */
export const clearRecentPresets = (): void => {
  localStorage.removeItem(RECENT_KEY);
};
