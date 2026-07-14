// ============================================================
// storage.js - 数据持久化层
// 通过 preload API 读写 JSON 文件
// ============================================================

const Storage = {
  /** 文件名常量 */
  FILES: {
    SETTINGS: 'settings.json',
    USER: 'user.json',
    GRADES: 'grades.json',
  },

  /** 默认设置 */
  DEFAULT_SETTINGS: {
    language: 'zh',
    themeColor: 'blue',
    darkMode: false,
    ageGroup: '',
    aiConfigs: [],
    activeAiConfigId: null,
    aiPrompt: '',
    // （本地视觉模型 / OCR 模块已移除）
    // 单词本（Wordbook）设置
    wordbook: {
      enabled: true,                                    // 是否启用（默认开启，启用后显示侧边栏入口并注册快捷键）
      shortcut: 'CommandOrControl+G',                   // 全局快捷键，默认 Ctrl+G
      definitionMode: 'zh',                             // 释义模式：zh=中文 / en=英文 / both=中英
      translateApiKey: '',                               // uapis.cn 翻译 API Key（可选，不填使用免费额度）
      exampleCount: 3,                                   // AI 例句数量（1~5 条，默认 3）
    },
  },

  /** AI 配置默认提示词（zh） */
  DEFAULT_AI_PROMPT: `你是一位经验丰富的学习辅导老师。请根据以下成绩数据和学生信息进行理性、客观的全面分析：

**分析要求（必须严格遵守）：**
1. **优点分析**：识别学生的优势学科和强项知识点，说明进步的原因
2. **缺点分析**：找出薄弱学科和需要改进的知识点，分析失分的根本原因
3. **趋势分析**：结合历史成绩识别长期趋势，判断是进步、退步还是波动
4. **改进方案**：针对每个问题给出具体、可执行的改进建议和学习计划
5. **优先级排序**：按重要性和紧急程度对改进项进行排序

学生信息：
- 姓名：{name}
- 年龄段：{ageGroup}
- 年级：{grade}
- 学校：{school}
- 本次考试：{examName}（{date}，{examType}）

【本次成绩明细】
{subjectDetails}

【历史成绩（按学科/总分汇总）】
{historyDetails}

成绩波动图见附图（综合趋势图）。
{imageHint}

请用结构化的语言回答，使用清晰的标题和列表，重点突出，字数控制在 600 字以内。`,

  /** 默认用户 */
  DEFAULT_USER: {
    name: '',
    ageGroup: '',
    grade: '',      // 年级，如 "三年级"、"高一"
    school: '',     // 学校名称
    avatar: '',     // 头像路径（可选）
    createdAt: null,
  },

  /** 年龄组定义 */
  AGE_GROUPS: {
    primary_low:  { label_zh: '小学低年级', label_en: 'Lower Primary', grades: '1-3年级', subjects: ['语文', '数学', '英语', '科学', '道德与法治'] },
    primary_high: { label_zh: '小学高年级', label_en: 'Upper Primary', grades: '4-6年级', subjects: ['语文', '数学', '英语', '科学', '道德与法治'] },
    middle:       { label_zh: '初中',       label_en: 'Middle School', grades: '7-9年级', subjects: ['语文', '数学', '英语', '道法', '历史', '物理', '化学'] },
    high:         { label_zh: '高中',       label_en: 'High School',  grades: '10-12年级', subjects: ['语文', '数学', '英语', '政治', '历史', '地理', '物理', '化学', '生物'] },
  },

  /** 缓存 — 带大小上限的 LRU 淘汰 */
  _cache: {},
  /** 缓存条目估算大小上限（字符数），超出时淘汰最旧条目 */
  _MAX_CACHE_SIZE: 512 * 1024, // 512KB 字符
  /** 缓存条目访问/创建时间戳 */
  _cacheTimestamps: {},

  /**
   * 估算缓存条目的字符大小
   * @param {*} data - 缓存的数据
   * @returns {number} 估算的字符数
   */
  _estimateCacheSize(data) {
    if (data === null || data === undefined) return 0;
    if (typeof data === 'string') return data.length;
    try { return JSON.stringify(data).length; } catch (_) { return 1024; }
  },

  /**
   * 淘汰最旧的缓存条目，直到总大小在限制内
   */
  _evictCacheIfNeeded() {
    let totalSize = 0;
    for (const key of Object.keys(this._cache)) {
      totalSize += this._estimateCacheSize(this._cache[key]);
    }
    if (totalSize <= this._MAX_CACHE_SIZE) return;

    // 按时间戳排序，淘汰最旧的
    const entries = Object.keys(this._cacheTimestamps)
      .filter(k => k in this._cache)
      .sort((a, b) => (this._cacheTimestamps[a] || 0) - (this._cacheTimestamps[b] || 0));

    for (const key of entries) {
      if (totalSize <= this._MAX_CACHE_SIZE * 0.8) break; // 留 20% 余量
      totalSize -= this._estimateCacheSize(this._cache[key]);
      delete this._cache[key];
      delete this._cacheTimestamps[key];
    }
  },

  /**
   * 读取 JSON 文件（带缓存，有大小上限）
   */
  async load(filename) {
    if (this._cache[filename] !== undefined) {
      this._cacheTimestamps[filename] = Date.now();
      return this._cache[filename];
    }
    const data = await window.api.readJSON(filename);
    this._cache[filename] = data;
    this._cacheTimestamps[filename] = Date.now();
    this._evictCacheIfNeeded();
    return data;
  },

  /**
   * 写入 JSON 文件（更新缓存）
   */
  async save(filename, data) {
    const result = await window.api.writeJSON(filename, data);
    if (result.success) {
      this._cache[filename] = data;
      this._cacheTimestamps[filename] = Date.now();
      this._evictCacheIfNeeded();
    }
    return result;
  },

  /**
   * 清除缓存
   */
  clearCache(filename) {
    if (filename) {
      delete this._cache[filename];
    } else {
      this._cache = {};
    }
  },

  // ==================== 设置 ====================

  async loadSettings() {
    const data = await this.load(this.FILES.SETTINGS);
    const merged = { ...this.DEFAULT_SETTINGS, ...(data || {}) };
    // 嵌套对象深合并，避免旧数据缺少 wordbook 子字段时覆盖默认值
    merged.wordbook = { ...this.DEFAULT_SETTINGS.wordbook, ...(data && data.wordbook ? data.wordbook : {}) };
    return merged;
  },

  async saveSettings(settings) {
    return this.save(this.FILES.SETTINGS, settings);
  },

  // ==================== 用户 ====================

  async loadUser() {
    const data = await this.load(this.FILES.USER);
    return { ...this.DEFAULT_USER, ...(data || {}) };
  },

  async saveUser(user) {
    return this.save(this.FILES.USER, user);
  },

  // ==================== 成绩 ====================

  async loadGrades() {
    const data = await this.load(this.FILES.GRADES);
    return Array.isArray(data) ? data : [];
  },

  async saveGrades(grades) {
    return this.save(this.FILES.GRADES, grades);
  },

  /** 生成唯一分组 ID */
  _generateGroupId() {
    return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /**
   * 迁移旧数据：补全 groupId / subScores / imagePaths / examType 字段
   * 应在应用启动时调用一次
   */
  async migrateGrades() {
    const grades = await this.loadGrades();
    if (!Array.isArray(grades) || grades.length === 0) return false;
    let changed = false;
    const majorGroups = {}; // key: `${examName}|${date}|${createdAt}` -> groupId

    grades.forEach(g => {
      // 补全 examType
      if (!g.examType) {
        g.examType = 'minor';
        changed = true;
      }
      // 分组或分配 groupId
      if (g.examType === 'major' && !g.groupId) {
        const key = `${g.examName || ''}|${g.date || ''}|${g.createdAt || ''}`;
        if (!majorGroups[key]) {
          majorGroups[key] = this._generateGroupId();
        }
        g.groupId = majorGroups[key];
        changed = true;
      } else if (!g.groupId) {
        g.groupId = this._generateGroupId();
        changed = true;
      }
      // 补全新字段
      if (g.subScores === undefined) {
        g.subScores = null;
        changed = true;
      }
      if (g.imagePaths === undefined) {
        g.imagePaths = null;
        changed = true;
      }
      // 排名迁移
      if (g.classRank === undefined) {
        g.classRank = null;
        changed = true;
      }
      if (g.classTotal === undefined) {
        g.classTotal = null;
        changed = true;
      }
      if (g.gradeRank === undefined) {
        g.gradeRank = null;
        changed = true;
      }
      if (g.gradeTotal === undefined) {
        g.gradeTotal = null;
        changed = true;
      }
      if (g.totalClassRank === undefined) {
        g.totalClassRank = null;
        changed = true;
      }
      if (g.totalClassTotal === undefined) {
        g.totalClassTotal = null;
        changed = true;
      }
      if (g.totalGradeRank === undefined) {
        g.totalGradeRank = null;
        changed = true;
      }
      if (g.totalGradeTotal === undefined) {
        g.totalGradeTotal = null;
        changed = true;
      }
    });

    if (changed) await this.saveGrades(grades);
    return changed;
  },

  /**
   * 添加一条成绩记录
   */
  async addGrade(grade) {
    const grades = await this.loadGrades();
    const newGrade = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      subject: grade.subject,
      score: Number(grade.score),
      total: Number(grade.total) || 100,
      examName: grade.examName || '',
      examType: grade.examType || 'minor',
      date: grade.date,
      createdAt: new Date().toISOString(),
      groupId: this._generateGroupId(),
      subScores: grade.subScores || null,
      imagePaths: grade.imagePaths || null,
      classRank: grade.classRank || null,
      classTotal: grade.classTotal || null,
      gradeRank: grade.gradeRank || null,
      gradeTotal: grade.gradeTotal || null,
      totalClassRank: grade.totalClassRank || null,
      totalClassTotal: grade.totalClassTotal || null,
      totalGradeRank: grade.totalGradeRank || null,
      totalGradeTotal: grade.totalGradeTotal || null,
    };
    grades.push(newGrade);
    await this.saveGrades(grades);
    return newGrade;
  },

  /**
   * 批量添加大考成绩（多条科目记录，同一次考试）
   * @param {Array} subjectGrades - [{ subject, score, total }, ...]
   * @param {string} examName - 考试名称
   * @param {string} date - 考试日期
   * @param {Object} [options={}] - 可选参数
   * @param {Object} [options.subScores] - 按科目划分的小分，keyed by subject
   * @param {string[]} [options.imagePaths] - 图片路径数组
   */
  async addMajorGrades(subjectGrades, examName, date, options = {}) {
    const grades = await this.loadGrades();
    const now = new Date().toISOString();
    const groupId = this._generateGroupId();
    const newRecords = subjectGrades.map(sg => ({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 4),
      subject: sg.subject,
      score: Number(sg.score),
      total: Number(sg.total) || 100,
      examName: examName || '',
      examType: 'major',
      date: date,
      createdAt: now,
      groupId,
      subScores: options.subScores?.[sg.subject] || null,
      imagePaths: sg.imagePaths || options.imagePaths || null,
      classRank: sg.classRank || null,
      classTotal: sg.classTotal || null,
      gradeRank: sg.gradeRank || null,
      gradeTotal: sg.gradeTotal || null,
      totalClassRank: options.totalClassRank || null,
      totalClassTotal: options.totalClassTotal || null,
      totalGradeRank: options.totalGradeRank || null,
      totalGradeTotal: options.totalGradeTotal || null,
    }));
    grades.push(...newRecords);
    await this.saveGrades(grades);
    return newRecords;
  },

  /**
   * 更新一条成绩记录
   */
  async updateGrade(id, updates) {
    const grades = await this.loadGrades();
    const index = grades.findIndex(g => g.id === id);
    if (index === -1) return null;
    const original = grades[index];
    grades[index] = { ...original, ...updates, id, examType: original.examType || 'minor' };
    await this.saveGrades(grades);
    return grades[index];
  },

  /**
   * 删除一条成绩记录
   */
  async deleteGrade(id) {
    const grades = await this.loadGrades();
    const filtered = grades.filter(g => g.id !== id);
    if (filtered.length === grades.length) return false;
    await this.saveGrades(filtered);
    return true;
  },

  /**
   * 获取某个科目的所有成绩（按日期排序）
   */
  async getGradesBySubject(subject) {
    const grades = await this.loadGrades();
    const filtered = subject === 'all' ? grades : grades.filter(g => g.subject === subject);
    return filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
  },

  /**
   * 获取年龄组对应的科目列表
   */
  getSubjectsForAge(ageGroup) {
    const group = this.AGE_GROUPS[ageGroup];
    return group ? group.subjects : this.AGE_GROUPS.middle.subjects;
  },

  /**
   * 获取年龄组显示文字
   */
  getAgeGroupLabel(ageGroup, lang = 'zh') {
    const group = this.AGE_GROUPS[ageGroup];
    if (!group) return ageGroup;
    return lang === 'zh' ? group.label_zh : group.label_en;
  },

  /**
   * 计算每次考试的总分（按日期分组求和，仅统计大考成绩）
   * @param {Array} grades - 所有成绩
   * @returns {Array} [{ date: '2026-06-15', total: 265 }, ...]
   * 说明：小考 (examType='minor' 或无 examType) 不纳入总分统计
   */
  calculateTotalScores(grades) {
    const byDate = {};
    grades.forEach(g => {
      if ((g.examType || 'minor') !== 'major') return;
      if (!byDate[g.date]) byDate[g.date] = 0;
      byDate[g.date] += g.score;
    });
    return Object.entries(byDate).map(([date, total]) => ({ date, total }));
  },

  /**
   * 按科目分组成绩
   * @param {Array} grades - 所有成绩
   * @returns {Object} { '语文': [grades], '数学': [grades], ... }
   */
  groupGradesBySubject(grades) {
    const groups = {};
    grades.forEach(g => {
      if (!groups[g.subject]) groups[g.subject] = [];
      groups[g.subject].push(g);
    });
    return groups;
  },

  // ==================== 大考分组操作 ====================

  /**
   * 获取同一大考分组的所有记录
   * @param {string} groupId
   * @returns {Promise<Array>}
   */
  async getMajorExamGroup(groupId) {
    const grades = await this.loadGrades();
    return grades.filter(g => g.groupId === groupId);
  },

  /**
   * 删除同一大考分组的所有记录
   * @param {string} groupId
   * @returns {Promise<boolean>}
   */
  async deleteMajorExamGroup(groupId) {
    const grades = await this.loadGrades();
    const remaining = grades.filter(g => g.groupId !== groupId);
    if (remaining.length === grades.length) return false;
    await this.saveGrades(remaining);
    return true;
  },

  /**
   * 更新同一大考分组的部分字段
   * @param {string} groupId
   * @param {Object} updates
   * @param {string} [updates.examName]
   * @param {string} [updates.date]
   * @param {Object} [updates.subjectUpdates] - { [subject]: { score?, total?, subScores?, imagePaths? } }
   * @returns {Promise<boolean>}
   */
  async updateMajorExamGroup(groupId, updates) {
    const grades = await this.loadGrades();
    let changed = false;
    // Collect subjects that should be kept (checked ones in subjectUpdates)
    const allowedSubjects = updates.subjectUpdates ? Object.keys(updates.subjectUpdates) : null;

    const filtered = grades.filter(g => {
      if (g.groupId !== groupId) return true;
      // If subjectUpdates is provided, remove subjects not in the update set
      if (allowedSubjects && !allowedSubjects.includes(g.subject)) {
        changed = true;
        return false; // Remove this record
      }
      return true;
    });

    filtered.forEach(g => {
      if (g.groupId === groupId) {
        if (updates.examName !== undefined) g.examName = updates.examName;
        if (updates.date !== undefined) g.date = updates.date;
        if (updates.subjectUpdates && updates.subjectUpdates[g.subject]) {
          const su = updates.subjectUpdates[g.subject];
          if (su.score !== undefined) g.score = Number(su.score);
          if (su.total !== undefined) g.total = Number(su.total);
          if (su.subScores !== undefined) g.subScores = su.subScores;
          if (su.imagePaths !== undefined) g.imagePaths = su.imagePaths;
          if (su.classRank !== undefined) g.classRank = su.classRank;
          if (su.classTotal !== undefined) g.classTotal = su.classTotal;
          if (su.gradeRank !== undefined) g.gradeRank = su.gradeRank;
          if (su.gradeTotal !== undefined) g.gradeTotal = su.gradeTotal;
        }
        if (updates.totalClassRank !== undefined) g.totalClassRank = updates.totalClassRank;
        if (updates.totalClassTotal !== undefined) g.totalClassTotal = updates.totalClassTotal;
        if (updates.totalGradeRank !== undefined) g.totalGradeRank = updates.totalGradeRank;
        if (updates.totalGradeTotal !== undefined) g.totalGradeTotal = updates.totalGradeTotal;
        changed = true;
      }
    });
    if (changed) await this.saveGrades(filtered);
    return changed;
  },

  // ==================== AI 配置 ====================

  /**
   * 生成 AI 配置 ID
   */
  _generateAiConfigId() {
    return 'ai_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  /**
   * 获取所有 AI 配置
   */
  async getAiConfigs() {
    const settings = await this.loadSettings();
    return settings.aiConfigs || [];
  },

  /**
   * 获取当前激活的 AI 配置
   */
  async getActiveAiConfig() {
    const settings = await this.loadSettings();
    const list = settings.aiConfigs || [];
    return list.find(c => c.id === settings.activeAiConfigId) || list[0] || null;
  },

  /**
   * 添加一个 AI 配置
   * @param {Object} config
   * @param {Object} [targetSettings] - 可选的目标 settings 对象；若提供则复用其引用，避免内存/磁盘双写
   */
  async addAiConfig(config, targetSettings) {
    const settings = targetSettings || await this.loadSettings();
    if (!settings.aiConfigs) settings.aiConfigs = [];
    const newConfig = {
      id: this._generateAiConfigId(),
      name: config.name || 'AI',
      type: config.type || 'openai',
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || '',
      model: config.model || (config.type === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini'),
    };
    settings.aiConfigs.push(newConfig);
    // 首次添加自动激活
    if (!settings.activeAiConfigId) settings.activeAiConfigId = newConfig.id;
    await this.saveSettings(settings);
    return newConfig;
  },

  /**
   * 更新一个 AI 配置
   * @param {string} id
   * @param {Object} updates
   * @param {Object} [targetSettings]
   */
  async updateAiConfig(id, updates, targetSettings) {
    const settings = targetSettings || await this.loadSettings();
    const list = settings.aiConfigs || [];
    const idx = list.findIndex(c => c.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates, id };
    await this.saveSettings(settings);
    return list[idx];
  },

  /**
   * 删除一个 AI 配置
   * @param {string} id
   * @param {Object} [targetSettings]
   */
  async deleteAiConfig(id, targetSettings) {
    const settings = targetSettings || await this.loadSettings();
    const list = settings.aiConfigs || [];
    const filtered = list.filter(c => c.id !== id);
    if (filtered.length === list.length) return false;
    settings.aiConfigs = filtered;
    if (settings.activeAiConfigId === id) {
      settings.activeAiConfigId = filtered[0]?.id || null;
    }
    await this.saveSettings(settings);
    return true;
  },

  /**
   * 切换当前激活的 AI 配置
   * @param {string} id
   * @param {Object} [targetSettings]
   */
  async setActiveAiConfig(id, targetSettings) {
    const settings = targetSettings || await this.loadSettings();
    settings.activeAiConfigId = id;
    await this.saveSettings(settings);
  },

  /**
   * 获取默认提示词（用户自定义或默认）
   */
  async getAiPrompt(targetSettings) {
    const settings = targetSettings || await this.loadSettings();
    return settings.aiPrompt || this.DEFAULT_AI_PROMPT;
  },

  /**
   * 保存默认提示词
   */
  async saveAiPrompt(prompt, targetSettings) {
    const settings = targetSettings || await this.loadSettings();
    settings.aiPrompt = prompt;
    await this.saveSettings(settings);
  },

};
