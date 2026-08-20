/**
 * 输入清洗插件示例：文件/桥接输入进入编辑器前
 * - 统一 Windows 换行为 \n
 * - 去除行尾空白
 * - 将 PlantUML 风格的 `@startuml/@enduml` 包裹剥掉（格式转换演示）
 */
export default {
  id: 'demo.input-cleaner',
  name: '输入清洗（示例）',
  version: '1.0.0',
  description: '统一换行/去行尾空白/剥离 PlantUML 包裹',
  permissions: ['input:transform'],
  inputTransform: {
    name: 'clean',
    transform(code, source) {
      if (source === 'url') {
        return code; // URL 分享链接按原样恢复
      }
      let out = code
        .replaceAll('\r\n', '\n')
        .split('\n')
        .map((l) => l.replace(/\s+$/, ''))
        .join('\n');
      out = out.replace(/^@startuml\s*\n?/, '').replace(/\n?@enduml\s*$/, '');
      return out;
    }
  }
};
