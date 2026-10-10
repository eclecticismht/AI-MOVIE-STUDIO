// Presentation helpers only. Production records and generation contracts stay unchanged.
(function (root) {
  'use strict';
  const stages = [
    { id: 'write', title: '写剧本', note: '故事与对白', icon: 'pen', defaultRoute: 'scripts', hint: '对白先行，保留故事与剧本版本', routes: [['stories', '故事'], ['scripts', '剧本']] },
    { id: 'assets', title: '做资产', note: '人物与世界', icon: 'grid', defaultRoute: 'assets', hint: '管理可复用资产；不在此固定每场人物座次', routes: [['assets', '资产总览'], ['characters', '角色'], ['scenes', '场景'], ['propsdb', '道具']] },
    { id: 'storyboard', title: '做分镜', note: '设计怎样拍', icon: 'grid', defaultRoute: 'previs', hint: '先排座次、动作与机位，再生成镜头', routes: [['previs', '导演预演'], ['shots', '分镜设计']] },
    { id: 'produce', title: '做镜头', note: '生成与审片', icon: 'film', defaultRoute: 'gen', hint: '按分镜生成、绑定声音并比较候选', routes: [['gen', 'AI 生成'], ['review', '审片室'], ['audio', '镜头声音']] },
    { id: 'finish', title: '剪成片', note: '剪辑与输出', icon: 'cut', defaultRoute: 'timeline', hint: '先剪节奏，再检查与输出', routes: [['timeline', '剪辑台'], ['masters', '成片']] }
  ];
  // Director previs is a real explicit-save workspace; existing production routes remain available.
  function entryRoute(stageId) {
    const stage = stages.find(s => s.id === stageId);
    return stage?.defaultRoute || stage?.routes[0]?.[0] || null;
  }
  function stageFor(route) {
    if (route === 'assets') return 'assets';
    if (route === 'edit') return 'finish';
    return stages.find(s => s.routes.some(r => r[0] === route))?.id || null;
  }
  const own = (data, kind, id) => (data[kind] || []).filter(item => item.projectId === id);
  function summary(data, id) {
    const shots = own(data, 'shots', id).filter(s => !s.autoArchived);
    const ids = new Set(shots.map(s => s.id));
    const generations = own(data, 'generations', id).filter(g => ids.has(g.shot));
    const videoIds = new Set(generations.filter(g => g.videoUrl).map(g => g.shot));
    for (const shot of shots) if (shot.videoUrl) videoIds.add(shot.id);
    const jobs = own(data, 'jobs', id);
    const terminal = j => !!j.videoUrl || /已完成|已生成|待审核|取消/.test(j.status || '');
    const failed = jobs.filter(j => !terminal(j) && /失败|阻止|失联/.test(j.status || '')).length;
    const pending = jobs.filter(j => !terminal(j) && !/失败|阻止|失联/.test(j.status || '')).length;
    return { shots: shots.length, video: videoIds.size, review: generations.filter(g => g.status === '待审核').length,
      scripts: own(data, 'scripts', id).filter(s => !s.autoArchived).length, pending, failed,
      assets: ['characters', 'scenes', 'props'].reduce((n, k) => n + own(data, k, id).length, 0) };
  }
  function nextRoute(data, project, last) {
    if (last && stageFor(last)) return last;
    const s = summary(data, project.id);
    if (s.video) return 'timeline';
    if (s.shots) return s.pending ? 'gen' : 'shots';
    return 'scripts';
  }
  function versionPatch(edit, versionId, duration) {
    if (typeof versionId !== 'string' || !versionId || !Number.isFinite(duration) || duration < .1) throw Error('视频版本或实际时长无效。');
    const trimIn = Number(edit.trimIn ?? 0), trimOut = Number(edit.trimOut ?? edit.sourceDuration ?? duration);
    if (!Number.isFinite(trimIn) || !Number.isFinite(trimOut) || trimIn < 0 || trimOut - trimIn < .1) throw Error('当前剪点无效，请先调整入出点。');
    if (trimOut > duration + .001) throw Error('新版本短于当前出点。未替换：请先调整剪点，避免自动移动后续对白和画面。');
    return { versionId, sourceDuration: duration, trimIn, trimOut };
  }
  function newProject(data, input, id, now = new Date().toISOString()) {
    const name = String(input.name || '').trim(), type = input.type, target = Number(input.target);
    if (!name || name.length > 80) throw Error('项目名称需为 1–80 个字。');
    if (!['短剧', '电影', '短片'].includes(type)) throw Error('请选择作品类型。');
    if (!Number.isFinite(target) || target < .1 || target > 600) throw Error('目标时长需为 0.1–600 分钟。');
    if (typeof id !== 'string' || !id || data.projects.some(p => p.id === id)) throw Error('项目编号重复，请重试。');
    return { id, name, type, universe: '', target, status: '策划中', created: now.slice(0, 10),
      storyText: '', bible: { logline: '', synopsis: '', theme: '', genre: '', style: '写实电影感' },
      wizard: { name, type, target, style: '写实电影感', candidates: 1 },
      h3Width: 864, h3Height: 480, timelineOutputResolution: '2560x1440' };
  }
  function timecode(seconds, fps = 24) {
    const frames = Math.max(0, Math.round((Number(seconds) || 0) * fps));
    return [Math.floor(frames / (fps * 60)), Math.floor(frames / fps) % 60, frames % fps].map(n => String(n).padStart(2, '0')).join(':');
  }
  const api = { stages, stageFor, entryRoute, summary, nextRoute, versionPatch, newProject, timecode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StudioWorkbenchModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
