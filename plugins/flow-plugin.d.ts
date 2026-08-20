/**
 * Flow 编辑器插件类型声明。
 *
 * 插件作者在 .mjs 顶部加一行 @satisfies 类型导入注释即可获得完整 IDE
 * 类型提示（写法见 plugins/examples/ai-prompt-exporter.mjs 与
 * note/plugin-api.md 的「类型提示」一节）。
 */
export type {
  ExportFormat,
  FlowPlugin,
  FrontendHook,
  ImportHandler,
  InstalledPlugin,
  InputTransformHook,
  PluginContext,
  PluginManifest,
  PluginPermission,
  ThemeHook
} from '../src/lib/plugins/types';
