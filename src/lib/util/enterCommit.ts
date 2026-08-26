/**
 * Enter 提交（blur 触发 change 路径）的共享 action。
 * 可视化族编辑器（Board/Sequence/Sheet/Git）的文本输入都是 change-on-blur
 * 提交——Enter 此前无行为，打字后必须挪手离开输入框才生效。
 * isComposing + keyCode 229 双守卫：拼音输入法选词的回车不是提交
 * （MC 设计器循环 72 的既有判例）。
 */
export const enterCommit = (el: HTMLElement): void => {
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      el.blur();
    }
  });
};
