AI MOVIE STUDIO Web v0.2 PROJECT COCKPIT

For regular use, start START_LOCAL_SERVER.bat and open http://127.0.0.1:4173. Full functionality requires the local services and configured model runtimes.
The launcher starts the web server and connector in hidden background processes,
reuses healthy running services, and opens the site. Closing the launcher does not
stop them. After restarting Windows, run the launcher again. ComfyUI is separate.
Startup errors are saved under .runtime. For checks without opening a browser use
powershell -NoProfile -File start-local-services.ps1 -NoBrowser.

For wardrobe continuity, use a single current-costume character image for a scene,
not a biography collage containing multiple ages and outfits. Existing generated
videos need to be rendered again after changing references. Film retry revisions
can replace an existing character image with characterReferenceFiles (asset ID to
uploaded reference filename); first-frame shots must also replace or clear their
opening frame, and continuation shots must be corrected through the prior shot.

For browser automation and full interaction testing, double-click START_LOCAL_SERVER.bat,
then open http://127.0.0.1:4173. The web server runs locally. DeepSeek screenplay/prompt generation sends the selected content to the configured text-model service. Local video rendering uses the H3 connector and ComfyUI.

To connect the Generation Queue to NODE_01, also double-click START_LOCAL_CONNECTOR.bat.
The connector listens only on http://127.0.0.1:8080 and accepts local H3 jobs.
"发送 NODE_01" submits the saved job to ComfyUI at http://127.0.0.1:8188
(override with COMFY_URL). ComfyUI needs the H3 nodes and models used by the
connector graph. "同步结果" imports the returned video into the review room.
Repeated submissions of an accepted task reuse its ComfyUI prompt id. Cancelled
tasks cannot be submitted again. Generation errors and missing video outputs are
reported explicitly; sampling progress uses available telemetry while remaining time is an estimate.

Development verification: node --test connector.test.js

SELECTED-SHOT SAMPLES
Automatic-film sound: select original model audio, full silence, or an imported
WAV/MP3 environment track (20MB maximum). Silence/replacement reject spoken
dialogue. Replacement loops or trims the independent track, retaining originals;
it does not separate voices out of the original recording. Film revisions can
apply a sound-only child version without GPU rendering. Audio uploads normalize
up to the first ten minutes; keep the desired ambience at the start of the file.
First-frame shots with on-screen dialogue require the speaker's left/center/right
position. Splitting scenes clears old first frames and replacement audio, and
splitting speech turns clears speaker positioning for review.

Optional first frame: edit a storyboard shot and import a PNG/JPEG/WebP (up to
8MB), or enter an image URL. Confirm the full composition before rendering.
This uses I2VA from the complete first frame, retaining asset relationships as
metadata rather than supplying separate asset pictures to Ref2VA. Clear the
first-frame URL to restore the normal asset-reference workflow. First-frame image generation is available through the local image workflow; review the composition before adopting a candidate.

In 自动成片, expand 选择样片镜头 and select 1–12 shots from the current batch.
制作所选镜头样片 preserves their original order, durations, dialogue and asset
references. It creates a separate sample; an empty selection never starts the
whole film. Pure-black shots use local composition without model generation.
Reference binding proves images were supplied, not that visual identity passed.
Tests use an isolated in-memory queue and a simulated ComfyUI service; they do not
submit GPU work or modify connector-queue.json. Real model execution still needs
to be verified on the configured machine. After connector changes, restart the
connector and refresh the application page.

The application retains its v0.1.7 localStorage key (`aimovie_data`) and adds
project bible, scene-script, asset, storyboard, generation queue, review,
MASTER/4K, audio, Premiere hand-off, Local Connector, and 300/90 tracking.
Project data is stored in this browser. Video jobs are sent to the configured local
connector; screenplay generation sends the story and adaptation notes to DeepSeek.

SCREENPLAY WORKSPACE (DeepSeek)
1. Restart START_LOCAL_SERVER.bat and open http://127.0.0.1:4173 in your usual browser.
2. Open 剧本, paste the original story and optionally enter adaptation notes.
3. Expand DeepSeek 连接 and enter a DeepSeek API Key, then click 生成剧本.
   The key stays in page memory only; it is not included in project exports or
   localStorage. Refreshing clears it. Alternatively set DEEPSEEK_API_KEY in the
   server environment before launching. No key is needed in local-connector.js.
4. Edit the full screenplay directly. Edits save locally. Regeneration creates a
   new version and preserves the previous one. Copy or export TXT as needed.

