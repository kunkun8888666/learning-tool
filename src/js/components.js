// ============================================================
// components.js - UI 组件渲染 + 国际化 (i18n)
// ============================================================

const I18n = {
  /** 当前语言 */
  _lang: 'zh',

  /** 翻译表 */
  _messages: {
    zh: {
      app_name: '学习小工具',
      home: '主页',
      grades: '成绩',
      settings: '设置',
      user: '用户',
      grade_records: '成绩记录',
      add_grade: '添加成绩',
      filter_subject: '筛选科目：',
      all_subjects: '全部科目',
      no_grades_yet: '还没有成绩记录',
      add_first_grade: '点击上方按钮添加第一条成绩吧！',
      no_data_hint: '暂无成绩数据，请先在「成绩」页面添加记录',
      language: '语言',
      theme_color: '主题色',
      appearance: '外观',
      dark_mode: '深色模式',
      theme_hint: '选择您喜欢的主题色',
      username: '用户名',
      age_group: '年龄段',
      grade: '年级',
      school: '学校',
      change_avatar: '更换头像',
      edit_info: '编辑信息',
      // login_notice: '登录系统即将上线，敬请期待！',
      total_score_chart: '总分趋势',
      subject_breakdown: '各科成绩',
      score_error: '分数不能超过满分！',
      major_exam: '大考',
      minor_exam: '小考',
      grade_detail: '成绩详情',
      subject_scores: '各科成绩',
      sub_scores: '小题分',
      uploaded_images: '上传图片',
      total_score_label: '总分',
      average_score: '平均分',
      subject_count: '科',
      back: '返回',
      subject: '科目',
      score: '分数',
      total_score: '满分',
      exam_name: '考试名称',
      date: '日期',
      save: '保存',
      cancel: '取消',
      edit_grade: '编辑成绩',
      delete_grade: '删除',
      delete_confirm: '确定要删除这条成绩记录吗？',
      add_sub_scores: '添加小题分',
      add_row: '添加一行',
      upload_image: '上传图片',
      sub_score_type: '题型',
      sub_score_score: '得分',
      sub_score_total: '满分',
      remove: '删除',
      remove_image: '删除图片',
      select_question_type: '选择题型',
      question_type_choice: '选择',
      question_type_fill: '填空',
      question_type_solve: '解答题',
      question_type_listen: '听力',
      question_type_cloze: '完形填空',
      question_type_reading: '阅读',
      question_type_essay: '作文',
      question_type_classical: '古文',
      question_type_mini_read: '小阅读',
      question_type_big_read: '大阅读',
      question_type_masterwork: '名著阅读',
      question_type_expr_choice: '表达选择题',
      question_type_7of5: '7选5',
      question_type_comprehensive: '综合填空',
      rank: '排名',
      class_rank: '班级排名',
      grade_rank: '年级排名',
      total_rank: '总分排名',
      subject_detail: '科目详情',
      no_sub_scores: '暂无小题分',
      no_rank: '暂无排名',
      click_to_expand: '点击查看详情',
      primary_low: '小学低年级',
      primary_high: '小学高年级',
      middle_school: '初中',
      high_school: '高中',
      grade: '年级',
      school: '学校',
      change_avatar: '更换头像',
      morning: '早上好',
      afternoon: '下午好',
      evening: '晚上好',
      // AI 相关
      ai_assistant: 'AI 助手',
      ai_settings: 'AI 设置',
      ai_configs: 'AI 配置',
      ai_add_config: '添加 AI',
      ai_no_config: '尚未配置 AI。前往「AI 设置」添加 API。',
      ai_select: '选择 AI',
      ai_no_active: '（未选择）',
      ai_send: '发送',
      ai_input_placeholder: '向 AI 提问…',
      ai_thinking: 'AI 正在思考…',
      ai_clear: '清空对话',
      ai_new_chat: '新对话',
      ai_default_prompt: '默认提示词',
      ai_prompt_hint: '进入详情页时，AI 会自动使用此提示词分析成绩。',
      ai_reset_prompt: '恢复默认',
      ai_set_default: '设为默认',
      ai_active: '使用中',
      ai_default: '默认',
      ai_config_name: '名称',
      ai_config_type: '类型',
      ai_config_apikey: 'API Key',
      ai_config_baseurl: 'Base URL（可选）',
      ai_config_baseurl_hint: 'OpenAI 类型留空用官方；Gemini 中转站时填入对应地址。',
      ai_config_model: '模型',
      ai_openai: 'OpenAI 兼容',
      ai_gemini: 'Google Gemini',
      ai_config_save: '保存',
      ai_config_cancel: '取消',
      ai_config_delete: '删除',
      ai_config_delete_confirm: '确定要删除这个 AI 配置吗？',
      ai_test: '测试',
      ai_testing: '测试中…',
      ai_test_ok: '可用',
      ai_test_auth: '认证失败',
      ai_test_notfound: '未找到',
      ai_test_network: '网络异常',
      ai_test_server: '服务异常',
      ai_test_ratelimit: '限流',
      ai_test_unknown: '失败',
      ai_test_no_key: '无 Key',
      ai_untested: '未测试',
      ai_ms: 'ms',
      ai_cooldown_hint: '（冷却中）',
      ai_test_success: '连接成功！',
      // （本地视觉模型 / OCR 模块已移除）
      // 课程（OpenMAIC）
      course: '课程',
      course_not_installed_title: 'OpenMAIC 课程系统',
      course_not_installed_desc: '清华大学开源多智能体互动课堂平台，可从任何主题自动生成沉浸式 AI 课程。',
      course_install_btn: '下载并安装',
      course_install_hint: '首次使用会自动下载所需依赖（Git、Node.js、pnpm），整个过程约需几分钟。',
      course_ready_title: '课程已就绪',
      course_ready_desc: 'OpenMAIC 已安装，点击下方按钮启动互动课堂服务。',
      course_start_btn: '启动课程',
      course_starting_title: '正在启动…',
      course_starting_desc: '课程服务启动中，请稍候。',
      course_running_title: '互动课堂',
      course_stop_btn: '停止服务',
      course_error_title: '出错了',
      course_retry_btn: '重新尝试',
      course_progress_cloning: '正在克隆仓库…',
      course_progress_installing: '正在安装依赖…',
      course_progress_configuring: '正在配置 API…',
      course_progress_done: '安装完成！',
      // OCR
      ocr_settings: 'OCR 文字识别',
      ocr_start: '启动 OCR 服务',
      ocr_stop: '停止 OCR 服务',
      ocr_hint: '首次启动会自动安装 EasyOCR（约 1GB），支持中英文识别。',
      // 下载设置
      download_settings: '下载设置',
      download_speed_limit: '下载限速',
      download_speed_hint: '0 表示无限制，单位：MB/s',
      download_threads: '下载线程数',
      download_threads_hint: '多线程下载可提升速度，建议根据网络情况调整',
      download_source: '下载源',
      download_custom_hint: '如：https://gh-proxy.com',
      clear_cache: '清除缓存',
      clear_cache_hint: '清除下载的临时文件和缓存数据',
      // AI 服务商
      ai_providers_title: '提供商',
      ai_providers_connected: '已连接的提供商',
      ai_providers_popular: '热门提供商',
      ai_providers_more: '查看更多提供商',
      ai_providers_less: '收起',
      ai_providers_connect: '连接',
      ai_providers_disconnect: '断开连接',
      ai_providers_recommended: '推荐',
      ai_providers_custom: '自定义',
      ai_providers_custom_desc: '通过基础 URL 添加与 OpenAI 兼容的提供商。',
      // 描述
      ai_prov_opencode_zen_desc: 'OpenCode Zen 模型',
      ai_prov_openrouter_desc: '聚合多种模型的中转服务',
      ai_prov_opencode_go_desc: '适合所有人的低成本订阅',
      ai_prov_anthropic_desc: '使用 Claude Pro/Max 或 API 密钥连接',
      ai_prov_github_copilot_desc: '使用 Copilot 或 API 密钥连接',
      ai_prov_openai_desc: '使用 ChatGPT Pro/Plus 或 API 密钥连接',
      ai_prov_google_desc: '使用 Google 账号或 API 密钥连接',
      ai_prov_vercel_desc: '使用 Vercel 账号或 API 密钥连接',
      ai_prov_alibaba_desc: '阿里云通义千问（Qwen）',
      ai_prov_cloudflare_desc: 'Cloudflare Workers AI',
      ai_prov_deepseek_desc: '深度求索 DeepSeek',
      ai_prov_iflow_desc: 'iFlow AI',
      ai_prov_llama_desc: 'Meta Llama',
      ai_prov_minimax_desc: 'MiniMax 模型',
      ai_prov_moonshot_desc: '月之暗面 Kimi',
      ai_prov_z_ai_desc: '智谱 AI（GLM）',
      ai_providers_hint: '点击「连接」预填配置后填入 API 密钥即可使用。',
      ai_provider: '服务商',
      ai_analysis_title: '成绩分析',
      ai_image_hint_with: '附有 {n} 张试卷图片，请结合图片分析错题原因。',
      ai_image_hint_without: '本次未上传试卷图片。',
      proverbs: [
        '学而不思则罔，思而不学则殆。',
        '温故而知新，可以为师矣。',
        '知之者不如好之者，好之者不如乐之者。',
        '三人行，必有我师焉。',
        '不积跬步，无以至千里。',
        '业精于勤，荒于嬉。',
        '宝剑锋从磨砺出，梅花香自苦寒来。',
        '书山有路勤为径，学海无涯苦作舟。',
        '千里之行，始于足下。',
        '少壮不努力，老大徒伤悲。',
        '一寸光阴一寸金，寸金难买寸光阴。',
        '黑发不知勤学早，白首方悔读书迟。',
        '天道酬勤。',
        '功不唐捐。',
        '玉不琢，不成器；人不学，不知义。',
        '学如逆水行舟，不进则退。',
      ],
    },
    en: {
      app_name: 'Learning Tool',
      home: 'Home',
      grades: 'Grades',
      settings: 'Settings',
      user: 'User',
      grade_records: 'Grade Records',
      add_grade: 'Add Grade',
      filter_subject: 'Filter: ',
      all_subjects: 'All Subjects',
      no_grades_yet: 'No grade records yet',
      add_first_grade: 'Click the button above to add your first grade!',
      no_data_hint: 'No grade data yet. Add records in the Grades page first.',
      language: 'Language',
      theme_color: 'Theme Color',
      appearance: 'Appearance',
      dark_mode: 'Dark Mode',
      theme_hint: 'Choose your preferred theme color',
      username: 'Username',
      age_group: 'Age Group',
      grade: 'Grade',
      school: 'School',
      change_avatar: 'Change Avatar',
      edit_info: 'Edit Info',
      // login_notice: 'Login system coming soon!',
      total_score_chart: 'Total Score Trend',
      subject_breakdown: 'Subject Breakdown',
      score_error: 'Score cannot exceed total!',
      major_exam: 'Major Exam',
      grade_detail: 'Grade Detail',
      subject_scores: 'Subject Scores',
      sub_scores: 'Sub-scores',
      uploaded_images: 'Uploaded Images',
      total_score_label: 'Total Score',
      average_score: 'Average',
      subject_count: 'subjects',
      back: 'Back',
      minor_exam: 'Quiz',
      subject: 'Subject',
      score: 'Score',
      total_score: 'Total',
      exam_name: 'Exam Name',
      date: 'Date',
      save: 'Save',
      cancel: 'Cancel',
      edit_grade: 'Edit Grade',
      delete_grade: 'Delete',
      delete_confirm: 'Are you sure you want to delete this grade record?',
      add_sub_scores: 'Add Sub-scores',
      add_row: 'Add Row',
      upload_image: 'Upload Image',
      sub_score_type: 'Type',
      sub_score_score: 'Score',
      sub_score_total: 'Max',
      remove: 'Remove',
      remove_image: 'Remove Image',
      select_question_type: 'Select type',
      question_type_choice: 'Choice',
      question_type_fill: 'Fill-in',
      question_type_solve: 'Problem Solving',
      question_type_listen: 'Listening',
      question_type_cloze: 'Cloze',
      question_type_reading: 'Reading Comp',
      question_type_essay: 'Essay',
      question_type_classical: 'Classical Chinese',
      question_type_mini_read: 'Mini Reading',
      question_type_big_read: 'Big Reading',
      question_type_masterwork: 'Masterwork Reading',
      question_type_expr_choice: 'Expression Choice',
      question_type_7of5: '7-of-5',
      question_type_comprehensive: 'Comprehensive Fill',
      rank: 'Rank',
      class_rank: 'Class Rank',
      grade_rank: 'Grade Rank',
      total_rank: 'Total Rank',
      subject_detail: 'Subject Details',
      no_sub_scores: 'No sub-scores',
      no_rank: 'No ranking data',
      click_to_expand: 'Click for details',
      primary_low: 'Lower Primary',
      primary_high: 'Upper Primary',
      middle_school: 'Middle School',
      high_school: 'High School',
      morning: 'Good Morning',
      afternoon: 'Good Afternoon',
      evening: 'Good Evening',
      // AI related
      ai_assistant: 'AI Assistant',
      ai_settings: 'AI Settings',
      ai_configs: 'AI Configs',
      ai_add_config: 'Add AI',
      ai_no_config: 'No AI configured. Go to AI Settings to add an API.',
      ai_select: 'Select AI',
      ai_no_active: '(none)',
      ai_send: 'Send',
      ai_input_placeholder: 'Ask AI…',
      ai_thinking: 'AI is thinking…',
      ai_clear: 'Clear Chat',
      ai_new_chat: 'New Chat',
      ai_default_prompt: 'Default Prompt',
      ai_prompt_hint: 'When you open a detail page, AI will use this prompt to analyze grades automatically.',
      ai_reset_prompt: 'Reset to default',
      ai_set_default: 'Set as default',
      ai_active: 'Active',
      ai_default: 'Default',
      ai_config_name: 'Name',
      ai_config_type: 'Type',
      ai_config_apikey: 'API Key',
      ai_config_baseurl: 'Base URL (optional)',
      ai_config_baseurl_hint: 'OpenAI: leave empty for official; Gemini relay: enter the relay address.',
      ai_config_model: 'Model',
      ai_openai: 'OpenAI-compatible',
      ai_gemini: 'Google Gemini',
      ai_config_save: 'Save',
      ai_config_cancel: 'Cancel',
      ai_config_delete: 'Delete',
      ai_config_delete_confirm: 'Delete this AI config?',
      ai_test: 'Test',
      ai_testing: 'Testing…',
      ai_test_ok: 'Available',
      ai_test_auth: 'Auth Failed',
      ai_test_notfound: 'Not Found',
      ai_test_network: 'Network Error',
      ai_test_server: 'Server Error',
      ai_test_ratelimit: 'Rate Limited',
      ai_test_unknown: 'Failed',
      ai_test_no_key: 'No Key',
      ai_untested: 'Untested',
      ai_ms: 'ms',
      ai_cooldown_hint: '(Cooldown)',
      ai_test_success: 'Connection OK!',
      // （Local VLM removed）
      // Course (OpenMAIC)
      course: 'Course',
      course_not_installed_title: 'OpenMAIC Course System',
      course_not_installed_desc: 'An open-source multi-agent interactive classroom platform from Tsinghua University. Generate immersive AI courses from any topic.',
      course_install_btn: 'Download & Install',
      course_install_hint: 'Dependencies (Git, Node.js, pnpm) will be auto-downloaded if missing. Takes a few minutes.',
      course_ready_title: 'Course Ready',
      course_ready_desc: 'OpenMAIC is installed. Click below to start the interactive classroom service.',
      course_start_btn: 'Start Course',
      course_starting_title: 'Starting…',
      course_starting_desc: 'Course service is starting, please wait.',
      course_running_title: 'Interactive Classroom',
      course_stop_btn: 'Stop Service',
      course_error_title: 'Error',
      course_retry_btn: 'Retry',
      course_progress_cloning: 'Cloning repository…',
      course_progress_installing: 'Installing dependencies…',
      course_progress_configuring: 'Configuring API…',
      course_progress_done: 'Installation complete!',
      // OCR
      ocr_settings: 'OCR Text Recognition',
      ocr_start: 'Start OCR Service',
      ocr_stop: 'Stop OCR Service',
      ocr_hint: 'First launch will auto-install EasyOCR (~1GB), supports Chinese and English.',
      // Download Settings
      download_settings: 'Download Settings',
      download_speed_limit: 'Download Speed Limit',
      download_speed_hint: '0 means unlimited, unit: MB/s',
      download_threads: 'Download Threads',
      download_threads_hint: 'Multi-threaded download can improve speed, adjust according to network conditions',
      download_source: 'Download Source',
      download_custom_hint: 'e.g., https://gh-proxy.com',
      clear_cache: 'Clear Cache',
      clear_cache_hint: 'Clear downloaded temporary files and cached data',
      // AI Providers
      ai_providers_title: 'Providers',
      ai_providers_connected: 'Connected Providers',
      ai_providers_popular: 'Popular Providers',
      ai_providers_more: 'See more providers',
      ai_providers_less: 'Show less',
      ai_providers_connect: 'Connect',
      ai_providers_disconnect: 'Disconnect',
      ai_providers_recommended: 'Recommended',
      ai_providers_custom: 'Custom',
      ai_providers_custom_desc: 'Add any OpenAI-compatible provider via base URL.',
      ai_prov_opencode_zen_desc: 'OpenCode Zen models',
      ai_prov_openrouter_desc: 'Aggregator for many models',
      ai_prov_opencode_go_desc: 'Low-cost subscription for everyone',
      ai_prov_anthropic_desc: 'Use Claude Pro/Max or API key',
      ai_prov_github_copilot_desc: 'Use Copilot or API key',
      ai_prov_openai_desc: 'Use ChatGPT Pro/Plus or API key',
      ai_prov_google_desc: 'Use Google account or API key',
      ai_prov_vercel_desc: 'Use Vercel account or API key',
      ai_prov_alibaba_desc: 'Alibaba Qwen',
      ai_prov_cloudflare_desc: 'Cloudflare Workers AI',
      ai_prov_deepseek_desc: 'DeepSeek',
      ai_prov_iflow_desc: 'iFlow AI',
      ai_prov_llama_desc: 'Meta Llama',
      ai_prov_minimax_desc: 'MiniMax models',
      ai_prov_moonshot_desc: 'Moonshot Kimi',
      ai_prov_z_ai_desc: 'Zhipu AI (GLM)',
      ai_providers_hint: 'Click "Connect" to prefill the config, then enter your API key.',
      ai_provider: 'Provider',
      ai_analysis_title: 'Grade Analysis',
      ai_image_hint_with: 'Attached: {n} exam paper image(s). Please analyze based on the images.',
      ai_image_hint_without: 'No exam paper images uploaded.',
      proverbs: [
        'Learning without thought is labor lost; thought without learning is perilous.',
        'Review the old and learn the new.',
        'To know is not as good as to love, and to love is not as good as to delight in.',
        'Where there are three men walking together, one of them can teach me something.',
        'A journey of a thousand miles begins with a single step.',
        'Diligence is the vehicle on the road to excellence.',
        'No pain, no gain.',
        'There is no royal road to learning.',
        'Every journey begins with a single step.',
        'Time and tide wait for no man.',
        'An inch of time is an inch of gold.',
        'A young idler, an old beggar.',
        'Hard work pays off.',
        'All efforts will bear fruit.',
        'Jade must be carved to become a vessel.',
        'Learning is like rowing upstream; not to advance is to drop back.',
      ],
    },
  },

  /**
   * 预置 AI 服务商列表
   * 每个 provider 包含:
   *   id          - 唯一 ID
   *   name        - 显示名称
   *   letter      - 用于图标显示的首字母
   *   color       - 图标背景色
   *   descKey     - 描述的 i18n key
   *   baseUrl     - 默认 Base URL
   *   model       - 默认模型
   *   type        - 'openai' 或 'gemini'
   *   featured    - 是否显示在「热门提供商」中
   *   recommended - 是否显示「推荐」徽标
   *   isCustom    - 是否为「自定义」入口（不需要 baseUrl/model）
   */
  AI_PROVIDERS: [
    {
      id: 'opencode_zen',
      name: 'OpenCode Zen',
      letter: 'Z',
      color: '#7c3aed',
      descKey: 'ai_prov_opencode_zen_desc',
      baseUrl: 'https://opencode.ai/zen/v1',
      model: 'gpt-4o',
      type: 'openai',
      featured: true,
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      letter: 'R',
      color: '#6366f1',
      descKey: 'ai_prov_openrouter_desc',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openai/gpt-4o-mini',
      type: 'openai',
      featured: true,
    },
    {
      id: 'opencode_go',
      name: 'OpenCode Go',
      letter: 'G',
      color: '#10b981',
      descKey: 'ai_prov_opencode_go_desc',
      baseUrl: 'https://opencode.ai/go/v1',
      model: 'gpt-4o-mini',
      type: 'openai',
      featured: true,
      recommended: true,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      letter: 'A',
      color: '#d97706',
      descKey: 'ai_prov_anthropic_desc',
      baseUrl: 'https://api.anthropic.com/v1',
      model: 'claude-3-5-sonnet-20241022',
      type: 'openai',
      featured: true,
    },
    {
      id: 'github_copilot',
      name: 'GitHub Copilot',
      letter: 'C',
      color: '#1f2937',
      descKey: 'ai_prov_github_copilot_desc',
      baseUrl: 'https://api.githubcopilot.com',
      model: 'gpt-4o',
      type: 'openai',
      featured: true,
    },
    {
      id: 'openai',
      name: 'OpenAI',
      letter: 'O',
      color: '#10a37f',
      descKey: 'ai_prov_openai_desc',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      type: 'openai',
      featured: true,
    },
    {
      id: 'google',
      name: 'Google',
      letter: 'G',
      color: '#4285f4',
      descKey: 'ai_prov_google_desc',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-1.5-flash',
      type: 'gemini',
      featured: true,
    },
    {
      id: 'vercel',
      name: 'Vercel AI Gateway',
      letter: 'V',
      color: '#0f172a',
      descKey: 'ai_prov_vercel_desc',
      baseUrl: 'https://ai-gateway.vercel.sh/v1',
      model: 'openai/gpt-4o-mini',
      type: 'openai',
      featured: true,
    },
    {
      id: 'alibaba',
      name: 'Alibaba',
      letter: '阿',
      color: '#ff6a00',
      descKey: 'ai_prov_alibaba_desc',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
      type: 'openai',
      featured: false,
    },
    {
      id: 'cloudflare',
      name: 'Cloudflare',
      letter: 'C',
      color: '#f38020',
      descKey: 'ai_prov_cloudflare_desc',
      baseUrl: 'https://api.cloudflare.com/client/v4/ai/v1',
      model: '@cf/meta/llama-3.1-8b-instruct',
      type: 'openai',
      featured: false,
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      letter: 'D',
      color: '#1d4ed8',
      descKey: 'ai_prov_deepseek_desc',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      type: 'openai',
      featured: false,
    },
    {
      id: 'iflow',
      name: 'iFlow',
      letter: 'i',
      color: '#a855f7',
      descKey: 'ai_prov_iflow_desc',
      baseUrl: 'https://apis.iflow.cn/v1',
      model: 'qwen2.5-72b',
      type: 'openai',
      featured: false,
    },
    {
      id: 'llama',
      name: 'Llama',
      letter: 'L',
      color: '#0668e1',
      descKey: 'ai_prov_llama_desc',
      baseUrl: 'https://api.llama.com/v1',
      model: 'llama-3.1-70b',
      type: 'openai',
      featured: false,
    },
    {
      id: 'minimax',
      name: 'minimax',
      letter: 'm',
      color: '#ec4899',
      descKey: 'ai_prov_minimax_desc',
      baseUrl: 'https://api.MiniMax.chat/v1',
      model: 'MiniMax-text-01',
      type: 'openai',
      featured: false,
    },
    {
      id: 'moonshot',
      name: 'Moonshot AI',
      letter: 'M',
      color: '#1f2937',
      descKey: 'ai_prov_moonshot_desc',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'moonshot-v1-8k',
      type: 'openai',
      featured: false,
    },
    {
      id: 'z_ai',
      name: 'Z.AI',
      letter: 'Z',
      color: '#0ea5e9',
      descKey: 'ai_prov_z_ai_desc',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4-plus',
      type: 'openai',
      featured: false,
    },
    {
      id: 'custom',
      name: '自定义',
      letter: '✦',
      color: '#64748b',
      descKey: 'ai_providers_custom_desc',
      baseUrl: '',
      model: '',
      type: 'openai',
      featured: true,
      isCustom: true,
      // 自定义 provider 打开模态框时不预填名称
      skipName: true,
    },
  ],

  /**
   * 设置当前语言
   */
  setLang(lang) {
    if (this._lang !== lang) {
      this._cache = null; // 切换语言时清空缓存
    }
    this._lang = lang;
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');
  },

  /**
   * 获取当前语言
   */
  getLang() {
    return this._lang;
  },

  /**
   * 翻译文本（缓存当前语言的字典引用，避免每次查找）
   */
  t(key) {
    if (!this._cache || this._cache.lang !== this._lang) {
      this._cache = { lang: this._lang, map: this._messages[this._lang] || this._messages.zh };
    }
    const map = this._cache.map;
    return map[key] !== undefined ? map[key] : key;
  },

  /**
   * 获取谚语（随机一条）
   */
  getRandomProverb() {
    const proverbs = this._messages[this._lang]?.proverbs || this._messages.zh.proverbs;
    return proverbs[Math.floor(Math.random() * proverbs.length)];
  },

  /**
   * 获取问候语
   */
  getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return this.t('morning');
    if (hour >= 12 && hour < 18) return this.t('afternoon');
    return this.t('evening');
  },

  /**
   * 更新页面所有 data-i18n 标记的文本
   */
  updatePageTexts() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });
  },
};

