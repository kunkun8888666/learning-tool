// 一次性脚本：从 _icons_built.json 生成 src/js/icons.js
// 运行：node build-icons.js --write
const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '_icons_built.json');
const outPath = path.join(__dirname, 'src', 'js', 'icons.js');

const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// SVG 工厂：Game-Icon-Pack 图标是 fill 型的（实心），用 currentColor 继承主题色
const SVG_FILL = (paths) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths}</svg>`;

// 对原 icons.js 中没被 Game-Icon-Pack 替换的图标保留旧 stroke 版本
const ICONS_STROKE = {
  // 备份保留（未在 Game-Icon-Pack 中找到更合适映射的）
  // 其它保留
};

// 把每个 path 包到 <path> 标签里
const entries = Object.entries(data).map(([name, d]) => {
  // d 可能是多 path（空格分隔）
  const paths = d.trim().split(/\s+(?=[mlhvcsqtaz])/i)
    .filter(Boolean)
    .map(p => `<path d="${p.replace(/\s+/g, ' ').trim()}"/>`)
    .join('');
  return `    "${name}": \`${SVG_FILL(paths)}\``;
}).join(',\n');

const newContent = `/**
 * 图标库 - 统一 SVG 图标系统（来源：Game-Icon-Pack）
 * 用法: <i class="icon" data-icon="book"></i>
 * 启动时调用 Icons.mount() 把所有 [data-icon] 元素替换为内联 SVG
 *
 * 转换说明：
 *   - 源 SVG 来自 https://github.com/Nieobie/Game-Icon-Pack
 *   - 全部统一为 24x24 viewBox，fill="currentColor" 跟随主题色
 *   - 由 build-icons.js 自动生成
 */
window.Icons = (function () {
  // 填充型图标（Game-Icon-Pack 原生为 fill 风格，currentColor 继承主题色）
  const SVG_FILL = (paths) => \`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">\${paths}</svg>\`;

  const ICONS = {
${entries}
  };

  /**
   * 替换 DOM 中所有 [data-icon] 元素为内联 SVG
   * @param {Element|Document} root
   */
  function mount(root) {
    if (!root) return;
    const elements = (root.querySelectorAll ? root.querySelectorAll('[data-icon]:not([data-icon-mounted])') : []);
    elements.forEach((el) => {
      const name = el.getAttribute('data-icon');
      const svg = ICONS[name];
      if (!svg) return;
      el.innerHTML = svg;
      // 标记已挂载
      el.setAttribute('data-icon-mounted', '1');
    });
  }

  return { ICONS, mount };
})();
`;

if (process.argv.includes('--write')) {
  fs.writeFileSync(outPath, newContent, 'utf8');
  console.log('Wrote', outPath, '(' + newContent.length + ' bytes)');
} else {
  console.log(newContent);
}
