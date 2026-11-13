#!/usr/bin/env node
/**
 * 根据工程里的歌词、节奏轨和可选 song-analysis.json 生成可编辑的全曲分镜草稿。
 * 只写 STORYBOARD.md，不覆盖 shots/*.js，也不改变现有渲染行为。
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const project = path.resolve(process.argv[2] || '.');
const args = process.argv.slice(3);
const argValue = (name, fallback) => {
  const hit = args.find((v) => v === name || v.startsWith(name + '='));
  if (!hit) return fallback;
  return hit === name ? args[args.indexOf(hit) + 1] : hit.slice(name.length + 1);
};
const requestedOut = argValue('--out', 'STORYBOARD.md');
const outFile = path.isAbsolute(requestedOut) || path.dirname(requestedOut) !== '.'
  ? path.resolve(requestedOut) : path.resolve(project, requestedOut);
const analysisFile = argValue('--analysis', null);
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const loadWindow = (file) => {
  const box = { window: {} };
  const source = read(file);
  if (!source) return box.window;
  vm.runInNewContext(source, box, { filename: file });
  return box.window;
};
const index = read(path.join(project, 'index.html'));
const number = (pattern, fallback) => {
  const hit = index.match(pattern);
  return hit ? Number(hit[1]) : fallback;
};
const duration = number(/DURATION\s*:\s*([\d.]+)/, 0);
const bpm = number(/BPM\s*:\s*([\d.]+)/, 120);
const lyrics = loadWindow(path.join(project, 'lyrics.js')).LYRICS || [];
const direction = loadWindow(path.join(project, 'direction.js')).MV_DIRECTION || {};
const rhythm = loadWindow(path.join(project, 'rhythm.js')).MV_RHYTHM || {};
let analysis = {};
const analysisPath = analysisFile ? path.resolve(analysisFile) : path.join(project, 'song-analysis.json');
if (fs.existsSync(analysisPath)) {
  try { analysis = JSON.parse(fs.readFileSync(analysisPath, 'utf8')); }
  catch (error) { console.error('读取分析文件失败：' + error.message); process.exit(1); }
}
const beats = Array.isArray(rhythm.beats) ? rhythm.beats : [];
const downbeats = Array.isArray(rhythm.downbeats) ? rhythm.downbeats : [];
const sections = Array.isArray(analysis.sections) ? analysis.sections : [];
const events = Array.isArray(analysis.events) ? analysis.events : [];
const hits = Array.isArray(analysis.hits) ? analysis.hits : [];
const track = (name) => Array.isArray(rhythm[name]) ? rhythm[name] : [];
const fmt = (value) => Number(value || 0).toFixed(2);
const clean = (value) => String(value || '').replace(/[|\n\r]/g, ' ').trim();
const lineText = (line) => Array.isArray(line) ? line[2] : line?.text || '';
const lineStart = (line) => Array.isArray(line) ? Number(line[0]) : Number(line?.start || 0);
const lineEnd = (line) => Array.isArray(line) ? Number(line[1]) : Number(line?.end || lineStart(line) + 1);
const within = (items, start, end) => items.filter((t) => t >= start && t <= end);
const nearest = (items, target, start, end) => {
  const candidates = within(items, start, end);
  return candidates.length ? candidates.reduce((a, b) => Math.abs(a - target) < Math.abs(b - target) ? a : b) : null;
};
const scaleNames = ['远景', '中景', '近景', '特写'];
const cameraNames = ['横移', '推近', '跟拍', '静止反应'];
const eventFor = (start, end, i) => {
  const target = start + (end - start) * 0.6;
  const kind = i % 3 === 0 ? 'kick' : i % 3 === 1 ? 'snare' : 'beats';
  const hit = nearest(track(kind), target, start, end) ?? nearest(beats, target, start, end);
  return hit === null ? '待听校' : kind + ' ' + fmt(hit) + 's';
};
const sectionFor = (start) => {
  const item = sections.find((s) => start >= Number(s.start) && start < Number(s.end));
  return item ? '段 ' + (sections.indexOf(item) + 1) + '（' + (item.level || '待命名') + '）' : '待命名段落';
};
const boundaryRows = [];
const boundaryPoints = new Set([0, duration]);
for (const section of sections) {
  if (Number.isFinite(Number(section.start))) boundaryPoints.add(Math.max(0, Number(section.start)));
  if (Number.isFinite(Number(section.end))) boundaryPoints.add(Math.min(duration, Number(section.end)));
}
const sortedPoints = [...boundaryPoints].sort((a, b) => a - b);
for (let i = 0; i < sortedPoints.length - 1; i++) boundaryRows.push([sortedPoints[i], sortedPoints[i + 1]]);
const rows = [];
if (lyrics.length) {
  lyrics.forEach((line, i) => {
    const start = Math.max(0, lineStart(line));
    const end = Math.min(duration || lineEnd(line), lineEnd(line));
    if (!(end > start)) return;
    rows.push({
      start, end, section: sectionFor(start), text: clean(lineText(line)),
      scale: scaleNames[i % scaleNames.length], camera: cameraNames[i % cameraNames.length],
      anchor: eventFor(start, end, i),
      action: '准备关系或道具，' + (i % 2 ? '在声音锚点完成接触' : '在声音锚点改变方向') + '，镜尾留下结果',
      reason: '歌词事件'
    });
  });
} else {
  const pointsByBeat = downbeats.length ? downbeats : beats;
  const step = Math.max(1, Math.round((bpm > 0 ? 60 / bpm : 0.6) * 4 / (bpm > 120 ? 2 : 1)));
  for (let i = 0; i < pointsByBeat.length && pointsByBeat[i] < duration; i += step) {
    const start = pointsByBeat[i];
    const next = pointsByBeat[i + step];
    const end = Math.min(duration, next ?? (start + 4 * 60 / bpm));
    if (end > start) rows.push({
      start, end, section: sectionFor(start), text: '（无歌词，填写本段可见事件）',
      scale: scaleNames[rows.length % scaleNames.length], camera: cameraNames[rows.length % cameraNames.length],
      anchor: eventFor(start, end, rows.length),
      action: '写出准备 → 接触 → 回收，并说明人物或道具在镜尾的结果',
      reason: '节拍网格'
    });
  }
}
for (const [start, end] of boundaryRows) {
  if (!rows.some((row) => Math.abs(row.start - start) < 0.03)) rows.push({
    start, end, section: sectionFor(start), text: '（段落边界，填写场景或关系变化）',
    scale: '远景', camera: '静止反应', anchor: eventFor(start, end, rows.length),
    action: '在这里决定换场、换机位、换色或保留留白', reason: '段落边界'
  });
}
rows.sort((a, b) => a.start - b.start);
const introEnd = Number(direction.introEnd || 0);
const lines = [
  '# 全曲分镜草稿',
  '',
  '> 这是可编辑的导演草稿，由歌词、节奏轨和可选歌曲分析生成。它不会自动覆盖 shots/*.js。',
  '> 每一行都要补上具体场景、角色动作、镜尾结果和切镜理由。确认后再把它写入正式镜头。',
  '',
  '## 项目时钟',
  '',
  '- 时长：' + fmt(duration) + 's',
  '- BPM：' + fmt(bpm),
  '- 片头结束：' + (introEnd ? fmt(introEnd) + 's' : '无或待定'),
  '- 节拍轨：' + beats.length + ' 个 beat，' + downbeats.length + ' 个 downbeat',
  '- 分析事件：' + events.length + ' 个变化，' + hits.length + ' 个重音',
  '',
  '## 镜头草稿',
  '',
  '| 时间 | 段落 | 歌词或可见事件 | 景别 | 机位运动 | 声音锚点 | 镜内表演 | 生成依据 |',
  '|---|---|---|---|---|---|---|---|'
];
rows.forEach((row) => {
  lines.push('| ' + fmt(row.start) + '–' + fmt(row.end) + ' | ' + row.section + ' | ' + row.text +
    ' | ' + row.scale + ' | ' + row.camera + ' | ' + row.anchor + ' | ' + row.action +
    ' | ' + row.reason + ' |');
});
lines.push(
  '',
  '## 导演复核',
  '',
  '- [ ] 片头是否在第一句或第一记重音前完成，标题是否需要保留。',
  '- [ ] 每个承担叙事的镜头是否写清准备、接触、回收和镜尾结果。',
  '- [ ] 每次循环是否有明确动机，停顿是否写明观众需要看清的细节。',
  '- [ ] 同场景换机位是否保持视线、运动方向或道具关系。',
  '- [ ] 交付前是否已经替换所有 rehearsal: true 镜头。',
  ''
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log('已写出 ' + outFile + '（' + rows.length + ' 行草稿，不修改 shots）');
