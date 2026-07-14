const asar=require('./node_modules/@electron/asar/lib/asar.js');
const ap = String.raw`\src\js\app.js`;
const mn = String.raw`\main.js`;
const a=asar.extractFile('dist/win-unpacked/resources/app.asar', ap).toString('utf-8');
console.log('speakWord 用 result.audio:', a.includes('result.audio'));
console.log('已无 ttsGetAudio 调用:', !a.includes('ttsGetAudio'));
const m=asar.extractFile('dist/win-unpacked/resources/app.asar', mn).toString('utf-8');
console.log('main tts-speak 返回 audio:', m.includes('audio: audioBuffer.toString'));
console.log('main 已无 kw-paths handler:', !m.includes("'kw-paths'"));
