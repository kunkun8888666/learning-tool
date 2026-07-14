// 单词本查词弹窗逻辑（置顶小窗）
(function () {
  const $ = (s) => document.querySelector(s);
  const input = $('#wb-popup-input');
  const searchBtn = $('#wb-popup-search');
  const closeBtn = $('#wb-popup-close');
  const listEl = $('#wb-popup-list');
  const statusEl = $('#wb-popup-status');

  let mode = 'zh';
  let hasAI = false;
  let _entries = [];

  // 主题色 → 主色 / 深色（与 styles.css 中 [data-theme] 保持一致）
  const THEME_COLORS = {
    blue:   { p: '#3b82f6', d: '#2563eb' },
    green:  { p: '#10b981', d: '#059669' },
    orange: { p: '#f59e0b', d: '#d97706' },
    purple: { p: '#8b5cf6', d: '#7c3aed' },
    pink:   { p: '#ec4899', d: '#db2777' },
    indigo: { p: '#6366f1', d: '#4f46e5' },
    red:    { p: '#ef4444', d: '#dc2626' },
    teal:   { p: '#14b8a6', d: '#0d9488' },
  };
  function applyTheme(name) {
    const c = THEME_COLORS[name] || THEME_COLORS.blue;
    const root = document.documentElement;
    root.style.setProperty('--wb-primary', c.p);
    root.style.setProperty('--wb-primary-dark', c.d);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  async function init() {
    try {
      const res = await window.api.wordbookGetSettings();
      if (res && res.success) {
        mode = res.definitionMode || 'zh';
        hasAI = !!res.hasAI;
        if (res.themeColor) applyTheme(res.themeColor);
        // 与主窗口保持一致：主题色 + 亮/暗模式
        const root = document.documentElement;
        root.setAttribute('data-theme', res.themeColor || 'blue');
        root.setAttribute('data-dark', res.darkMode ? 'true' : 'false');
      }
    } catch (e) { console.warn('[wordbook-popup] 读取设置失败:', e.message); }
    await loadHistory();
    input.focus();
  }

  async function loadHistory() {
    try {
      const res = await window.api.wordbookList();
      _entries = (res && res.success && res.entries) ? res.entries : [];
      renderList();
    } catch (e) { console.error('[wordbook-popup] 加载历史失败:', e.message); }
  }

  function renderList() {
    if (!_entries || _entries.length === 0) {
      listEl.innerHTML = '<div class="wb-popup-empty">还没有查询记录</div>';
      return;
    }
    listEl.innerHTML = _entries.map(cardHtml).join('');
  }

  function cardHtml(e) {
    const phonetic = e.phonetic ? '/' + escapeHtml(e.phonetic) + '/' : '';
    const defs = [];
    if (mode === 'zh' || mode === 'both') {
      if (e.definitionZh) defs.push('<div class="wb-pop-def-zh">' + escapeHtml(e.definitionZh) + '</div>');
    }
    if (mode === 'en' || mode === 'both') {
      if (e.definitionEn) {
        e.definitionEn.split('\n').forEach(d => {
          if (d.trim()) defs.push('<div class="wb-pop-def-en">' + escapeHtml(d) + '</div>');
        });
      }
    }
    if (defs.length === 0) defs.push('<div class="wb-pop-def-empty">暂无释义（请检查网络连接）</div>');

    // 例句区域：始终渲染，让用户看到状态
    let ex = '';
    ex = '<div class="wb-pop-examples" id="wb-ex-' + escapeHtml(e.id) + '">';
    if (Array.isArray(e.examples) && e.examples.length > 0) {
      ex += e.examples.map(x =>
        '<div class="wb-pop-ex"><div class="wb-pop-ex-en">' + escapeHtml(x.en) + '</div><div class="wb-pop-ex-zh">' + escapeHtml(x.zh) + '</div></div>'
      ).join('');
    } else if (!hasAI) {
      ex += '<div class="wb-pop-ex-hint">暂无例句 — 请在「设置 → 单词本」中配置 AI 以自动生成例句</div>';
    } else {
      // 有 AI 但尚未生成 — 会在 doLookup 中触发生成并更新
      ex += '';
    }
    ex += '</div>';

    return '<div class="wb-pop-card" data-id="' + escapeHtml(e.id) + '">' +
      '<div class="wb-pop-word">' + escapeHtml(e.word) + ' <span class="wb-pop-phonetic">' + phonetic + '</span></div>' +
      '<div class="wb-pop-defs">' + defs.join('') + '</div>' +
      ex +
      '</div>';
  }

  async function doLookup() {
    const word = input.value.trim();
    if (!word) return;
    statusEl.textContent = '查询中…';
    statusEl.className = 'wb-popup-status';

    try {
      const res = await window.api.wordbookLookup(word);
      if (!res || !res.success) {
        statusEl.textContent = (res && res.error) ? res.error : '查询失败';
        statusEl.className = 'wb-popup-status error';
        return;
      }
      if (res.warning) {
        statusEl.textContent = res.warning;
        statusEl.className = 'wb-popup-status warn';
      } else {
        statusEl.textContent = '';
        statusEl.className = 'wb-popup-status';
      }

      const entry = res.entry;
      await loadHistory();
      listEl.scrollTop = 0;

      // 例句区域：始终尝试获取
      const card = listEl.querySelector('.wb-pop-card[data-id="' + cssEscape(entry.id) + '"]');
      let exBox = card ? document.getElementById('wb-ex-' + cssEscape(entry.id)) : null;

      if (hasAI) {
        // 有 AI：显示加载状态并生成例句
        if (!exBox && card) {
          exBox = document.createElement('div');
          exBox.className = 'wb-pop-examples';
          exBox.id = 'wb-ex-' + cssEscape(entry.id);
          card.appendChild(exBox);
        }
        if (exBox) exBox.innerHTML = '<div class="wb-pop-ex-loading">⏳ AI 生成例句中…</div>';

        // 如果已有例句则跳过
        if (!(entry.examples && entry.examples.length > 0)) {
          try {
            const exRes = await window.api.wordbookExamples({ word: entry.word, definitionZh: entry.definitionZh });
            if (exRes && exRes.success) {
              await loadHistory();
              // 重新渲染后例句会自动出现在卡片中
            } else if (exBox) {
              exBox.innerHTML = '<div class="wb-pop-ex-error">' + escapeHtml((exRes && exRes.error) || '例句生成失败') + '</div>';
            }
          } catch (e2) {
            console.error('[wordbook-popup] 例句生成失败:', e2.message);
            if (exBox) exBox.innerHTML = '<div class="wb-pop-ex-error">例句生成失败: ' + escapeHtml(e2.message.slice(0, 80)) + '</div>';
          }
        }
      } else {
        // 无 AI：cardHtml 已渲染提示，无需额外操作
      }

      input.select();
    } catch (e) {
      statusEl.textContent = '查询出错: ' + e.message;
      statusEl.className = 'wb-popup-status error';
    }
  }

  closeBtn.addEventListener('click', () => { try { window.close(); } catch (_) {} });
  searchBtn.addEventListener('click', doLookup);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });

  init();
})();
