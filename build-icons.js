/**
 * 生成 Windows .ico 图标（多分辨率）
 * 需要 to-ico 包（已安装）
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function main() {
  const assetsDir = path.join(__dirname, 'assets');
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  console.log('Reading icon PNGs...');
  for (const s of sizes) {
    const filePath = path.join(assetsDir, `icon-${s}.png`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  ⚠ Missing icon-${s}.png, skipping`);
      continue;
    }
    const buf = await sharp(filePath).png().toBuffer();
    pngBuffers.push(buf);
    console.log(`  ✓ icon-${s}.png`);
  }

  if (pngBuffers.length === 0) {
    console.error('No icon PNGs found! Run generate-book-icon.js first.');
    process.exit(1);
  }

  console.log('\nGenerating .ico file...');
  // Use the to-ico package
  const toIco = require('to-ico');
  const icoBuffer = await toIco(pngBuffers);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), Buffer.from(icoBuffer));
  console.log(`  ✓ assets/icon.ico (${icoBuffer.length} bytes)`);

  console.log('\nDone!');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
