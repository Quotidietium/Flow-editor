/**
 * 「实时预览暂停」的响应式单例（会话级，不持久化）。
 * 大图连改时每键击都可能触发整次渲染（数百毫秒级），显式暂停让编辑
 * 不被渲染拖住——恢复走「立即渲染」按钮或任意导出前自动恢复。
 * 会话级而非 localStorage 持久化：被遗忘的暂停会让新会话出现
 * 「改了代码预览不动」的假死感（与导出倍数同为会话级先例）。
 * View.svelte 依此跳过渲染并显示陈旧指示；PanZoomToolbar 的开关与
 * Actions 的导出前恢复读写此值。
 */

export const previewPause = $state({ paused: false });
