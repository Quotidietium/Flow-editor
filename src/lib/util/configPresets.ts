import { MERMAID_LOOKS, MERMAID_THEMES } from '$/constants';
import { formatJSON } from './util';

/**
 * 配置模板：把预制的 Mermaid 配置片段一键合并进当前配置 JSON。
 * 纯逻辑层（无 DOM），单测覆盖；UI 见 ConfigPresets.svelte。
 */

export interface ConfigPreset {
  /** 合并进当前配置的片段（深层合并：同名标量覆盖、同名对象递归、数组整体替换） */
  config: Record<string, unknown>;
  /** 菜单中的一行式说明 */
  hint: string;
  /** 稳定 id（e2e testid = config-preset-<id>） */
  id: string;
  label: string;
}

export interface ConfigPresetGroup {
  group: string;
  items: ConfigPreset[];
}

export const CONFIG_PRESET_GROUPS: ConfigPresetGroup[] = [
  {
    group: '风格',
    items: [
      {
        config: { look: 'handDrawn' },
        hint: '手绘质感的线条与填充',
        id: 'hand-drawn',
        label: '手绘风格'
      },
      {
        config: { look: 'classic' },
        hint: '恢复标准渲染线条',
        id: 'classic-look',
        label: '经典线条'
      }
    ]
  },
  {
    group: '主题',
    items: [
      {
        config: { theme: 'default' },
        hint: 'Mermaid 默认配色',
        id: 'theme-default',
        label: '默认主题'
      },
      {
        config: { theme: 'dark' },
        hint: '深色背景配色',
        id: 'theme-dark',
        label: '深色主题'
      },
      {
        config: { theme: 'forest' },
        hint: '绿色系配色',
        id: 'theme-forest',
        label: '森林主题'
      },
      {
        config: { theme: 'neutral' },
        hint: '灰白简约配色',
        id: 'theme-neutral',
        label: '中性主题'
      },
      {
        config: { theme: 'neo' },
        hint: '新一代浅色配色',
        id: 'theme-neo',
        label: 'Neo 主题'
      },
      {
        config: { theme: 'neo-dark' },
        hint: '新一代深色配色',
        id: 'theme-neo-dark',
        label: 'Neo 深色'
      }
    ]
  },
  {
    group: '版式',
    items: [
      {
        config: { flowchart: { nodeSpacing: 25, rankSpacing: 35 } },
        hint: '缩小流程图节点与层间距',
        id: 'compact',
        label: '紧凑布局'
      },
      {
        config: { flowchart: { nodeSpacing: 80, rankSpacing: 90 } },
        hint: '放大流程图节点与层间距',
        id: 'spacious',
        label: '宽松布局'
      },
      {
        config: { themeVariables: { fontSize: '20px' } },
        hint: '投影演示更清晰的大字号',
        id: 'presentation',
        label: '演示大字'
      },
      {
        config: { theme: 'default', themeVariables: { background: '#ffffff' } },
        hint: '纯白底，适合插入文档与打印',
        id: 'print-white',
        label: '打印白底'
      }
    ]
  }
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const deepMerge = (
  base: Record<string, unknown>,
  overlay: Record<string, unknown>
): Record<string, unknown> => {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return out;
};

/**
 * 把模板片段合并进当前配置 JSON，返回格式化后的新 JSON。
 * 当前内容不是合法 JSON（或顶层不是对象）时返回 undefined——
 * 调用方据此提示且不破坏用户手头的内容。
 */
export const applyConfigPreset = (
  currentJson: string,
  preset: ConfigPreset
): string | undefined => {
  let current: unknown;
  try {
    current = currentJson.trim() === '' ? {} : JSON.parse(currentJson);
  } catch {
    return undefined;
  }
  if (!isPlainObject(current)) {
    return undefined;
  }
  return formatJSON(deepMerge(current, preset.config));
};

/** 重新格式化当前配置 JSON；非法 JSON 返回 undefined。 */
export const formatConfigJson = (currentJson: string): string | undefined => {
  try {
    return formatJSON(JSON.parse(currentJson));
  } catch {
    return undefined;
  }
};

/**
 * 子集匹配：preset 的每个叶子值都与 current 同路径值相等（current 允许
 * 多出其它键）——用于模板菜单给「当前已生效」的模板打勾。
 */
export const isConfigSubset = (current: unknown, preset: unknown): boolean => {
  if (isPlainObject(current) && isPlainObject(preset)) {
    return Object.entries(preset).every(([key, value]) =>
      isConfigSubset((current as Record<string, unknown>)[key], value)
    );
  }
  return current === preset;
};

/** 出厂默认配置（与 defaultState.mermaid 同形）。 */
export const defaultConfigJson = (): string => formatJSON({ theme: 'default' });

/* ---------------- 自定义模板（用户把当前配置存为预设） ---------------- */

export interface UserPreset {
  config: Record<string, unknown>;
  id: string;
  label: string;
}

const USER_PRESETS_KEY = 'flowUserConfigPresets';
const MAX_USER_PRESETS = 20;
const MAX_LABEL_LENGTH = 30;
// localStorage 可被手改：单条配置体超限直接丢弃（与 sanitizePositions 同款
// 不可信输入防线）。
const MAX_CONFIG_JSON_LENGTH = 10 * 1024;

const isValidUserPreset = (value: unknown): value is UserPreset => {
  if (!isPlainObject(value)) {
    return false;
  }
  const { config, id, label } = value as Partial<UserPreset>;
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    typeof label === 'string' &&
    label.trim().length > 0 &&
    isPlainObject(config) &&
    formatJSON(config).length <= MAX_CONFIG_JSON_LENGTH
  );
};

/** 读取用户模板（非法/超限条目静默丢弃）。 */
export const loadUserPresets = (): UserPreset[] => {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isValidUserPreset).slice(0, MAX_USER_PRESETS);
  } catch {
    return [];
  }
};

/** 保存当前配置为用户模板（同名覆盖；返回最新列表）。空名不落盘。 */
export const saveUserPreset = (label: string, config: Record<string, unknown>): UserPreset[] => {
  const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
  const presets = loadUserPresets();
  if (!trimmed) {
    return presets;
  }
  const entry: UserPreset = {
    config,
    id: `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    label: trimmed
  };
  const next = [entry, ...presets.filter((preset) => preset.label !== trimmed)].slice(
    0,
    MAX_USER_PRESETS
  );
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(next));
  return next;
};

/** 删除一条用户模板（返回最新列表）。 */
export const deleteUserPreset = (id: string): UserPreset[] => {
  const next = loadUserPresets().filter((preset) => preset.id !== id);
  localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(next));
  return next;
};

// 注册表完整性在模块加载期即校验（另有单测钉住）：非法模板宁可炸在
// 开发期，也不让它进菜单。
const themeValues = new Set<string>(MERMAID_THEMES);
const lookValues = new Set<string>(MERMAID_LOOKS);
const seenIds = new Set<string>();
for (const { items } of CONFIG_PRESET_GROUPS) {
  for (const preset of items) {
    if (seenIds.has(preset.id)) {
      throw new Error(`Duplicate config preset id: ${preset.id}`);
    }
    seenIds.add(preset.id);
    const { theme, look } = preset.config;
    if (typeof theme === 'string' && !themeValues.has(theme)) {
      throw new Error(`Unknown mermaid theme in preset ${preset.id}: ${theme}`);
    }
    if (typeof look === 'string' && !lookValues.has(look)) {
      throw new Error(`Unknown mermaid look in preset ${preset.id}: ${look}`);
    }
  }
}
