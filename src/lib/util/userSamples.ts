/**
 * 我的示例：用户把当前图表整图存为具名示例，出现在「示例图表」卡片
 * 顶部——与「我的配置模板」（configPresets）/「我的代码片段」
 * （userSnippets，光标处插入）三足鼎立：我的示例 = 整图载入。
 * localStorage 持久化 + 加载期白名单校验 + 数量/体积上限。
 * 纯逻辑层（无 DOM），单测覆盖；UI 见 Preset.svelte。
 */

export interface UserSample {
  /** 整图 mermaid 代码（保留原始空白） */
  code: string;
  id: string;
  label: string;
}

const USER_SAMPLES_KEY = 'flowUserSamples';
const MAX_USER_SAMPLES = 20;
const MAX_LABEL_LENGTH = 30;
// localStorage 可被手改：单条示例体超限直接丢弃（不可信输入防线）。
// 10KB 足以放下常用整图模板（与我的配置模板同上限）。
const MAX_CODE_LENGTH = 10 * 1024;

const isValidUserSample = (value: unknown): value is UserSample => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { code, id, label } = value as Partial<UserSample>;
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

/** 读取用户示例（非法/超限条目静默丢弃）。 */
export const loadUserSamples = (): UserSample[] => {
  try {
    const raw = localStorage.getItem(USER_SAMPLES_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidUserSample).slice(0, MAX_USER_SAMPLES);
  } catch {
    return [];
  }
};

/** 保存当前图为用户示例（同名覆盖；返回最新列表）。空名/空白代码不落盘。 */
export const saveUserSample = (label: string, code: string): UserSample[] => {
  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
  const samples = loadUserSamples();
  if (!trimmed || code.trim().length === 0 || code.length > MAX_CODE_LENGTH) {
    return samples;
  }
  const entry: UserSample = {
    code,
    id: `sample-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: trimmed
  };
  const next = [entry, ...samples.filter((sample) => sample.label !== trimmed)].slice(
    0,
    MAX_USER_SAMPLES
  );
  localStorage.setItem(USER_SAMPLES_KEY, JSON.stringify(next));
  return next;
};

/** 删除一条用户示例（返回最新列表）。 */
export const deleteUserSample = (id: string): UserSample[] => {
  const next = loadUserSamples().filter((sample) => sample.id !== id);
  localStorage.setItem(USER_SAMPLES_KEY, JSON.stringify(next));
  return next;
};