This step creates a screenplay plus character, scene and prop text assets in one
DeepSeek request. It does not create shots, storyboards, images or GPU jobs.
Assets are scoped to the current project and linked to the screenplay version.
Existing same-name assets are reused without overwriting manual notes or media.
The screenplay and assets are saved together; a storage failure preserves old data.
Existing legacy script content remains available in a collapsed section. Rendering
the workspace no longer creates missing legacy shots automatically.
DeepSeek model names can be entered in the connection panel (default deepseek-flash).
Stories are limited to 60,000 characters per request. Incomplete model responses
produce an error instead of being stored as a complete screenplay.
API reference: https://api-docs.deepseek.com/api/create-chat-completion/
Regression checks: node --test connector.test.js screenplay.test.js

STORYBOARD WORKSPACE
Open 分镜, select a saved screenplay in 来源剧本, optionally enter directing notes,
then click 根据所选剧本生成分镜. It shares the DeepSeek key from the screenplay
page in the same browser session. Each run adds a new batch without replacing
existing shots. Batch records keep the source screenplay snapshot; each shot keeps
its source excerpt, scene, action, visual direction, camera, dialogue and duration.
Editing shots does not modify the original screenplay. Generated shots can be
sent individually to the existing generation queue after review.
Checks: node --test connector.test.js screenplay.test.js storyboard.test.js

H3 OUTPUT SIZE AND LIVE PROGRESS
Above the storyboard list, save H3 width and height (multiples of 32, 32..8192).
Both single and bulk queueing snapshot these dimensions into new jobs. Previously
queued jobs retain their dimensions; legacy jobs default to 864x480.
The connector subscribes to ComfyUI WebSocket sampling events. The generation page
refreshes every three seconds, distinguishes pending/running/saving, and displays
actual sampling steps. ETA is estimated from observed sampling speed and excludes
decoding/saving. Loading, disconnected, and queued stages have no invented ETA.
Node.js 24 provides the built-in WebSocket client; no new dependency is required.

STORYBOARD ASSET REFERENCES
New storyboard requests include the current project's character, scene and prop
names/descriptions. The model returns existing asset IDs per shot; unknown IDs and
missing scene references are rejected. Cards display references and allow edits.
Selected asset descriptions feed H3 prompts. This is descriptive conditioning;
the current render graph does not turn library images into H3 image inputs.

CLEAR ALL QUEUE RECORDS
The clear button removes every current-project queue record, including running or
unreachable tasks. It attempts to cancel pending remote jobs. Removal does not
stop a running ComfyUI render. Uncertain tasks are logged in detachedRenderJobs;
existing review videos and shots are preserved. Storage failure retains records.

AUTOMATIC FILM
Open 自动成片, select a storyboard batch and start. The app prepares H3 prompts in
batches using the session DeepSeek connection, then saves a durable plan under
film-runs. The local server renders each shot through the connector, normalizes
video/audio, concatenates in order and burns Chinese dialogue subtitles into a
720p MP4. It retains H3-generated audio; there is no separate voice cloning/TTS.
Prompt preparation requires the page to remain open; after the render run starts,
the local server can continue without the page. Keep ComfyUI and both Node services
running. Server restart pauses unfinished runs; use 继续制作 to resume.
Completed MP4s appear in 自动成片 and 成片. Completion means a playable export, not
automatic artistic approval: identity, lip sync, dialogue and continuity need review.
FFMPEG_PATH can override the locally discovered imageio-ffmpeg executable.

STORYBOARD TIMING
Default is 根据剧本自动推荐. Optional target duration guides planning without forcing
identical shot lengths. Each shot retains its recommended 4–15 second duration at
queueing; invalid durations are rejected, not silently replaced by five seconds.


2026-09-17 资产图片实际接入渲染
- 角色/场景/道具档案添加 PNG、JPEG、WebP 图片；本地文件使用导入，网络图片需允许浏览器读取。
- 分镜引用的资产必须有图片；缺图或超过每镜 9 张会明确阻止入队和自动成片。没有视觉资产的镜头仍可使用纯文字模式。
- 图片先上传本机 ComfyUI，按内容哈希保存；队列与成片计划保存图片文件快照和资产身份，不随之后的资产编辑漂移。
- 带图片时使用 minimax_h3_ref2va_pruned_int8_convrot，LoadImage → ReferenceToVideo group → Director，按 Picture 1…N 对应资产。普通队列和自动成片都生效。
- 视频参考目前仍只是档案存储，没有接入此图片引用流程。画外人物不应作为可见人物强制引用。
- 已经完成的旧视频不会因代码升级而改变；需要在资产图片齐备后重新制作相应镜头。


