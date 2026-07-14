/**
 * clean-before-build.js
 *
 * 打包前清理脚本 — 在 electron-builder 打包之前自动执行。
 *
 * 清理内容：
 *   1. data/ 目录下的测试用户数据（settings.json、user.json、grades.json、images/）
 *   2. dist/ 目录下的旧构建产物
 *   3. 确保打包产物不包含任何开发期间的测试数据
 *
 * 注意：此脚本不会删除 data/ 目录本身（运行时由 app 自动创建），
 *       也不会影响开发环境的数据文件（仅清理会被打包的副本）。
 *
 * 用法：
 *   node scripts/clean-before-build.js        # 交互模式（需要确认）
 *   node scripts/clean-before-build.js --yes  # 跳过确认，直接执行
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

// 需要清理的测试数据文件
const TEST_DATA_FILES = [
  'settings.json',
  'user.json',
  'grades.json',
];

// 需要清理的测试数据目录
const TEST_DATA_DIRS = [
  'images',
];

/**
 * 递归删除目录（如果存在）
 */
function removeDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  try {
    fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    console.log(`  [OK] 已删除目录: ${path.relative(PROJECT_ROOT, dirPath)}`);
  } catch (err) {
    console.warn(`  [WARN] 删除目录失败: ${path.relative(PROJECT_ROOT, dirPath)} — ${err.message}`);
  }
}

/**
 * 删除文件（如果存在）
 */
function removeFileSync(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
    console.log(`  [OK] 已删除文件: ${path.relative(PROJECT_ROOT, filePath)}`);
  } catch (err) {
    console.warn(`  [WARN] 删除文件失败: ${path.relative(PROJECT_ROOT, filePath)} — ${err.message}`);
  }
}

/**
 * 清理 data/ 目录下的测试用户数据
 */
function cleanTestData() {
  console.log('\n[1/3] 清理 data/ 目录下的测试用户数据...');

  if (!fs.existsSync(DATA_DIR)) {
    console.log('  [SKIP] data/ 目录不存在，跳过');
    return;
  }

  // 删除测试数据文件
  for (const file of TEST_DATA_FILES) {
    removeFileSync(path.join(DATA_DIR, file));
  }

  // 删除测试数据目录
  for (const dir of TEST_DATA_DIRS) {
    removeDirSync(path.join(DATA_DIR, dir));
  }

  console.log('  [DONE] 测试用户数据已清理');
}

/**
 * 清理 dist/ 目录下的旧构建产物
 */
function cleanOldBuild() {
  console.log('\n[2/3] 清理 dist/ 目录下的旧构建产物...');

  if (!fs.existsSync(DIST_DIR)) {
    console.log('  [SKIP] dist/ 目录不存在，跳过');
    return;
  }

  removeDirSync(DIST_DIR);
  console.log('  [DONE] 旧构建产物已清理');
}

/**
 * 验证清理结果 — 确保测试数据不会被打包
 */
function verifyClean() {
  console.log('\n[3/3] 验证清理结果...');

  let allClean = true;

  for (const file of TEST_DATA_FILES) {
    const filePath = path.join(DATA_DIR, file);
    if (fs.existsSync(filePath)) {
      console.error(`  [FAIL] 测试数据仍存在: ${path.relative(PROJECT_ROOT, filePath)}`);
      allClean = false;
    }
  }

  for (const dir of TEST_DATA_DIRS) {
    const dirPath = path.join(DATA_DIR, dir);
    if (fs.existsSync(dirPath)) {
      console.error(`  [FAIL] 测试目录仍存在: ${path.relative(PROJECT_ROOT, dirPath)}`);
      allClean = false;
    }
  }

  if (allClean) {
    console.log('  [PASS] 所有测试数据已清除，可以安全打包');
  } else {
    console.error('  [FAIL] 清理不完整！请手动检查上述文件/目录');
    process.exit(1);
  }
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  const skipConfirm = process.argv.includes('--yes');

  console.log('========================================');
  console.log('  学习小工具 — 打包前清理脚本');
  console.log('========================================');

  if (!skipConfirm) {
    console.log('\n即将执行以下操作：');
    console.log('  1. 删除 data/ 下的测试用户数据（settings.json、user.json、grades.json、images/）');
    console.log('  2. 删除 dist/ 下的旧构建产物');
    console.log('  3. 验证清理结果');
    console.log('\n注意：此操作不可逆！开发期间的数据将被清除。');
    console.log('如需保留开发数据，请先备份 data/ 目录。');

    // 在 npm script 中运行时自动跳过确认
    if (process.env.npm_lifecycle_event && process.env.npm_lifecycle_event.startsWith('pre')) {
      console.log('\n[检测到 npm pre-hook 自动执行，跳过确认]');
    } else {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => {
        rl.question('\n确认执行清理？(y/N) ', resolve);
      });
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log('已取消清理。');
        process.exit(0);
      }
    }
  }

  cleanTestData();
  cleanOldBuild();
  verifyClean();

  console.log('\n========================================');
  console.log('  清理完成！可以开始打包了。');
  console.log('========================================\n');
}

main().catch(err => {
  console.error('清理脚本执行失败:', err);
  process.exit(1);
});
