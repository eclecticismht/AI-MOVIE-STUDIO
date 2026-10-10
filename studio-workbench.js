// UI v0.3: adapt the existing production editors, never substitute demo data.
(function () {
  'use strict';
  const M = globalThis.StudioWorkbenchModel;
  if (!M || typeof D === 'undefined') throw Error('新版工作台依赖未加载，请刷新页面。');
  const VERSION = '0.4.0-alpha.4 · 五轨声音', PREFS = 'ams_workbench_view_v1';
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch {}
  const state = { route: 'studio', bin: 'shots', query: '', versionBusy: false, assetDirty: false, previousFocus: null };
  const $ = id => document.getElementById(id);
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    film: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 10h18M7 5l3 5m3-5 3 5m-7 5 5 3-5 3z"/>',
    pen: '<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14zM4 14l5 5"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m9 8 11 12M9 16 20 4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    chart: '<path d="M4 3v18h17M8 16v-4m5 4V7m5 9V4"/>',
    queue: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v1"/>'
  };
  const icon = name => '<svg class="wb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[name] || paths.film) + '</svg>';
  const routeTitle = route => M.stages.flatMap(s => s.routes).find(r => r[0] === route)?.[1] || ({ studio: '项目总台', projects: '项目管理', assets: '资产库', data: '数据', settings: '设置', cockpit: '项目详情' })[route] || '工作台';
  function savePreferences() { try { localStorage.setItem(PREFS, JSON.stringify(preferences)); } catch {} }
  function remember() {
    if (!M.stageFor(state.route)) return;
    preferences.last = { ...(preferences.last || {}), [D.activeProjectId]: state.route };
    savePreferences();
  }
  function notice(message) {
    if (typeof tlMessage === 'function') tlMessage(message);
    const status = $('wb-global-status'); if (status) status.textContent = message;
  }
  function canLeave() {
    if (globalThis.SoundStudioUI && !globalThis.SoundStudioUI.canLeave()) return false;
    if (globalThis.DirectorPrevisUI && !globalThis.DirectorPrevisUI.canLeave()) return false;
    if (state.versionBusy) { notice('正在核对视频版本，请完成后再切换。'); return false; }
    if (typeof tlCanLeave === 'function' && !tlCanLeave()) return false;
    if (state.assetDirty) {
      if (!confirm('资产档案有未保存修改。离开将放弃这些修改，是否继续？')) return false;
      state.assetDirty = false;
      if (typeof editingCharacterId !== 'undefined') editingCharacterId = null;
      if (typeof editingSceneId !== 'undefined') editingSceneId = null;
      if (typeof editingPropId !== 'undefined') editingPropId = null;
    }
    return true;
  }
  function safeImage(url) {
    if (typeof url !== 'string') return '';
    return /^(?:\/(?!\/)|https?:\/\/|data:image\/(?:png|jpe?g|webp|gif);base64,)/i.test(url) ? url : '';
  }
  function projectImage(id) {
    const shot = (D.shots || []).find(s => s.projectId === id && !s.autoArchived && safeImage(s.firstFrameUrl));
    return safeImage(shot?.firstFrameUrl) || safeImage((D.scenes || []).find(s => s.projectId === id && s.imageUrl)?.imageUrl) || safeImage((D.characters || []).find(s => s.projectId === id && s.imageUrl)?.imageUrl);
  }
  function mount() {
    document.body.classList.add('workbench-v3');
    document.body.dataset.wbTheme = preferences.theme === 'light' ? 'light' : 'dark';
    document.querySelector('body > aside')?.setAttribute('inert', '');
    const shell = document.createElement('header'); shell.id = 'wb-shell';
    shell.innerHTML = `<div class="wb-top"><button type="button" class="wb-brand" data-wb-route="studio" aria-label="AI MOVIE STUDIO，返回项目总台">${icon('film')}<span>AI MOVIE<small>STUDIO</small></span></button><nav class="wb-global" aria-label="工作室导航"><button class="btn wb-btn wb-quiet" data-wb-route="studio">${icon('grid')}<span>Studio</span></button><span class="wb-build" title="本机正式工程界面版本">Web ${VERSION}</span></nav><div class="wb-global-tools"><span id="wb-save" class="wb-save"></span><button class="btn wb-btn wb-quiet" id="wb-queue" title="打开当前项目生成任务">${icon('queue')}<span class="wb-tool-label">生成任务</span><span id="wb-queue-count">0</span></button><button class="btn wb-btn wb-quiet" data-wb-route="data" title="制作数据">${icon('chart')}<span class="wb-tool-label">数据</span></button><button class="btn wb-btn wb-quiet" id="wb-theme" aria-label="切换深色或浅色界面">${icon('sun')}</button><button class="btn wb-btn wb-quiet" data-wb-route="settings" title="系统设置">${icon('settings')}<span class="wb-tool-label">设置</span></button></div></div><div class="wb-projectbar" id="wb-projectbar" hidden><label class="wb-picker"><span>项目</span><select id="wb-project-select" aria-label="切换项目"></select></label><span class="wb-picker-divider"></span><label class="wb-picker" id="wb-batch-picker" hidden><span>分镜批次</span></label><button class="btn wb-btn wb-quiet" data-wb-route="assets">${icon('grid')}项目资产</button><span class="wb-format">本地生产 · 24 fps · 仅使用真实项目与素材</span></div><nav id="wb-stages" class="wb-stages" aria-label="制作阶段" hidden>${M.stages.map(s => `<button type="button" class="wb-stage" data-wb-stage="${s.id}" aria-pressed="false"><span>${icon(s.icon)}</span><span><strong>${s.title}</strong><small>${s.note}</small></span></button>`).join('')}</nav><nav id="wb-subnav" class="wb-subnav" aria-label="当前阶段工具" hidden></nav>`;
    document.querySelector('main').before(shell);
    const services = document.createElement('details'); services.id = 'wb-service-panel'; services.className = 'wb-service-popover';
    services.innerHTML = '<summary class="btn wb-btn wb-quiet">服务</summary>';
    shell.querySelector('.wb-global-tools').append(services);
    if ($('studioServiceControls')) services.append($('studioServiceControls'));
    const home = document.createElement('section'); home.id = 'wb-home'; home.className = 'page wb-home'; document.querySelector('main').append(home);
    const footer = document.createElement('footer'); footer.className = 'wb-footer';
    footer.innerHTML = '<span id="wb-context">AI MOVIE STUDIO · 本机工作台</span><span id="wb-global-status" role="status" aria-live="polite">界面已接入现有制作服务</span>';
    document.body.append(footer);
    shell.addEventListener('click', event => {
      const target = event.target.closest('[data-wb-route]'); if (target) go(target.dataset.wbRoute);
      const stage = event.target.closest('[data-wb-stage]'); if (stage) {
        const targetRoute = M.entryRoute(stage.dataset.wbStage);
        if (targetRoute) go(targetRoute);
      }
    });
    $('wb-project-select').onchange = event => openProject(event.target.value, state.route);
    $('wb-queue').onclick = () => { go('gen'); if (state.route === 'gen') tlTools('gen'); };
    $('wb-theme').onclick = () => { preferences.theme = document.body.dataset.wbTheme === 'dark' ? 'light' : 'dark'; document.body.dataset.wbTheme = preferences.theme; savePreferences(); };
    document.addEventListener('input', event => {
      if (event.target.closest('.library-group') && /^(char|scene|prop)_(name|type|notes|image_url|video_url)$/.test(event.target.id)) state.assetDirty = true;
    });
  }
  function shellUpdate() {
    if (!$('wb-shell')) return;
    document.body.dataset.wbRoute = state.route;
    const stage = M.stageFor(state.route), project = activeProject();
    $('wb-projectbar').hidden = ['studio', 'settings', 'projects'].includes(state.route);
    $('wb-stages').hidden = !stage; $('wb-subnav').hidden = !stage;
    const select = $('wb-project-select'), signature = JSON.stringify(D.projects.map(p => [p.id, p.name]));
    if (select.dataset.signature !== signature) { select.innerHTML = D.projects.map(p => `<option value="${h(p.id)}">${h(p.name)}</option>`).join(''); select.dataset.signature = signature; }
    select.value = project?.id || '';
    document.querySelectorAll('[data-wb-stage]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wbStage === stage)));
    const current = M.stages.find(s => s.id === stage);
    if (current) {
      const key = stage + '|' + state.route;
      if ($('wb-subnav').dataset.key !== key) {
        $('wb-subnav').innerHTML = current.routes.map(([route, title]) => `<button class="btn wb-btn wb-quiet" data-wb-route="${route}" ${state.route === route ? 'aria-current="page"' : ''}>${title}</button>`).join('') + `<span class="wb-subnote">${h(current.hint || current.note)}</span>`;
        $('wb-subnav').dataset.key = key;
      }
    }
    $('wb-batch-picker').hidden = !$('timeline')?.classList.contains('on');
    $('wb-context').textContent = (state.route === 'studio' ? 'AI MOVIE STUDIO' : project?.name || 'AI MOVIE STUDIO') + ' / ' + routeTitle(state.route);
    document.title = 'AI MOVIE STUDIO · ' + routeTitle(state.route);
    statusUpdate();
  }
  function statusUpdate() {
    if (!$('wb-save')) return;
    const sync = typeof workspaceSave !== 'undefined' ? workspaceSave : null;
    const warning = !!sync?.conflict || /失败|无法|中断|未确认|损坏|未连接/.test(sync?.message || '');
    if ($('workspaceSaveStatus')) $('workspaceSaveStatus').hidden = !warning;
    $('wb-save').classList.toggle('is-warning', warning);
    $('wb-save').textContent = warning ? '保存状态需检查' : sync?.pending || sync?.inflight ? '正在保存到本机…' : '本机工作区';
    $('wb-save').title = sync?.message || '沿用现有浏览器与磁盘保存机制';
    const s = M.summary(D, D.activeProjectId); $('wb-queue-count').textContent = String(s.pending);
    $('wb-queue').title = `当前项目：${s.pending} 个未完成任务，${s.failed} 个异常任务`;
  }
  function renderHome() {
    const host = $('wb-home'); if (!host) return;
    const stats = D.projects.map(p => M.summary(D, p.id));
    const total = key => stats.reduce((n, s) => n + s[key], 0);
    host.innerHTML = `<div class="wb-heading"><div class="wb-home-intro"><small>YOUR STORIES. YOUR STUDIO.</small><h1>让故事，成为电影。</h1><p>从上次停下的地方，继续你的创作。</p></div><button class="btn gold wb-btn" id="wb-new-project">${icon('plus')}新建项目</button></div><div class="wb-statline">${[[D.projects.length, '全部项目'], [total('shots'), '有效分镜'], [total('review'), '待审视频'], [total('pending'), '未完成生成任务']].map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('')}</div><div class="wb-section-head"><h2>我的项目</h2><span>真实项目数据 · 新旧版本与素材保留</span></div><div class="wb-project-grid">${D.projects.map((p, i) => {
      const s = stats[i], image = projectImage(p.id), route = M.nextRoute(D, p, preferences.last?.[p.id]);
      return `<article class="wb-project-card ${p.id === D.activeProjectId ? 'is-current' : ''}"><div class="wb-cover">${image ? `<img src="${h(image)}" alt="${h(p.name)}项目参考图" loading="lazy">` : icon('film')}<span class="wb-cover-tag">${h(p.type || '影视项目')} · ${h(p.status || '创作中')}</span><span class="wb-cover-name">${h(p.name)}</span></div><div class="wb-card-content"><h3>${h(p.name)}</h3><div class="wb-card-meta"><span>${s.shots} 镜 · ${s.assets} 项资产</span><span>${s.video} 镜有视频记录</span></div><div class="wb-card-foot"><span>${s.review ? s.review + ' 个视频待审' : s.scripts ? s.scripts + ' 份剧本已保存' : '从第一个故事开始'}</span><button class="btn wb-btn ${p.id === D.activeProjectId ? 'gold' : ''}" data-open-project="${h(p.id)}" data-route="${route}">继续${route === 'timeline' ? '剪辑' : route === 'scripts' ? '写剧本' : '制作'}${icon('arrow')}</button></div></div></article>`;
    }).join('') || '<div class="card empty">还没有项目，点击“新建项目”开始。</div>'}</div><div class="wb-flow-note"><span>${icon('pen')}写剧本</span><span>${icon('film')}做镜头</span><span>${icon('cut')}剪成片</span><p>常用操作在眼前，完整工具按需展开。</p></div><div class="wb-section-head"><span>后台任务与源视频不会因切换页面而停止。</span><button class="btn wb-quiet" id="wb-advanced-projects">项目管理与高级选项</button></div>`;
    $('wb-new-project').onclick = newProjectDialog;
    $('wb-advanced-projects').onclick = () => go('projects');
    host.querySelectorAll('[data-open-project]').forEach(button => button.onclick = () => openProject(button.dataset.openProject, button.dataset.route));
    host.querySelectorAll('img').forEach(image => { image.onerror = () => { image.hidden = true; }; });
  }
  function openProject(id, route) {
    if (!D.projects.some(p => p.id === id) || !canLeave()) { shellUpdate(); return; }
    try {
      const saved = JSON.parse(localStorage.getItem('aimovie_data') || 'null');
      if (!saved?.projects?.some(p => p.id === id)) throw Error('项目已变化，请重新载入后选择。');
      saved.activeProjectId = id; localStorage.setItem('aimovie_data', JSON.stringify(saved)); Object.assign(D, saved);
      if (typeof cutClear === 'function') cutClear();
      Object.assign(TL, { projectId: null, shotId: null, version: null, time: 0, drawer: false, previewKey: null });
      if ($('tl-drawer')) $('tl-drawer').hidden = true;
      state.query = ''; state.assetDirty = false;
      go(M.stageFor(route) ? route : M.nextRoute(D, activeProject(), preferences.last?.[id]));
    } catch (e) { notice('项目切换未完成：' + e.message); shellUpdate(); }
  }
  function newProjectDialog() {
    if (!canLeave()) return;
    $('wb-create-dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'wb-create-dialog'; dialog.className = 'wb-dialog';
    dialog.innerHTML = '<form><h2>开始一个新故事</h2><p>先建立项目。角色、场景和镜头可在创作过程中补充。</p><label>项目名称<input name="name" maxlength="80" required placeholder="例如：我不是西门庆"></label><div class="formgrid"><label>作品类型<select name="type"><option>短剧</option><option>电影</option><option>短片</option></select></label><label>目标时长（分钟）<input name="target" type="number" min="0.1" max="600" step="0.1" value="2" required></label></div><p>默认 480p 生成迭代 · 24 fps · 2K 输出画布。具体放大方式以导出面板为准。</p><p role="status"></p><footer><button type="button" class="btn" data-cancel>取消</button><button type="submit" class="btn gold">创建并开始</button></footer></form>';
    document.body.append(dialog); dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.onclose = () => dialog.remove();
    dialog.querySelector('form').onsubmit = event => {
      event.preventDefault();
      try {
        const input = Object.fromEntries(new FormData(event.currentTarget));
        const stored = JSON.parse(localStorage.getItem('aimovie_data') || 'null');
        if (!stored?.projects) throw Error('当前工作区无法读取，请先检查保存状态。');
        const p = M.newProject(stored, input, uid('AMS'));
        const next = { ...stored, projects: [...stored.projects, p], activeProjectId: p.id };
        localStorage.setItem('aimovie_data', JSON.stringify(next)); Object.assign(D, next); dialog.close(); go('scripts');
        notice('新项目已创建；未自动调用模型或提交生成任务。');
      } catch (e) { dialog.querySelector('[role=status]').textContent = e.message; }
    };
    dialog.showModal(); dialog.querySelector('input').focus();
  }
  function fold(node, title, key, defaultOpen = false) {
    if (!node || node.parentElement?.dataset.wbFold === key) return node?.parentElement;
    const details = document.createElement('details'); details.className = 'wb-fold'; details.dataset.wbFold = key;
    const summary = document.createElement('summary'); summary.textContent = title; details.append(summary);
    details.open = preferences.folds?.[key] ?? defaultOpen; node.before(details); details.append(node);
    details.addEventListener('toggle', () => { preferences.folds = { ...(preferences.folds || {}), [key]: details.open }; savePreferences(); });
    return details;
  }
  function decorateScripts() {
    const page = $('scripts'); if (!page) return;
    const title = page.querySelector('h1'); if (title) title.textContent = state.route === 'stories' ? '故事' : '剧本工作区';
    const lead = page.querySelector('h1 + p'); if (lead) lead.textContent = '故事、对白与配音先行。沿用已保存的版本，不自动改写原文。';
    const source = $('storyTextInput')?.closest('.card'), content = $('screenplayContent')?.closest('.card') || page.querySelector('.creative-columns > .card:last-child');
    source?.classList.add('wb-story-card'); if (content && content !== source) content.classList.add('wb-script-card');
    if (source && state.route !== 'stories') fold(source, '故事原文与改编要求', 'story-source');
    fold($('textAISettings'), 'AI 模型连接与高级设置', 'text-ai');
    fold(page.querySelector('.story-flow'), '自动创作、文件导入与恢复', 'story-flow');
  }
  function shotImage(shot) {
    const image = safeImage(shot.firstFrameUrl); if (image) return image;
    return safeImage((D.scenes || []).find(a => a.projectId === shot.projectId && (shot.sceneIds || []).includes(a.id))?.imageUrl);
  }
  function renderBin() {
    const host = $('tl-bin'); if (!host) return;
    host.innerHTML = `<div class="wb-bin-head"><div><span>本批内容</span><small>${tlClips().length} 个镜头</small></div><div class="wb-bin-tabs"><button data-bin="shots" aria-pressed="${state.bin === 'shots'}">镜头</button><button data-bin="dialogue" aria-pressed="${state.bin === 'dialogue'}">对白</button></div><input id="wb-bin-search" aria-label="搜索镜头或对白" placeholder="搜索镜头或对白" value="${h(state.query)}"></div><div class="wb-bin-list" id="wb-bin-list"></div><div class="wb-bin-foot">${state.bin === 'dialogue' ? '按镜头定位 · 不自动改写对白' : '项目内素材 · 保留全部生成版本'}</div>`;
    host.querySelectorAll('[data-bin]').forEach(button => button.onclick = () => { state.bin = button.dataset.bin; renderBin(); });
    $('wb-bin-search').oninput = event => { state.query = event.target.value; renderBinItems(); };
    renderBinItems();
  }
  function renderBinItems() {
    const host = $('wb-bin-list'); if (!host) return;
    const clips = tlClips(), query = state.query.trim().toLocaleLowerCase();
    const visible = clips.map((clip, index) => ({ clip, index })).filter(({ clip }) => [clip.shot.scene, clip.shot.script, clip.shot.dialogue, clip.shot.id].join(' ').toLocaleLowerCase().includes(query));
    host.innerHTML = visible.map(({ clip: c, index: i }) => {
      const image = shotImage(c.shot);
      return `<button type="button" data-shot="${h(c.shot.id)}" aria-pressed="${c.shot.id === TL.shotId}" title="第 ${i + 1} 镜 · ${h(c.shot.scene || '')}">${state.bin === 'dialogue' ? `<div class="wb-bin-dialogue"><small>${String(i + 1).padStart(2, '0')} · ${M.timecode(c.start)}</small>${h(c.shot.dialogue || '本镜无对白')}</div>` : `${image ? `<img class="wb-bin-thumb" src="${h(image)}" alt="本镜参考图" loading="lazy">` : `<span class="wb-bin-thumb">${String(i + 1).padStart(2, '0')}</span>`}<span class="wb-bin-copy"><b>${String(i + 1).padStart(2, '0')} · ${h(c.shot.scene || '镜头')}</b><small>${c.duration.toFixed(1)} 秒 · ${h(c.shot.status || '待制作')}</small></span>`}</button>`;
    }).join('') || '<p class="empty">没有匹配镜头。</p>';
    host.querySelectorAll('[data-shot]').forEach(button => button.onclick = () => tlSelect(button.dataset.shot));
    host.querySelectorAll('img').forEach(image => { image.onerror = () => { image.hidden = true; }; });
  }
  async function useVersion(versionId) {
    if (!canLeave()) return;
    const clip = tlCurrent(); if (!clip) return;
    const version = TimelineModel.versions(D, clip.shot).find(g => g.id === versionId);
    if (!version?.videoUrl) return notice('该版本没有可读取的视频。');
    if (tlMedia(clip.shot)?.id === versionId) return;
    state.versionBusy = true; cutStop();
    const key = cutKey(), baseline = JSON.stringify(cutSettings()), shotId = clip.shot.id;
    try {
      notice('正在核对新版本长度，保留当前剪点…');
      const duration = await cutProbeDuration(version.videoUrl);
      if (key !== cutKey() || TL.shotId !== shotId || baseline !== JSON.stringify(cutSettings())) throw Error('核对期间剪辑已变化，未替换版本。');
      const patch = M.versionPatch(clip.edit, versionId, duration);
      if (cutPatch(shotId, patch)) { TL.version = versionId; TL.previewKey = null; notice('剪辑版本已切换，原入出点、转场与音量保留；审片状态未改变。'); }
    } catch (e) { notice(e.message); }
    finally { state.versionBusy = false; tlRender(); }
  }
  function decorateInspector() {
    const host = $('tl-inspector'), clip = tlCurrent(); if (!host || !clip) return;
    if (globalThis.DirectorPrevisUI && !host.querySelector('[data-previs-open]')) {
      const b = document.createElement('button'); b.className = 'btn'; b.dataset.previsOpen = ''; b.textContent = '导演预演 / 对照座次';
      b.onclick = () => globalThis.DirectorPrevisUI.openForShot(clip.shot.id); host.prepend(b);
    }
    const versions = host.querySelector('[aria-label="本镜视频版本"]');
    if (versions) versions.onchange = () => useVersion(versions.value);
    const cut = host.querySelector('.cut-properties');
    if (cut) {
      const headings = [...cut.querySelectorAll('h3')], mix = headings.find(x => x.textContent === '实时混音');
      if (mix && TL.mode !== 'audio') {
        const nodes = []; let n = mix; while (n) { nodes.push(n); n = n.nextSibling; }
        const details = document.createElement('details'); details.className = 'wb-fold';
        const summary = document.createElement('summary'); summary.textContent = '音乐与混音'; details.append(summary); mix.before(details); nodes.forEach(x => details.append(x));
      }
    }
    if (TL.mode !== 'cut' || host.querySelector('.wb-current-version')) return;
    const list = TimelineModel.versions(D, clip.shot), chosen = tlMedia(clip.shot);
    const section = document.createElement('section'); section.className = 'wb-current-version';
    section.innerHTML = `<div class="wb-card-meta"><span>剪辑使用版本</span><span>${list.length} 个版本</span></div>${list.length ? `<div class="wb-version-grid">${list.slice(0, 3).map((v, i) => `<button data-version="${h(v.id)}" aria-pressed="${chosen?.id === v.id}" title="${h(v.version || '版本 ' + (i + 1))}"><b>${h(v.version || '版本 ' + (i + 1))}</b><small>${h(v.status === 'MASTER' ? '已采用' : v.status || '待审')}</small></button>`).join('')}</div>` : '<p class="muted">本镜还没有视频，可导入素材或生成新版本。</p>'}<div class="wb-inspector-actions"><button class="btn" data-review>全部版本</button><button class="btn" data-redo>AI 帮我改</button></div>`;
    host.prepend(section);
    section.querySelectorAll('[data-version]').forEach(button => button.onclick = () => useVersion(button.dataset.version));
    section.querySelector('[data-review]').onclick = () => tlMode('review');
    section.querySelector('[data-redo]').onclick = () => timelineOpenRedo();
  }
  function decorateTimeline() {
    const page = $('timeline'); if (!page) return;
    const stage = page.querySelector('.tl-stage'), tracks = page.querySelector('.tl-timeline');
    if (stage && stage.parentElement !== page) page.querySelector('.tl-head').after(stage);
    if (tracks && tracks.parentElement !== page) stage.after(tracks);
    const legacyFold = $('actFilmAdvanced'); if (legacyFold && !legacyFold.querySelector('.tl-stage,.tl-timeline,#cut-toolbar,#timelinePromptPanel')) legacyFold.remove();
    const actPanel = $('actFilmPanel');
    if (actPanel) {
      const group = fold(actPanel, '场次合成与历史成片', 'act-films');
      if (group && $('tl-notice') && group.previousElementSibling !== $('tl-notice')) $('tl-notice').after(group);
    }
    const heading = page.querySelector('.tl-head h1'); if (heading) heading.textContent = state.route === 'timeline' ? '剪辑台' : '镜头工作台';
    const batch = $('tl-batch'); if (batch && batch.parentElement !== $('wb-batch-picker')) $('wb-batch-picker').append(batch);
    if (!$('wb-export-panel')) {
      const actions = page.querySelector('.tl-actions');
      [...actions.children].forEach(node => { if (node !== batch) node.remove(); });
      actions.innerHTML = `<button class="btn wb-btn wb-secondary" id="wb-full-tools">${icon('settings')}制作工具</button><button class="btn wb-btn wb-secondary" id="wb-keyboard" aria-label="剪辑快捷键">${icon('help')}</button><details class="wb-export-popover" id="wb-export-panel"><summary class="btn wb-btn">${icon('upload')}检查与输出</summary></details>`;
      $('wb-full-tools').onclick = () => tlTools(state.route === 'gen' ? 'gen' : state.route === 'review' ? 'review' : state.route === 'audio' ? 'audio' : 'shots');
      $('wb-keyboard').onclick = () => notice('快捷键：空格播放/暂停；← → 前后移动一帧；Ctrl+Z 撤销，Ctrl+Shift+Z 重做。输入文字时不拦截。');
      const monitor = page.querySelector('.tl-monitor'), label = document.createElement('div'); label.className = 'wb-monitor-label'; label.innerHTML = '<span>节目预览</span><span>真实素材 · 实时混音</span>'; monitor.prepend(label);
      const play = page.querySelector('[aria-label="播放或暂停预览"]');
      if (play) { play.textContent = '▶ / Ⅱ'; const back = document.createElement('button'); back.className = 'btn'; back.textContent = '−1帧'; back.setAttribute('aria-label', '后退一帧'); back.onclick = () => tlSeek(TL.time - 1 / 24); play.before(back); const next = document.createElement('button'); next.className = 'btn'; next.textContent = '+1帧'; next.setAttribute('aria-label', '前进一帧'); next.onclick = () => tlSeek(TL.time + 1 / 24); play.after(next); }
      const timelineHead = page.querySelector('.tl-timeline-head');
      const toolbar = document.createElement('span'); toolbar.className = 'wb-inspector-actions'; toolbar.style.margin = '0';
      toolbar.innerHTML = '<button class="btn" id="wb-undo" title="撤销剪辑 Ctrl+Z">↶ 撤销</button><button class="btn" id="wb-redo" title="重做剪辑 Ctrl+Shift+Z">↷ 重做</button><button class="btn" id="wb-fit">适配整段</button>';
      timelineHead.querySelector('h2').after(toolbar); $('wb-undo').onclick = () => cutUndo(); $('wb-redo').onclick = () => cutUndo(true);
      $('wb-fit').onclick = () => { const total = tlClips().at(-1)?.end || 0; if (!total) return; TL.zoom = Math.max(.5, Math.min(100, (page.querySelector('.tl-scroll').clientWidth - 105) / total)); const slider = page.querySelector('[aria-label="时间线缩放"]'); if (slider) slider.value = TL.zoom; tlTracks(); };
      const slider = page.querySelector('[aria-label="时间线缩放"]'); if (slider) { slider.min = '.5'; slider.max = '100'; slider.step = '.5'; }
      page.addEventListener('click', event => { const ruler = event.target.closest('.tl-ruler'); if (ruler) tlSeek(Math.max(0, (event.clientX - ruler.getBoundingClientRect().left) / TL.zoom)); });
      const tabs = page.querySelector('.tl-tabs');
      const tab = document.createElement('button'); tab.setAttribute('role', 'tab'); tab.dataset.mode = 'cut'; tab.textContent = '画面'; tab.onclick = () => tlMode('cut'); tabs.prepend(tab);
    }
    const bar = $('cut-toolbar'); if (bar && bar.parentElement !== $('wb-export-panel')) $('wb-export-panel').append(bar);
    const prompt = $('timelinePromptPanel'); if (prompt) fold(prompt, '生成提示词与参考素材', 'timeline-prompt')?.classList.add('wb-prompt-fold');
    const p = activeProject(); if ($('tl-project')) $('tl-project').textContent = p.name + ' · 裁切、版本选择与混音均沿用真实制作数据';
    $('wb-batch-picker').hidden = !page.classList.contains('on');
    if ($('wb-undo')) $('wb-undo').disabled = !(CUT.undo.get(cutKey()) || []).length;
    if ($('wb-redo')) $('wb-redo').disabled = !(CUT.redo.get(cutKey()) || []).length;
    renderBin();
    page.querySelectorAll('.tl-tabs [data-mode]').forEach(button => { button.setAttribute('aria-selected', String(button.dataset.mode === TL.mode)); button.hidden = state.route === 'timeline' && button.dataset.mode === 'gen'; });
    const drawer = $('tl-drawer'); if (drawer) { drawer.setAttribute('role', 'dialog'); drawer.setAttribute('aria-label', '制作工具'); }
    shellUpdate();
  }
  // Preserve the scene service, but let this workbench own the panel layout.
  if (typeof simplifyActWorkspace === 'function') simplifyActWorkspace = function () {};
  const originalWorkspaceStatus = workspaceStatus;
  workspaceStatus = function (message) { originalWorkspaceStatus(message); statusUpdate(); };
  const originalGo = go;
  go = function (id) {
    if (!canLeave()) return;
    const previous = state.route;
    state.route = id === 'wb-home' ? 'studio' : id === 'edit' ? 'timeline' : id;
    try {
      if (['shots', 'gen', 'review', 'audio', 'timeline'].includes(id)) {
        if (TL.drawer) { TL.drawer = false; if ($('tl-drawer')) $('tl-drawer').hidden = true; tlPages.forEach(key => $(key)?.classList.remove('on')); }
        TL.mode = id === 'timeline' ? 'cut' : id;
        originalGo('timeline');
      } else originalGo(id === 'studio' ? 'wb-home' : id);
      const expected = ['shots', 'gen', 'review', 'audio', 'timeline', 'edit'].includes(id) ? 'timeline' : ['characters', 'scenes', 'propsdb', 'assets'].includes(id) ? 'assets' : id === 'stories' ? 'scripts' : id === 'studio' || id === 'wb-home' ? 'wb-home' : id;
      if (!$(expected)?.classList.contains('on')) state.route = previous;
      if (state.route === 'previs') globalThis.DirectorPrevisUI?.activate();
      if (['soundassets','soundmix'].includes(state.route)) globalThis.SoundStudioUI?.activate(state.route);
      shellUpdate(); remember();
    } catch (e) { state.route = previous; shellUpdate(); notice('页面切换未完成：' + e.message); throw e; }
  };
  openCockpit = function (id) { openProject(id, M.nextRoute(D, D.projects.find(p => p.id === id) || activeProject(), preferences.last?.[id])); };
  const originalRenderAll = renderAll;
  renderAll = function () { originalRenderAll(); if ($('wb-home')?.classList.contains('on')) renderHome(); shellUpdate(); };
  const originalScripts = renderScripts;
  renderScripts = function () { originalScripts(); decorateScripts(); };
  const originalTLRender = tlRender;
  tlRender = function () { originalTLRender(); decorateTimeline(); };
  const originalInspector = tlInspector;
  tlInspector = function () { originalInspector(); decorateInspector(); };
  const originalTLMode = tlMode;
  tlMode = function (mode) { originalTLMode(mode); decorateTimeline(); };
  const originalClock = tlClock;
  tlClock = function () { originalClock(); if ($('tl-time')) $('tl-time').textContent = M.timecode(TL.time) + ' / ' + M.timecode(tlClips().at(-1)?.end || 0); };
  const originalModules = renderModules;
  renderModules = function () { originalModules(); if (typeof editingCharacterId !== 'undefined' && !editingCharacterId && typeof editingSceneId !== 'undefined' && !editingSceneId && typeof editingPropId !== 'undefined' && !editingPropId) state.assetDirty = false; };
  document.addEventListener('keydown', event => {
    if (!$('timeline')?.classList.contains('on') || event.target.closest('input,textarea,select,[contenteditable=true]') || document.querySelector('dialog[open]') || TL.drawer) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); cutUndo(event.shiftKey); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && event.code === 'Space' && !event.target.closest('button,summary')) { event.preventDefault(); tlPlay(); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key) && !event.target.closest('button')) { event.preventDefault(); tlSeek(TL.time + (event.key === 'ArrowRight' ? 1 : -1) / 24); }
  });
  mount(); renderHome(); go('studio');
  setInterval(statusUpdate, 2000);
  globalThis.StudioWorkbench = { version: VERSION, navigate: route => go(route), openProject, useVersion, newProjectDialog, state };
})();