2026-09-17 通用系统调试（不依赖某个故事）
- 移除 H3 提示词服务中硬编码的陈实、孙嘉俊、出租屋和结尾；人物与场景只来自当前项目。
- 对白每行“人物名：原句”；电话用“人物名（语音）：原句”；画外用“人物名（画外）：原句”；消息用“屏幕文字：原文”；音效用“环境音：描述”。
- 生成前检查说话人物、来源原文、时长、资产图片；多人说话按轮次拆镜。检查按钮不调用模型。
- “按对白轮次重建批次”只修复有明确打字原文依据的消息和多人轮次，保存新批次保留旧批次，不会触发渲染。
- 字幕从台词和屏幕文字数据生成，不把人物标签和环境音说明烧进字幕。
- 模型只编写画面与环境声音提示，应用再绑定台词、人物与画内/电话/画外位置；旧含台词提示词必须更新。
- 此校验验证的是生成输入，不是生成音频的自动识别；实际说词、口型和叙事表演仍待输出审片。
- 资产图片包支持在角色/场景/道具页输入 /assets/目录/manifest.json，按项目内名称唯一匹配，检查图片后一次保存。
- /assets/laoshiren-v2/manifest.json 是四张角色图的测试包，图像由内置 image_gen 生成，提示见同目录 PROMPTS.md。
本地资产生成首帧（2026-09-17）
分镜 → 编辑分镜 → “保存分镜并用本镜资产生成首帧（本地）”。
依照本镜所选资产图片和状态生成候选画面；检查后点击“采用这张首帧”，有画内对白时重新设置发声位置，再保存分镜。
生成使用本机8188 ComfyUI，不调用在线图片API。每轮实际图片输入、模型工作流及结果持久化在 frame-runs/；候选PNG保存到 assets/generated-frames/。重启工作室后可继续查询已有的ComfyUI生成编号。
尺寸沿用项目H3画面比例，大图首帧限制到约100万像素；采用后视频仍按项目H3尺寸制作。
需要节点 Krea2EditModelPatch、Krea2EditGroundedEncode；模型 Krea2\krea2_turbo_fp8_scaled.safetensors、qwen3vl_4b_fp8_scaled.safetensors、qwen_image_vae.safetensors 和 krea2_identity_edit_v1_2_r128.safetensors。
当前本地编辑节点每轮接受两路图像；双人加场景时，使用ImageStitch把两张肖像组成一路，同时输入场景。额外资产按轮次处理，所有选中资产均会进入实际图像条件。多人物脸部和服装仍可能偏差，因此生成完成不等于审片通过，不能直接把未经检查的候选覆盖原首帧。
“首帧起始状态”可选填，用于修正人物位置、姿势、物品归属。默认以画面设计生成动作发生前的静态状态；完整人物行动由视频阶段执行，避免首帧直接画出事件结果。


连续动作与对白拆分（2026-09-18）
- 自动生成分镜时，可以把“先说完、后行动”生成为相邻两镜，后镜无口头对白并承接前镜尾帧。同一机位、场景、人物及参考图片才能承接。
- 已有镜头在“编辑分镜 → 拆为先说话、后行动”填写两段行动与画面，台词只保留在前段。每段4–15秒，保存前显示总时长，旧镜头归档保留。
- 如保留旧首帧，需在拆分表单明确勾选它仍适合前段；系统验证原记录后为新镜头重建来源记录。后镜使用前镜视频的真实最后一帧。
- 使用“自动成片”或同时选择相邻镜头制作样片。独立生成队列不能执行尾帧依赖，系统会提示。
- 重做前镜会连带重做连续承接的后镜，其他素材复用，旧版成片保留。字幕未对齐时可从问题条目直接打开对应镜头的提示词与对白。
- 自动对白核对不会把同音或近音字直接认作正确；识别有差异时仍标为需复核。

本地对白增强复核：页面可选择“增强复核对白（本地）”。已安装模型后，新制作优先使用增强模型对齐字幕；增强复核后的字幕更新也沿用该模型，不重新生成视频。复核不把近音字强行等同，保留前次检查记录；识别文字一致仍需观看确认人物与口型。

2026-09-18 制作质量检查与屏幕内容
- 新自动成片任务会逐镜进行本地声音核对；不一致时保留视频并暂停。
- 暂停卡片可预览原音轨、查看提示词并修订重做；只有实际试听确认识别误差时才填写核对说明并保留该镜。语音识别不会确认说话人物和口型。
- 轻声电话对白识别不完整时会进行音量归一、关闭VAD的第二次识别，两次结果均保留；原句不会作为识别提示输入。
- 分镜“制作方式”可选择“直接展示屏幕资产（本地合成）”。“原始图片”保留朋友圈照片和布局；“本镜屏幕原文”准确显示该镜填写的文字。前者可裁掉图片下部空白，后者使用完整消息画面。
- “逐字输入后删除”在本地文字展示中仍逐字输入并删空，不表示发送成功。屏幕镜头不能包含口头对白、独立首帧或尾帧承接。
- 明确指定的本镜状态图片优先于文字参考卡，避免照片被纯文字卡覆盖。已有任务保存自己的输入快照，修改分镜后需制作新版本。

