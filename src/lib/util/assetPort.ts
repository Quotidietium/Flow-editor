/**
 * 个人资产移植：我的配置模板（flowUserConfigPresets）/我的代码片段
 * （flowUserSnippets）/我的示例（flowUserSamples）一键导出为 JSON、
 * 在另一设备导入合并——三类资产此前锁死在单浏览器 localStorage。
 * 纯逻辑层（无 DOM），单测覆盖；UI 见 MainMenu 资产对话框。
 */

import {
  deleteUserPreset,
  loadUserPresets,
  saveUserPreset,
  type UserPreset
} from './configPresets';
import { deleteUserSample, loadUserSamples, saveUserSample, type UserSample } from './userSamples';
import {
  deleteUserSnippet,
  loadUserSnippets,
  saveUserSnippet,
  type UserSnippet
} from './userSnippets';

export interface AssetBundle {
  /** 导出格式版本（未来结构变更时迁移用） */
  version: 1;
  userConfigPresets: UserPreset[];
  userSamples: UserSample[];
  userSnippets: UserSnippet[];
}

const ASSET_VERSION = 1;

/** 收集三类个人资产为可下载 bundle。 */
export const exportAssets = (): AssetBundle => ({
  userConfigPresets: loadUserPresets(),
  userSamples: loadUserSamples(),
  userSnippets: loadUserSnippets(),
  version: ASSET_VERSION
});

const isValidEntry = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** 校验导入文件：结构合法才允许进入合并（不可信输入防线）。 */
export const parseAssetBundle = (raw: string): AssetBundle | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isValidEntry(parsed) || parsed.version !== ASSET_VERSION) {
    return undefined;
  }
  const lists = {
    userConfigPresets: parsed.userConfigPresets,
    userSamples: parsed.userSamples,
    userSnippets: parsed.userSnippets
  };
  for (const list of Object.values(lists)) {
    if (!Array.isArray(list) || list.some((entry) => !isValidEntry(entry))) {
      return undefined;
    }
  }
  return { ...lists, version: ASSET_VERSION } as AssetBundle;
};

export interface ImportResult {
  configPresets: number;
  samples: number;
  snippets: number;
}

/**
 * 按「同名覆盖」语义合并导入（与各自保存路径一致）；非法条目静默
 * 跳过（loadUserX 的白名单在 saveUserX 入口再拦一道）。返回各类计数。
 */
export const importAssets = (bundle: AssetBundle): ImportResult => {
  const result = { configPresets: 0, samples: 0, snippets: 0 };
  for (const preset of bundle.userConfigPresets) {
    if (typeof preset.label === 'string' && isValidEntry(preset.config)) {
      saveUserPreset(preset.label, preset.config as Record<string, unknown>);
      result.configPresets += 1;
    }
  }
  for (const sample of bundle.userSamples) {
    if (typeof sample.label === 'string' && typeof sample.code === 'string') {
      saveUserSample(sample.label, sample.code);
      result.samples += 1;
    }
  }
  for (const snippet of bundle.userSnippets) {
    if (typeof snippet.label === 'string' && typeof snippet.code === 'string') {
      saveUserSnippet(snippet.label, snippet.code);
      result.snippets += 1;
    }
  }
  return result;
};

/** 清空三类资产（对话框的「本机清除」用——导出后换设备场景）。 */
export const clearAssets = (): void => {
  for (const preset of loadUserPresets()) {
    deleteUserPreset(preset.id);
  }
  for (const sample of loadUserSamples()) {
    deleteUserSample(sample.id);
  }
  for (const snippet of loadUserSnippets()) {
    deleteUserSnippet(snippet.id);
  }
};
