# 学习小工具

> 一个本地优先的桌面学习工作台——成绩追踪、AI 陪练、语音听写，离线也能用。

## 特性

基于 Electron 构建的桌面应用，学习数据全部留在你的电脑里；
成绩追踪：大考小考分开记，14 种题型小题分，班级/年级排名一目了然；
成绩可视化：纯本地渲染趋势图，进步退步看得见，数据不上传；
AI 智能分析：接入 OpenAI / Gemini 兼容接口，自动读成绩、图表与试卷图给建议；
文字转语音（TTS）：20+ 中文神经语音，男声女声随心换，语速自由调节；
单词本：全局快捷键随时取词，释义、音标、例句一窗看全；
试卷 OCR：本地识别试卷文字，题目答案随手提取，不依赖联网；
听写练习：上传试卷 → OCR 提词 → 语音朗读 → 开口跟读，听写闭环一气呵成；
内置课程平台：一键自动安装依赖并启动，学习资源本地跑；
隐私优先：成绩、设置、试卷图片全部存于本机，绝不云端同步或上传；
具有亮/暗色主题，还能根据系统设置自动切换；
多主题配色，支持你高度自定义；
系统托盘驻留，最小化后台常驻不占地方；
中英双语界面，护眼又顺手；
……
还有更多待你发现。

## 软件截图

主界面（亮色）
![主界面（亮色）](docs/screenshots/light.png)

主界面（暗色）
![主界面（暗色）](docs/screenshots/dark.png)

成绩趋势图
![成绩趋势图](docs/screenshots/chart.png)

## 安装&使用

> Tip
> 可在 学习小工具 官方文档 查看完整教程。

> Important
> 若要体验此页面的特性，请前往 Releases 页面下载最新构建。

下载 当前版本 中最新版安装包（Windows 为 `.exe`、macOS 为 `.dmg`、Linux 为 `.AppImage`），安装后运行 **学习小工具** 即可。可通过托盘菜单进入设置、或退出此程序；在「设置」中粘贴你的 AI Key 与 TTS 配置后即可启用对应能力。

## 协议

此项目（学习小工具）基于 MIT 许可证授权发布，详情请参阅 LICENSE 文件。

Copyright © 2026 学习小工具团队.

## 致谢

### 第三方库和框架
- [Electron](https://www.electronjs.org/) —— 跨平台桌面应用框架（主进程与渲染进程均 `require('electron')`）
- [EasyOCR](https://github.com/JaidedAI/EasyOCR) —— 本地试卷文字识别（Python 服务 `import easyocr`）
- [Pillow](https://python-pillow.org/) / [NumPy](https://numpy.org/) / [OpenCV](https://opencv.org/) —— 图像预处理与 OCR 增强（Python 服务 `import PIL / numpy / cv2`）
- [electron-builder](https://www.electron.build/) —— 安装包构建（`npm run dist:*` 调用）
- [sharp](https://sharp.pixelplumbing.com/) / [to-ico](https://github.com/kevva/to-ico) —— 应用图标生成（`build-icons.js` 中调用）

### 外部服务（运行时调用）
- 微软 Azure 神经语音（TTS 接口，文字转语音）
- OpenAI / Gemini 兼容接口（AI 智能分析，需自备 Key）

### 资源
- 内置图标（由 `build-icons.js` 脚本自绘生成）

## 贡献

Ask zread &nbsp; Ask DeepWiki

感谢以下同学为 学习小工具 作出贡献。

## 赞助商

感谢以下人员对本项目的支持。

## 社区

我们目前开通了 Issues、Discussions、QQ 群和 Discord 服务器。

## 星标历史

Star History Chart

---

这仅是我作为新人的练习作品，欢迎提供更多意见！
