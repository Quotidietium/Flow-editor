/**
 * 主题示例：紫色暗色配色（CSS 变量覆盖，即时生效）。
 */
export default {
  id: 'demo.theme-purple',
  name: '紫色主题（示例）',
  version: '1.0.0',
  description: '覆盖 --primary/--ring 等变量',
  permissions: ['ui:theme'],
  theme: {
    variables: {
      // Full color functions, matching how app.css defines them — bare
      // OKLCH component triplets are invalid values here.
      '--primary': 'hsl(280 40% 55%)',
      '--ring': 'hsl(280 40% 55%)',
      '--border': 'hsl(280 25% 65%)'
    }
  }
};