// ============================================================
// UI 组件渲染函数
// ============================================================

const Components = {

  /**
   * 渲染科目筛选按钮（事件委托 + i18n 缓存）
   * @param {Array} subjects - 科目列表
   * @param {string} active - 当前选中的科目
   */
  renderSubjectFilters(subjects, active) {
    const container = document.getElementById('subject-filters');
    const allLabel = I18n._lang === 'zh' ? '全部' : 'All';
    const parts = [`<button class="chart-filter-btn ${active === 'all' ? 'active' : ''}" data-subject="all">${allLabel}</button>`];
    for (let i = 0; i < subjects.length; i++) {
      const subj = subjects[i];
      parts.push(`<button class="chart-filter-btn ${active === subj ? 'active' : ''}" data-subject="${subj}">${subj}</button>`);
    }
    container.innerHTML = parts.join('');

    // 事件委托：每个 container 只绑定一次
    if (!container._subjectFiltersDelegated) {
      container._subjectFiltersDelegated = true;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.chart-filter-btn');
        if (!btn || !container.contains(btn)) return;
        const all = container.querySelectorAll('.chart-filter-btn');
        for (let i = 0; i < all.length; i++) all[i].classList.remove('active');
        btn.classList.add('active');
        const subject = btn.getAttribute('data-subject');
        document.dispatchEvent(new CustomEvent('subject-filter-change', { detail: { subject } }));
      });
    }
  },

  /**
   * 渲染成绩列表（事件委托 + i18n 预取 + 一次渲染）
   * @param {Array} grades - 成绩数组
   * @param {string} filterSubject - 筛选科目
   */
  renderGradesList(grades, filterSubject) {
    const container = document.getElementById('grades-list');
    const emptyEl = document.getElementById('grades-empty');
    const countEl = document.getElementById('grade-count');

    // 1) 过滤：仅在需要时分配新数组
    const filtered = (filterSubject && filterSubject !== 'all')
      ? grades.filter(g => g.subject === filterSubject)
      : grades;

    // 2) 按日期降序：用字符串比较 (ISO 格式)，比 new Date(...) 快 5-10 倍
    const sorted = [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    // 3) 预取所有用到的 i18n 字符串（避免循环中重复字典查找）
    const T = this._gradesListT || {};
    if (T._lang !== I18n._lang) {
      const zh = I18n._lang === 'zh';
      T._lang = I18n._lang;
      T.totalPrefix = zh ? '共' : 'Total';
      T.records = zh ? '条记录' : 'records';
      T.regularExam = zh ? '日常考试' : 'Regular Exam';
      T.major = zh ? '大考' : 'Major';
      T.quiz = zh ? '小考' : 'Quiz';
      T.subj = zh ? '科' : 'subj';
      T.avg = zh ? '均分' : 'Avg';
      T.edit = zh ? '编辑' : 'Edit';
      T.delete = zh ? '删除' : 'Delete';
      this._gradesListT = T;
    }

    // 4) 分组（大考按 groupId）
    const groups = {};
    const singletons = [];
    for (let i = 0; i < sorted.length; i++) {
      const g = sorted[i];
      if ((g.examType || 'minor') === 'major' && g.groupId) {
        let group = groups[g.groupId];
        if (!group) {
          group = { records: [], groupId: g.groupId, examName: g.examName, date: g.date };
          groups[g.groupId] = group;
        }
        group.records.push(g);
      } else {
        singletons.push(g);
      }
    }
    const groupedCards = Object.values(groups);
    const displayCount = groupedCards.length + singletons.length;

    countEl.textContent = `${T.totalPrefix}: ${displayCount} ${T.records}`;

    // 5) 空状态
    if (sorted.length === 0) {
      container.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    // 6) 渲染 HTML（用数组 join 避免字符串拼接）
    const parts = [];

    // 6.1 大考分组卡片
    for (let i = 0; i < groupedCards.length; i++) {
      const group = groupedCards[i];
      const records = group.records;
      let totalScore = 0, totalTotal = 0;
      for (let j = 0; j < records.length; j++) {
        totalScore += records[j].score;
        totalTotal += records[j].total;
      }
      const avg = records.length > 0 ? (totalScore / records.length).toFixed(1) : '0';
      const pct = totalTotal > 0 ? Math.round((totalScore / totalTotal) * 100) : 0;
      const scoreColor = pct >= 90 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : '#ef4444';
      const examName = group.examName || T.regularExam;
      parts.push(
        `<div class="grade-card grade-card-group" data-group-id="${group.groupId}">` +
          `<div class="grade-card-group-header">` +
            `<span class="grade-card-group-name">${examName}</span>` +
            `<span class="exam-type-badge major">${T.major}</span>` +
          `</div>` +
          `<div class="grade-card-group-info">` +
            `<div class="grade-card-group-stats">` +
              `<span class="group-stat-count">${records.length}${T.subj}</span>` +
              `<span class="group-stat-avg">${T.avg}: <strong>${avg}</strong></span>` +
            `</div>` +
            `<div class="grade-card-date">${group.date}</div>` +
          `</div>` +
          `<div class="grade-card-score" style="color:${scoreColor}">` +
            `${totalScore}` +
            `<span class="grade-card-total">/${totalTotal}</span>` +
          `</div>` +
          `<div class="grade-card-actions">` +
            `<button class="edit-group-btn" data-group-id="${group.groupId}">${T.edit}</button>` +
            `<button class="delete-group-btn" data-group-id="${group.groupId}">${T.delete}</button>` +
          `</div>` +
        `</div>`
      );
    }

    // 6.2 单条（小考）卡片
    for (let i = 0; i < singletons.length; i++) {
      const g = singletons[i];
      const pct = g.total > 0 ? Math.round((g.score / g.total) * 100) : 0;
      const scoreColor = pct >= 90 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : '#ef4444';
      const examName = g.examName || T.regularExam;
      parts.push(
        `<div class="grade-card" data-id="${g.id}">` +
          `<div class="grade-card-subject">${g.subject}</div>` +
          `<div class="grade-card-info">` +
            `<div class="grade-card-exam">` +
              `${examName}` +
              `<span class="exam-type-badge minor">${T.quiz}</span>` +
            `</div>` +
            `<div class="grade-card-date">${g.date}</div>` +
          `</div>` +
          `<div class="grade-card-score" style="color:${scoreColor}">` +
            `${g.score}` +
            `<span class="grade-card-total">/${g.total}</span>` +
          `</div>` +
          `<div class="grade-card-actions">` +
            `<button class="edit-btn" data-id="${g.id}">${T.edit}</button>` +
            `<button class="delete-btn" data-id="${g.id}">${T.delete}</button>` +
          `</div>` +
        `</div>`
      );
    }

    container.innerHTML = parts.join('');

    // 7) 事件委托：每个 container 只绑定一次 click，事件冒泡后按 class 分派
    if (!container._gradesListDelegated) {
      container._gradesListDelegated = true;
      container._gradesListData = { grades };
      container.addEventListener('click', (e) => {
        // 7.1 阻止按钮事件冒泡到卡片
        const btn = e.target.closest('button');
        if (btn) e.stopPropagation();

        // 7.2 编辑/删除按钮
        if (btn) {
          if (btn.classList.contains('edit-btn')) {
            const id = btn.getAttribute('data-id');
            const grade = container._gradesListData.grades.find(g => g.id === id);
            if (grade) document.dispatchEvent(new CustomEvent('edit-grade', { detail: { grade } }));
            return;
          }
          if (btn.classList.contains('delete-btn')) {
            const id = btn.getAttribute('data-id');
            document.dispatchEvent(new CustomEvent('delete-grade', { detail: { id } }));
            return;
          }
          if (btn.classList.contains('edit-group-btn')) {
            const groupId = btn.getAttribute('data-group-id');
            document.dispatchEvent(new CustomEvent('edit-grade-group', { detail: { groupId } }));
            return;
          }
          if (btn.classList.contains('delete-group-btn')) {
            const groupId = btn.getAttribute('data-group-id');
            document.dispatchEvent(new CustomEvent('delete-grade-group', { detail: { groupId } }));
            return;
          }
        }

        // 7.3 卡片点击 → 查看详情
        const card = e.target.closest('.grade-card');
        if (!card) return;
        // 排除操作区
        if (e.target.closest('.grade-card-actions')) return;
        if (card.classList.contains('grade-card-group')) {
          const groupId = card.getAttribute('data-group-id');
          document.dispatchEvent(new CustomEvent('view-grade-detail', { detail: { groupId } }));
        } else {
          const id = card.getAttribute('data-id');
          const grade = container._gradesListData.grades.find(g => g.id === id);
          if (grade) document.dispatchEvent(new CustomEvent('view-grade-detail', { detail: { grade } }));
        }
      });
    } else {
      // 更新数据引用（保持 click handler 可访问最新 grades）
      container._gradesListData.grades = grades;
    }
  },

  /**
   * 渲染成绩模态框中的科目选项
   */
  renderGradeModalSubjects(subjects, selected) {
    const select = document.getElementById('grade-subject');
    select.innerHTML = subjects.map(s =>
      `<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`
    ).join('');
  },

  /**
   * 渲染成绩筛选下拉
   */
  renderGradeFilterSubjects(subjects) {
    const select = document.getElementById('grade-filter-subject');
    const allLabel = I18n._lang === 'zh' ? '全部科目' : 'All Subjects';
    select.innerHTML = `<option value="all">${allLabel}</option>` +
      subjects.map(s => `<option value="${s}">${s}</option>`).join('');
  },

  /**
   * 渲染成绩详情页
   * @param {Object} grade - 单条成绩记录（小考用）
   * @param {Array} groupGrades - 大考分组所有记录
   * @param {string} groupId - 分组ID
   */
  renderGradeDetail(grade, groupGrades, groupId) {
    const isMajor = groupGrades && groupGrades.length > 0;
    const records = isMajor ? groupGrades : [grade];
    const examName = records[0].examName || (I18n._lang === 'zh' ? '日常考试' : 'Regular Exam');
    const date = records[0].date;
    const examType = records[0].examType || 'minor';
    const examTypeLabel = examType === 'major'
      ? (I18n._lang === 'zh' ? '大考' : 'Major')
      : (I18n._lang === 'zh' ? '小考' : 'Quiz');
    const totalScore = records.reduce((sum, r) => sum + r.score, 0);
    const avg = records.length > 0 ? (totalScore / records.length).toFixed(1) : '0';

    // Header
    const headerEl = document.getElementById('detail-header');
    headerEl.innerHTML = `
      <div class="detail-header-top">
        <span class="detail-exam-name">${examName}</span>
        <span class="exam-type-badge ${examType}">${examTypeLabel}</span>
      </div>
      <div class="detail-date">${date}</div>
    `;

    // Stats
    const statsEl = document.getElementById('detail-stats');
    if (isMajor) {
      const totalCR = records[0].totalClassRank;
      const totalGR = records[0].totalGradeRank;
      statsEl.innerHTML = `
        <div class="detail-stat-item">
          <span class="detail-stat-value">${totalScore}</span>
          <span class="detail-stat-label" data-i18n="total_score_label">总分</span>
        </div>
        <div class="detail-stat-item">
          <span class="detail-stat-value">${avg}</span>
          <span class="detail-stat-label" data-i18n="average_score">平均分</span>
        </div>
        <div class="detail-stat-item">
          <span class="detail-stat-value">${records.length}</span>
          <span class="detail-stat-label" data-i18n="subject_count">科</span>
        </div>
        ${totalCR ? `
        <div class="detail-stat-item detail-stat-rank">
          <span class="detail-stat-value rank-value">#${totalCR}${records[0].totalClassTotal ? '/' + records[0].totalClassTotal : ''}</span>
          <span class="detail-stat-label" data-i18n="class_rank">班级排名</span>
        </div>` : ''}
        ${totalGR ? `
        <div class="detail-stat-item detail-stat-rank">
          <span class="detail-stat-value rank-value">#${totalGR}${records[0].totalGradeTotal ? '/' + records[0].totalGradeTotal : ''}</span>
          <span class="detail-stat-label" data-i18n="grade_rank">年级排名</span>
        </div>` : ''}
      `;
    } else {
      const pct = records[0].total > 0 ? Math.round((records[0].score / records[0].total) * 100) : 0;
      statsEl.innerHTML = `
        <div class="detail-stat-item">
          <span class="detail-stat-value">${records[0].score}</span>
          <span class="detail-stat-label" data-i18n="score">分数</span>
        </div>
        <div class="detail-stat-item">
          <span class="detail-stat-value">${records[0].total}</span>
          <span class="detail-stat-label" data-i18n="total_score">满分</span>
        </div>
        <div class="detail-stat-item">
          <span class="detail-stat-value">${pct}%</span>
          <span class="detail-stat-label" data-i18n="score">正确率</span>
        </div>
      `;
    }

    // Subjects list — clickable rows with expand/collapse
    const subjectsEl = document.getElementById('detail-subjects-list');
    subjectsEl.innerHTML = records.map(r => {
      const pct = r.total > 0 ? Math.round((r.score / r.total) * 100) : 0;
      const scoreColor = pct >= 90 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : '#ef4444';
      const hasSubScores = r.subScores && r.subScores.length > 0;
      const hasRank = r.classRank || r.gradeRank;
      // 大考的所有科目行都可展开，小考只在有小题分或排名时展开
      const expandable = isMajor || hasSubScores || hasRank;

      let subScoresHtml = '';
      if (hasSubScores) {
        subScoresHtml = `
          <div class="subject-sub-scores">
            <table class="sub-scores-table">
              <thead><tr>
                <th>${I18n.t('sub_score_type')}</th>
                <th>${I18n.t('sub_score_score')}</th>
                <th>${I18n.t('sub_score_total')}</th>
                <th>%</th>
              </tr></thead>
              <tbody>
                ${r.subScores.map(ss => {
                  const spct = ss.total > 0 ? Math.round((ss.score / ss.total) * 100) : 0;
                  return `<tr>
                    <td>${I18n.t('question_type_' + ss.type) || ss.type}</td>
                    <td class="sub-score-cell-score">${ss.score}</td>
                    <td class="sub-score-cell-total">${ss.total}</td>
                    <td class="sub-score-cell-pct">${spct}%</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      let rankHtml = '';
      if (hasRank) {
        rankHtml = `
          <div class="subject-rank-info">
            ${r.classRank ? `<span class="rank-badge">${I18n.t('class_rank')}: #${r.classRank}${r.classTotal ? '/' + r.classTotal : ''}</span>` : ''}
            ${r.gradeRank ? `<span class="rank-badge rank-grade">${I18n.t('grade_rank')}: #${r.gradeRank}${r.gradeTotal ? '/' + r.gradeTotal : ''}</span>` : ''}
          </div>
        `;
      }

      return `
        <div class="detail-subject-row-wrapper">
          <div class="detail-subject-row ${expandable ? 'expandable' : ''}" data-id="${r.id}">
            <span class="detail-subject-name">${r.subject}</span>
            <span class="detail-subject-score" style="color:${scoreColor}">${r.score}<span class="detail-subject-total">/${r.total}</span></span>
            <span class="detail-subject-pct" style="color:${scoreColor}">${pct}%</span>
            ${expandable ? '<span class="expand-indicator">▶</span>' : ''}
          </div>
          <div class="subject-expand-content hidden">
            ${subScoresHtml}
            ${rankHtml}
            ${!hasSubScores && !hasRank ? '<div class="subject-empty-hint">' + I18n.t('no_sub_scores') + '</div>' : ''}
          </div>
        </div>
      `;
    }).join('');

    // 事件委托：详情页科目行点击（展开/折叠 或 导航到大考单科详情）
    // 每个 subjectsEl 只绑定一次 click
    if (!subjectsEl._subjectRowDelegated) {
      subjectsEl._subjectRowDelegated = true;
      subjectsEl._subjectRowState = { isMajor, records };
      subjectsEl.addEventListener('click', (e) => {
        const row = e.target.closest('.detail-subject-row.expandable');
        if (!row || !subjectsEl.contains(row)) return;
        const state = subjectsEl._subjectRowState;
        // 大考：点击行 → 导航到该科详情
        if (state.isMajor) {
          const id = row.getAttribute('data-id');
          const record = state.records.find(r => r.id === id);
          if (record) {
            document.dispatchEvent(new CustomEvent('view-subject-detail', { detail: { grade: record } }));
          }
          return;
        }
        // 小考：展开/折叠
        const wrapper = row.closest('.detail-subject-row-wrapper');
        if (!wrapper) return;
        const content = wrapper.querySelector('.subject-expand-content');
        const indicator = row.querySelector('.expand-indicator');
        if (!content) return;
        const isHidden = content.classList.contains('hidden');
        content.classList.toggle('hidden');
        if (indicator) indicator.textContent = isHidden ? '▼' : '▶';
      });
    } else {
      // 更新数据引用（records 可能变化）
      subjectsEl._subjectRowState.isMajor = isMajor;
      subjectsEl._subjectRowState.records = records;
    }

    // Sub-scores are now shown per-subject in expandable rows
    document.getElementById('detail-sub-scores-section').classList.add('hidden');
    document.getElementById('detail-sub-scores-table').innerHTML = '';

    // Image gallery — hide for major exams (images shown per-subject in subject detail)
    const imagesSection = document.getElementById('detail-images-section');
    const imagesGallery = document.getElementById('detail-images-gallery');
    if (isMajor) {
      imagesSection.classList.add('hidden');
      imagesGallery.innerHTML = '';
    } else {
      // Collect all image paths from all records (minor exams only)
      const allImagePaths = [];
      records.forEach(r => {
        if (r.imagePaths && r.imagePaths.length > 0) {
          r.imagePaths.forEach(p => {
            if (!allImagePaths.includes(p)) allImagePaths.push(p);
          });
        }
      });

      if (allImagePaths.length > 0) {
        imagesSection.classList.remove('hidden');
        imagesGallery.innerHTML = allImagePaths.map(path => `
          <div class="detail-image-item">
            <img src="${path}" class="detail-image-thumb" alt="exam paper"
                 onclick="window.open('${path}', '_blank')">
          </div>
        `).join('');
      } else {
        imagesSection.classList.add('hidden');
        imagesGallery.innerHTML = '';
      }
    }

    // Store data on the page for later use
    document.getElementById('page-grade-detail').dataset.groupId = groupId || '';
    document.getElementById('page-grade-detail').dataset.gradeId = grade ? grade.id : '';
  },

  /**
   * 渲染科目详情页（大考单科点击）
   * @param {Object} grade - 单条成绩记录
   */
  renderSubjectDetail(grade) {
    if (!grade) return;

    const card = document.getElementById('subject-detail-card');
    const pct = grade.total > 0 ? Math.round((grade.score / grade.total) * 100) : 0;
    const scoreColor = pct >= 90 ? '#10b981' : pct >= 75 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : '#ef4444';
    const examName = grade.examName || (I18n._lang === 'zh' ? '日常考试' : 'Regular Exam');
    const hasSubScores = grade.subScores && grade.subScores.length > 0;
    const hasImages = grade.imagePaths && grade.imagePaths.length > 0;

    let subScoresHtml = '';
    if (hasSubScores) {
      subScoresHtml = `
        <div class="subject-sub-scores">
          <h3 style="font-size:0.88rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary);">${I18n.t('sub_scores')}</h3>
          <table class="sub-scores-table">
            <thead><tr>
              <th>${I18n.t('sub_score_type')}</th>
              <th>${I18n.t('sub_score_score')}</th>
              <th>${I18n.t('sub_score_total')}</th>
              <th>%</th>
            </tr></thead>
            <tbody>
              ${grade.subScores.map(ss => {
                const spct = ss.total > 0 ? Math.round((ss.score / ss.total) * 100) : 0;
                return `<tr>
                  <td>${I18n.t('question_type_' + ss.type) || ss.type}</td>
                  <td class="sub-score-cell-score">${ss.score}</td>
                  <td class="sub-score-cell-total">${ss.total}</td>
                  <td class="sub-score-cell-pct">${spct}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    let imagesHtml = '';
    if (hasImages) {
      imagesHtml = `
        <div class="detail-section">
          <h3 style="font-size:0.88rem;font-weight:600;margin-bottom:8px;color:var(--text-secondary);">${I18n.t('uploaded_images')}</h3>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${grade.imagePaths.map(path => `
              <div class="detail-image-item" style="width:140px;height:140px;">
                <img src="${path}" class="detail-image-thumb" alt="exam paper"
                     onclick="window.open('${path}', '_blank')">
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="detail-header">
        <div class="detail-header-top">
          <span class="detail-exam-name">${grade.subject}</span>
        </div>
        <div class="detail-date" style="font-size:0.82rem;color:var(--text-tertiary);">${examName} · ${grade.date}</div>
      </div>

      <div class="detail-stats" style="margin-bottom:18px;padding:14px 0;border-top:1px solid var(--border-color);border-bottom:1px solid var(--border-color);display:flex;gap:20px;">
        <div class="detail-stat-item">
          <span class="detail-stat-value" style="color:${scoreColor}">${grade.score}</span>
          <span class="detail-stat-label" style="font-size:0.76rem;color:var(--text-tertiary);">${I18n.t('score')}</span>
        </div>
        <div class="detail-stat-item">
          <span class="detail-stat-value">${grade.total}</span>
          <span class="detail-stat-label" style="font-size:0.76rem;color:var(--text-tertiary);">${I18n.t('total_score')}</span>
        </div>
        <div class="detail-stat-item">
          <span class="detail-stat-value" style="color:${scoreColor}">${pct}%</span>
          <span class="detail-stat-label" style="font-size:0.76rem;color:var(--text-tertiary);">正确率</span>
        </div>
        ${grade.classRank ? `
        <div class="detail-stat-item detail-stat-rank">
          <span class="detail-stat-value rank-value">#${grade.classRank}${grade.classTotal ? '/' + grade.classTotal : ''}</span>
          <span class="detail-stat-label" style="font-size:0.76rem;color:var(--text-tertiary);" data-i18n="class_rank">班级排名</span>
        </div>` : ''}
        ${grade.gradeRank ? `
        <div class="detail-stat-item detail-stat-rank">
          <span class="detail-stat-value rank-value">#${grade.gradeRank}${grade.gradeTotal ? '/' + grade.gradeTotal : ''}</span>
          <span class="detail-stat-label" style="font-size:0.76rem;color:var(--text-tertiary);" data-i18n="grade_rank">年级排名</span>
        </div>` : ''}
      </div>

      ${hasSubScores ? subScoresHtml : '<div class="subject-empty-hint">' + I18n.t('no_sub_scores') + '</div>'}
      ${hasImages ? imagesHtml : ''}
    `;

    // Update page title
    const title = document.getElementById('subject-detail-title');
    if (title) {
      title.textContent = grade.subject + ' - ' + I18n.t('subject_detail');
    }
  },

  /**
   * 渲染一行小题分输入
   * @param {Object} data - { type, score, total } or null for empty
   */
  renderSubScoreRow(data) {
    const types = [
      'choice', 'fill', 'solve', 'listen', 'cloze', 'reading', 'essay',
      'classical', 'mini_read', 'big_read', 'masterwork', 'expr_choice', '7of5', 'comprehensive'
    ];
    const typeOptions = types.map(t => {
      const label = I18n.t(`question_type_${t}`);
      const selected = data && data.type === t ? 'selected' : '';
      return `<option value="${t}" ${selected}>${label}</option>`;
    }).join('');

    return `
      <div class="sub-score-row">
        <select class="form-select sub-score-type">${typeOptions}</select>
        <input type="number" class="form-input sub-score-input" placeholder="${I18n.t('sub_score_score')}" min="0" value="${data && data.score !== undefined ? data.score : ''}">
        <span class="sub-score-sep">/</span>
        <input type="number" class="form-input sub-score-input sub-score-total" placeholder="${I18n.t('sub_score_total')}" min="0" value="${data && data.total !== undefined ? data.total : ''}">
        <button type="button" class="sub-score-remove-btn" title="${I18n.t('remove')}">×</button>
      </div>
    `;
  },
};
