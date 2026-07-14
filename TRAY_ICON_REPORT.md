# 系统托盘与图标功能实现报告

## 修改日期：2026-07-05

---

## 功能清单

### 1. 自定义任务栏/窗口图标

- 生成文件：`assets/icon-16.png`、`assets/icon-32.png`、`assets/icon-256.png`
- 生成脚本：`generate-icon.js`（零依赖，运行 `node generate-icon.js` 可重新生成）
- `main.js` 中 `BrowserWindow.icon` 设置为高清图标，Windows 任务栏/Alt-Tab 均使用此图标

### 2. 系统托盘驻留

- `main.js` 中新增 `createTray()` 函数
- 应用启动后在系统托盘区域显示图标
- 托盘图标使用 16x16 版本，适配高清屏自动缩放

### 3. 托盘右键菜单

右键托盘图标弹出菜单：
- **打开主界面**：点击后恢复并显示主窗口，若窗口被销毁则重新创建
- **退出**：彻底退出应用

### 4. 关闭主界面确认对话框

当用户点击窗口右上角 X、Alt+F4、任务栏右键关闭或调用 IPC `window-close` 时，均会弹出原生对话框：

> 你希望关闭应用还是最小化到系统托盘？  
> 最小化到托盘后，应用将在后台继续运行，下次点击托盘图标即可打开。

选项：
- **最小化到托盘**：隐藏窗口，保留托盘图标，后台继续运行（OpenMAIC 课程服务也继续运行）
- **关闭应用**：允许窗口关闭，最终退出整个 Electron 应用

---

## 数据隐私说明

OpenMAIC 及本应用的所有数据均保留在本地：

| 数据类型 | 本地位置 |
|---------|---------|
| 用户设置 | `data/settings.json`（项目目录） |
| 成绩记录 | `data/grades.json`（项目目录） |
| 用户信息 | `data/user.json`（项目目录） |
| 试卷图片 | `local-asset://images/*`（Electron userData/images） |
| OpenMAIC 运行配置 | `userData/openmaic/.env.local`（本地环境变量，仅本地服务读取） |
| OpenMAIC 源码与缓存 | `userData/openmaic/`（本地磁盘） |

**无远程同步/无云上传**：源码仓库从 GitHub 拉取，但运行所需的用户数据、API 配置、成绩、图片全部存储在本地磁盘，不调用任何同步或上传接口。

---

## 修改文件

| 文件 | 修改说明 |
|------|---------|
| `main.js` | 新增 Tray/Menu/nativeImage/dialog 导入；实现图标加载、托盘创建、关闭对话框 |
| `package.json` | 新增 `generate-icon` 脚本 |
| `generate-icon.js` | 新增图标生成脚本 |
| `assets/icon-16.png` | 新增托盘图标 |
| `assets/icon-32.png` | 新增窗口图标 |
| `assets/icon-256.png` | 新增高清任务栏图标 |

---

## 使用方式

1. 重新生成图标：
   ```bash
   npm run generate-icon
   ```

2. 启动应用：
   ```bash
   npm run dev
   # 或
   npm start
   ```

3. 关闭窗口测试：
   - 点击窗口右上角 X → 弹出确认对话框
   - 选择"最小化到托盘" → 窗口隐藏，右下角托盘图标保留
   - 点击托盘图标或右键选择"打开主界面" → 窗口恢复

4. 退出应用：
   - 右键托盘图标 → 选择"退出" → 应用彻底关闭
   - 或在关闭对话框中选择"关闭应用"
