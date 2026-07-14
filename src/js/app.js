// ============================================================
// app.js - 应用主入口
// 负责：初始化、路由、状态管理、事件绑定、窗口控制
// ============================================================

(async function () {
  'use strict';

  // ==================== Markdown 渲染 ====================
  function markdownToHtml(text) {
    if (!text) return '';
    
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/~~(.+?)~~/g, '<s>$1</s>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
      return `<pre><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    html = html.replace(/^\s*-\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

    html = html.replace(/^\s*>\s+(.+)$/gm, '<blockquote>$1</blockquote>');
    html = html.replace(/<\/blockquote>\s*<blockquote>/g, '\n');

    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/^\s*$/gm, '');
    if (!html.startsWith('<')) html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, '');

    return html;
  }

  // ==================== 应用状态 ====================
  const AppState = {
    user: null,
    settings: null,
    grades: [],
    currentPage: 'home',
    subjects: [],
    initialized: false,
  };

  let _editingGrade = null; // 编辑模式暂存成绩
  let _subjectFormData = {}; // 大考各科编辑数据: { subject: { subScores, images } }
  let _currentPanelSubject = null; // 当前侧面板打开的科目

  // ==================== DOM 引用 ====================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ==================== 窗口控制 ====================
  function initWindowControls() {
    // 防御：若预加载脚本未注入 window.api，跳过窗口控制绑定，避免启动崩溃
    if (!window.api) {
      console.error('[initWindowControls] window.api 未注入，跳过窗口控制绑定');
      return;
    }
    $('#tb-minimize').addEventListener('click', () => window.api.minimizeWindow());
    $('#tb-maximize').addEventListener('click', () => window.api.maximizeWindow());
    $('#tb-close').addEventListener('click', () => window.api.closeWindow());

    window.api.onMaximizedChanged((isMaximized) => {
      // 最大化按钮图标切换（用 SVG）
      const updateMaximizeIcon = (maximized) => {
        const btn = $('#tb-maximize');
        if (!btn) return;
        btn.innerHTML = `<i class="icon" data-icon="${maximized ? 'restore' : 'maximize'}"></i>`;
        if (window.IconsMount) window.IconsMount();
      };
      updateMaximizeIcon(isMaximized);
    });

    window.api.isMaximized().then((maximized) => {
      if (maximized) {
        const btn = $('#tb-maximize');
        btn.innerHTML = '<i class="icon" data-icon="restore"></i>';
        if (window.IconsMount) window.IconsMount();
      }
    });
  }

  // ==================== Element 风格确认弹窗（替代 confirm / 原生 dialog） ====================
  /**
   * @param {{title?: string, message: string, okText?: string, cancelText?: string, danger?: boolean}} opts
   * @returns {Promise<boolean>} true = 用户点击确定，false = 取消/关闭
   */
  function elConfirm(opts) {
    return new Promise((resolve) => {
      const overlay = $('#el-confirm-overlay');
      const titleEl = $('#el-confirm-title');
      const msgEl = $('#el-confirm-message');
      const okBtn = $('#el-confirm-ok');
      const cancelBtn = $('#el-confirm-cancel');
      const closeBtn = $('#el-confirm-close');

      titleEl.textContent = opts.title || '提示';
      msgEl.textContent = opts.message;
      okBtn.textContent = opts.okText || '确定';
      cancelBtn.textContent = opts.cancelText || '取消';

      // 危险操作用红色主按钮
      if (opts.danger) {
        okBtn.style.background = 'var(--danger)';
        okBtn.style.borderColor = 'var(--danger)';
      } else {
        okBtn.style.background = '';
        okBtn.style.borderColor = '';
      }

      overlay.classList.remove('hidden');

      const cleanup = (result) => {
        overlay.classList.add('hidden');
        resolve(result);
      };

      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      closeBtn.onclick = () => cleanup(false);

      // 点击遮罩层取消
      overlay.onmousedown = (e) => { if (e.target === overlay) cleanup(false); };
    });
  }

  // ==================== 初始化 ====================
  async function init() {
    // 预加载接口缺失时，抛出清晰可操作的错误，而不是晦涩的 undefined 崩溃
    if (!window.api) {
      throw new Error(
        '应用接口(window.api)未初始化，预加载脚本(preload.js)可能未正确加载。' +
        '请尝试：1) 重新安装依赖：npm install；2) 重新构建应用；' +
        '3) 确认 Electron 运行时完整（resources/electron.asar 存在，且未使用损坏的 electron 安装）。'
      );
    }

    initWindowControls();

    // 监听主进程的启动状态
    window.api.onSplashStatus((msg) => updateSplashStatus(msg));

    AppState.settings = await Storage.loadSettings();
    AppState.user = await Storage.loadUser();
    AppState.grades = await Storage.loadGrades();

    // 迁移旧数据：补全 groupId / subScores / imagePaths
    const migrated = await Storage.migrateGrades();
    if (migrated) {
      AppState.grades = await Storage.loadGrades();
    }

    applySettings(AppState.settings);
    I18n.setLang(AppState.settings.language || 'zh');

    const isFirstLaunch = !AppState.user || !AppState.user.name || !AppState.user.ageGroup;

    if (isFirstLaunch) {
      showWizard();
    } else {
      AppState.subjects = Storage.getSubjectsForAge(AppState.user.ageGroup);
      showMainApp();
    }

    AIChat.init();
    bindEvents();
    Icons.mount(document);
    // 暴露给其他模块在 i18n/主题切换后重挂图标
    window.IconsMount = () => Icons.mount(document);
    AppState.initialized = true;

    // 性能监控：在 AppData 标记文件存在时启用（方便调试）
    if (typeof PerfMonitor !== 'undefined') {
      PerfMonitor.start(false);
      // 每 120 秒输出一次摘要到控制台
      setInterval(() => {
        if (window.__perf_verbose) PerfMonitor.report();
      }, 120000);
    }

    // 隐藏启动加载动画
    hideSplash();

    // 延迟执行 AI 自动测试 — 让 UI 先完成渲染，避免启动时网络请求抢占资源
    setTimeout(() => AIChat.autoTestAll(), 1500);
  }

  function updateSplashStatus(text) {
    const el = $('#splash-status');
    if (el) el.textContent = text;
  }

  function hideSplash() {
    const splash = $('#splash-screen');
    if (splash) {
      splash.classList.add('splash-fade-out');
      setTimeout(() => splash.remove(), 500);
    }
  }

  // ==================== 首次启动向导 ====================
  function showWizard() {
    $('#wizard-overlay').classList.remove('hidden');
    $('#main-layout').classList.add('hidden');

    const ageCards = $$('#age-options .age-card');
    ageCards.forEach(card => {
      card.addEventListener('click', () => {
        ageCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input[type="radio"]').checked = true;
        const name = $('#wizard-name').value.trim();
        $('#wizard-confirm').disabled = !name;
      });
    });

    $('#wizard-name').addEventListener('input', () => {
      const name = $('#wizard-name').value.trim();
      const ageSelected = $$('#age-options .age-card.selected').length > 0;
      $('#wizard-confirm').disabled = !name || !ageSelected;
    });

    $('#wizard-confirm').addEventListener('click', async () => {
      const name = $('#wizard-name').value.trim();
      const grade = $('#wizard-grade').value.trim();
      const school = $('#wizard-school').value.trim();
      const selectedAge = $('#age-options .age-card.selected');
      if (!name || !selectedAge) return;

      const ageGroup = selectedAge.getAttribute('data-age');
      const user = { name, ageGroup, grade, school, createdAt: new Date().toISOString() };

      await Storage.saveUser(user);
      AppState.settings.ageGroup = ageGroup;
      await Storage.saveSettings(AppState.settings);

      AppState.user = user;
      AppState.subjects = Storage.getSubjectsForAge(ageGroup);
      AppState.grades = await Storage.loadGrades();

      hideWizard();
      showMainApp();
    });
  }

  function hideWizard() {
    $('#wizard-overlay').classList.add('hidden');
  }

  function showMainApp() {
    $('#main-layout').classList.remove('hidden');

    renderHomePage();
    GradeChart.buildMiniGrid(AppState.subjects);
    GradeChart.initTotal();
    GradeChart.initAllMinis(AppState.subjects);
    updateCharts();

    renderGradesPage();
    renderUserPage();
    renderSettingsPage();

    navigateTo('home');
  }

  // ==================== 设置应用 ====================
  function applySettings(settings) {
    document.documentElement.setAttribute('data-theme', settings.themeColor || 'blue');
    document.documentElement.setAttribute('data-dark', settings.darkMode ? 'true' : 'false');
  }

  // ==================== 页面渲染 ====================

  function renderHomePage() {
    const greeting = I18n.getGreeting();
    const user = AppState.user || {};
    const name = user.name || I18n.t('user');
    const grade = user.grade ? ` · ${user.grade}` : '';
    $('#greeting-time').textContent = greeting;
    $('#greeting-username').textContent = name + grade;
    $('#proverb-text').textContent = I18n.getRandomProverb();
  }

  function renderGradesPage() {
    Components.renderGradeFilterSubjects(AppState.subjects);
    Components.renderGradesList(AppState.grades, document.getElementById('grade-filter-subject')?.value || 'all');
    const today = new Date().toISOString().split('T')[0];
    $('#grade-date').value = today;
  }

  async function renderSettingsPage() {
    const settings = AppState.settings;
    $$('#language-options .setting-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === settings.language);
    });
    $$('#theme-colors .color-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-color') === settings.themeColor);
    });
    $('#dark-mode-toggle').checked = settings.darkMode;
    // TTS 设置
    const ttsRateSlider = $('#tts-rate-slider');
    const ttsRateValue = $('#tts-rate-value');
    if (ttsRateSlider) {
      ttsRateSlider.value = settings.ttsRate || 0.8;
      if (ttsRateValue) ttsRateValue.textContent = ttsRateSlider.value;
    }
    // 填充声音列表
    populateTtsVoices(settings.ttsVoice);
    // AI 部分
    renderAiConfigsList();
    renderAiProviders();
    // 加载默认提示词
    const promptInput = $('#ai-prompt-input');
    if (promptInput) {
      promptInput.value = settings.aiPrompt || Storage.DEFAULT_AI_PROMPT;
    }
    // （本地视觉模型 / OCR 模块已移除）

    // 下载设置
    renderDownloadSettings();

    // 单词本设置
    renderWordbookSettings();
  }

  async function populateTtsVoices(selectedVoice) {
    const select = $('#tts-voice-select');
    if (!select) return;
    // 从 TTS 服务 API 获取语音列表
    const res = await window.api.ttsGetVoices();
    const voices = res.success ? (res.voices || []) : [];
    if (voices.length === 0) {
      select.innerHTML = '<option value="">暂无可用语音</option>';
      return;
    }
    // 按语言分组
    const zhVoices = voices.filter(v => (v.locale || '').startsWith('zh'));
    const enVoices = voices.filter(v => (v.locale || '').startsWith('en'));
    const otherVoices = voices.filter(v => {
      const l = v.locale || '';
      return !l.startsWith('zh') && !l.startsWith('en');
    });

    select.innerHTML = '<option value="">默认（自动选择）</option>';

    function addGroup(label, list) {
      if (list.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = label;
      const seen = new Set();
      const unique = list.filter(v => {
        if (seen.has(v.name)) return false;
        seen.add(v.name);
        return true;
      }).sort((a, b) => a.name.localeCompare(b.name));
      unique.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        const gender = v.gender === 'Female' ? ' ♀' : v.gender === 'Male' ? ' ♂' : '';
        opt.textContent = `${v.name}${gender}`;
        group.appendChild(opt);
      });
      select.appendChild(group);
    }

    addGroup('中文', zhVoices);
    addGroup('English', enVoices);
    addGroup('其他', otherVoices);

    if (selectedVoice) select.value = selectedVoice;
  }

  async function renderDownloadSettings() {
    try {
      const dlSettings = await window.api.downloadGetSettings();
      const speedInput = $('#download-speed-limit');
      const speedValue = $('#download-speed-value');
      if (speedInput) {
        speedInput.value = dlSettings.speedLimit;
        speedValue.textContent = dlSettings.speedLimit === 0 ? I18n.t('download_speed_limit') === '下载限速' ? '无限制' : 'Unlimited' : `${dlSettings.speedLimit} MB/s`;
      }

      const threadsInput = $('#download-threads');
      const threadsValue = $('#download-threads-value');
      if (threadsInput) {
        threadsInput.value = dlSettings.threads;
        threadsValue.textContent = dlSettings.threads;
      }

      const sourceButtons = $$('#download-source-options .setting-btn');
      sourceButtons.forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-source') === dlSettings.source);
      });

      const customSourceDiv = $('#download-custom-source');
      const customSourceInput = $('#download-custom-url');
      if (customSourceDiv && customSourceInput) {
        customSourceDiv.classList.toggle('hidden', dlSettings.source !== 'custom');
        customSourceInput.value = dlSettings.customSource;
      }
    } catch (err) {
      console.error('Failed to render download settings:', err.message);
    }
  }

  // ==================== 单词本（Wordbook） ====================
  function updateWordbookSidebarVisibility() {
    const item = $('#sidebar-wordbook');
    if (!item) return;
    const enabled = !!(AppState.settings && AppState.settings.wordbook && AppState.settings.wordbook.enabled);
    item.classList.toggle('hidden', !enabled);
  }

  function renderWordbookSettings() {
    const wb = AppState.settings.wordbook || { enabled: false, shortcut: 'CommandOrControl+G', definitionMode: 'zh' };
    const enableToggle = $('#wordbook-enable-toggle');
    if (enableToggle) enableToggle.checked = !!wb.enabled;
    const modeBtns = $$('#wordbook-mode-options .setting-btn');
    modeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === wb.definitionMode));
    const label = $('#wordbook-shortcut-label');
    if (label) label.textContent = acceleratorToLabel(wb.shortcut || 'CommandOrControl+G');

    // 翻译 API Key
    const apiKeyInput = $('#wordbook-apikey');
    if (apiKeyInput) apiKeyInput.value = wb.translateApiKey || '';

    // 例句数量
    const countBtns = $$('#wordbook-example-options .setting-btn');
    const count = Number(wb.exampleCount) || 3;
    countBtns.forEach(b => b.classList.toggle('active', Number(b.getAttribute('data-count')) === count));
  }

  // 将 Electron 快捷键字符串转换为可读标签（Ctrl+G 等）
  function acceleratorToLabel(accel) {
    return String(accel)
      .replace(/CommandOrControl\+/g, 'Ctrl+')
      .replace(/Cmd\+/g, 'Cmd+')
      .replace(/Alt\+/g, 'Alt+')
      .replace(/Shift\+/g, 'Shift+');
  }

  async function saveWordbookSettings() {
    await Storage.saveSettings(AppState.settings);
    // 通知主进程重新注册全局快捷键
    try { await window.api.wordbookRegisterShortcut(); } catch (_) {}
    updateWordbookSidebarVisibility();
  }

  function initWordbook() {
    // 快捷键冲突时，主进程通知渲染进程跳转到设置
    if (window.api && window.api.onWordbookShortcutConflict) {
      window.api.onWordbookShortcutConflict(() => {
        navigateTo('settings');
        // 滚动到单词本设置卡片
        setTimeout(() => {
          const el = document.getElementById('wordbook-enable-toggle');
          if (el) { const c = el.closest('.settings-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        }, 300);
      });
      // Element 风格快捷键冲突弹窗（主进程发送）
      const origShortcutConflict = window.api.onWordbookShortcutConflict;
      // 通过 ipcRenderer.on 监听自定义事件
      try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('wordbook:shortcut-conflict-custom', async (_event, data) => {
          const confirmed = await elConfirm({
            title: data.title || '快捷键注册失败',
            message: data.message || '',
            okText: '去设置',
            cancelText: '忽略',
            danger: false,
          });
          if (confirmed) {
            navigateTo('settings');
            setTimeout(() => {
              const el = document.getElementById('wordbook-enable-toggle');
              if (el) { const c = el.closest('.settings-card'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
            }, 300);
          }
        });
      } catch (_) {}
    }

    updateWordbookSidebarVisibility();
    renderWordbookSettings();

    // 设置：启用开关
    const enableToggle = $('#wordbook-enable-toggle');
    if (enableToggle) {
      enableToggle.addEventListener('change', async (e) => {
        AppState.settings.wordbook = AppState.settings.wordbook || {};
        AppState.settings.wordbook.enabled = e.target.checked;
        await saveWordbookSettings();
      });
    }

    // 设置：释义模式
    $$('#wordbook-mode-options .setting-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-mode');
        AppState.settings.wordbook = AppState.settings.wordbook || {};
        AppState.settings.wordbook.definitionMode = mode;
        $$('#wordbook-mode-options .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await saveWordbookSettings();
      });
    });

    // 设置：快捷键重新绑定
    const shortcutBtn = $('#wordbook-shortcut-btn');
    if (shortcutBtn) {
      shortcutBtn.addEventListener('click', () => {
        const label = $('#wordbook-shortcut-label');
        if (label) label.textContent = '请按下快捷键…';
        shortcutBtn.disabled = true;
        const handler = (e) => {
          e.preventDefault();
          e.stopPropagation();
          document.removeEventListener('keydown', handler, true);
          shortcutBtn.disabled = false;
          if (['Escape', 'Tab'].includes(e.key)) {
            renderWordbookSettings();
            return;
          }
          const mods = [];
          if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
          if (e.shiftKey) mods.push('Shift');
          if (e.altKey) mods.push('Alt');
          let key = e.key;
          if (key === ' ') key = 'Space';
          else if (key.length === 1) key = key.toUpperCase();
          else key = key.charAt(0).toUpperCase() + key.slice(1);
          const accel = mods.join('+') + '+' + key;
          AppState.settings.wordbook = AppState.settings.wordbook || {};
          AppState.settings.wordbook.shortcut = accel;
          renderWordbookSettings();
          saveWordbookSettings();
        };
        document.addEventListener('keydown', handler, true);
      });
    }

    // 设置：翻译 API Key
    const apiKeyInput = $('#wordbook-apikey');
    if (apiKeyInput) {
      let saveTimer = null;
      apiKeyInput.addEventListener('input', () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          AppState.settings.wordbook = AppState.settings.wordbook || {};
          AppState.settings.wordbook.translateApiKey = apiKeyInput.value.trim();
          await saveWordbookSettings();
        }, 500); // 防抖 500ms
      });
    }

    // 设置：例句数量
    $$('#wordbook-example-options .setting-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const count = Number(btn.getAttribute('data-count'));
        if (!count) return;
        AppState.settings.wordbook = AppState.settings.wordbook || {};
        AppState.settings.wordbook.exampleCount = count;
        $$('#wordbook-example-options .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        await saveWordbookSettings();
      });
    });

    // 单词本页面：搜索
    const searchInput = $('#wb-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => renderWordbookList());
    }

    // 单词本页面：筛选（全部/收藏）
    const filter = $('#wb-filter');
    if (filter) {
      filter.addEventListener('click', (e) => {
        const btn = e.target.closest('.setting-btn');
        if (!btn) return;
        $$('#wb-filter .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderWordbookList();
      });
    }
  }

  // 内存预索引，加速搜索
  let _wbIndex = { entries: [], lower: [] };

  function buildWordbookIndex(entries) {
    _wbIndex.entries = entries;
    _wbIndex.lower = entries.map(e => String(e.word || '').toLowerCase());
  }

  async function renderWordbookPage() {
    try {
      const res = await window.api.wordbookList();
      const entries = (res && res.success && res.entries) ? res.entries : [];
      buildWordbookIndex(entries);
      renderWordbookList();
    } catch (err) {
      console.error('加载单词本失败:', err.message);
    }
  }

  function renderWordbookList() {
    const listEl = $('#wb-list');
    const emptyEl = $('#wb-empty');
    if (!listEl) return;
    const q = ($('#wb-search-input') ? $('#wb-search-input').value : '').trim().toLowerCase();
    const filterBtn = $('#wb-filter .setting-btn.active');
    const filterMode = filterBtn ? filterBtn.getAttribute('data-wb-filter') : 'all';

    const results = [];
    for (let i = 0; i < _wbIndex.entries.length; i++) {
      const e = _wbIndex.entries[i];
      // 预索引加速：直接对预计算的小写词做 includes
      if (q && !_wbIndex.lower[i].includes(q)) continue;
      if (filterMode === 'favorite' && !e.favorite) continue;
      results.push(e);
    }

    if (results.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    const mode = (AppState.settings.wordbook && AppState.settings.wordbook.definitionMode) || 'zh';
    listEl.innerHTML = results.map(e => wordbookCardHtml(e, mode)).join('');

    // 事件委托：收藏 / 删除
    listEl.onclick = async (ev) => {
      const card = ev.target.closest('.wb-card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      if (ev.target.closest('.wb-fav-btn')) {
        const entry = _wbIndex.entries.find(x => x.id === id);
        const newFav = !(entry && entry.favorite);
        try {
          await window.api.wordbookSetFavorite({ id, favorite: newFav });
          if (entry) entry.favorite = newFav;
          renderWordbookList();
        } catch (err) { console.error(err); }
      } else if (ev.target.closest('.wb-del-btn')) {
        if (!await elConfirm({ message: '确定删除该单词记录？', title: '确认删除', danger: true })) return;
        try {
          await window.api.wordbookDelete(id);
          _wbIndex.entries = _wbIndex.entries.filter(x => x.id !== id);
          _wbIndex.lower = _wbIndex.entries.map(x => String(x.word || '').toLowerCase());
          renderWordbookList();
        } catch (err) { alert('删除失败: ' + err.message); }
      }
    };
  }

  function wordbookCardHtml(e, mode) {
    const phonetic = e.phonetic ? `/${escapeHtml(e.phonetic)}/` : '';
    const defLines = [];
    if (mode === 'zh' || mode === 'both') {
      if (e.definitionZh) defLines.push(`<div class="wb-def-zh">${escapeHtml(e.definitionZh)}</div>`);
    }
    if (mode === 'en' || mode === 'both') {
      if (e.definitionEn) {
        e.definitionEn.split('\n').forEach(d => {
          if (d.trim()) defLines.push(`<div class="wb-def-en">${escapeHtml(d)}</div>`);
        });
      }
    }
    if (defLines.length === 0) defLines.push('<div class="wb-def-empty">暂无释义（请检查网络连接）</div>');

    let examplesHtml = '';
    if (Array.isArray(e.examples) && e.examples.length) {
      examplesHtml = '<div class="wb-examples">' + e.examples.map(x =>
        `<div class="wb-example"><div class="wb-ex-en">${escapeHtml(x.en)}</div><div class="wb-ex-zh">${escapeHtml(x.zh)}</div></div>`
      ).join('') + '</div>';
    }

    return `<div class="wb-card" data-id="${escapeHtml(e.id)}">
      <div class="wb-card-head">
        <div class="wb-word">${escapeHtml(e.word)} <span class="wb-phonetic">${phonetic}</span></div>
        <div class="wb-card-actions">
          <button class="wb-fav-btn ${e.favorite ? 'active' : ''}" title="收藏">${e.favorite ? '★' : '☆'}</button>
          <button class="wb-del-btn" title="删除">🗑</button>
        </div>
      </div>
      <div class="wb-defs">${defLines.join('')}</div>
      ${examplesHtml}
    </div>`;
  }

  async function renderOCRStatus() {
    try {
      const status = await window.api.ocrStatus();
      const statusDiv = $('#ocr-status');
      const statusText = $('#ocr-status-text');
      const startBtn = $('#ocr-start-btn');
      const stopBtn = $('#ocr-stop-btn');
      
      if (!statusDiv || !statusText) return;
      
      statusDiv.classList.remove('running', 'installing');
      
      if (status.running) {
        statusDiv.classList.add('running');
        statusText.textContent = 'OCR 服务运行中';
      } else if (!status.pythonAvailable) {
        statusText.textContent = '未安装 Python，请先安装 Python 3.8+';
      } else if (!status.installed) {
        statusText.textContent = 'EasyOCR 未安装，点击启动进行安装';
      } else {
        statusText.textContent = 'OCR 服务已就绪，点击启动';
      }
      
      if (startBtn) {
        startBtn.disabled = status.running;
        startBtn.textContent = status.running ? '运行中' : I18n.t('ocr_start');
      }
      if (stopBtn) {
        stopBtn.disabled = !status.running;
      }
    } catch (err) {
      console.error('Failed to render OCR status:', err.message);
    }
  }

  async function handleOCRStart() {
    const startBtn = $('#ocr-start-btn');
    const statusDiv = $('#ocr-status');
    const statusText = $('#ocr-status-text');
    
    if (startBtn) startBtn.disabled = true;
    if (statusDiv) statusDiv.classList.add('installing');
    if (statusText) statusText.textContent = '正在启动 OCR 服务…';
    
    try {
      const result = await window.api.ocrStart();
      if (result.success) {
        renderOCRStatus();
      } else {
        if (statusText) statusText.textContent = '启动失败: ' + result.error;
        if (statusDiv) statusDiv.classList.remove('installing');
        if (startBtn) startBtn.disabled = false;
      }
    } catch (err) {
      console.error('OCR start error:', err.message);
      if (statusText) statusText.textContent = '启动失败: ' + err.message;
      if (statusDiv) statusDiv.classList.remove('installing');
      if (startBtn) startBtn.disabled = false;
    }
  }

  async function handleOCRStop() {
    try {
      await window.api.ocrStop();
      renderOCRStatus();
    } catch (err) {
      console.error('OCR stop error:', err.message);
    }
  }

  async function saveDownloadSettings() {
    try {
      const speedLimit = parseInt($('#download-speed-limit').value) || 0;
      const threads = parseInt($('#download-threads').value) || 4;
      const activeSourceBtn = $$('#download-source-options .setting-btn.active')[0];
      const source = activeSourceBtn ? activeSourceBtn.getAttribute('data-source') : 'ghproxy';
      const customSource = $('#download-custom-url').value || 'https://gh-proxy.com';
      
      await window.api.downloadSetSettings({
        speedLimit,
        threads,
        source,
        customSource
      });
    } catch (err) {
      console.error('Failed to save download settings:', err.message);
    }
  }

  function renderUserPage() {
    const user = AppState.user || {};
    const name = user.name || '-';
    const ageLabel = Storage.getAgeGroupLabel(user.ageGroup, I18n.getLang()) || '-';
    const grade = user.grade || '-';
    const school = user.school || '-';

    // 更新显示
    $('#user-name').textContent = name;
    $('#user-name-display').textContent = name;
    $('#user-age-group').textContent = ageLabel;
    $('#user-grade').textContent = grade;
    $('#user-school').textContent = school;

    // 更新头像
    const avatarDisplay = $('#user-avatar-display');
    if (user.avatar) {
      avatarDisplay.innerHTML = `<img src="${user.avatar}" alt="${name}">`;
    } else {
      avatarDisplay.innerHTML = '<i class="icon" data-icon="user"></i>';
    }
    Icons.mount(avatarDisplay);
  }

  // ==================== 课程页面（OpenMAIC） ====================

  async function renderCoursePage() {
    // 重置全屏填充状态
    $('#page-course').classList.remove('course-running-active');
    $('#content').classList.remove('course-running-mode');
    // 隐藏所有状态卡片
    const cards = ['course-not-installed', 'course-installed-stopped', 'course-starting', 'course-running', 'course-error'];
    cards.forEach(id => $(`#${id}`).classList.add('hidden'));

    try {
      const status = await window.api.openmaicStatus();
      if (status.running) {
        // 服务正在运行 → 全屏填充 webview
        $('#page-course').classList.add('course-running-active');
        $('#content').classList.add('course-running-mode');
        $('#course-running').classList.remove('hidden');
        const port = status.port || 3000;
        const webview = $('#course-webview');
        const currentSrc = webview.getAttribute('src');
        const expectedSrc = `http://localhost:${port}`;
        if (currentSrc !== expectedSrc) {
          // 记录 webview 加载开始时间
          if (typeof PerfMonitor !== 'undefined') PerfMonitor.markWebviewLoadStart();
          webview.setAttribute('src', expectedSrc);
        }
      } else if (status.installed) {
        // 已安装但未运行
        $('#course-installed-stopped').classList.remove('hidden');
      } else {
        // 未安装
        $('#course-not-installed').classList.remove('hidden');
      }
    } catch (e) {
      $('#course-not-installed').classList.remove('hidden');
    }
  }

  async function installOpenmaic() {
    const progressEl = $('#course-install-progress');
    progressEl.classList.remove('hidden');
    const fillEl = $('#course-progress-fill');
    const labelEl = $('#course-progress-label');
    const btn = $('#course-install-btn');
    btn.disabled = true;

    // 监听进度
    const removeListener = window.api.onOpenmaicProgress((data) => {
      fillEl.style.width = `${data.pct || 0}%`;
      labelEl.textContent = data.label || '';
      if (data.step === 'done') {
        progressEl.classList.add('hidden');
        renderCoursePage();
        removeListener();
      }
      if (data.step === 'error') {
        progressEl.classList.add('hidden');
        $('#course-error-msg').textContent = data.label;
        cards.forEach(id => $(`#${id}`).classList.add('hidden'));
        $('#course-error').classList.remove('hidden');
        btn.disabled = false;
        removeListener();
      }
    });

    const cards = ['course-not-installed', 'course-installed-stopped', 'course-starting', 'course-running', 'course-error'];
    const res = await window.api.openmaicInstall();
    if (!res.success) {
      progressEl.classList.add('hidden');
      $('#course-error-msg').textContent = res.error;
      cards.forEach(id => $(`#${id}`).classList.add('hidden'));
      $('#course-error').classList.remove('hidden');
      btn.disabled = false;
    }
  }

  async function startOpenmaic() {
    const cards = ['course-not-installed', 'course-installed-stopped', 'course-starting', 'course-running', 'course-error'];
    cards.forEach(id => $(`#${id}`).classList.add('hidden'));
    $('#course-starting').classList.remove('hidden');

    // 监听后台进度事件，不再阻塞 IPC 等待 120 秒
    const removeListener = window.api.onOpenmaicProgress(async (data) => {
      if (data.step === 'started') {
        $('#page-course').classList.add('course-running-active');
        $('#content').classList.add('course-running-mode');
        cards.forEach(id => $(`#${id}`).classList.add('hidden'));
        $('#course-running').classList.remove('hidden');
        const webview = $('#course-webview');
        try {
          const status = await window.api.openmaicStatus();
          webview.setAttribute('src', `http://localhost:${status.port || 3000}`);
        } catch (_) {
          webview.setAttribute('src', 'http://localhost:3000');
        }
        removeListener();
      }
      if (data.step === 'error' || data.step === 'stopped') {
        $('#page-course').classList.remove('course-running-active');
        $('#content').classList.remove('course-running-mode');
        cards.forEach(id => $(`#${id}`).classList.add('hidden'));
        $('#course-error-msg').textContent = data.label;
        $('#course-error').classList.remove('hidden');
        removeListener();
      }
    });

    // 立即调用（IPC 返回后端立即响应）
    const res = await window.api.openmaicStart();
    if (res.success && res.alreadyRunning) {
      // 已经在运行，直接显示
      removeListener();
      $('#page-course').classList.add('course-running-active');
      $('#content').classList.add('course-running-mode');
      cards.forEach(id => $(`#${id}`).classList.add('hidden'));
      $('#course-running').classList.remove('hidden');
      const webview = $('#course-webview');
      const port = res.port || 3000;
      webview.setAttribute('src', `http://localhost:${port}`);
    } else if (!res.success) {
      // 立即失败（未安装、正在启动等）
      removeListener();
      $('#page-course').classList.remove('course-running-active');
      $('#content').classList.remove('course-running-mode');
      cards.forEach(id => $(`#${id}`).classList.add('hidden'));
      $('#course-error-msg').textContent = res.error;
      $('#course-error').classList.remove('hidden');
    }
    // res.starting === true → 等待 progress 事件（上面已注册 listener）
  }

  async function stopOpenmaic() {
    await window.api.openmaicStop();
    renderCoursePage();
  }

  // ==================== 图表更新 ====================

  /** 缓存上次计算结果，避免连续更新时重复重算 */
  let _updateChartsCache = null;
  let _updateChartsPending = false;
  function updateCharts() {
    if (_updateChartsPending) return;
    _updateChartsPending = true;
    requestAnimationFrame(() => {
      _updateChartsPending = false;
      const grades = AppState.grades;
      const totalsByDate = Storage.calculateTotalScores(grades);
      const bySubject = Storage.groupGradesBySubject(grades);
      GradeChart.updateAll(totalsByDate, bySubject, AppState.subjects);
    });
  }

  // ==================== 页面导航 ====================

  function navigateTo(page) {
    AppState.currentPage = page;

    // 切换到非课程页面时，清理课程全屏状态
    if (page !== 'course') {
      $('#page-course').classList.remove('course-running-active');
      $('#content').classList.remove('course-running-mode');
    }

    $$('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-page') === page);
    });

    $$('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
      targetPage.classList.add('active');
      if (page === 'home') {
        renderHomePage();
        updateCharts();
      } else if (page === 'grades') {
        renderGradesPage();
      } else if (page === 'user') {
        renderUserPage();
      } else if (page === 'course') {
        renderCoursePage();
      } else if (page === 'settings') {
        renderSettingsPage();
      } else if (page === 'wordbook') {
        renderWordbookPage();
      } else if (page === 'add-grade') {
        // 保持表单状态不变
      } else if (page === 'grade-detail') {
        // Detail page loads via event, not navigation alone
      } else if (page === 'subject-detail') {
        // Subject detail loads via event
      }
    }
  }

  // ==================== 表单验证 ====================

  function validateGradeForm() {
    const score = parseInt($('#grade-score').value);
    const total = parseInt($('#grade-total').value);
    const errorEl = $('#score-error');

    if (score > total) {
      errorEl.classList.remove('hidden');
      $('#grade-score').classList.add('input-error');
      return false;
    }
    errorEl.classList.add('hidden');
    $('#grade-score').classList.remove('input-error');
    return true;
  }

  function validateMajorExam() {
    let valid = true;
    $$('#major-subjects-list .major-subject-row').forEach(row => {
      const score = parseInt(row.querySelector('.major-score').value);
      const total = parseInt(row.querySelector('.major-total').value);
      if (!isNaN(score) && !isNaN(total) && score > total) {
        row.classList.add('has-error');
        valid = false;
      } else {
        row.classList.remove('has-error');
      }
    });
    return valid;
  }

  // ==================== 大考/小考切换 ====================

  function renderMajorExamSubjects(subjects) {
    const container = $('#major-subjects-list');

    // Initialize subject form data
    _subjectFormData = {};
    subjects.forEach(subj => {
      _subjectFormData[subj] = { subScores: [], images: [] };
    });

    container.innerHTML = subjects.map(subj => `
      <div class="major-subject-wrapper" data-subject="${subj}">
        <div class="major-subject-row" data-subject="${subj}">
          <input type="checkbox" class="major-checkbox" checked>
          <span class="major-subject-name">${subj}</span>
          <div class="major-subject-inputs">
            <input type="number" class="form-input major-score" placeholder="分数" min="0">
            <input type="number" class="form-input major-total" value="100" placeholder="满分" min="1">
          </div>
          <div class="major-rank-inputs">
            <input type="number" class="form-input major-class-rank" placeholder="班排名" min="1" title="班级排名">
            <input type="number" class="form-input major-grade-rank" placeholder="级排名" min="1" title="年级排名">
          </div>
          <button type="button" class="major-detail-toggle" title="编辑小题分和图片">▼</button>
          <small class="major-score-error">超过满分</small>
        </div>
      </div>
    `).join('');

    // Bind score validation
    container.querySelectorAll('.major-subject-row').forEach(row => {
      const scoreInput = row.querySelector('.major-score');
      const totalInput = row.querySelector('.major-total');
      const validate = () => {
        const score = parseInt(scoreInput.value);
        const total = parseInt(totalInput.value);
        row.classList.toggle('has-error', !isNaN(score) && !isNaN(total) && score > total);
      };
      scoreInput.addEventListener('input', validate);
      totalInput.addEventListener('input', validate);
    });

    // Bind detail toggle buttons → open side panel
    bindMajorDetailToggles(container);
  }

  function createMajorSubScoreRow(data) {
    const types = [
      'choice', 'fill', 'solve', 'listen', 'cloze', 'reading', 'essay',
      'classical', 'mini_read', 'big_read', 'masterwork', 'expr_choice', '7of5', 'comprehensive'
    ];
    const typeOptions = types.map(t => {
      const label = I18n.t(`question_type_${t}`);
      const selected = data && data.type === t ? 'selected' : '';
      return `<option value="${t}" ${selected}>${label}</option>`;
    }).join('');

    const div = document.createElement('div');
    div.className = 'sub-score-row';
    div.innerHTML = `
      <select class="form-select sub-score-type">${typeOptions}</select>
      <input type="number" class="form-input sub-score-input" placeholder="得分" min="0" value="${data && data.score !== undefined ? data.score : ''}">
      <span class="sub-score-sep">/</span>
      <input type="number" class="form-input sub-score-input sub-score-total" placeholder="满分" min="0" value="${data && data.total !== undefined ? data.total : ''}">
      <button type="button" class="sub-score-remove-btn" title="${I18n.t('remove')}">×</button>
    `;
    return div;
  }

  function getMajorSubScoresData() {
    const result = {};
    Object.keys(_subjectFormData).forEach(subject => {
      const wrapper = document.querySelector(`.major-subject-wrapper[data-subject="${CSS.escape(subject)}"]`);
      if (!wrapper) return;
      const checked = wrapper.querySelector('.major-checkbox').checked;
      if (!checked) return;

      const subScores = _subjectFormData[subject].subScores.filter(ss =>
        ss.type && ss.score !== '' && ss.score !== undefined && !isNaN(Number(ss.score))
      );
      if (subScores.length > 0) {
        result[subject] = subScores.map(ss => ({
          type: ss.type,
          score: Number(ss.score),
          total: Number(ss.total) || 0,
        }));
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  }

  async function getMajorImageData() {
    const result = {};
    for (const subject of Object.keys(_subjectFormData)) {
      const wrapper = document.querySelector(`.major-subject-wrapper[data-subject="${CSS.escape(subject)}"]`);
      if (!wrapper) continue;
      const checked = wrapper.querySelector('.major-checkbox').checked;
      if (!checked) continue;

      const images = _subjectFormData[subject].images;
      const paths = [];
      for (const img of images) {
        if (img.saved && img.path) {
          paths.push(img.path);
        } else if (img.base64) {
          const r = await window.api.saveImage(img.base64, img.name);
          if (r.success) {
            img.saved = true;
            img.path = r.path;
            paths.push(r.path);
          }
        }
      }
      if (paths.length > 0) {
        result[subject] = paths;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  }

  function setExamType(type) {
    // Close subject edit panel if open
    if (_currentPanelSubject) {
      closeSubjectEditPanel();
    }
    $('#grade-exam-type').value = type;
    $$('.exam-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-exam-type') === type);
    });
    if (type === 'major') {
      $('#minor-exam-fields').classList.add('hidden');
      $('#major-exam-fields').classList.remove('hidden');
      renderMajorExamSubjects(AppState.subjects);
      // Hide global sub-scores and image sections for major exams
      document.getElementById('sub-scores-section').classList.add('hidden');
      document.getElementById('toggle-sub-scores').classList.add('hidden');
      document.querySelector('.image-upload-section').classList.add('hidden');
    } else {
      $('#minor-exam-fields').classList.remove('hidden');
      $('#major-exam-fields').classList.add('hidden');
      // Show global sub-scores and image sections for minor exams
      document.getElementById('toggle-sub-scores').classList.remove('hidden');
      document.querySelector('.image-upload-section').classList.remove('hidden');
    }
    // Show/hide total rank fields
    const totalRankFields = document.getElementById('total-rank-fields');
    if (type === 'major') {
      totalRankFields.classList.remove('hidden');
    } else {
      totalRankFields.classList.add('hidden');
    }
  }

  // ==================== 小题分 ====================

  function initSubScoreToggle() {
    const toggleBtn = document.getElementById('toggle-sub-scores');
    const section = document.getElementById('sub-scores-section');
    const list = document.getElementById('sub-scores-list');
    const addRowBtn = document.getElementById('add-sub-score-row');

    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
      section.classList.toggle('hidden');
      if (!section.classList.contains('hidden') && list.children.length === 0) {
        list.appendChild(createSubScoreRow(null));
      }
    });

    addRowBtn.addEventListener('click', () => {
      list.appendChild(createSubScoreRow(null));
    });

    // Delegate remove events
    list.addEventListener('click', (e) => {
      if (e.target.classList.contains('sub-score-remove-btn')) {
        e.target.closest('.sub-score-row').remove();
      }
    });
  }

  function createSubScoreRow(data) {
    const div = document.createElement('div');
    div.innerHTML = Components.renderSubScoreRow(data);
    return div.firstElementChild;
  }

  // ==================== 科目编辑侧面板 ====================

  function bindMajorDetailToggles(container) {
    container.querySelectorAll('.major-detail-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const wrapper = btn.closest('.major-subject-wrapper');
        const subject = wrapper.getAttribute('data-subject');
        openSubjectEditPanel(subject);
      });
    });
  }

  function openSubjectEditPanel(subject) {
    // Sync panel if switching subjects (data already in _subjectFormData via event handlers)
    _currentPanelSubject = subject;

    // Set panel title
    document.getElementById('panel-subject-name').textContent = subject;

    // Render content
    renderPanelContent();

    // Show panel
    document.getElementById('subject-edit-panel').classList.remove('hidden');
    document.getElementById('add-grade-layout').classList.add('has-panel');
  }

  function closeSubjectEditPanel() {
    _currentPanelSubject = null;
    document.getElementById('subject-edit-panel').classList.add('hidden');
    document.getElementById('add-grade-layout').classList.remove('has-panel');
  }

  function renderPanelContent() {
    if (!_currentPanelSubject) return;
    renderPanelSubScores();
    renderPanelImages();
  }

  function renderPanelSubScores() {
    const subject = _currentPanelSubject;
    const data = _subjectFormData[subject];
    if (!data) return;
    const container = document.getElementById('panel-sub-scores-list');
    container.innerHTML = '';

    data.subScores.forEach((ss, index) => {
      const row = createMajorSubScoreRow(ss);

      const typeSelect = row.querySelector('.sub-score-type');
      const scoreInput = row.querySelector('.sub-score-input');
      const totalInput = row.querySelector('.sub-score-total');
      const removeBtn = row.querySelector('.sub-score-remove-btn');

      const syncData = () => {
        data.subScores[index] = {
          type: typeSelect.value,
          score: scoreInput.value !== '' ? parseFloat(scoreInput.value) : '',
          total: totalInput.value !== '' ? parseFloat(totalInput.value) : '',
        };
      };

      typeSelect.addEventListener('change', syncData);
      scoreInput.addEventListener('input', syncData);
      totalInput.addEventListener('input', syncData);

      removeBtn.addEventListener('click', () => {
        data.subScores.splice(index, 1);
        renderPanelSubScores();
      });

      container.appendChild(row);
    });
  }

  function renderPanelImages() {
    const subject = _currentPanelSubject;
    const data = _subjectFormData[subject];
    if (!data) return;
    const container = document.getElementById('panel-image-preview-list');
    container.innerHTML = '';

    data.images.forEach((img, i) => {
      const div = document.createElement('div');
      div.className = 'image-preview-item';
      div.innerHTML = `
        <img src="${img.previewUrl}" class="image-preview-thumb">
        <button type="button" class="image-preview-ocr" title="OCR识别">
          <i class="icon" data-icon="scan"></i>
        </button>
        <button type="button" class="image-preview-remove" title="${I18n.t('remove_image')}">×</button>
        ${img.ocrResult ? `<div class="image-preview-ocr-result">${escapeHtml(img.ocrResult)}</div>` : ''}
      `;
      div.querySelector('.image-preview-remove').addEventListener('click', () => {
        if (img.previewUrl && img.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(img.previewUrl);
        }
        data.images.splice(i, 1);
        renderPanelImages();
      });
      div.querySelector('.image-preview-ocr').addEventListener('click', async () => {
        const btn = div.querySelector('.image-preview-ocr');
        btn.disabled = true;
        try {
          const result = await recognizeImageText(img.base64 || img.previewUrl);
          if (result.success) {
            data.images[i].ocrResult = result.text || '';
          } else {
            const errMsg = result.error || '未知错误';
            console.error('recognize failed:', errMsg);
            alert('识别失败: ' + errMsg);
          }
        } catch (err) {
          console.error('recognize error:', err.message);
          alert('识别出错: ' + err.message);
        }
        renderPanelImages();
      });
      container.appendChild(div);
    });

    Icons.mount(container);
  }

  function getSubScoresData() {
    const section = document.getElementById('sub-scores-section');
    if (section.classList.contains('hidden')) return null;
    const rows = document.querySelectorAll('#sub-scores-list .sub-score-row');
    const data = [];
    rows.forEach(row => {
      const type = row.querySelector('.sub-score-type').value;
      const score = parseFloat(row.querySelector('.sub-score-input').value);
      const total = parseFloat(row.querySelector('.sub-score-total').value);
      if (type && !isNaN(score) && !isNaN(total)) {
        data.push({ type, score, total });
      }
    });
    return data.length > 0 ? data : null;
  }

  function populateSubScores(subScores) {
    const section = document.getElementById('sub-scores-section');
    const list = document.getElementById('sub-scores-list');
    list.innerHTML = '';
    if (subScores && subScores.length > 0) {
      section.classList.remove('hidden');
      subScores.forEach(s => {
        list.appendChild(createSubScoreRow(s));
      });
    } else {
      section.classList.add('hidden');
    }
  }

  // ==================== 图片上传 ====================

  let _pendingImages = [];

  function initImageUpload() {
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-file-input');
    if (!uploadBtn) return;

    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const files = e.target.files;
      for (const file of files) {
        const base64 = await fileToBase64(file);
        const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        _pendingImages.push({
          base64,
          name: filename,
          previewUrl: URL.createObjectURL(file),
          saved: false,
          path: null,
        });
      }
      renderImagePreviews();
      fileInput.value = '';
    });
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // 将任意输入（data URL / 裸 base64 / 本地资源或 blob URL）统一转成 data URL
  async function toImageDataUrl(input) {
    if (!input) return null;
    if (typeof input !== 'string') return null;
    if (input.startsWith('data:')) return input;
    if (input.includes('://')) {
      // local-asset:// / blob: / http(s):// 等 URL，取回并转 data URL
      try {
        const resp = await fetch(input);
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onloadend = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      } catch (e) {
        console.warn('[recognize] 取回图片失败:', e && e.message);
        return null;
      }
    }
    // 裸 base64
    return 'data:image/png;base64,' + input;
  }

  /**
   * 图片文字识别：使用本地 EasyOCR（服务端会自动剥离 data: 前缀）。
   * @param {string} input data URL / 裸 base64 / 图片 URL
   * @returns {Promise<{success:boolean, text?:string, error?:string}>}
   */
  async function recognizeImageText(input) {
    const dataUrl = await toImageDataUrl(input);
    if (!dataUrl) return { success: false, error: '无图片数据' };
    try {
      const ocrRes = await window.api.ocrRecognize(dataUrl);
      if (ocrRes && ocrRes.success) {
        return { success: true, text: ocrRes.text || '' };
      }
      return { success: false, error: (ocrRes && ocrRes.error) || 'OCR 识别失败' };
    } catch (e) {
      return { success: false, error: (e && e.message) || 'OCR 识别失败' };
    }
  }

  function renderImagePreviews() {
    const container = document.getElementById('image-preview-list');
    container.innerHTML = _pendingImages.map((img, i) => `
      <div class="image-preview-item" data-index="${i}">
        <img src="${img.previewUrl}" class="image-preview-thumb">
        <button type="button" class="image-preview-ocr" title="OCR识别">
          <i class="icon" data-icon="scan"></i>
        </button>
        <button type="button" class="image-preview-remove" title="${I18n.t('remove_image')}">×</button>
        ${img.ocrResult ? `<div class="image-preview-ocr-result">${escapeHtml(img.ocrResult)}</div>` : ''}
      </div>
    `).join('');

    container.querySelectorAll('.image-preview-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.parentElement.getAttribute('data-index'));
        const img = _pendingImages[index];
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
        _pendingImages.splice(index, 1);
        renderImagePreviews();
      });
    });

    container.querySelectorAll('.image-preview-ocr').forEach(btn => {
      btn.addEventListener('click', async () => {
        const index = parseInt(btn.parentElement.getAttribute('data-index'));
        const img = _pendingImages[index];
        await handleImageOCR(index, img);
      });
    });

    Icons.mount(container);
  }

  async function handleImageOCR(index, img) {
    const btn = document.querySelector(`.image-preview-item[data-index="${index}"] .image-preview-ocr`);
    if (btn) btn.disabled = true;
    
    try {
      const result = await recognizeImageText(img.base64 || img.previewUrl);
      if (result.success) {
        _pendingImages[index].ocrResult = result.text || '';
      } else {
        alert('识别失败: ' + (result.error || '未知错误'));
      }
    } catch (err) {
      console.error('recognize error:', err.message);
      alert('识别失败: ' + err.message);
    }
    
    renderImagePreviews();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function savePendingImages() {
    const savedPaths = [];
    for (const img of _pendingImages) {
      if (img.saved && img.path) {
        savedPaths.push(img.path);
      } else {
        const result = await window.api.saveImage(img.base64, img.name);
        if (result.success) {
          img.saved = true;
          img.path = result.path;
          savedPaths.push(result.path);
        }
      }
    }
    return savedPaths.length > 0 ? savedPaths : null;
  }

  function clearPendingImages() {
    _pendingImages.forEach(img => {
      if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    });
    _pendingImages = [];
    renderImagePreviews();
  }

  function populateImages(imagePaths) {
    if (imagePaths && imagePaths.length > 0) {
      _pendingImages = imagePaths.map(path => ({
        base64: null,
        name: path.split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_'),
        previewUrl: path,
        saved: true,
        path: path,
      }));
      renderImagePreviews();
    }
  }

  // ==================== AI 对话框 ====================

  const AIChat = {
    panels: {}, // context -> { element, messages, sending, gradeData, configId, cooldown: { configId: untilTs } }
    testStatus: {}, // configId -> { status, label, latencyMs, code, error, at, cooldownUntil, testing }
    /** 消息数量上限，超出时裁剪旧消息 */
    MAX_MESSAGES: 50,

    /** 挂载当前 panel 内的图标（用于 innerHTML 注入后） */
    _mountIcons(panel) {
      if (window.IconsMount && panel) window.IconsMount(panel);
    },

    /** 获取某配置的测试状态（自动清理过期冷却） */
    _getTestStatus(configId) {
      const st = this.testStatus[configId];
      if (!st) return null;
      if (st.cooldownUntil && st.cooldownUntil < Date.now()) {
        st.cooldownUntil = 0;
      }
      return st;
    },

    /** 设置某配置的测试状态 */
    _setTestStatus(configId, status) {
      this.testStatus[configId] = status;
    },

    /** 启动时自动测试所有配置（不阻塞 UI） */
    async autoTestAll() {
      const configs = AppState.settings.aiConfigs || [];
      if (configs.length === 0) return;
      // 并行测试，限制并发避免阻塞
      const tasks = configs.map(async (c) => {
        if (!c.apiKey) {
          this._setTestStatus(c.id, { status: 'no_key', label: I18n.t('ai_test_no_key'), at: Date.now() });
          return;
        }
        this._setTestStatus(c.id, { testing: true });
        try {
          const res = await window.api.aiTest({ type: c.type, apiKey: c.apiKey, baseUrl: c.baseUrl, model: c.model });
          if (res && res.success) {
            this._setTestStatus(c.id, { status: 'ok', latencyMs: res.latencyMs, label: I18n.t('ai_test_ok'), at: Date.now() });
          } else {
            const status = (res && res.status) || 'unknown';
            const label = I18n.t('ai_test_' + status) || I18n.t('ai_test_unknown');
            const entry = { status, label, code: res && res.code, error: res && res.error, at: Date.now() };
            const cd = getCooldownMsByError(res);
            if (cd) entry.cooldownUntil = Date.now() + cd;
            this._setTestStatus(c.id, entry);
          }
        } catch (err) {
          this._setTestStatus(c.id, { status: 'unknown', label: err.message || I18n.t('ai_test_unknown'), at: Date.now() });
        }
      });
      await Promise.allSettled(tasks);
      // 测试完成后，若在设置页则刷新显示
      if ($('#ai-configs-list')) renderAiConfigsList();
    },

    /** 初始化：找到所有 .ai-chat-slot 并实例化面板 */
    init() {
      document.querySelectorAll('.ai-chat-slot').forEach(slot => {
        const context = slot.getAttribute('data-ai-context');
        this._mountPanel(slot, context);
      });
    },

    _mountPanel(slot, context) {
      const tpl = document.getElementById('ai-chat-panel-template');
      if (!tpl) return;
      const panel = tpl.content.firstElementChild.cloneNode(true);
      slot.appendChild(panel);

      const state = {
        element: panel,
        messages: [],
        renderedCount: 0,
        sending: false,
        gradeData: null,
        configId: null,
        context,
      };
      this.panels[context] = state;

      // 一次性缓存 DOM 引用
      const input = panel.querySelector('.ai-chat-input');
      const sendBtn = panel.querySelector('.ai-chat-send-btn');
      const clearBtn = panel.querySelector('.ai-chat-clear-btn');
      const configSelect = panel.querySelector('.ai-chat-config-select');
      state.input = input;
      state.sendBtn = sendBtn;
      state.clearBtn = clearBtn;
      state.configSelect = configSelect;
      state.messagesEl = panel.querySelector('.ai-chat-messages');
      state.emptyEl = panel.querySelector('.ai-chat-empty');

      // 填充 i18n（缓存到本地变量，避免循环查表）
      // 必须 bind 保留 I18n 上下文；否则解构出的 t() 在严格模式下 this 为 undefined
      const t = I18n.t.bind(I18n);
      panel.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.getAttribute('data-i18n'));
      });
      input.placeholder = t('ai_input_placeholder');

      // 事件（按元素直接绑一次，不再 querySelectorAll 重复找）
      sendBtn.addEventListener('click', () => this._sendUserMessage(state));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this._sendUserMessage(state);
        }
      });
      clearBtn.addEventListener('click', () => this._clearChat(state));
      configSelect.addEventListener('change', (e) => this._switchConfig(state, e.target.value));

      this._refreshConfigSelect(state);
      this._renderEmpty(state);
    },

    _refreshConfigSelect(state) {
      const select = state.configSelect || state.element.querySelector('.ai-chat-config-select');
      const configs = AppState.settings.aiConfigs || [];
      const activeId = AppState.settings.activeAiConfigId;
      // 保存当前选中
      const current = state.configId || activeId;
      select.innerHTML = '';
      if (configs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = I18n.t('ai_no_active');
        select.appendChild(opt);
        select.disabled = true;
      } else {
        select.disabled = false;
        // 用纯文字前缀区分类型（option 中 emoji 不可靠）
        configs.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          const tag = c.type === 'gemini' ? 'G' : 'O';
          opt.textContent = `[${tag}] ${c.name}`;
          if (c.id === current) opt.selected = true;
          select.appendChild(opt);
        });
        state.configId = current && configs.find(c => c.id === current) ? current : (activeId || configs[0].id);
      }
    },

    async _switchConfig(state, id) {
      state.configId = id;
      await Storage.setActiveAiConfig(id);
      AppState.settings.activeAiConfigId = id;
    },

    _renderEmpty(state) {
      const empty = state.emptyEl || state.element.querySelector('.ai-chat-empty');
      const messages = state.messagesEl || state.element.querySelector('.ai-chat-messages');
      messages.querySelectorAll('.ai-msg').forEach(el => el.remove());
      state.renderedCount = 0;
      const configs = AppState.settings.aiConfigs || [];
      if (configs.length === 0) {
        empty.innerHTML = `
          <span class="ai-chat-empty-icon"><i class="icon" data-icon="robot"></i></span>
          ${I18n.t('ai_no_config')}
        `;
        empty.classList.remove('hidden');
      } else {
        empty.innerHTML = `
          <span class="ai-chat-empty-icon"><i class="icon" data-icon="sparkle"></i></span>
          ${I18n._lang === 'zh' ? 'AI 已就绪，正在分析成绩…' : 'AI ready, analyzing…'}
        `;
        empty.classList.add('hidden');
      }
      this._mountIcons(state.element);
    },

    /** 进入详情页时调用：触发自动分析 */
    async onShow(context, gradeData) {
      const state = this.panels[context];
      if (!state) return;
      state.gradeData = gradeData;
      this._refreshConfigSelect(state);
      // 清空旧对话
      state.messages = [];
      state.renderedCount = 0;
      this._renderEmpty(state);
      // 自动发送默认分析
      await this._sendAutoAnalysis(state);
    },

    /** 离开详情页时调用：仅重置数据引用，保留消息历史 */
    onHide(context) {
      const state = this.panels[context];
      if (!state) return;
      state.gradeData = null;
    },

    _clearChat(state) {
      state.messages = [];
      state.renderedCount = 0;
      this._renderEmpty(state);
    },

    async _sendAutoAnalysis(state) {
      if (!state.gradeData) return;
      const configs = AppState.settings.aiConfigs || [];
      if (configs.length === 0) {
        this._renderEmpty(state);
        return;
      }
      try {
        const prompt = await this._buildAnalysisPrompt(state.gradeData);
        const chartPng = await this._captureTrendChart(state.gradeData);
        const labeledImages = await this._readLabeledPaperImages(state.gradeData);

        const userContent = [];
        userContent.push({ type: 'text', text: prompt });
        if (chartPng) {
          userContent.push({ type: 'text', text: this._getTrendChartCaption(state.gradeData) });
          userContent.push({ type: 'image_url', image_url: { url: chartPng } });
        }
        // 插入带学科标注的图片 + 文字说明
        labeledImages.forEach(item => {
          if (item.caption) {
            userContent.push({ type: 'text', text: item.caption });
          }
          userContent.push({ type: 'image_url', image_url: { url: item.url } });
        });

        state.messages = [{ role: 'user', content: userContent }];
        this._resetAndRenderMessages(state);
        await this._callAi(state);
      } catch (err) {
        console.error('AI 自动分析失败:', err);
        this._appendError(state, err.message);
      }
    },

    /** 成绩波动图说明文字 */
    _getTrendChartCaption(data) {
      if (data.isMajor) {
        return I18n._lang === 'zh'
          ? '【附图 1】大考总分历史趋势图'
          : '[Fig 1] Major exam total score trend';
      }
      const subj = data.record ? data.record.subject : '';
      return I18n._lang === 'zh'
        ? `【附图】${subj} 历史得分趋势图`
        : `[Fig] ${subj} score history trend`;
    },

    async _buildAnalysisPrompt(data) {
      const template = await Storage.getAiPrompt();
      const userName = AppState.user?.name || '-';
      const ageLabel = Storage.getAgeGroupLabel(AppState.user?.ageGroup, I18n.getLang()) || '-';
      const grade = AppState.user?.grade || '-';
      const school = AppState.user?.school || '-';
      const subjectDetails = this._formatSubjectDetails(data);
      const historyDetails = this._formatHistoryDetails(data);
      const imageCount = data._imageCount || 0;
      const imageHint = imageCount > 0
        ? I18n.t('ai_image_hint_with').replace('{n}', imageCount)
        : I18n.t('ai_image_hint_without');
      const imageLabelsHint = data.isMajor
        ? (I18n._lang === 'zh'
            ? '\n注意：附件图片已按学科标注（【图片 N：<科目>】），请在分析时结合图片所属学科。'
            : '\nNote: attached images are labeled by subject ([Img N: <subject>]).')
        : '';
      // 用变量映射一次性替换所有模板占位符，确保每个变量都被真实数据替换
      const vars = {
        name: userName,
        ageGroup: ageLabel,
        grade: grade,
        school: school,
        examName: data.examName || (I18n._lang === 'zh' ? '日常考试' : 'Regular Exam'),
        date: data.date || '-',
        examType: data.examType === 'major' ? (I18n._lang === 'zh' ? '大考' : 'Major') : (I18n._lang === 'zh' ? '小考' : 'Quiz'),
        subjectDetails,
        historyDetails,
        imageHint: imageHint + imageLabelsHint,
      };
      return template.replace(/\{(\w+)\}/g, (_, key) => {
        return vars[key] !== undefined ? vars[key] : '';
      });
    },

    _formatSubjectDetails(data) {
      const zh = I18n._lang === 'zh';
      if (data.isMajor && data.groupRecords) {
        return data.groupRecords.map(r => {
          const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
          let s = `· ${r.subject}：${r.score}/${r.total} (${pct}%)`;
          if (r.subScores && r.subScores.length > 0) {
            s += '\n  小题分：' + r.subScores.map(ss =>
              `${I18n.t('question_type_' + ss.type) || ss.type}: ${ss.score}/${ss.total}`
            ).join(', ');
          }
          if (r.classRank) s += `\n  ${zh ? '班级排名' : 'Class Rank'}: #${r.classRank}${r.classTotal ? '/' + r.classTotal : ''}`;
          if (r.gradeRank) s += `\n  ${zh ? '年级排名' : 'Grade Rank'}: #${r.gradeRank}${r.gradeTotal ? '/' + r.gradeTotal : ''}`;
          if (r.imagePaths && r.imagePaths.length > 0) {
            s += `\n  ${zh ? `试卷图片` : 'Paper images'}: ${r.imagePaths.length} ${zh ? '张' : 'img'}`;
          }
          return s;
        }).join('\n');
      }
      if (data.record) {
        const r = data.record;
        const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
        let s = `${r.subject}：${r.score}/${r.total} (${pct}%)`;
        if (r.subScores && r.subScores.length > 0) {
          s += '\n小题分：' + r.subScores.map(ss =>
            `${I18n.t('question_type_' + ss.type) || ss.type}: ${ss.score}/${ss.total}`
          ).join(', ');
        }
        if (r.classRank) s += `\n班级排名: #${r.classRank}${r.classTotal ? '/' + r.classTotal : ''}`;
        if (r.gradeRank) s += `\n年级排名: #${r.gradeRank}${r.gradeTotal ? '/' + r.gradeTotal : ''}`;
        return s;
      }
      return '-';
    },

    /** 拼接历史成绩明细（用于提示词） */
    _formatHistoryDetails(data) {
      const zh = I18n._lang === 'zh';
      const all = AppState.grades || [];
      if (all.length === 0) return zh ? '（暂无历史成绩）' : '(No history)';

      // 大考详情：列出本次大考涉及的所有科目 + 总分的历史
      if (data.isMajor && data.groupRecords) {
        const subjects = [...new Set(data.groupRecords.map(r => r.subject))];
        const sections = [];
        // 各科历史
        subjects.forEach(subj => {
          const hist = all
            .filter(g => g.subject === subj)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          if (hist.length === 0) return;
          const lines = hist.map(g => {
            const pct = g.total > 0 ? Math.round((g.score / g.total) * 100) : 0;
            const type = (g.examType || 'minor') === 'major'
              ? (zh ? '[大考]' : '[Major]')
              : (zh ? '[小考]' : '[Quiz]');
            return `  ${g.date} ${type} ${g.score}/${g.total} (${pct}%)` +
              (g.classRank ? ` 班排#${g.classRank}` : '') +
              (g.gradeRank ? ` 级排#${g.gradeRank}` : '');
          });
          sections.push(`【${subj}】共 ${hist.length} 次\n` + lines.join('\n'));
        });
        // 大考总分历史
        const totals = Storage.calculateTotalScores(all)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (totals.length > 0) {
          const lines = totals.map(t => `  ${t.date} 总分 ${t.total}`);
          sections.push(`【${zh ? '大考总分' : 'Major Total'}】共 ${totals.length} 次\n` + lines.join('\n'));
        }
        return sections.length > 0 ? sections.join('\n\n') : (zh ? '（暂无历史）' : '(No history)');
      }

      // 小考/单科详情：该科目所有历史
      if (data.record) {
        const subj = data.record.subject;
        const hist = all
          .filter(g => g.subject === subj)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (hist.length === 0) return zh ? '（暂无该科历史）' : '(No subject history)';
        const lines = hist.map(g => {
          const pct = g.total > 0 ? Math.round((g.score / g.total) * 100) : 0;
          const type = (g.examType || 'minor') === 'major'
            ? (zh ? '[大考]' : '[Major]')
            : (zh ? '[小考]' : '[Quiz]');
          return `  ${g.date} ${type} ${g.score}/${g.total} (${pct}%)` +
            (g.classRank ? ` 班排#${g.classRank}` : '') +
            (g.gradeRank ? ` 级排#${g.gradeRank}` : '');
        });
        return `【${subj}】共 ${hist.length} 次\n` + lines.join('\n');
      }
      return '-';
    },

    /** 读取试卷图片为 base64，并标注所属学科 */
    async _readLabeledPaperImages(data) {
      const items = this._collectLabeledImagePaths(data);
      const results = [];
      const maxPerSubject = 2;
      const maxTotal = 8;
      // 按学科统计
      const perSubject = {};
      let imgCounter = 0;
      for (const item of items) {
        const subj = item.subject || '-';
        perSubject[subj] = (perSubject[subj] || 0);
        if (perSubject[subj] >= maxPerSubject) continue;
        if (results.filter(r => r.subject === subj).length >= maxPerSubject) continue;
        if (imgCounter >= maxTotal) break;
        if (!item.path || !item.path.startsWith('local-asset://')) continue;
        const r = await window.api.readAssetBase64(item.path);
        if (r && r.success) {
          imgCounter++;
          perSubject[subj]++;
          const caption = I18n._lang === 'zh'
            ? `【图片 ${imgCounter}：${subj}】`
            : `[Img ${imgCounter}: ${subj}]`;
          results.push({ subject: subj, url: `data:${r.mime};base64,${r.base64}`, caption, originalName: item.originalName });
        }
      }
      return results;
    },

    /** 收集 (subject, path) 元组列表 */
    _collectLabeledImagePaths(data) {
      const out = [];
      if (data.isMajor && data.groupRecords) {
        data.groupRecords.forEach(r => {
          if (r.imagePaths && r.imagePaths.length) {
            r.imagePaths.forEach((p, i) => {
              out.push({ subject: r.subject, path: p, originalName: `${r.subject}-${i + 1}` });
            });
          }
        });
        return out;
      }
      if (data.record && data.record.imagePaths) {
        const subj = data.record.subject;
        data.record.imagePaths.forEach((p, i) => {
          out.push({ subject: subj, path: p, originalName: `${subj}-${i + 1}` });
        });
      }
      return out;
    },

    /** 渲染成绩趋势图到 canvas，输出 PNG base64 */
    async _captureTrendChart(data) {
      const series = this._buildTrendSeries(data);
      if (!series || series.length === 0) return null;
      // 多系列（仅大考）
      if (data.isMajor && Array.isArray(series) && series.length > 0 && series[0].values) {
        const svg = this._buildTrendSvgMulti({ title: this._trendTitle(data), multiSeries: series });
        if (!svg) return null;
        return this._svgToPng(svg, 800, 320);
      }
      const svg = this._buildTrendSvg(series, { color: '#3b82f6', title: this._trendTitle(data) });
      if (!svg) return null;
      return this._svgToPng(svg, 700, 240);
    },

    _trendTitle(data) {
      if (data.isMajor) return I18n._lang === 'zh' ? '大考各科/总分历史趋势（百分比）' : 'Major Exam Subject/Total Trend (%)';
      const subj = data.record ? data.record.subject : '';
      return (I18n._lang === 'zh' ? `${subj}成绩趋势` : `${subj} Score Trend`);
    },

    _buildTrendSeries(data) {
      const all = AppState.grades || [];
      // 大考详情：返回多系列 { name, values:[{date,value}], color }
      if (data.isMajor && data.groupRecords) {
        const subjects = [...new Set(data.groupRecords.map(r => r.subject))];
        // 取所有相关日期（大考日期 + 各科成绩日期的并集）
        const dateSet = new Set();
        const totalsByDate = {};
        all.forEach(g => {
          if ((g.examType || 'minor') === 'major' && subjects.includes(g.subject)) {
            dateSet.add(g.date);
            totalsByDate[g.date] = (totalsByDate[g.date] || 0) + g.score;
          }
        });
        const dates = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
        if (dates.length === 0) return [];
        const palette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
        const series = [];
        // 各科折线（百分比）
        subjects.forEach((subj, i) => {
          const values = dates.map(date => {
            const g = all.find(x => x.subject === subj && x.date === date);
            if (!g || !g.total) return null;
            const pct = (g.score / g.total) * 100;
            return { date, value: Math.round(pct * 10) / 10 };
          });
          series.push({ name: subj, values, color: palette[i % palette.length] });
        });
        // 总分折线（按百分比）
        const totalValues = dates.map(date => {
          const total = totalsByDate[date] || 0;
          const fullTotal = subjects.reduce((s, subj) => {
            const g = all.find(x => x.subject === subj && x.date === date);
            return s + (g ? g.total : 0);
          }, 0);
          if (fullTotal === 0) return null;
          return { date, value: Math.round((total / fullTotal) * 1000) / 10 };
        });
        series.push({ name: I18n._lang === 'zh' ? '总分%' : 'Total %', values: totalValues, color: '#0f172a', isTotal: true });
        return series;
      }
      // 小考/单科详情：用该科目历史成绩
      if (data.record) {
        const subj = data.record.subject;
        const hist = all
          .filter(g => g.subject === subj)
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        return hist.map(g => ({ label: g.date.slice(5), value: g.score }));
      }
      return [];
    },

    /** 多系列 SVG 趋势图（用于大考各科对比） */
    _buildTrendSvgMulti(options) {
      const { width = 800, height = 320, title = '', multiSeries = [] } = options;
      if (!multiSeries || multiSeries.length === 0) return null;
      const series = multiSeries.filter(s => s.values && s.values.some(v => v !== null));
      if (series.length === 0) return null;
      const allValues = [];
      series.forEach(s => s.values.forEach(v => { if (v) allValues.push(v.value); }));
      if (allValues.length === 0) return null;
      const padding = { top: title ? 50 : 32, right: 16, bottom: 36, left: 48 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const dataMax = Math.max(...allValues, 100);
      const dataMin = Math.min(...allValues, 0);
      const range = dataMax - dataMin || 10;
      const yMax = Math.min(100, dataMax + range * 0.1);
      const yMin = Math.max(0, dataMin - range * 0.1);
      const dateSet = new Set();
      series.forEach(s => s.values.forEach(v => { if (v) dateSet.add(v.date); }));
      const dates = [...dateSet].sort((a, b) => new Date(a) - new Date(b));
      if (dates.length === 0) return null;
      const xStep = dates.length > 1 ? chartW / (dates.length - 1) : 0;
      const toX = (i) => padding.left + (dates.length > 1 ? i * xStep : chartW / 2);
      const toY = (v) => padding.top + chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;
      // 网格线
      const gridStep = 4;
      let gridLines = '';
      for (let i = 0; i <= gridStep; i++) {
        const y = padding.top + (chartH / gridStep) * i;
        const val = Math.round(yMax - ((yMax - yMin) / gridStep) * i);
        gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
        gridLines += `<text x="${padding.left - 6}" y="${y + 3}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#94a3b8">${val}%</text>`;
      }
      const xAxis = `<line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>`;
      const maxLabels = 6;
      const step = Math.max(1, Math.ceil(dates.length / maxLabels));
      const xLabels = dates.map((d, i) => {
        if (i !== 0 && i !== dates.length - 1 && i % step !== 0) return '';
        return `<text x="${toX(i)}" y="${height - 12}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#64748b">${d.slice(5)}</text>`;
      }).join('');
      const dateIdx = {};
      dates.forEach((d, i) => { dateIdx[d] = i; });
      // 各系列折线
      const lines = series.map(s => {
        let pathD = '';
        let points = '';
        let firstValid = true;
        s.values.forEach(v => {
          if (!v) return;
          const i = dateIdx[v.date];
          const x = toX(i);
          const y = toY(v.value);
          if (firstValid) { pathD = `M ${x} ${y}`; firstValid = false; }
          else { pathD += ` L ${x} ${y}`; }
          points += `<circle cx="${x}" cy="${y}" r="${s.isTotal ? 4 : 3}" fill="${s.color}" stroke="#ffffff" stroke-width="1.5"/>`;
        });
        return `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="${s.isTotal ? 2.5 : 1.8}" stroke-linejoin="round" stroke-linecap="round"/>${points}`;
      }).join('');
      // 图例（顶部两行）
      const legendY = title ? 30 : 14;
      const legendItems = series.map((s, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        const x = padding.left + col * 110;
        const y = legendY + row * 18;
        return `<rect x="${x}" y="${y - 8}" width="12" height="12" fill="${s.color}" rx="2"/>` +
          `<text x="${x + 18}" y="${y + 2}" font-family="sans-serif" font-size="11" fill="#334155">${s.name}</text>`;
      }).join('');
      const titleHtml = title
        ? `<text x="${width / 2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#0f172a" font-weight="600">${title}</text>`
        : '';
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#ffffff"/>
        ${titleHtml}
        ${legendItems}
        ${gridLines}
        ${xAxis}
        ${lines}
        ${xLabels}
      </svg>`;
    },

    _buildTrendSvg(series, options = {}) {
      if (!series || series.length === 0) return null;
      const { width = 700, height = 240, color = '#3b82f6', title = '' } = options;
      const padding = { top: title ? 32 : 14, right: 16, bottom: 28, left: 44 };
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      const values = series.map(d => d.value);
      const dataMax = Math.max(...values, 0);
      const dataMin = Math.min(...values, 0);
      const range = dataMax - dataMin || 100;
      const yMax = dataMax + range * 0.1;
      const yMin = Math.max(0, dataMin - range * 0.1);
      const xStep = series.length > 1 ? chartW / (series.length - 1) : 0;
      const toX = (i) => padding.left + (series.length > 1 ? i * xStep : chartW / 2);
      const toY = (v) => padding.top + chartH - ((v - yMin) / (yMax - yMin || 1)) * chartH;

      let pathD = `M ${toX(0)} ${toY(values[0])}`;
      for (let i = 1; i < values.length; i++) pathD += ` L ${toX(i)} ${toY(values[i])}`;
      // 填充区
      const fillD = pathD +
        ` L ${toX(values.length - 1)} ${padding.top + chartH}` +
        ` L ${toX(0)} ${padding.top + chartH} Z`;

      // 网格线
      const gridStep = 4;
      let gridLines = '';
      for (let i = 0; i <= gridStep; i++) {
        const y = padding.top + (chartH / gridStep) * i;
        const val = Math.round(yMax - ((yMax - yMin) / gridStep) * i);
        gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#f1f5f9" stroke-width="1"/>`;
        gridLines += `<text x="${padding.left - 6}" y="${y + 3}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#94a3b8">${val}</text>`;
      }

      // 数据点
      const points = series.map((d, i) =>
        `<circle cx="${toX(i)}" cy="${toY(d.value)}" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`
      ).join('');

      // X 轴标签（最多 6 个）
      const maxLabels = 6;
      const step = Math.max(1, Math.ceil(series.length / maxLabels));
      const labels = series.map((d, i) => {
        if (i !== 0 && i !== series.length - 1 && i % step !== 0) return '';
        return `<text x="${toX(i)}" y="${height - 8}" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#64748b">${d.label}</text>`;
      }).join('');

      const titleHtml = title
        ? `<text x="${width / 2}" y="20" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#0f172a" font-weight="600">${title}</text>`
        : '';

      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#ffffff"/>
        ${titleHtml}
        ${gridLines}
        <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${width - padding.right}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
        <path d="${fillD}" fill="${color}" fill-opacity="0.12"/>
        <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${points}
        ${labels}
      </svg>`;
    },

    _svgToPng(svgString, width, height) {
      return new Promise((resolve, reject) => {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, width, height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
      });
    },

    _sendUserMessage(state) {
      const input = state.input || state.element.querySelector('.ai-chat-input');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const userContent = [{ type: 'text', text }];
      this._appendMessage(state, 'user', userContent);
      this._callAi(state);
    },

    async _callAi(state) {
      if (state.sending) return;
      const configs = AppState.settings.aiConfigs || [];
      if (configs.length === 0) {
        this._appendError(state, I18n.t('ai_no_config'));
        return;
      }

      // 用循环实现"失败→自动切换→重试"，避免深层递归导致栈深度问题
      const tried = new Set();
      const maxAttempts = configs.length;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // 1) 过滤掉处于冷却中的 + 已尝试失败的
        const now = Date.now();
        const available = configs.filter(c => {
          if (tried.has(c.id)) return false;
          const st = this._getTestStatus(c.id);
          return !(st && st.cooldownUntil && st.cooldownUntil > now);
        });

        // 2) 决定本次要用的配置
        let current = available.find(c => c.id === state.configId) || available[0];
        if (!current) {
          // 全部都在冷却/已尝试 - 找出最早解冻的，作为兜底（但仍会失败）
          const sorted = [...configs]
            .filter(c => !tried.has(c.id))
            .sort((a, b) => {
              const sa = this._getTestStatus(a.id)?.cooldownUntil || 0;
              const sb = this._getTestStatus(b.id)?.cooldownUntil || 0;
              return sa - sb;
            });
          current = sorted[0];
          if (!current) break; // 实在没辙
        }
        state.configId = current.id;
        tried.add(current.id);

        // 3) 开始发送
        state.sending = true;
        this._setSending(state, true);
        const loadingEl = this._appendLoading(state);
        let shouldContinue = false;
        try {
          const res = await window.api.aiChat({
            config: { type: current.type, apiKey: current.apiKey, baseUrl: current.baseUrl, model: current.model },
            messages: state.messages,
          });
          if (res && res.success) {
            loadingEl.remove();
            this._appendMessage(state, 'assistant', res.content);
            return;
          }
          // 失败：解析错误码（统一函数）
          loadingEl.remove();
          const errMsg = res?.error || 'Unknown error';
          const errorStatus = this._parseErrorStatus(errMsg);

          // 记录该配置的测试状态 + 设置冷却
          const fakeRes = { success: false, status: errorStatus, error: errMsg };
          const cd = getCooldownMsByError(fakeRes);
          const label = I18n.t('ai_test_' + errorStatus) || I18n.t('ai_test_unknown');
          const entry = { status: errorStatus, label, error: errMsg, at: now };
          if (cd) entry.cooldownUntil = now + cd;
          this._setTestStatus(current.id, entry);
          // 同步设置页状态
          if (document.getElementById('ai-configs-list')) renderAiConfigsList();

          // 自动切换到下一个可用配置
          if (this._isSwitchableError(errorStatus) && attempt < maxAttempts - 1) {
            const isAvailable = (c) => {
              if (tried.has(c.id)) return false;
              const st = this._getTestStatus(c.id);
              return !(st && st.cooldownUntil && st.cooldownUntil > now);
            };
            const next = configs.find(isAvailable);
            if (next) {
              const msg = I18n._lang === 'zh'
                ? `当前AI(${current.name})请求失败(${errorStatus})，已自动切换到 ${next.name}`
                : `AI (${current.name}) failed (${errorStatus}), switched to ${next.name}`;
              this._appendMessage(state, 'system', msg);
              state.configId = next.id;
              shouldContinue = true;
            } else {
              this._appendError(state, errMsg);
              return;
            }
          } else {
            this._appendError(state, errMsg);
            return;
          }
        } catch (err) {
          loadingEl.remove();
          this._appendError(state, err.message);
          return;
        } finally {
          state.sending = false;
          this._setSending(state, false);
        }
        if (!shouldContinue) return;
      }

      // 所有配置都尝试过
      this._appendError(state, I18n.t('ai_no_config'));
    },

    /** 解析错误码到 status 字符串（与 ai-test IPC 返回的 status 保持一致） */
    _parseErrorStatus(errMsg) {
      const m = String(errMsg).match(/(OpenAI|Gemini)\s+(\d{3})/);
      const code = m ? m[2] : '';
      if (code === '401' || code === '403') return 'auth';
      if (code === '404' || code === '400') return 'notfound';
      if (code === '429') return 'ratelimit';
      if (code === '500' || code === '502' || code === '503' || code === '504') return 'server';
      if (/fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|abort|network/i.test(errMsg)) return 'network';
      return 'unknown';
    },

    /** 该错误是否需要自动切换到下一个配置 */
    _isSwitchableError(status) {
      return status === 'auth' || status === 'notfound' || status === 'server'
        || status === 'ratelimit' || status === 'network';
    },

    _setSending(state, sending) {
      const btn = state.sendBtn || state.element.querySelector('.ai-chat-send-btn');
      btn.disabled = sending;
      // 缓存按钮内的 text 节点引用，避免重复 querySelector
      const textEl = btn._sendText || btn.querySelector('.ai-chat-send-text');
      if (!btn._sendText) btn._sendText = textEl;
      textEl.textContent = sending ? I18n.t('ai_thinking') : I18n.t('ai_send');
    },

    _renderMessages(state) {
      // 增量渲染：仅渲染 state.renderedCount 之后的新消息
      const messages = state.messagesEl || state.element.querySelector('.ai-chat-messages');
      const empty = state.emptyEl || messages.querySelector('.ai-chat-empty');
      if (state.messages.length === 0) {
        empty.classList.remove('hidden');
        // 清理已渲染的 DOM
        messages.querySelectorAll('.ai-msg').forEach(el => el.remove());
        state.renderedCount = 0;
        return;
      }
      empty.classList.add('hidden');
      const start = state.renderedCount || 0;
      for (let i = start; i < state.messages.length; i++) {
        this._appendMessageNode(state, state.messages[i]);
      }
      state.renderedCount = state.messages.length;
      this._scrollToBottom(state);
    },

    _appendMessage(state, role, content) {
      const msg = { role, content };
      state.messages.push(msg);

      // 消息数量上限：裁剪最旧的 user/assistant 消息对
      if (state.messages.length > this.MAX_MESSAGES) {
        this._trimOldMessages(state);
      }

      // 增量追加：仅当 DOM 与数据一致时直接追加
      if (state.renderedCount === state.messages.length - 1) {
        this._appendMessageNode(state, msg);
        state.renderedCount = state.messages.length;
        this._scrollToBottom(state);
      } else {
        this._renderMessages(state);
      }
    },

    /** 裁剪最旧的 N 条消息（保留 system 消息） */
    _trimOldMessages(state) {
      const excess = state.messages.length - this.MAX_MESSAGES;
      if (excess <= 0) return;
      let trimmed = 0;
      state.messages = state.messages.filter(m => {
        if (trimmed < excess && m.role !== 'system') {
          trimmed++;
          return false;
        }
        return true;
      });
      // 如果裁剪后 renderedCount 不再有效，全量渲染
      state.renderedCount = Math.min(state.renderedCount, state.messages.length);
    },

    /** 全量重置并重新渲染（用于自动分析时整段替换首条消息） */
    _resetAndRenderMessages(state) {
      state.renderedCount = 0;
      const messages = state.messagesEl || state.element.querySelector('.ai-chat-messages');
      if (messages) messages.querySelectorAll('.ai-msg').forEach(el => el.remove());
      this._renderMessages(state);
    },

    _appendMessageNode(state, msg) {
      const messages = state.messagesEl || state.element.querySelector('.ai-chat-messages');
      const empty = state.emptyEl || messages.querySelector('.ai-chat-empty');
      empty.classList.add('hidden');
      const div = document.createElement('div');
      div.className = `ai-msg ai-msg-${msg.role}`;

      if (msg.role === 'system') {
        // 系统提示：简短居中消息，不显示时间和图片
        const bubble = document.createElement('div');
        bubble.className = 'ai-msg-bubble';
        bubble.textContent = msg.content;
        div.appendChild(bubble);
        messages.appendChild(div);
        return;
      }

      if (Array.isArray(msg.content)) {
        const images = msg.content.filter(p => p.type === 'image_url');
        if (images.length > 0) {
          const imgs = document.createElement('div');
          imgs.className = 'ai-msg-images';
          for (const p of images) {
            const img = document.createElement('img');
            img.className = 'ai-msg-image';
            img.src = p.image_url?.url || p.image_url;
            imgs.appendChild(img);
          }
          div.appendChild(imgs);
        }
        const textParts = [];
        for (const p of msg.content) if (p.type === 'text') textParts.push(p.text);
        const text = textParts.join('\n');
        if (text) {
          const bubble = document.createElement('div');
          bubble.className = 'ai-msg-bubble';
          bubble.innerHTML = markdownToHtml(text);
          div.appendChild(bubble);
        }
      } else {
        const bubble = document.createElement('div');
        bubble.className = 'ai-msg-bubble';
        bubble.innerHTML = markdownToHtml(msg.content);
        div.appendChild(bubble);
      }

      const time = document.createElement('div');
      time.className = 'ai-msg-time';
      time.textContent = this._formatTime(new Date());
      div.appendChild(time);

      messages.appendChild(div);
    },

    _appendError(state, msg) {
      const messages = state.messagesEl || state.element.querySelector('.ai-chat-messages');
      const div = document.createElement('div');
      div.className = 'ai-msg ai-msg-assistant ai-msg-error';
      const bubble = document.createElement('div');
      bubble.className = 'ai-msg-bubble';
      bubble.innerHTML = `<i class="icon" data-icon="error"></i> ${(msg || '请求失败').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}`;
      div.appendChild(bubble);
      messages.appendChild(div);
      this._mountIcons(bubble);
      this._scrollToBottom(state);
    },

    _appendLoading(state) {
      const messages = state.messagesEl || state.element.querySelector('.ai-chat-messages');
      const div = document.createElement('div');
      div.className = 'ai-msg ai-msg-assistant';
      const bubble = document.createElement('div');
      bubble.className = 'ai-msg-bubble';
      bubble.innerHTML = `<span class="ai-msg-loading"><span></span><span></span><span></span></span> ${I18n.t('ai_thinking')}`;
      div.appendChild(bubble);
      messages.appendChild(div);
      this._scrollToBottom(state);
      return div;
    },

    _scrollToBottom(state) {
      const messages = state.messagesEl;
      if (messages) {
        requestAnimationFrame(() => { messages.scrollTop = messages.scrollHeight; });
      }
    },

    _formatTime(date) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    },
  };

  // ==================== AI 设置页 ====================

  function renderAiConfigsList() {
    const list = $('#ai-configs-list');
    if (!list) return;
    const configs = AppState.settings.aiConfigs || [];
    const activeId = AppState.settings.activeAiConfigId;
    if (configs.length === 0) {
      list.innerHTML = `<div class="settings-hint" style="text-align:center;padding:14px;">${I18n.t('ai_no_config')}</div>`;
      return;
    }
    // 一次性取出 i18n 字符串，避免循环中重复字典查找
    const T = {
      default: I18n.t('ai_default'),
      test: I18n.t('ai_test'),
      activate: I18n.t('ai_set_default'),
      edit: I18n.t('edit_grade'),
      del: I18n.t('ai_config_delete'),
      delConfirm: I18n.t('ai_config_delete_confirm'),
    };
    // 预先计算每个配置的 status HTML 和 badge 字符串
    const rows = configs.map(c => {
      const isActive = c.id === activeId;
      const isGemini = c.type === 'gemini';
      const statusHtml = renderAiConfigStatus(AIChat._getTestStatus(c.id));
      const typeBadge = `<span class="ai-config-badge ai-config-badge-${c.type}">${isGemini ? 'Gemini' : 'OpenAI'}</span>`;
      const defaultBadge = isActive ? `<span class="ai-config-badge ai-config-badge-default">${T.default}</span>` : '';
      const activateBtn = isActive ? '' : `<button class="ai-config-icon-btn" data-action="activate" data-id="${c.id}" title="${T.activate}"><i class="icon" data-icon="check"></i></button>`;
      return (
        `<div class="ai-config-item" data-id="${c.id}">` +
          `<div class="ai-config-item-info">` +
            `<div class="ai-config-item-name">${c.name}${typeBadge}${defaultBadge}${statusHtml}</div>` +
            `<div class="ai-config-item-meta">${c.model}${c.baseUrl ? ' · ' + c.baseUrl : ''}</div>` +
          `</div>` +
          `<div class="ai-config-item-actions">` +
            `<button class="ai-config-icon-btn" data-action="test" data-id="${c.id}" title="${T.test}"><i class="icon" data-icon="play"></i></button>` +
            activateBtn +
            `<button class="ai-config-icon-btn" data-action="edit" data-id="${c.id}" title="${T.edit}"><i class="icon" data-icon="edit"></i></button>` +
            `<button class="ai-config-icon-btn danger" data-action="delete" data-id="${c.id}" title="${T.del}"><i class="icon" data-icon="trash"></i></button>` +
          `</div>` +
        `</div>`
      );
    });
    list.innerHTML = rows.join('');

    // 挂载新生成的图标（兼容首次渲染时 window.IconsMount 尚未定义的情况）
    if (window.IconsMount) window.IconsMount(list);
    else if (window.Icons && window.Icons.mount) window.Icons.mount(list);

    // 事件委托：每个 render 只绑定一次 click，事件冒泡到 list 后再分派
    if (!list._aiConfigDelegated) {
      list._aiConfigDelegated = true;
      list.addEventListener('click', async (e) => {
        const btn = e.target.closest('.ai-config-icon-btn');
        if (!btn || !list.contains(btn)) return;
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');
        if (action === 'test') {
          await testAiConfig(id, btn);
        } else if (action === 'activate') {
          await Storage.setActiveAiConfig(id, AppState.settings);
          AppState.settings.activeAiConfigId = id;
          renderAiConfigsList();
          Object.values(AIChat.panels).forEach(s => AIChat._refreshConfigSelect(s));
        } else if (action === 'edit') {
          openAiConfigModal(id);
        } else if (action === 'delete') {
          if (!await elConfirm({ message: I18n.t('ai_config_delete_confirm'), title: '确认删除', danger: true })) return;
          await Storage.deleteAiConfig(id, AppState.settings);
          const list2 = AppState.settings.aiConfigs || [];
          const idx = list2.findIndex(c => c.id === id);
          if (idx >= 0) list2.splice(idx, 1);
          if (AppState.settings.activeAiConfigId === id) {
            AppState.settings.activeAiConfigId = list2[0]?.id || null;
          }
          renderAiConfigsList();
          renderAiProviders();
          Object.values(AIChat.panels).forEach(s => AIChat._refreshConfigSelect(s));
        }
      });
    }
  }

  /** 渲染单个 AI 配置的测试状态徽标 */
  function renderAiConfigStatus(st) {
    if (!st) {
      return `<span class="ai-config-status ai-config-status-untested" data-status-untested>${I18n.t('ai_untested')}</span>`;
    }
    if (st.testing) {
      return `<span class="ai-config-status ai-config-status-testing"><span class="ai-config-status-spinner"></span>${I18n.t('ai_testing')}</span>`;
    }
    if (st.cooldownUntil && st.cooldownUntil > Date.now()) {
      const remain = Math.ceil((st.cooldownUntil - Date.now()) / 1000);
      const label = `${st.label}${I18n.t('ai_cooldown_hint')} ${remain}s`;
      return `<span class="ai-config-status ai-config-status-${st.status || 'unknown'}">${label}</span>`;
    }
    if (st.status === 'ok') {
      return `<span class="ai-config-status ai-config-status-ok">${I18n.t('ai_test_ok')} ${st.latencyMs || 0}${I18n.t('ai_ms')}</span>`;
    }
    return `<span class="ai-config-status ai-config-status-${st.status || 'unknown'}">${st.label || I18n.t('ai_test_unknown')}</span>`;
  }

  /**
   * 手动测试某个 AI 配置（用户点击测试按钮）
   * @param {string} id - config id
   * @param {HTMLElement} btn - 触发按钮（用于高亮）
   */
  async function testAiConfig(id, btn) {
    const cfg = (AppState.settings.aiConfigs || []).find(c => c.id === id);
    if (!cfg) return;
    AIChat._setTestStatus(id, { testing: true });
    if (btn) btn.disabled = true;
    renderAiConfigsList();
    try {
      const res = await window.api.aiTest({ type: cfg.type, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model });
      if (res && res.success) {
        AIChat._setTestStatus(id, { status: 'ok', latencyMs: res.latencyMs, label: I18n.t('ai_test_ok'), at: Date.now() });
      } else {
        const status = (res && res.status) || 'unknown';
        const label = I18n.t('ai_test_' + status) || I18n.t('ai_test_unknown');
        const cooldown = getCooldownMsByError(res);
        const entry = { status, label, code: res && res.code, error: res && res.error, at: Date.now() };
        if (cooldown) entry.cooldownUntil = Date.now() + cooldown;
        AIChat._setTestStatus(id, entry);
        // 自动切换到下一个可用配置：仅在自动分析场景下生效，手动测试不影响默认选择
      }
    } catch (err) {
      AIChat._setTestStatus(id, { status: 'unknown', label: err.message || I18n.t('ai_test_unknown'), at: Date.now() });
    } finally {
      if (btn) btn.disabled = false;
      renderAiConfigsList();
    }
  }

  /** 根据测试结果判断需要冷却多少毫秒 */
  function getCooldownMsByError(res) {
    if (!res) return 0;
    // 只有硬错误才冷却（认证失败 / 资源不存在 / 服务异常 / 限流）
    if (['auth', 'notfound', 'server', 'ratelimit'].includes(res.status)) {
      if (res.status === 'ratelimit') return 60 * 1000;          // 限流：60 秒
      if (res.status === 'server') return 30 * 1000;              // 服务异常：30 秒
      if (res.status === 'auth') return 5 * 60 * 1000;           // 认证失败：5 分钟
      if (res.status === 'notfound') return 60 * 1000;           // 资源/路径错误：60 秒
    }
    return 0;
  }

  /** 打开 AI 配置模态框
   * @param {string} [configId] - 编辑模式时传入现有配置 ID
   * @param {Object} [preset] - 预填的 provider 模板 {name, baseUrl, model, type, isCustom}
   */
  function openAiConfigModal(configId, preset) {
    const modal = $('#ai-config-modal');
    const list = AppState.settings.aiConfigs || [];
    const cfg = configId ? list.find(c => c.id === configId) : null;
    $('#ai-config-id').value = configId || '';
    $('#ai-config-name').value = cfg?.name || (preset?.skipName ? '' : (preset?.name || ''));
    $('#ai-config-apikey').value = cfg?.apiKey || '';
    $('#ai-config-baseurl').value = cfg?.baseUrl ?? (preset ? preset.baseUrl || '' : '');
    $('#ai-config-model').value = cfg?.model ?? (preset ? preset.model || '' : '');
    // 清空模型查询结果（防止残留）
    const modelSelect = $('#ai-model-select');
    if (modelSelect) { modelSelect.innerHTML = ''; modelSelect.classList.add('hidden'); }
    const hintEl = $('#ai-models-hint');
    if (hintEl) { hintEl.textContent = ''; hintEl.style.color = ''; }
    const type = cfg?.type || preset?.type || 'openai';
    $$('#ai-type-options .ai-type-card').forEach(card => {
      const t = card.getAttribute('data-type');
      card.classList.toggle('selected', t === type);
      card.querySelector('input[type="radio"]').checked = t === type;
    });
    updateAiBaseUrlVisibility(type);
    $('#ai-config-modal-title').textContent = cfg
      ? cfg.name
      : (preset ? `${I18n.t('ai_add_config')} · ${preset.name}` : I18n.t('ai_add_config'));
    $('#ai-config-delete-btn').classList.toggle('hidden', !configId);
    modal.classList.remove('hidden');
    setTimeout(() => $('#ai-config-apikey').focus(), 50);
  }

  /**
   * 渲染预置 AI 服务商列表
   * 默认仅展示 featured=true 的"热门提供商"；点击"查看更多"展示其余。
   */
  let _providersExpanded = false;
  function renderAiProviders() {
    const list = $('#ai-providers-list');
    if (!list) return;
    const all = (Components.AI_PROVIDERS || []);
    const featured = all.filter(p => p.featured);
    const others = all.filter(p => !p.featured);
    const showAll = _providersExpanded;
    const showList = showAll ? all : featured;

    // 已连接的 provider key 集合（按 baseUrl + type 匹配）
    const connectedKeys = new Set();
    for (const c of (AppState.settings.aiConfigs || [])) {
      const type = c.type || 'openai';
      const url = (c.baseUrl || '').replace(/\/+$/, '');
      connectedKeys.add(type + '::' + url);
    }
    const isProviderConnected = (p) => !p.isCustom && connectedKeys.has(p.type + '::' + (p.baseUrl || '').replace(/\/+$/, ''));

    // 一次性取出 i18n 字符串
    const T = {
      recommended: I18n.t('ai_providers_recommended'),
      custom: I18n.t('ai_providers_custom'),
      connect: I18n.t('ai_providers_connect'),
    };

    list.innerHTML = showList.map(p => {
      const isConnected = isProviderConnected(p);
      return renderProviderCard(p, isConnected, T);
    }).join('');

    // 挂载图标
    if (window.IconsMount) window.IconsMount(list);
    else if (window.Icons && window.Icons.mount) window.Icons.mount(list);

    // 事件委托：每个 render 只绑定一次
    if (!list._aiProviderDelegated) {
      list._aiProviderDelegated = true;
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('.ai-provider-connect-btn');
        const card = e.target.closest('.ai-provider-card');
        if (!card || !list.contains(card)) return;
        const id = card.getAttribute('data-provider-id');
        const provider = all.find(p => p.id === id);
        if (!provider) return;
        // 点中连接按钮或卡片其它位置都打开预填模态框
        openAiConfigModal(null, provider);
      });
    }

    // 切换"更多"按钮
    const toggle = $('#ai-providers-toggle');
    if (toggle) {
      if (others.length === 0) {
        toggle.classList.add('hidden');
      } else {
        toggle.classList.remove('hidden');
        toggle.textContent = I18n.t(showAll ? 'ai_providers_less' : 'ai_providers_more');
      }
    }
  }

  function renderProviderCard(p, isConnected, T) {
    const isCustom = p.isCustom;
    const desc = I18n.t(p.descKey) || p.descKey;
    const name = p.name;
    const badge = p.recommended
      ? `<span class="ai-provider-badge ai-provider-badge-recommended">${T.recommended}</span>`
      : (isCustom ? `<span class="ai-provider-badge">${T.custom}</span>` : '');
    const connectLabel = isConnected ? `${T.connect} ✓` : T.connect;
    return (
      `<div class="ai-provider-card ${isConnected ? 'is-connected' : ''} ${isCustom ? 'is-custom' : ''}" data-provider-id="${p.id}">` +
        `<div class="ai-provider-icon" style="background:${p.color}">${p.letter}</div>` +
        `<div class="ai-provider-info">` +
          `<div class="ai-provider-name-row">` +
            `<span class="ai-provider-name">${name}</span>${badge}` +
          `</div>` +
          `<div class="ai-provider-desc">${desc}</div>` +
        `</div>` +
        `<button type="button" class="ai-provider-connect-btn" title="${connectLabel}">` +
          `<i class="icon" data-icon="add"></i><span>${connectLabel}</span>` +
        `</button>` +
      `</div>`
    );
  }

  function closeAiConfigModal() {
    $('#ai-config-modal').classList.add('hidden');
  }

  function updateAiBaseUrlVisibility(type) {
    const input = $('#ai-config-baseurl');
    const hint = $('#ai-config-baseurl-hint');
    if (type === 'gemini') {
      input.placeholder = 'https://generativelanguage.googleapis.com/v1beta';
      hint.textContent = I18n.t('ai_config_baseurl_hint');
    } else {
      input.placeholder = 'https://api.openai.com/v1';
      hint.textContent = I18n.t('ai_config_baseurl_hint');
    }
  }

  async function saveAiPromptFromInput() {
    const text = $('#ai-prompt-input').value;
    await Storage.saveAiPrompt(text, AppState.settings);
  }

  // ==================== 事件绑定 ====================

  function bindEvents() {
    // ---- 侧边栏收起/展开 ----
    const sidebarToggle = $('#sidebar-toggle');
    const sidebar = $('#sidebar');
    if (sidebarToggle && sidebar) {
      // 恢复上次状态
      const savedCollapsed = localStorage.getItem('sidebar-collapsed');
      if (savedCollapsed === 'true') {
        sidebar.classList.add('collapsed');
      }
      sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
      });
    }

    $$('.sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        navigateTo(item.getAttribute('data-page'));
      });
    });

    // ---- 课程按钮 ----
    $('#course-install-btn')?.addEventListener('click', () => installOpenmaic());
    $('#course-start-btn')?.addEventListener('click', () => startOpenmaic());
    $('#course-stop-btn')?.addEventListener('click', () => stopOpenmaic());
    $('#course-retry-btn')?.addEventListener('click', () => {
      // 重新检测状态并刷新页面
      renderCoursePage();
    });

    // ---- 总分图时间筛选 ----
    $$('#total-chart-time-filter .time-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // 更新按钮状态
        $$('#total-chart-time-filter .time-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // 设置时间范围并更新图表
        GradeChart.setTimeRange(btn.getAttribute('data-range'));
      });
    });

    // ---- 成绩：添加按钮 ----
    $('#add-grade-btn').addEventListener('click', () => {
      navigateToAddGrade(null);
    });

    // ---- 成绩：筛选 ----
    $('#grade-filter-subject').addEventListener('change', (e) => {
      Components.renderGradesList(AppState.grades, e.target.value);
    });

    // ---- 成绩：编辑 ----
    document.addEventListener('edit-grade', (e) => {
      navigateToAddGrade(e.detail.grade);
    });

    // ---- 成绩：删除 ----
    document.addEventListener('delete-grade', async (e) => {
      if (await elConfirm({ message: I18n.t('delete_confirm'), title: '确认删除', danger: true })) {
        const success = await Storage.deleteGrade(e.detail.id);
        if (success) {
          AppState.grades = await Storage.loadGrades();
          renderGradesPage();
          updateCharts();
        }
      }
    });

    // ---- 成绩详情：查看 ----
    document.addEventListener('view-grade-detail', async (e) => {
      const detail = e.detail;
      // detail: { grade (for minor), groupId (for major) }
      let gradeData;
      if (detail.groupId) {
        const groupGrades = await Storage.getMajorExamGroup(detail.groupId);
        Components.renderGradeDetail(null, groupGrades, detail.groupId);
        const totalScore = groupGrades.reduce((s, r) => s + r.score, 0);
        const totalTotal = groupGrades.reduce((s, r) => s + r.total, 0);
        let imageCount = 0;
        groupGrades.forEach(r => { if (r.imagePaths) imageCount += r.imagePaths.length; });
        gradeData = {
          isMajor: true,
          groupRecords: groupGrades,
          examName: groupGrades[0]?.examName,
          date: groupGrades[0]?.date,
          examType: 'major',
          _imageCount: imageCount,
          _totalScore: totalScore,
          _totalTotal: totalTotal,
        };
      } else if (detail.grade) {
        Components.renderGradeDetail(detail.grade, null, null);
        const r = detail.grade;
        gradeData = {
          isMajor: false,
          record: r,
          examName: r.examName,
          date: r.date,
          examType: r.examType || 'minor',
          _imageCount: r.imagePaths ? r.imagePaths.length : 0,
        };
      }
      navigateTo('grade-detail');
      if (gradeData) {
        // 等 DOM 渲染完成后再触发 AI
        setTimeout(() => AIChat.onShow('grade-detail', gradeData), 50);
      }
    });

    // ---- 科目详情：大考单科点击 ----
    document.addEventListener('view-subject-detail', (e) => {
      const grade = e.detail.grade;
      if (grade) {
        Components.renderSubjectDetail(grade);
      }
      navigateTo('subject-detail');
      if (grade) {
        const gradeData = {
          isMajor: (grade.examType === 'major'),
          record: grade,
          examName: grade.examName,
          date: grade.date,
          examType: grade.examType || 'major',
          _imageCount: grade.imagePaths ? grade.imagePaths.length : 0,
        };
        setTimeout(() => AIChat.onShow('subject-detail', gradeData), 50);
      }
    });

    // ---- 科目详情：返回按钮 ----
    $('#subject-detail-back-btn')?.addEventListener('click', () => {
      navigateTo('grade-detail');
    });
    $('#subject-detail-back-btn2')?.addEventListener('click', () => {
      navigateTo('grade-detail');
    });

    // ---- 成绩详情：编辑按钮 ----
    $('#detail-edit-btn')?.addEventListener('click', () => {
      const groupId = document.getElementById('page-grade-detail')?.dataset.groupId;
      const gradeId = document.getElementById('page-grade-detail')?.dataset.gradeId;
      if (groupId) {
        // Edit major exam group
        Storage.getMajorExamGroup(groupId).then(groupGrades => {
          navigateToAddGradeGroup(groupGrades, groupId);
        });
      } else if (gradeId) {
        // Edit single grade
        const grade = AppState.grades.find(g => g.id === gradeId);
        if (grade) navigateToAddGrade(grade);
      }
    });

    // ---- 成绩详情：删除按钮 ----
    $('#detail-delete-btn')?.addEventListener('click', async () => {
      if (!await elConfirm({ message: I18n.t('delete_confirm'), title: '确认删除', danger: true })) return;
      const groupId = document.getElementById('page-grade-detail')?.dataset.groupId;
      const gradeId = document.getElementById('page-grade-detail')?.dataset.gradeId;
      if (groupId) {
        await Storage.deleteMajorExamGroup(groupId);
      } else if (gradeId) {
        await Storage.deleteGrade(gradeId);
      }
      AppState.grades = await Storage.loadGrades();
      navigateTo('grades');
      renderGradesPage();
      updateCharts();
    });

    // ---- 成绩详情：编辑大考分组 ----
    document.addEventListener('edit-grade-group', async (e) => {
      const groupId = e.detail.groupId;
      const grades = await Storage.getMajorExamGroup(groupId);
      if (grades.length > 0) {
        // Navigate to add-grade in edit mode for major exam
        navigateToAddGradeGroup(grades, groupId);
      }
    });

    // ---- 成绩详情：删除大考分组 ----
    document.addEventListener('delete-grade-group', async (e) => {
      if (await elConfirm({ message: I18n.t('delete_confirm'), title: '确认删除', danger: true })) {
        await Storage.deleteMajorExamGroup(e.detail.groupId);
        AppState.grades = await Storage.loadGrades();
        renderGradesPage();
        updateCharts();
      }
    });

    // ---- 添加成绩：返回/取消 ----
    $('#grade-back-btn')?.addEventListener('click', () => {
      navigateTo('grades');
    });
    $('#grade-cancel-btn')?.addEventListener('click', () => {
      navigateTo('grades');
    });
    $('#detail-back-btn')?.addEventListener('click', () => navigateTo('grades'));

    // ---- 小考分数验证 ----
    $('#grade-score')?.addEventListener('input', validateGradeForm);
    $('#grade-total')?.addEventListener('input', validateGradeForm);

    // ---- 考试类型切换 ----
    $$('.exam-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if ($('#grade-edit-id')?.value) return; // 编辑模式禁止切换
        setExamType(btn.getAttribute('data-exam-type'));
      });
    });

    // ---- 成绩表单提交 ----
    $('#grade-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Sync panel data before submission (close panel if open)
      if (_currentPanelSubject) {
        closeSubjectEditPanel();
      }

      try {
        const editId = $('#grade-edit-id').value;
        const groupId = $('#grade-group-id').value;
        const examType = $('#grade-exam-type').value;

          if (editId) {
            // 编辑模式（单条记录）
            if (!validateGradeForm()) {
              alert(I18n.t('score_error'));
              return;
            }
            const subScores = getSubScoresData();
            const imagePaths = await savePendingImages();
            await Storage.updateGrade(editId, {
              subject: $('#grade-subject').value,
              score: parseInt($('#grade-score').value),
              total: parseInt($('#grade-total').value),
              examName: $('#grade-exam').value.trim(),
              date: $('#grade-date').value,
              subScores,
              imagePaths,
            });
          } else if (groupId && examType === 'major') {
          // 大考编辑模式（更新已有分组）
          if (!validateMajorExam()) {
            alert(I18n.t('score_error'));
            return;
          }
          const examName = $('#grade-exam').value.trim();
          const date = $('#grade-date').value;
          const subjectUpdates = {};
          $$('#major-subjects-list .major-subject-row').forEach(row => {
            const checked = row.querySelector('.major-checkbox').checked;
            if (!checked) return;
            const score = parseInt(row.querySelector('.major-score').value);
            const total = parseInt(row.querySelector('.major-total').value);
            const subject = row.getAttribute('data-subject');
            const classRank = parseInt(row.querySelector('.major-class-rank').value) || null;
            const gradeRank = parseInt(row.querySelector('.major-grade-rank').value) || null;
            if (!isNaN(score) && score >= 0) {
              subjectUpdates[subject] = { score, total: isNaN(total) ? 100 : total, classRank, gradeRank };
            }
          });
          if (Object.keys(subjectUpdates).length === 0) {
            alert('请至少填写一个科目的有效分数');
            return;
          }
          // Collect per-subject sub-scores and images
          const perSubjectSubScores = getMajorSubScoresData();
          const perSubjectImages = await getMajorImageData();
          if (perSubjectSubScores) {
            Object.keys(subjectUpdates).forEach(subj => {
              subjectUpdates[subj].subScores = perSubjectSubScores[subj] || null;
            });
          }
          if (perSubjectImages) {
            Object.keys(subjectUpdates).forEach(subj => {
              subjectUpdates[subj].imagePaths = perSubjectImages[subj] || null;
            });
          }
          await Storage.updateMajorExamGroup(groupId, {
            examName,
            date,
            subjectUpdates,
            totalClassRank: parseInt($('#total-class-rank').value) || null,
            totalClassTotal: parseInt($('#total-class-total').value) || null,
            totalGradeRank: parseInt($('#total-grade-rank').value) || null,
            totalGradeTotal: parseInt($('#total-grade-total').value) || null,
          });
        } else if (examType === 'major') {
          // 大考模式（批量保存多条科目记录）
          if (!validateMajorExam()) {
            alert(I18n.t('score_error'));
            return;
          }
          const examName = $('#grade-exam').value.trim();
          const date = $('#grade-date').value;
          const subjectGrades = [];
          $$('#major-subjects-list .major-subject-row').forEach(row => {
            const checked = row.querySelector('.major-checkbox').checked;
            if (!checked) return;
            const score = parseInt(row.querySelector('.major-score').value);
            const total = parseInt(row.querySelector('.major-total').value);
            const subject = row.getAttribute('data-subject');
            const classRank = parseInt(row.querySelector('.major-class-rank').value) || null;
            const gradeRank = parseInt(row.querySelector('.major-grade-rank').value) || null;
            if (!isNaN(score) && score >= 0) {
              subjectGrades.push({ subject, score, total: isNaN(total) ? 100 : total, classRank, gradeRank });
            }
          });
          if (subjectGrades.length === 0) {
            alert('请至少填写一个科目的有效分数');
            return;
          }
          // Collect per-subject sub-scores and images
          const perSubjectSubScores = getMajorSubScoresData();
          const perSubjectImages = await getMajorImageData();
          // Attach to each subject grade
          if (perSubjectSubScores) {
            subjectGrades.forEach(sg => {
              sg.subScores = perSubjectSubScores[sg.subject] || null;
            });
          }
          if (perSubjectImages) {
            subjectGrades.forEach(sg => {
              sg.imagePaths = perSubjectImages[sg.subject] || null;
            });
          }
          await Storage.addMajorGrades(subjectGrades, examName, date, {
            totalClassRank: parseInt($('#total-class-rank').value) || null,
            totalClassTotal: parseInt($('#total-class-total').value) || null,
            totalGradeRank: parseInt($('#total-grade-rank').value) || null,
            totalGradeTotal: parseInt($('#total-grade-total').value) || null,
          });
        } else {
          // 小考模式（单条保存）
          if (!validateGradeForm()) {
            alert(I18n.t('score_error'));
            return;
          }
          await Storage.addGrade({
            subject: $('#grade-subject').value,
            score: parseInt($('#grade-score').value),
            total: parseInt($('#grade-total').value),
            examName: $('#grade-exam').value.trim(),
            date: $('#grade-date').value,
            examType: 'minor',
            subScores: getSubScoresData(),
            imagePaths: await savePendingImages(),
          });
        }

        clearPendingImages();
        AppState.grades = await Storage.loadGrades();
        navigateTo('grades');
        renderGradesPage();
        updateCharts();
      } catch (err) {
        console.error('成绩保存失败:', err);
        alert('保存失败: ' + (err.message || '未知错误'));
      }
    });

    // ---- 保存按钮点击时确保表单提交 ----
    // 浏览器在 type="submit" 点击后会自动触发 submit 事件，
    // 加上 novalidate 确保 submit 事件不被 HTML5 校验拦截。

    // ---- 设置：语言 ----
    $$('#language-options .setting-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lang = btn.getAttribute('data-lang');
        AppState.settings.language = lang;
        await Storage.saveSettings(AppState.settings);
        I18n.setLang(lang);
        I18n.updatePageTexts();

        $$('#language-options .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const currentPage = AppState.currentPage;
        if (currentPage === 'home') renderHomePage();
        else if (currentPage === 'grades') renderGradesPage();
        else if (currentPage === 'settings') renderSettingsPage();
        else if (currentPage === 'user') renderUserPage();

        updateCharts();
      });
    });

    // ---- 设置：主题色 ----
    $$('#theme-colors .color-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const color = btn.getAttribute('data-color');
        AppState.settings.themeColor = color;
        await Storage.saveSettings(AppState.settings);
        document.documentElement.setAttribute('data-theme', color);

        $$('#theme-colors .color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const totalsByDate = Storage.calculateTotalScores(AppState.grades);
        GradeChart.updateTotal(totalsByDate);
      });
    });

    // ---- 设置：深色模式 ----
    $('#dark-mode-toggle')?.addEventListener('change', async (e) => {
      AppState.settings.darkMode = e.target.checked;
      await Storage.saveSettings(AppState.settings);
      document.documentElement.setAttribute('data-dark', e.target.checked ? 'true' : 'false');

      GradeChart.destroyAll();
      GradeChart.initTotal();
      GradeChart.initAllMinis(AppState.subjects);
      updateCharts();
    });

    // ---- TTS 设置：语速 ----
    $('#tts-rate-slider')?.addEventListener('input', async (e) => {
      const rate = parseFloat(e.target.value);
      const ttsRateEl = $('#tts-rate-value');
      if (ttsRateEl) ttsRateEl.textContent = rate;
      AppState.settings.ttsRate = rate;
      await Storage.saveSettings(AppState.settings);
    });

    // ---- TTS 设置：朗读声音 ----
    $('#tts-voice-select')?.addEventListener('change', async (e) => {
      AppState.settings.ttsVoice = e.target.value;
      await Storage.saveSettings(AppState.settings);
    });

    // ---- TTS 设置：试听 ----
    $('#tts-test-btn')?.addEventListener('click', async () => {
      const settings = AppState.settings || {};
      const rate = settings.ttsRate || 0.8;
      const voice = settings.ttsVoice || 'zh-CN-XiaoxiaoNeural';
      try {
        const result = await window.api.ttsSpeak({ text: '测试', rate, voice });
        if (result.success && result.audio) {
          const audio = new Audio('data:audio/mp3;base64,' + result.audio);
          audio.play();
          return;
        }
      } catch (err) {
        console.error('TTS test error:', err);
      }
      // fallback
      const utterance = new SpeechSynthesisUtterance('测试');
      utterance.rate = rate;
      utterance.lang = 'zh-CN';
      speechSynthesis.speak(utterance);
    });

    // ---- AI 设置：添加配置 ----
    $('#ai-add-config-btn')?.addEventListener('click', () => openAiConfigModal(null));

    // ---- AI 设置：类型选择 ----
    $$('#ai-type-options .ai-type-card').forEach(card => {
      card.addEventListener('click', () => {
        $$('#ai-type-options .ai-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input[type="radio"]').checked = true;
        const type = card.getAttribute('data-type');
        updateAiBaseUrlVisibility(type);
        // 自动填充默认 model
        const modelInput = $('#ai-config-model');
        if (!modelInput.value) {
          modelInput.value = type === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini';
        }
      });
    });

    // ---- AI 设置：查询可用模型 ----
    $('#ai-fetch-models-btn')?.addEventListener('click', async () => {
      const btn = $('#ai-fetch-models-btn');
      const hintEl = $('#ai-models-hint');
      const modelInput = $('#ai-config-model');
      const modelSelect = $('#ai-model-select');
      const baseUrl = $('#ai-config-baseurl').value.trim();
      const apiKey = $('#ai-config-apikey').value.trim();

      if (!apiKey) {
        hintEl.textContent = '⚠️ 请先填写 API Key';
        hintEl.style.color = 'var(--danger)';
        return;
      }

      btn.classList.add('loading');
      btn.disabled = true;
      btn.textContent = '查询中…';
      hintEl.textContent = '';
      hintEl.style.color = '';

      try {
        const res = await window.api.aiFetchModels({ baseUrl, apiKey });
        if (res && res.success && res.models && res.models.length > 0) {
          // 用下拉框展示所有模型
          modelSelect.innerHTML = res.models.map(m =>
            `<option value="${m}">${m}</option>`
          ).join('');
          modelSelect.classList.remove('hidden');
          // 选中当前已填的模型（如果有）
          if (modelInput.value) {
            const idx = Array.from(modelSelect.options).findIndex(o => o.value === modelInput.value);
            if (idx >= 0) modelSelect.selectedIndex = idx;
          }
          hintEl.innerHTML = '<span style="color:var(--success);font-weight:500;">✅ 查询到 ' + res.models.length + ' 个模型</span>';
          hintEl.style.color = '';
        } else {
          hintEl.textContent = '❌ ' + ((res && res.error) || '查询失败');
          hintEl.style.color = 'var(--danger)';
          modelSelect.classList.add('hidden');
        }
      } catch (e) {
        hintEl.textContent = '❌ 查询失败：' + e.message;
        hintEl.style.color = 'var(--danger)';
        modelSelect.classList.add('hidden');
      } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
        btn.textContent = '🔍 查询模型';
      }
    });

    // ---- AI 设置：下拉选择模型后自动填入输入框 ----
    $('#ai-model-select')?.addEventListener('change', () => {
      const sel = $('#ai-model-select');
      const input = $('#ai-config-model');
      if (sel.value) input.value = sel.value;
    });

    // ---- AI 设置：保存配置 ----
    $('#ai-config-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('#ai-config-id').value;
      const name = $('#ai-config-name').value.trim();
      const type = $('#ai-type-options .ai-type-card.selected')?.getAttribute('data-type') || 'openai';
      const apiKey = $('#ai-config-apikey').value.trim();
      const baseUrl = $('#ai-config-baseurl').value.trim();
      const model = $('#ai-config-model').value.trim();

      if (!name || !apiKey || !model) {
        alert('请填写完整信息');
        return;
      }

      const data = { name, type, apiKey, baseUrl, model };
      if (id) {
        // 传入 AppState.settings 让 Storage 复用引用，避免双写
        await Storage.updateAiConfig(id, data, AppState.settings);
        const list = AppState.settings.aiConfigs || [];
        const idx = list.findIndex(c => c.id === id);
        if (idx >= 0) list[idx] = { ...list[idx], ...data };
      } else {
        // 同上
        const created = await Storage.addAiConfig(data, AppState.settings);
        const list = AppState.settings.aiConfigs || [];
        if (!list.find(c => c.id === created.id)) {
          list.push(created);
        }
        if (!AppState.settings.activeAiConfigId) {
          AppState.settings.activeAiConfigId = created.id;
        }
      }
      closeAiConfigModal();
      renderAiConfigsList();
      renderAiProviders();
      Object.values(AIChat.panels).forEach(s => AIChat._refreshConfigSelect(s));
    });

    // ---- AI 设置：删除配置 ----
    $('#ai-config-delete-btn')?.addEventListener('click', async () => {
      const id = $('#ai-config-id').value;
      if (!id) return;
      if (!await elConfirm({ message: I18n.t('ai_config_delete_confirm'), title: '确认删除', danger: true })) return;
      await Storage.deleteAiConfig(id, AppState.settings);
      const list = AppState.settings.aiConfigs || [];
      const idx = list.findIndex(c => c.id === id);
      if (idx >= 0) list.splice(idx, 1);
      if (AppState.settings.activeAiConfigId === id) {
        AppState.settings.activeAiConfigId = list[0]?.id || null;
      }
      closeAiConfigModal();
      renderAiConfigsList();
      renderAiProviders();
      Object.values(AIChat.panels).forEach(s => AIChat._refreshConfigSelect(s));
    });

    // ---- AI 设置：关闭模态框 ----
    $('#ai-config-modal-close')?.addEventListener('click', closeAiConfigModal);
    $('#ai-config-cancel-btn')?.addEventListener('click', closeAiConfigModal);
    $('#ai-config-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeAiConfigModal();
    });

    // ---- AI 服务商列表：展开/收起 ----
    $('#ai-providers-toggle')?.addEventListener('click', () => {
      _providersExpanded = !_providersExpanded;
      renderAiProviders();
    });

    // ---- AI 设置：恢复默认提示词 ----
    $('#ai-reset-prompt-btn')?.addEventListener('click', async () => {
      $('#ai-prompt-input').value = Storage.DEFAULT_AI_PROMPT;
      await saveAiPromptFromInput();
    });

    // ---- AI 设置：保存提示词（blur 时） ----
    $('#ai-prompt-input')?.addEventListener('blur', saveAiPromptFromInput);

    // ---- 下载设置：限速滑块 ----
    $('#download-speed-limit')?.addEventListener('input', async (e) => {
      const value = parseInt(e.target.value);
      const speedValue = $('#download-speed-value');
      speedValue.textContent = value === 0 ? I18n.t('download_speed_limit') === '下载限速' ? '无限制' : 'Unlimited' : `${value} MB/s`;
      await saveDownloadSettings();
    });

    // ---- 下载设置：线程数滑块 ----
    $('#download-threads')?.addEventListener('input', async (e) => {
      const value = parseInt(e.target.value);
      $('#download-threads-value').textContent = value;
      await saveDownloadSettings();
    });

    // ---- 下载设置：下载源选择 ----
    $$('#download-source-options .setting-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const source = btn.getAttribute('data-source');
        $$('#download-source-options .setting-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('#download-custom-source').classList.toggle('hidden', source !== 'custom');
        await saveDownloadSettings();
      });
    });

    // ---- 下载设置：自定义源输入 ----
    $('#download-custom-url')?.addEventListener('change', async () => {
      await saveDownloadSettings();
    });

    // ---- 下载设置：清除缓存 ----
    $('#clear-cache-btn')?.addEventListener('click', async () => {
      const zh = (AppState.settings.language || 'zh') === 'zh';
      if (!await elConfirm({ message: zh ? '确定要清除所有缓存吗？' : 'Are you sure you want to clear all cache?', title: '确认' })) return;
      const result = await window.api.downloadClearCache();
      if (result.success) {
        alert(I18n.t('download_speed_limit') === '下载限速' ? `已清除 ${result.clearedSizeFormatted} 缓存` : `Cleared ${result.clearedSizeFormatted} cache`);
      } else {
        alert(I18n.t('download_speed_limit') === '下载限速' ? '清除缓存失败：' + result.error : 'Failed to clear cache: ' + result.error);
      }
    });

    // ---- 数据备份 / 还原 ----
    $('#backup-btn')?.addEventListener('click', async () => {
      const zh = (AppState.settings.language || 'zh') === 'zh';
      if (!await elConfirm({ message: zh
        ? '即将备份以下数据：\n\n• 历史成绩\n• 软件设置\n• OpenMAIC 登录状态\n\n点击「确定」后请选择保存位置。'
        : 'This will back up:\n\n• History grades\n• App settings\n• OpenMAIC login state\n\nClick OK then choose where to save.', title: '确认备份' })) return;
      try {
        const result = await window.api.backupCreate();
        if (result.canceled) return;
        if (result.success) {
          const s = result.summary || {};
          alert(zh
            ? `备份成功！\n文件：${result.filePath}\n\n包含：历史成绩 ${s.grades || 0} 条、设置 ${s.hasSettings ? '已包含' : '无'}、用户 ${s.hasUser ? '已包含' : '无'}、OpenMAIC Cookie ${s.openmaicCookies || 0} 个`
            : `Backup succeeded!\nFile: ${result.filePath}\n\nIncludes: ${s.grades || 0} grades, settings ${s.hasSettings ? 'yes' : 'no'}, user ${s.hasUser ? 'yes' : 'no'}, OpenMAIC cookies ${s.openmaicCookies || 0}`);
        } else {
          alert(zh ? '备份失败：' + result.error : 'Backup failed: ' + result.error);
        }
      } catch (err) {
        alert(zh ? '备份失败：' + err.message : 'Backup failed: ' + err.message);
      }
    });

    $('#restore-btn')?.addEventListener('click', async () => {
      const zh = (AppState.settings.language || 'zh') === 'zh';
      if (!await elConfirm({ message: zh
        ? '即将从备份文件恢复数据。\n\n注意：当前的历史成绩、软件设置和 OpenMAIC 登录状态将被备份文件中的内容覆盖。\n\n点击「确定」后请选择备份文件。'
        : 'This will restore data from a backup file.\n\nWarning: current grades, settings and OpenMAIC login state will be overwritten.\n\nClick OK then choose the backup file.', title: '确认还原' })) return;
      try {
        const result = await window.api.backupRestore();
        if (result.canceled) return;
        if (result.success) {
          const s = result.summary || {};
          let cookieNote = '';
          if (s.openmaicCookies > 0) {
            cookieNote = zh
              ? `\nOpenMAIC 登录状态已还原 ${s.openmaicCookies} 个 Cookie${s.openmaicCookieErrors ? `（${s.openmaicCookieErrors} 个失败）` : ''}，请在 OpenMAIC 页面刷新或重启以生效。`
              : `\nOpenMAIC login restored (${s.openmaicCookies} cookies${s.openmaicCookieErrors ? `, ${s.openmaicCookieErrors} failed` : ''}); refresh or restart OpenMAIC to apply.`;
          } else if (zh) {
            cookieNote = '\n（备份中无 OpenMAIC Cookie）';
          }
          alert(zh
            ? `还原成功！\n\n已恢复：历史成绩 ${s.grades || 0} 条、设置 ${s.hasSettings ? '已恢复' : '无'}、用户 ${s.hasUser ? '已恢复' : '无'}${cookieNote}\n\n界面将重新加载以应用更改。`
            : `Restore succeeded!\n\nRestored: ${s.grades || 0} grades, settings ${s.hasSettings ? 'yes' : 'no'}, user ${s.hasUser ? 'yes' : 'no'}${cookieNote}\n\nThe UI will reload to apply changes.`);
          // 重新加载界面以应用还原的数据（设置 / 成绩 / 用户）
          setTimeout(() => location.reload(), 700);
        } else {
          alert(zh ? '还原失败：' + result.error : 'Restore failed: ' + result.error);
        }
      } catch (err) {
        alert(zh ? '还原失败：' + err.message : 'Restore failed: ' + err.message);
      }
    });

    // ---- OCR：启动/停止 ----
    const ocrStartBtn = $('#ocr-start-btn');
    const ocrStopBtn = $('#ocr-stop-btn');
    if (ocrStartBtn) {
      ocrStartBtn.addEventListener('click', handleOCRStart);
    }
    if (ocrStopBtn) {
      ocrStopBtn.addEventListener('click', handleOCRStop);
    }
    renderOCRStatus();

    // ---- 用户：编辑信息 ----
    $('#edit-user-btn')?.addEventListener('click', () => {
      openUserModal();
    });

    $('#user-modal-close')?.addEventListener('click', closeUserModal);
    $('#user-modal-cancel')?.addEventListener('click', closeUserModal);
    $('#user-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeUserModal();
    });

    // ---- 用户表单提交 ----
    $('#user-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = $('#edit-username').value.trim();
      const grade = $('#edit-grade').value.trim();
      const school = $('#edit-school').value.trim();
      const selectedAge = $('#edit-age-options .age-card.selected');
      if (!name || !selectedAge) return;

      const ageGroup = selectedAge.getAttribute('data-age');
      AppState.user = { ...AppState.user, name, ageGroup, grade, school };

      // 保存头像
      const avatarInput = $('#avatar-input');
      if (avatarInput.files && avatarInput.files[0]) {
        const file = avatarInput.files[0];
        const reader = new FileReader();
        reader.onload = async (ev) => {
          AppState.user.avatar = ev.target.result;
          await Storage.saveUser(AppState.user);
          finishUserSave(ageGroup);
        };
        reader.readAsDataURL(file);
      } else {
        await Storage.saveUser(AppState.user);
        finishUserSave(ageGroup);
      }
    });

    function finishUserSave(ageGroup) {
      AppState.subjects = Storage.getSubjectsForAge(ageGroup);
      AppState.settings.ageGroup = ageGroup;
      Storage.saveSettings(AppState.settings);

      closeUserModal();
      renderUserPage();

      GradeChart.destroyAll();
      GradeChart.buildMiniGrid(AppState.subjects);
      GradeChart.initTotal();
      GradeChart.initAllMinis(AppState.subjects);
      updateCharts();

      if (AppState.currentPage === 'home') {
        renderHomePage();
      }
    }

    // ---- 编辑用户：年龄选择 ----
    $$('#edit-age-options .age-card').forEach(card => {
      card.addEventListener('click', () => {
        $$('#edit-age-options .age-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        card.querySelector('input[type="radio"]').checked = true;
      });
    });

    // ---- 编辑用户：头像上传 ----
    $('#avatar-upload-btn')?.addEventListener('click', () => {
      $('#avatar-input')?.click();
    });

    $('#avatar-input')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = $('#user-avatar-preview');
        if (preview) {
          preview.innerHTML = `<img src="${ev.target.result}" alt="avatar">`;
        }
      };
      reader.readAsDataURL(file);
    });

    // ---- 键盘：ESC 关闭当前页面/模态框 ----
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (AppState.currentPage === 'add-grade') {
          // If panel is open, close panel first
          if (_currentPanelSubject) {
            closeSubjectEditPanel();
            return;
          }
          navigateTo('grades');
        }
        if (!$('#user-modal').classList.contains('hidden')) closeUserModal();
      }
    });

    // ---- 单词本（Wordbook）事件绑定 ----
    initWordbook();

    // ---- 科目编辑侧面板：关闭 ----
    document.getElementById('panel-close-btn').addEventListener('click', closeSubjectEditPanel);

    // ---- 科目编辑侧面板：添加小题分 ----
    document.getElementById('btn-panel-add-sub-score').addEventListener('click', () => {
      if (!_currentPanelSubject) return;
      _subjectFormData[_currentPanelSubject].subScores.push({ type: 'choice', score: '', total: '' });
      renderPanelSubScores();
    });

    // ---- 科目编辑侧面板：上传图片 ----
    document.getElementById('btn-panel-upload-image').addEventListener('click', () => {
      document.getElementById('panel-image-file-input').click();
    });
    document.getElementById('panel-image-file-input').addEventListener('change', async (e) => {
      if (!_currentPanelSubject) return;
      const images = _subjectFormData[_currentPanelSubject].images;
      const files = e.target.files;
      for (const file of files) {
        const base64 = await fileToBase64(file);
        const name = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        images.push({
          base64,
          name,
          previewUrl: URL.createObjectURL(file),
          saved: false,
          path: null,
        });
      }
      renderPanelImages();
      e.target.value = '';
    });

    // ---- 小题分初始化 ----
    initSubScoreToggle();

    // ---- 图片上传初始化 ----
    initImageUpload();

    // ---- 关闭确认框（自定义模态框，替代原生 dialog） ----
    initCloseConfirm();

    // ---- 听写功能 ----
    initDictation();

    // ---- 性能监控：WebView 加载耗时 ----
    const courseWebview = $('#course-webview');
    if (courseWebview) {
      courseWebview.addEventListener('did-finish-load', () => {
        if (typeof PerfMonitor !== 'undefined') PerfMonitor.markWebviewLoadEnd();
      });
      // 监听 webview 崩溃，清理状态
      courseWebview.addEventListener('crashed', () => {
        console.error('[Perf] WebView 崩溃');
        if (typeof PerfMonitor !== 'undefined') {
          console.log('[Perf] 崩溃前性能报告:');
          PerfMonitor.report();
        }
      });
    }
  }

  // ==================== 自定义关闭确认框 ====================

  function initCloseConfirm() {
    const overlay = $('#close-confirm-overlay');
    const btnMinimize = $('#close-confirm-minimize');
    const btnQuit = $('#close-confirm-quit');
    if (!overlay) return;

    /** 显示确认框 */
    function showConfirm() {
      overlay.classList.remove('hidden');
      btnMinimize.focus();
    }

    /** 隐藏确认框 */
    function hideConfirm() {
      overlay.classList.add('hidden');
    }

    /** 处理用户选择 */
    function handleChoice(choice) {
      hideConfirm();
      window.api.closeConfirmResult(choice);
    }

    // 监听主进程通知：显示关闭确认框
    window.api.onCloseConfirmShow(showConfirm);

    // 按钮事件
    btnMinimize.addEventListener('click', () => handleChoice('minimize'));
    btnQuit.addEventListener('click', () => handleChoice('quit'));

    // ESC 键隐藏（默认行为是最小化到托盘）
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        handleChoice('minimize');
      }
    });
  }

  // ==================== 听写功能 ====================

  let _dictationWords = [];
  let _dictationCurrentIndex = 0;
  let _dictationImages = []; // 多张图片数组
  let _dictationTtsPlaying = false; // TTS 播放中标记：期间忽略声音检测结果，防止朗读声被拾取形成反馈
  let _dictationRevealed = false; // 听写模式：默认隐藏答案（像密码框掩码），点"显示答案"才显示

  function initDictation() {
    const uploadArea = $('#dictation-upload-area');
    const fileInput = $('#dictation-file-input');
    const previewList = $('#dictation-preview-list');
    const ocrBtn = $('#dictation-ocr-btn');
    const ocrLoading = $('#dictation-ocr-loading');
    const wordsSection = $('#dictation-words-section');
    const playBtn = $('#dictation-play-btn');
    const prevBtn = $('#dictation-prev-btn');
    const nextBtn = $('#dictation-next-btn');
    const revealBtn = $('#dictation-reveal-btn');

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      if (files.length > 0) {
        for (const file of files) handleDictationFile(file);
      }
    });

    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        for (const file of files) handleDictationFile(file);
      }
      fileInput.value = '';
    });

    ocrBtn.addEventListener('click', async () => {
      if (_dictationImages.length === 0) return;
      ocrLoading.classList.remove('hidden');
      ocrBtn.disabled = true;
      try {
        let allText = '';
        for (const img of _dictationImages) {
          const result = await recognizeImageText(img.dataUrl);
          if (result.success && result.text) {
            allText += '\n' + result.text;
          }
        }
        if (allText.trim()) {
          parseOCRWords(allText);
          wordsSection.classList.remove('hidden');
          renderDictationWords();
          setDictationCurrentIndex(0);
        } else {
          alert('识别失败，请重试');
        }
      } catch (err) {
        console.error('recognize error:', err);
        alert('识别出错：' + err.message);
      } finally {
        ocrLoading.classList.add('hidden');
        ocrBtn.disabled = false;
      }
    });

    playBtn.addEventListener('click', () => {
      if (_dictationWords.length > 0) {
        speakWord(_dictationWords[_dictationCurrentIndex]);
      }
    });

    prevBtn.addEventListener('click', () => {
      if (_dictationCurrentIndex > 0) {
        setDictationCurrentIndex(_dictationCurrentIndex - 1);
      }
    });

    nextBtn.addEventListener('click', () => {
      if (_dictationCurrentIndex < _dictationWords.length - 1) {
        setDictationCurrentIndex(_dictationCurrentIndex + 1);
      }
    });

    // 显示 / 隐藏答案（听写模式）：默认隐藏，点按钮才显示，不重新朗读
    function updateRevealUI() {
      if (revealBtn) {
        revealBtn.textContent = _dictationRevealed ? '隐藏答案' : '显示答案';
      }
      const section = $('#dictation-words-section');
      if (section) section.classList.toggle('answer-hidden', !_dictationRevealed);
    }

    if (revealBtn) {
      revealBtn.addEventListener('click', () => {
        _dictationRevealed = !_dictationRevealed;
        updateRevealUI();
        refreshDictationDisplay();
      });
    }
    updateRevealUI();

    function handleDictationFile(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        _dictationImages.push({
          id: Date.now() + Math.random().toString(36).slice(2),
          dataUrl: e.target.result,
          name: file.name,
        });
        renderDictationPreviews();
        ocrBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }

    function renderDictationPreviews() {
      previewList.innerHTML = '';
      if (_dictationImages.length === 0) {
        previewList.classList.add('hidden');
        ocrBtn.disabled = true;
        return;
      }
      previewList.classList.remove('hidden');
      _dictationImages.forEach((img, index) => {
        const item = document.createElement('div');
        item.className = 'dictation-preview-item';
        item.innerHTML = `
          <span class="preview-index">${index + 1}</span>
          <img src="${img.dataUrl}" alt="预览${index + 1}">
          <div class="preview-actions">
            <button class="btn-up" ${index === 0 ? 'disabled' : ''}>上移</button>
            <button class="btn-down" ${index === _dictationImages.length - 1 ? 'disabled' : ''}>下移</button>
            <button class="btn-remove">删除</button>
          </div>
        `;
        item.querySelector('.btn-up').addEventListener('click', () => {
          if (index > 0) {
            [_dictationImages[index], _dictationImages[index - 1]] = [_dictationImages[index - 1], _dictationImages[index]];
            renderDictationPreviews();
          }
        });
        item.querySelector('.btn-down').addEventListener('click', () => {
          if (index < _dictationImages.length - 1) {
            [_dictationImages[index], _dictationImages[index + 1]] = [_dictationImages[index + 1], _dictationImages[index]];
            renderDictationPreviews();
          }
        });
        item.querySelector('.btn-remove').addEventListener('click', () => {
          _dictationImages.splice(index, 1);
          renderDictationPreviews();
        });
        previewList.appendChild(item);
      });
    }

    function resetDictationToInitial() {
      _dictationWords = [];
      _dictationCurrentIndex = 0;
      _dictationImages = [];
      _dictationRevealed = false; // 回到默认隐藏（像密码框）
      renderDictationPreviews();
      wordsSection.classList.add('hidden');
      $('#dictation-current-word').textContent = '---';
      $('#dictation-words-container').innerHTML = '';
      $('#dictation-total-count').textContent = '0';
      $('#dictation-total').textContent = '0';
      $('#dictation-current-index').textContent = '1';
      updateRevealUI();
    }

    function fileToBase64FromBlob(blob) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }

    /**
     * 将 OCR 原始文本解析为结构化词条数组。
     * 输入格式：英语教材词汇表（双栏），每条含 单词 + 音标 + 词性·中文释义 + 页码。
     * 支持多行换行的词条（音标或释义跨行）。
     *
     * _dictationWords 变为数组，每项：
     *   { word: string, phonetic: string, posMeaning: string, page: string }
     */
    function parseOCRWords(text) {
      const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
      const entries = [];

      // ── 1. 过滤非词条行（大标题 / 注释 / Unit 标题 / 纯分隔符）──
      const TITLE_RE = /^(Words\s+and\s+Expressions|（注[：:]?.*|在英式和美式发音|Unit\s+\d|[\s_\-—–·•。，、；:：!！?？()（）.,]+)$/;

      // ── 2. 词条起始行正则：单词(字母开头) + 至少一个/phonetic/模式 ──
      // 匹配如: textbook /tekstbʊk/ n. 教科书 p.1
      //       novel /'nɒvl/,/'nɑːvl/ n. (长篇) 小说 p.4
      //       look up （在词典...中查过 p.3   （无音标的特殊词条）
      //       pay attention to 注意；关注 p.6  （无音标的多词短语）
      const ENTRY_HEAD_RE = /^([A-Za-z][\w\s'-]{1,40})\s+(\/[^\/]+(?:,\s*\/[^\/]+)*\/?(?:\s*.*)?)$/;
      const PHONETIC_ONLY_RE = /^\/[^\/]*\/(?:,\s*\/[^\/]*\/)*\s*$/;    // 纯音标续行
      const PAGE_RE = /[Pp]\.?\s*(\d+)/;                                // 页码

      let pending = null;

      for (const raw of lines) {
        // 跳过标题/注释/分隔行
        if (TITLE_RE.test(raw)) continue;

        // 尝试匹配新词条头部
        const m = ENTRY_HEAD_RE.exec(raw);
        if (m) {
          // 保存上一个未完成的词条
          if (pending) entries.push(pending);

          const wordPart = m[1].trim();
          const rest = (m[2] || '').trim();

          // 从 rest 中提取页码
          const pm = PAGE_RE.exec(rest);
          const page = pm ? pm[1] : '';
          const body = rest.replace(PAGE_RE, '').trim();

          pending = {
            word: wordPart,
            phonetic: '',
            posMeaning: '',
            page: page
          };

          // 拆分 phonetic 和 posMeaning
          // body 可能是: "/tekstbʊk/ n. 教科书；课本" 或 "n. 教科书；课本"
          if (/^\//.test(body)) {
            // 以 / 开头 → 提取所有 /.../ 作为 phonetic，剩余为释义
            const phMatches = body.match(/\/[^\/]+/g);
            if (phMatches) {
              pending.phonetic = phMatches.join(', ');
            }
            const afterPh = body.replace(/\/[^\/]+\//g, '').trim();
            pending.posMeaning = afterPh;
          } else {
            // 不以 / 开头 → 全部作为释义（无音标词条）
            pending.posMeaning = body;
          }
          continue;
        }

        // ── 续行处理 ──
        if (!pending) continue; // 无前导词条则跳过孤立行

        if (PHONETIC_ONLY_RE.test(raw)) {
          // 纯音标续行（如 /kɑːnvər'seɪʛn/）
          pending.phonetic += (pending.phonetic ? ' ' : '') + raw.trim();
        } else if (PAGE_RE.test(raw)) {
          // 页码行
          const pm = PAGE_RE.exec(raw);
          if (!pending.page) pending.page = pm[1];
        } else {
          // 释义续行（中文为主）
          pending.posMeaning += (pending.posMeaning ? ' ' : '') + raw.trim();
        }
      }

      // 推送最后一个词条
      if (pending) entries.push(pending);

      // 过滤掉无效词条（没有单词或没有任何有用信息）
      _dictationWords = entries.filter(e =>
        e.word && e.word.length > 0 && (e.posMeaning || e.phonetic || e.page)
      );
    }

    function renderDictationWords() {
      const container = $('#dictation-words-container');
      container.innerHTML = '';
      _dictationWords.forEach((entry, index) => {
        const div = document.createElement('div');
        div.className = 'word-item' + (index === _dictationCurrentIndex ? ' active' : '');
        if (_dictationRevealed) {
          // 列表项：单词 + 音标简览 + 释义摘要
          const phoneticPreview = entry.phonetic ? `<span class="word-item-phonetic">${escapeHtml(entry.phonetic)}</span>` : '';
          const meaningPreview = entry.posMeaning ? `<span class="word-item-meaning">${escapeHtml(entry.posMeaning)}</span>` : '';
          const pageBadge = entry.page ? `<span class="word-item-page">p.${entry.page}</span>` : '';
          div.innerHTML =
            `<span class="word-item-name">${escapeHtml(entry.word)}</span>` +
            phoneticPreview +
            meaningPreview +
            pageBadge;
        } else {
          // 隐藏模式：像密码框一样用圆点掩码，仅保留长度暗示
          const mask = entry.word ? maskBullets(entry.word) : maskBullets('', 3);
          div.innerHTML = `<span class="word-item-name word-item-masked">${mask}</span>`;
        }
        div.addEventListener('click', () => setDictationCurrentIndex(index));
        container.appendChild(div);
      });
      $('#dictation-total-count').textContent = _dictationWords.length;
      $('#dictation-total').textContent = _dictationWords.length;
    }

    function maskBullets(text, fixedLen) {
      if (!text) return '';
      const n = fixedLen != null ? fixedLen : Math.max(3, String(text).length);
      return '•'.repeat(n);
    }

    // 刷新主卡片 + 单词列表的显示内容（不触发朗读）
    function refreshDictationDisplay() {
      const entry = _dictationWords[_dictationCurrentIndex];
      if (!entry) return;
      $('#dictation-current-index').textContent = _dictationCurrentIndex + 1;
      // 主卡片：单词 + 音标 + 词性·释义 + 页码，隐藏时一律用圆点掩码
      const wordEl = $('#dictation-current-word');
      if (wordEl) wordEl.textContent = _dictationRevealed
        ? (entry.word || '---')
        : (entry.word ? maskBullets(entry.word) : '---');
      const phoneticEl = $('#dictation-current-phonetic');
      if (phoneticEl) phoneticEl.textContent = _dictationRevealed
        ? (entry.phonetic || '')
        : (entry.phonetic ? maskBullets(entry.phonetic, 8) : '');
      const meaningEl = $('#dictation-current-meaning');
      if (meaningEl) meaningEl.textContent = _dictationRevealed
        ? (entry.posMeaning || '')
        : (entry.posMeaning ? maskBullets(entry.posMeaning, 12) : '');
      const pageEl = $('#dictation-current-page');
      if (pageEl) pageEl.textContent = _dictationRevealed
        ? (entry.page ? `p.${entry.page}` : '')
        : (entry.page ? maskBullets(null, 3) : '');
      prevBtn.disabled = _dictationCurrentIndex === 0;
      nextBtn.disabled = _dictationCurrentIndex === _dictationWords.length - 1;
      renderDictationWords();
    }

    function setDictationCurrentIndex(index) {
      _dictationCurrentIndex = index;
      refreshDictationDisplay();
      speakWord(_dictationWords[index].word);
    }

    async function speakWord(word) {
      if (!word) return;
      _dictationTtsPlaying = true;
      try {
        const settings = AppState.settings || {};
        const rate = settings.ttsRate || 0.8;
        // 默认英文语音（朗读英语单词）
        const voice = settings.ttsVoice || 'en-US-JennyNeural';
        const result = await window.api.ttsSpeak({ text: word, rate, voice });
        if (result.success && result.audio) {
          const audio = new Audio('data:audio/mp3;base64,' + result.audio);
          // 安全兜底：即使 onended 因异常未触发，也在 15s 后强制解除标记
          const ttsSafety = setTimeout(() => { _dictationTtsPlaying = false; }, 15000);
          audio.onended = () => { clearTimeout(ttsSafety); _dictationTtsPlaying = false; };
          audio.onerror = () => { clearTimeout(ttsSafety); _dictationTtsPlaying = false; };
          audio.play().catch(() => { clearTimeout(ttsSafety); _dictationTtsPlaying = false; });
          return;
        }
        console.warn('TTS server failed, falling back to speechSynthesis:', result?.error);
        fallbackSpeak(word, rate);
      } catch (err) {
        console.error('TTS speak error:', err);
        fallbackSpeak(word, 0.8);
      }
    }

    function fallbackSpeak(word, rate) {
      try {
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.rate = rate;
        utterance.lang = 'en-US';  // 默认英文朗读英语单词
        // TTS 结束后才解除"播放中"标记，避免反馈回路
        const ttsSafety = setTimeout(() => { _dictationTtsPlaying = false; }, 15000);
        utterance.onend = () => { clearTimeout(ttsSafety); _dictationTtsPlaying = false; };
        utterance.onerror = () => { clearTimeout(ttsSafety); _dictationTtsPlaying = false; };
        speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Fallback TTS failed:', e);
        _dictationTtsPlaying = false;
      }
    }

  }

  // ==================== 添加/编辑成绩页面 ====================

  function navigateToAddGrade(grade) {
    _editingGrade = grade;
    const title = $('#page-add-grade-title');
    const editId = $('#grade-edit-id');

    // 重置验证状态
    $('#score-error').classList.add('hidden');
    $('#grade-score').classList.remove('input-error');

    if (grade) {
      // 编辑模式：单科目，隐藏切换
      title.textContent = I18n.t('edit_grade');
      editId.value = grade.id;
      $('#exam-type-toggle').classList.add('hidden');
      Components.renderGradeModalSubjects(AppState.subjects, grade.subject);
      $('#grade-score').value = grade.score;
      $('#grade-total').value = grade.total;
      $('#grade-exam').value = grade.examName || '';
      $('#grade-date').value = grade.date;
      $('#grade-exam-type').value = 'minor';
      $('#minor-exam-fields').classList.remove('hidden');
      $('#major-exam-fields').classList.add('hidden');
    } else {
      // 添加模式
      title.textContent = I18n.t('add_grade');
      editId.value = '';
      $('#exam-type-toggle').classList.remove('hidden');
      Components.renderGradeModalSubjects(AppState.subjects);
      $('#grade-exam-type').value = 'minor';
      $('#grade-score').value = '';
      $('#grade-total').value = 100;
      $('#grade-exam').value = '';
      $('#grade-date').value = new Date().toISOString().split('T')[0];
      setExamType('minor');
    }

    // Reset sub-scores and images
    populateSubScores(grade ? (grade.subScores || null) : null);
    clearPendingImages();
    if (grade && grade.imagePaths) {
      populateImages(grade.imagePaths);
    }

    navigateTo('add-grade');
  }

  // ==================== 编辑大考分组 ====================

  function navigateToAddGradeGroup(groupGrades, groupId) {
    _editingGrade = { groupId };
    const title = $('#page-add-grade-title');
    title.textContent = I18n.t('edit_grade');
    $('#grade-edit-id').value = ''; // No single edit ID for group
    $('#grade-group-id').value = groupId;
    $('#exam-type-toggle').classList.add('hidden');

    // Set to major exam mode
    $('#grade-exam-type').value = 'major';
    $('#minor-exam-fields').classList.add('hidden');
    $('#major-exam-fields').classList.remove('hidden');

    // Pre-fill major exam subjects
    const container = $('#major-subjects-list');
    const recordsBySubject = {};
    groupGrades.forEach(r => { recordsBySubject[r.subject] = r; });

    // Initialize subject form data from existing records
    _subjectFormData = {};
    AppState.subjects.forEach(subj => {
      const record = recordsBySubject[subj];
      _subjectFormData[subj] = {
        subScores: record ? (record.subScores ? [...record.subScores] : []) : [],
        images: record && record.imagePaths
          ? record.imagePaths.map(path => ({ previewUrl: path, base64: null, name: null, saved: true, path }))
          : [],
      };
    });

    container.innerHTML = AppState.subjects.map(subj => {
      const record = recordsBySubject[subj];
      const score = record ? record.score : '';
      const total = record ? record.total : 100;
      const checked = record ? 'checked' : '';
      const classRank = record ? (record.classRank || '') : '';
      const gradeRank = record ? (record.gradeRank || '') : '';

      return `
        <div class="major-subject-wrapper" data-subject="${subj}">
          <div class="major-subject-row" data-subject="${subj}">
            <input type="checkbox" class="major-checkbox" ${checked}>
            <span class="major-subject-name">${subj}</span>
            <div class="major-subject-inputs">
              <input type="number" class="form-input major-score" placeholder="分数" min="0" value="${score}">
              <input type="number" class="form-input major-total" value="${total}" placeholder="满分" min="1">
            </div>
            <div class="major-rank-inputs">
              <input type="number" class="form-input major-class-rank" placeholder="班排名" min="1" value="${classRank}">
              <input type="number" class="form-input major-grade-rank" placeholder="级排名" min="1" value="${gradeRank}">
            </div>
            <button type="button" class="major-detail-toggle" title="编辑小题分和图片">▼</button>
            <small class="major-score-error">超过满分</small>
          </div>
        </div>
      `;
    }).join('');

    // Pre-fill common fields
    $('#grade-exam').value = groupGrades[0].examName || '';
    $('#grade-date').value = groupGrades[0].date || '';

    // Pre-fill total rank fields
    $('#total-class-rank').value = groupGrades[0].totalClassRank || '';
    $('#total-class-total').value = groupGrades[0].totalClassTotal || '';
    $('#total-grade-rank').value = groupGrades[0].totalGradeRank || '';
    $('#total-grade-total').value = groupGrades[0].totalGradeTotal || '';

    // Show total rank fields
    document.getElementById('total-rank-fields').classList.remove('hidden');

    // Bind score validation
    container.querySelectorAll('.major-subject-row').forEach(row => {
      const scoreInput = row.querySelector('.major-score');
      const totalInput = row.querySelector('.major-total');
      const validate = () => {
        const score = parseInt(scoreInput.value);
        const total = parseInt(totalInput.value);
        row.classList.toggle('has-error', !isNaN(score) && !isNaN(total) && score > total);
      };
      scoreInput.addEventListener('input', validate);
      totalInput.addEventListener('input', validate);
    });

    // Bind detail toggle → side panel
    bindMajorDetailToggles(container);

    navigateTo('add-grade');
  }

  // ==================== 用户模态框 ====================

  function openUserModal() {
    const modal = $('#user-modal');
    const user = AppState.user || {};

    // 填充表单
    $('#edit-username').value = user.name || '';
    $('#edit-grade').value = user.grade || '';
    $('#edit-school').value = user.school || '';

    // 设置年龄选择
    $$('#edit-age-options .age-card').forEach(card => {
      const age = card.getAttribute('data-age');
      if (age === user.ageGroup) {
        card.classList.add('selected');
        card.querySelector('input[type="radio"]').checked = true;
      } else {
        card.classList.remove('selected');
      }
    });

    // 设置头像预览
    const avatarPreview = $('#user-avatar-preview');
    if (user.avatar) {
      avatarPreview.innerHTML = `<img src="${user.avatar}" alt="avatar">`;
    } else {
      avatarPreview.innerHTML = '<i class="icon" data-icon="user"></i>';
    }
    Icons.mount(avatarPreview);

    modal.classList.remove('hidden');
  }

  function closeUserModal() {
    $('#user-modal').classList.add('hidden');
  }

  // ==================== 错误处理 ====================

  window.addEventListener('unhandledrejection', (e) => {
    console.error('未处理的 Promise 错误:', e.reason);
  });

  // ==================== 启动！ ====================

  try {
    await init();
    console.log('学习小工具启动成功！');
  } catch (err) {
    console.error('启动失败:', err);
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;font-family:sans-serif;">
        <h2 style="color:#ef4444;">启动失败</h2>
        <p style="color:#64748b;">${err.message}</p>
        <pre style="background:#f1f5f9;padding:16px;border-radius:8px;max-width:600px;overflow:auto;font-size:13px;">${err.stack}</pre>
      </div>
    `;
  }

})();