制作可追溯性补充（2026-09-18）
- 制作检查包保存手写提示词、自动编写的提示词及其来源、首帧起始状态，便于复现偏差；连接密钥仍不进入检查包。
- 道具图约束外观与材质，本镜起始状态约束摆放方向与支撑位置。生成候选仍需看图确认，尤其是屏幕朝下、物品归属和目标桌面。
- 自动成片增加“准备整批提示词（不渲染视频）”：只准备并缓存文字提示词，不上传图片或提交视频任务；成功的批次保留，失败后可续接，再导出检查包核对。
- H3 提示词响应按镜头ID匹配，拒绝缺失、重复编号和混入对白标签，错误标明具体镜头。绑定已核对对白时清除全局“无人声”等矛盾指令，静默听者和文字消息保持静默。

暂停制作时修复无对白音轨（2026-09-19）
- 声音检查暂停后，可以在修订单镜中导入环境音并选择“仅更新声音”。
- 只允许修改已生成镜头的音轨；原画面、原声音与旧版保留，修复子版本继续未完成镜头。
- 已核对的口头对白仍不能被静音或替换；更改音轨使旧声音检查失效，后续镜头继续执行质量检查。
- 工地开场实测：程序合成无声源人声的机械/焊接/金属环境音，合成音轨medium识别为空，原视频SHA256不变。它是合成音效，不是现场录音。
单镜声音复核：自动成片在声音检查暂停时，可选择“重新检查此镜声音（不重渲染）”。使用本地 medium 模型复核原素材，保留此前结果，不提交视频任务。识别失败或差异仍会暂停；文字匹配后可继续，但人物、口型仍需审片。复核期间禁止并发修改该任务。
修订检查：自动成片的单镜修订页支持“检查修订与重做范围（不渲染）”，先校验提示词、原文对白、时长与声音，显示重做/复用/尚未制作的数量，不创建任务。正式“保存修订并重做”会同时应用所填声音设置。修订仍保存在成片子版本；原分镜不被自动覆盖。
安全保存修订到原分镜：新制作计划记录来源分镜及本镜引用资产的SHA-256校验值。修订页“保存修订到原分镜（不渲染）”先用后端检查，再比较当前来源；分镜、资产或其他页面的数据变化会阻止覆盖。保存更新提示词、对白、时长和声音，清除旧提示词缓存并标记需重做；不创建渲染任务，不改原片。旧制作任务缺少校验值时拒绝覆盖，请在分镜页人工核对修改。
保存修订时的承接关系：源镜头及同项目、同批次中直接或间接承接它的后镜会标记为需重做，清除旧提示词缓存、当前视频地址、字幕时间与对白检查结果。独立镜头、其他批次、归档镜头和历史成片保留。所有分镜修改一起保存；保存失败时内存状态不变。
结果版本保护：新独立渲染任务记录来源分镜与引用资产校验值。准备期间来源变化会取消入队；同步时不一致或缺少校验信息的结果保留为历史，不更新当前分镜状态。设为MASTER时再次检查来源，阻止旧画面批准为当前版本。旧任务缺少校验信息时需按当前分镜重新制作。
审片室支持“删除此版本”：删除审片记录及对应MASTER引用，保留分镜、独立音频和磁盘视频；结果再次同步不会复活该记录。单镜“加入生成队列”留在原处，在镜头按钮下显示添加状态，不自动跳转。4K队列与Premiere清单导出会复核MASTER来源，过期或缺失来源时阻止继续。
提交前校验：独立渲染队列发送任务前及提交GPU前均核对分镜和引用资产版本；过期或缺少来源记录的旧任务会被阻止，并提示重新入队。被阻止记录保留但不占用当前镜头的待执行资格，已提交的GPU任务不会因此自动中断。
清空队列与审片一致性：清理时发现已完成的视频，仍检查来源版本及审片删除记录。已删版本不重新添加，过期结果仅作为历史保留；有效结果保留来源校验信息，可继续审核。校验期间项目数据变化时停止本地清理，提示重试。

场次自动成片与简化审片
- 在故事中划分场次后，镜头齐全会自动合成本场成片；没有另行分组时，当前分镜批次作为一场。
- 打开“时间线”，直接播放“本场成片”。播放时自动定位当前镜头，也可手动选择。
- 写一句修改要求，点击“修改这一镜并更新成片”；相关尾帧承接镜头可能一起重做，完成后自动更新，旧版保留。
- 声音核对疑点显示为提示，不阻止观看场次成片；看完可点击“本场通过”。
- 精细剪辑和逐镜参数收在下方折叠区。场次成片按镜头顺序合成，不套用手工时间线剪辑。
- 已注册的场次在本地服务运行时持续检查；修改场次分组后打开工作室同步。成片与状态保存于 act-films，不提交到 Git。
