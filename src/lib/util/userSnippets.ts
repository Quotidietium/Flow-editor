/**
 * 我的代码片段：用户把当前代码（或其中一段骨架）存成具名片段，
 * 之后从「插入」菜单一键插回光标处。与「我的配置模板」（configPresets.ts）
 * 同形制：localStorage 持久化 + 加载期白名单校验 + 数量/体积上限。
 * 纯逻辑层（无 DOM），单测覆盖；UI 见 InsertSnippets.svelte。
 */

export interface UserSnippet {
  /** 片段本体（保留原始空白与换行，不做 trim——缩进可能是语义的一部分） */
  code: string;
  id: string;
  label: string;
}

const USER_SNIPPETS_KEY = 'flowUserSnippets';
const MAX_USER_SNIPPETS = 20;
const MAX_LABEL_LENGTH = 30;
// localStorage 可被手改：单条片段体超限直接丢弃（与 sanitizePositions 同款
// 不可信输入防线）。5KB 足以放下整图骨架。
const MAX_CODE_LENGTH = 5 * 1024;

const isValidUserSnippet = (value: unknown): value is UserSnippet => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { code, id, label } = value as Partial<UserSnippet>;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof label === 'string' &&
    label.trim().length > 0 &&
    typeof code === 'string' &&
    code.trim().length > 0 &&
    code.length <= MAX_CODE_LENGTH
  );
};

/** 读取用户片段（非法/超限条目静默丢弃）。 */
export const loadUserSnippets = (): UserSnippet[] => {
  try {
    const raw = localStorage.getItem(USER_SNIPPETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidUserSnippet).slice(0, MAX_USER_SNIPPETS);
  } catch {
    return [];
  }
};

/** 保存代码为用户片段（同名覆盖；返回最新列表）。空名/空白代码不落盘。 */
export const saveUserSnippet = (label: string, code: string): UserSnippet[] => {
  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
  const snippets = loadUserSnippets();
  if (!trimmed || code.trim().length === 0 || code.length > MAX_CODE_LENGTH) {
    return snippets;
  }
  const entry: UserSnippet = {
    code,
    id: `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: trimmed
  };
  const next = [entry, ...snippets.filter((snippet) => snippet.label !== trimmed)].slice(
    0,
    MAX_USER_SNIPPETS
  );
  localStorage.setItem(USER_SNIPPETS_KEY, JSON.stringify(next));
  return next;
};

/** 删除一条用户片段（返回最新列表）。 */
export const deleteUserSnippet = (id: string): UserSnippet[] => {
  const next = loadUserSnippets().filter((snippet) => snippet.id !== id);
  localStorage.setItem(USER_SNIPPETS_KEY, JSON.stringify(next));
  return next;
};
