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
      '--primary': '0.8 0.4 0.9',
      '--ring': '0.8 0.4 0.9',
      '--border': '0.6 0.3 0.7'
    }
  }
};
