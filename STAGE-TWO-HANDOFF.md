# 当前进度（2026-09-18，后续以此更新为准）

## 2026-09-18 21:15 左右更新（优先于下方旧记录）

### 21:42 最新覆盖
- 当前运行 **film_5a9b1267dbd8b028**，6镜39/61–65，共61秒。前4屏幕本地镜头已完成，原64正在I2VA渲染，65后续承接。观察会话 **32098**；旧观察17538/89940都已退出。
- 上轮`film_b9a17b28f2b68b18`完成但64手机放到地上，65继续错误地板手机，**失败，不能当通过**。原61失败的`film_98e62acfcaa76122`也保持暂停，不恢复。
- 64新的首帧`frame_431e17fb24716cd4_2.png`已检查采用：右陈实，左前景木桌，手机拿在桌面上方。行动、画面、机位已明确桌面而非地面。64/65手写完整英文三字段H3提示词已存入分镜：手机屏幕朝下放桌上，再双手膝盖坐直；65在2s/5s震动、不翻、不碰。
- 新修复：完整的用户H3提示词直接使用，不再二次DeepSeek改写（之前把table改成surface beside him造成错误）。`film-prompt-flow.test.js`验证有结构提示词跳过API、无结构仍自动编写。H3系统提示与分镜系统提示也强化物品目标/方向。
- 新screenSource=image/text：原39原图52%截取；61/62/63本地文字100%全画面。61文字“再转五百呗\n我在买单\n余额页：603.72元”；62保留type-delete三段，63余额603.72。`screen-layout.js`生成清晰深色信息画面，分镜列表有真实预览。本地镜头的加入队列按钮改成去自动成片。
- 四镜最终排版实际合成验证 **film_baad6756cd14fad4**（test project）。抽帧`screen-layout-final-*`及`screen-layout-draft-cleared.png`已看，39.3秒草稿完全删空。`test-artifacts/stage-two-screen-review.json`记录有限范围通过。不要把旧白底排版诊断`film_2608bcbebc9588f3`当最新版。
- 52/53已采用`frame_aa60d10629134b2d_2.png`夜工地SUV双人图，52右刘讲话，53左陈实回答；52/53影片还未实测。
- **150项回归全部通过**，`test-artifacts/stage-two-quality-regression.txt`。后端4173当前PID154688，已部署全部当前修复；8080仍151260。重启前需重新验证进程、GPU队列；现有GPU工作不可中断。
- CUA movieTab仍browser1/tab2，?review=tabletop，自动成片页。当前DeepSeek会话key空，关键镜头因手写提示词无需key。完整66镜新改动需自动编写时再按已授权的原密钥填会话；勿输出。最新检查包 **review_bc527a973c82ca4e**，66镜预检0项。
- 下一步：等当前64/65实际审片通过；补齐必要的修复再进入全66镜（约491.17秒）制作。**第三阶段尚未启动**。不要结束为“全部完成”，不要把局部样片当成片。不得重新启用旧7点截止自动任务。

- 第二轮9镜 `film_e7bd45a903055b1b` 完成前4镜后暂停。1/2原7/8画面、台词通过；3原17电话初次ASR只识别开头，**属于轻声VAD漏识别**。归一音量+无VAD复核识别出完整原句，唯一差异同音名字“陈时/陈实”，`test-artifacts/phone-rechecked.json`保留两次识别。电话无脸嘴，碎屏胶带保留。4原39无口头对白，但朋友圈图片被改成台灯、没有举杯，未通过。
- 发现根因：asset-reference-ui.js 中 screenText 会把整个图片换成纯文字卡，朋友圈3张照片没送入模型。已修复：明确的状态图片优先；新 screen 展示模式始终保留原图。已补回归。
- `film-quality.js`、film-api/UI增加新任务逐镜声音检查与暂停、原片预览、试听误识别确认记录、暂停中修订子版本；子版本保留其他素材，承接镜头检查失效。`transcribe-local.py`增加轻声复核，无原句提示输入ASR；speech-audit保留两次真实结果并选较近者，仍不擅改词/判人物。
- 新 screen 模式直接本地展示选定屏幕道具原图，可裁掉下部空白，不重画照片，不加重复文字。当前39已通过UI改screen，选择朋友圈、上部52%。实际渲染验收 `film_e05bfb7a93c0d04e`（测试项目screen-render-validation）图像正确；`film_8bd29b5e60885d99`是使用旧错误引用的诊断版本，勿当通过。
- 午后统一首帧 `frame_427b241db3e0d529_3.png`已检查，42–49已采用，42/44/46/47/49右说，43/45/48左说。21已用`/assets/laoshiren-v2/school-first-frame.png`右说，画面改教室。52夜工地SUV双人首帧正在排队，尚未采用，53也需匹配。
- 结尾5镜 **film_98e62acfcaa76122**（原61–65，49秒）运行，qualityGate=true。已请求当前镜后暂停用于部署最新screen功能；**不要中断GPU**。观察会话 **89940**。前9镜观察91883已退出。电话复核25902已退出。
- 本地语音T8实验499a792a...在排队状态安全删除，未执行、不需要继续：电话完整性问题已定位为ASR误判。脚本test-local-phone-speech.js仅实验，不是产品已集成能力。
- 工作室4173当前进程154572（重启前需重新确认），连接器8080当前151260。4173已加载qualityGate和ASR修复，但**未加载最新screen渲染后端**；等本轮暂停+首帧完成、GPU队列空后再重启4173。前端静态文件已更新，可用新query goto重新加载。
- 142项全套通过（screen功能之前）；之后screen/新引用修复相关测试也通过，需要最终再全套。工具UI新增ui-errors.js暴露真实前端错误。之前“制作方式”getByLabel exact选择失败属于label匹配，改用#board_renderMode即可，并非程序故障。
- 当前CUA movieTab浏览器1/tab2，URL带?review=screen，分镜列表，39已保存。最新检查包review_0309cb30d410ff33，后续21/52与39模式变化需部署后再导出。刷新后DeepSeek会话key为空（用户先前提供，勿输出）；screen模式不需文字模型，其他新prompt需要恢复会话key。
- 下一步：完成结尾5镜/逐镜审片，补52/53首帧；安全重启部署screen后通过真实UI再测39（不耗GPU）；全66镜预检、启动全片并逐镜检验。第三阶段全66镜尚未启动，不能宣称完整通过。

最新：电话第二候选 `frame_527119b5652f6029_1.png` 已检查，保留右下碎屏/胶带，无脸嘴；已采用17并用于32（32动作/画面/机位同步改手机手部特写）。完整66镜预检0项，最新检查包 `production-reviews/review_867e43c0b6480754.json`。第二轮九镜样片 **film_e7bd45a903055b1b** 已通过真实页面启动，使用新版提示词隔离和首帧。当前正在第一镜。不要误恢复第一轮暂停的film_b166c83674e2ac8b。

用户已批准依序执行：全66镜计划检查 → 关键场景测试 → 约8分钟完整成片与审片。第三阶段尚未启动。

第一阶段已完成文本/资产检查：66镜492秒。第12镜新增台词已移除，13处混合发声动作改写，3张道具图及相关引用补齐；搬砖7–11/40补手套，65承接64。报告 `test-artifacts/full-plan-review.json`，最近导出检查包 `production-reviews/review_cf17a6f5a6b6a1c3.json`（此后又修改了手套、首帧及电话镜头，需重新导出）。原批次历史sourceContent仍保留，当前可编辑源剧本已修正。

第二阶段 `film_b166c83674e2ac8b` 原9镜测试只完成前三镜，现已暂停，不按旧计划继续。原7/8对白识别匹配，视觉失败：缺手套、新增反光条、年龄/场地漂移。原17电话语音念出场景时间说明，且陈实嘴在说话。音频、抽帧、实际输入图片绑定证据在test-artifacts同名前缀文件；不能当作通过。

- 共用双人首帧 `frame_243bab93231712b8_3.png` 已检查并通过UI采用到7–11镜：左陈实戴手套，右老张，纯色衣服。7/9/11右说，8/10左说。11机位改为中景固定，并清除再重新导入首帧以记录正确来源。视频尚待复验。
- 第17镜改为手机手部特写（听者反应在下一镜）。候选 `frame_5a2115d992b6bc15` 未采用：无脸，但碎屏胶带丢失。已改进道具合成后轮替换占位物的规则，补手机本镜状态并生成第二候选。请从frame-runs最新记录读取ID。通过后应采用到17及32，保持原句/手机外放；32尚未调整。
- 通用资产历史隔离 `reference-visual-notes.js` 已接入前端、首帧和Ref2VA：只读图片外观与本镜状态。已加载4173/8080。分镜提示新增电话设备手部特写、听者无声反应分镜。
- ComfyUI取消队列成功返回空响应，旧连接器却json解析报错，造成任务已取消而工作室一直等待。已修复并实测取消 `FILM_film_b166c83674e2ac8b_3` 成功，未中断GPU任务。两服务重启时GPU队列为空。
- 已新增成片完成当前镜头后暂停、恢复保留素材。修复核心JSON请求按字节拼接后解码，防止中文跨网络块损坏。全套135项测试通过，记录 `test-artifacts/stage-two-regression.txt`。
- 观察脚本会话14701、89802已Ctrl-C结束，42417原已失败退出。无观察脚本仍运行。不要重建已过期的每30分钟自动任务；本轮没有新建自动任务或goal。

接下来：检查电话第二候选 → 采用并统一32 → 重新导出预检 → 用页面生成已修复的关键镜头样片（7/8/17/39/61–65，共9镜）并审查实际声音/画面 → 确认通过后才做完整66镜。用户允许完整制作；若自动审批拒绝，不以拆批规避。

工具状态：CUA `movieTab` 是浏览器1/tab2，当前分镜17编辑页，正在生成第二电话首帧。页面已刷新，DeepSeek会话key需重新填（之前用户已提供，不输出密钥）。本机Comfy8188、连接器8080、工作室4173。需通过浏览器UI操作D，不能读取隐藏localStorage；检查包是合法产品导出接口。

## 22:03 后续更新（覆盖此前结尾进度）
- film_5a9b1267dbd8b028 已完成，但64屏幕朝上，65末尾主动拿手机；实际视觉失败，不能批准。test-artifacts/stage-two-ending-failure.json。
- 新首帧 frame_ecb41363c566a108_2.png 已看并在UI采用64，黑色背面朝上、手悬在桌面手机旁。64/65完整手写提示词已改为背面向上放开、双手保持膝盖、只有呼吸。新的两镜样片 **film_4a600733cf4eec2a** 正在渲染，观察会话 **74015**（旧32098完成退出）。必须看实际画面再决定。
- 全11屏幕镜头23/26/28/30/36/39/58/60/61/62/63样片 **film_249cf2e39229e5c2** 完成。原片抽帧与最终合成抽帧均已看，金额/署名/时间/三张图正确，草稿逐字删空，无重复字幕/裁切。test-artifacts/stage-two-screen-all-review.json；inspect-composed-screens.py用于看最终字幕/草稿效果。
- 首帧通用指令现在区分参考图片的物品外观与本镜要求的方向/支撑面。检查包新增prompt/filmPrompt/filmPromptVersion/filmPromptSource/firstFrameIntent，避免无法复现。相关11测试通过。服务已在GPU队列空后重启，旧154688已停止，新的PID待重新查询。此次变更已加载。
- 当前CUA browser1/tab2 movieTab：?review=back-down，自动成片页。最新66镜检查包 **review_c971e09848a647e0**（验证prompt与起始状态实际已保存），0项文字预检问题。DeepSeek会话密钥为空，当前手写两镜不需key。
- 第三阶段完整66镜仍未启动。用户批准按三个阶段完成，继续等两镜实际验收，再做约8分钟完整片逐镜检查。不要把当前局部样片/0项预检当全片通过，不要重建过期的7点自动任务。

## 22:24 后续更新（优先于上方）
- film_4a600733cf4eec2a 两镜完成：64已通过抽帧（背面朝上在桌面、收手坐直），65虽不再伸手却把背面变成亮屏，仍失败。该两镜实际输入图片哈希2/2匹配。
- 65改为独立人物面部近景，头肩与灰蓝领口，手机放在画外，用两次画外震动声保留原结局。引用只留陈实/出租屋；不再承接64，不要求把手机画入本镜。frame_f9ad41af68a53a48_0.png未采用（仍有手机）；收紧构图后 **frame_50c63db33d2ce425_0.png**已看且采用。
- 当前单镜65样片 **film_b74a536d270fedf2**，观察会话 **24485**；旧74015完成退出。等待近景实际抽帧/声音审查。第三阶段完整66镜仍未启动。
- 新增“准备整批提示词（不渲染视频）”，实际UI已跑通；66镜所需文字提示词现已准备完成。准备不会上传图片或提交视频任务，已成功批次缓存保留。最新导出 **review_6cf0e8b2c050e4a7**在65最终首帧采用之前，之后应再导出。
- 准备过程中两次格式错误，新增 h3-prompt-response 按ID匹配/去外层空白，拒绝重复缺失和对白标签，并标明具体镜头。部署后续接成功；不要断言之前错误根因已由原始返回证明（旧接口未保存返回）。
- 实际审提示词发现有对白镜头含no voices/no spoken words/no dialogue等全局静音冲突。dialogue-contract绑定有台词时消除这类冲突，保留静默听者与屏幕消息约束；H3系统提示也明确禁用全局禁声句。两服务在GPU为空后已安全重启加载。旧PID155304/151260已停止，新PID需重新查。
- 最新全套 **157测试通过**，test-artifacts/stage-two-final-regression.txt。新film-ui语法和prepare-only请求范围都有测试。
- 当前movieTab browser1/tab2 ?review=prepare-prompts-2，自动成片页，样片只选65。DeepSeek会话已按既有授权填写（勿输出密钥）；刷新会丢会话key，但提示词缓存已完整，不应重复请求。
- 下一步：单镜65通过后最终66预检、导出，启动完整片并逐镜审查。64完整片重新渲染仍可能偏差，不能因为样片通过而跳过全片审片。未创建自动任务或goal。

## 第三阶段已启动（22:29左右）
- 最后人物近景样片 film_b74a536d270fedf2 完成，抽帧静坐未回应，ASR无口头文字；声能检查两处独立瞬态约5.0s/6.4s，未严格按提示2/5秒。不能声称波形已证明声源是手机。test-artifacts/stage-two-ending-review.json保留边界。
- 当前完整制作 **film_bd9e84f7b300399c** 已从真实UI启动：66镜、492计划秒、qualityGate=true，第一镜正在渲染。这是正式第三阶段，不是样片。实际成片尚未完成、未通过全片审片。
- 最终检查包 **review_e7d9836d36fc8943**，66镜预检0问题。手机背面朝上的64与人物近景65配置已纳入计划。工作室无需重启；全片运行中不可中断GPU。
- 24485观察会话完成退出。所有旧观察会话已退出。后续若需要观察当前全片，可运行watch-film-review.js film_bd9e84f7b300399c（两小时观察期限，不会停止渲染），或直接读取API。发现qualityHold必须核对实际音视频，不可自动确认。
- 本轮代码已部署，157测试通过。尚需全片逐镜检查（人物、物品方向、对白、原结局），失败用修订子版本保留其余素材。不要把前两阶段或开始渲染当全部完成。

## 2026-09-19 当前续作
- 原完整片film_bd9e84f7b300399c第一镜声音检查暂停（疑似25字人声，未擅自标误识别）。
- 修复产品缺口：recomposePlan及接口支持paused/failed已有镜头更新声音，复用已完成素材、继续未完成镜头，保持qualityGate；旧音轨检查失效。禁止未完成镜头/有口头对白静音替换。UI补充续作说明。158测试全部通过。
- 工地环境音是本地程序合成的机械/焊接/金属声，脚本make-construction-ambience.py；不是现场录音。单镜实测film_07df99496ad770c2，medium ASR为空，source SHA256不变，证据test-artifacts/opening-audio-repair.json。
- **当前正式66镜子版本 film_9bdea63ae50a9edc**：已复用第一镜并通过新音轨检查，正在第二镜。qualityGate=true。旧版保留，不要恢复旧版或重启正在运行的GPU。
- 4173旧PID156684已安全重启部署，新PID需重查。8080没有变更/无需重启。本轮暂无观察后台会话。
- 原分镜页面第一镜audioMode还未同步此次修复；本版成片计划内已正确绑定独立环境音。后续若从分镜另起新整片须同步，不能隐瞒。
- 用户要求按顺序完成：继续观察该子版本、处理后续异常、最终全片审片。不能把恢复渲染当完成。
- 2026-09-19补充：第二镜无对白但ASR识别11字，抽帧只见腰部握瓶无口部，因此保留画面、同样采用已验证工地环境音。新正式子版本 **film_13da8741adfbe5a9**，已完成2/66，继续第三镜；前两版均为历史暂停版本，不要恢复。原分镜1/2声音设置仍待同步，当前子版本快照已正确保存。用户中途问下一步，已说明接着检查第三镜刘头儿原句，不改变整片任务。
- 最新：film_13da8741adfbe5a9已3/66，qualityHold在第3镜。expected快一点啊！工期赶不赢了！；ASR快一点啊公其赶不赢了。未试听，不得直接判定误识别或放行。实际12帧抽帧已看，单人近景喊话；尚需与刘头儿参考核对身份并试听。
- 新增film-audio-sync.js及UI“将本版声音设置保存到分镜”，项目隔离、当前对白校验、先持久化再更新内存。真实UI已点击当前film，status确认2镜保存；导出review_99b8fcc3792c24ba.json验证原分镜1/2均replacement且绑定已验证环境音。全159测试通过，test-artifacts/audio-sync-regression.txt。
- 当前页面分镜，?review=audio-sync。未恢复任何旧版，当前正式全片暂停第3镜，无后台观察会话。下一步实际音频复核3→继续剩余63镜→完整审片。用户本条询问下一步，不能宣称全片完成。
- 工具研发续作：新增 POST /api/film/:id/recheck 和暂停面板“重新检查此镜声音（不重渲染）”。本地medium仅查原素材，speechCheckHistory保留旧结果；运行锁禁止并发复核/修改，失败保留hold，匹配后保持paused不自动放行人物。UI展示历史、轮询结束更新提示。161测试通过。4173安全重启部署，PID208704（之后需再确认）；GPU队列为空，无渲染中任务。
- 真实UI已对film_13da8741adfbe5a9第3镜实测，仍识别为公其，继续暂停3/66，历史可见。未人工试听、不宣称误判。用户强调工具研发优先，当前没有继续全片渲染。
- 研发续作：修订重做原来漏传声音设置，已修复前后端原子提交prompt/subtitle/duration/audioMode/audioAsset；兼容未提供声音字段的旧请求。有对白禁止mute/replacement仍由后端验证。retryPlan.retriedShots修正为选中镜与连续承接镜，不再把未制镜头误报重做，承接镜历史识别也失效。
- 新增validate-revision接口和“检查修订与重做范围（不渲染）”，复用实际retryPlan验证但不保存任务/复制文件/提交GPU。当前3镜实测显示重做3、复用2、待制63；真实UI选择mute被拦，已恢复model。此轮未启动任何新片，也未放行第3镜。页面保留修订单镜编辑器，?review=revision-preflight。
- 4173空闲时已重启PID203160，GPU未动。完整164测试预期，详见test-artifacts/revision-preflight-tests.txt。后续缺口：修订提示词与对白仍只保存于子版，尚需安全地回写原分镜（与旧快照资产/后续编辑冲突检查）；不要声称已完成这部分。
- 工具研发：安全回写修订到原分镜已完成。film-source-sync.js计算分镜（排除状态/缓存）和选定资产的SHA256；新startAutomaticFilm计划捕获sourceFingerprint，validatePlan/retryPlan保留。旧版本无指纹禁止覆盖。修订页新按钮经validate-revision再比对本地数据、跨页面持久化数据，先localStorage成功后改D。更新prompt/dialogue/dur/audio，清除缓存、标记需重做；不渲染。167项测试通过，包括正常保存/存储失败/另页更新/源资产冲突。
- 真实UI当前旧film13da…保存被正确阻止，旧分镜未改；新版本成功回写分支为自动化测试覆盖，尚未新起真实模型片验证。页面?review=source-sync，修订3打开，显示旧版本缺校验信息。当前仍3/66暂停，未放行。后端空闲安全重启PID209528。首次点击打开面板后立刻找按钮超时，重试单独点击可用，未确定是轮询竞争还是导航时序，勿声称已修复该偶发现象。
- 工具研发续作：FilmSourceSync.replaceWithDependents补齐安全回写后的承接失效。按continueFromShotId图遍历，不依赖存储顺序，限制同项目/批次、排除归档，visited防环。当前镜及后镜status需重做，清除filmPrompt缓存/videoUrl/subtitleTiming/speechCheck/history/continuityFrame，保留资产/承接引用及历史成片。UI一次存储后整体替换D.shots并报告后镜数量。
- 全169测试通过 test-artifacts/dependency-sync-tests.txt；含乱序多级依赖、独立镜头/跨项目批次隔离、循环、保存失败和其他页面更新时当前镜与后镜一起保持原样。此次仅前端文件变更无需重启后端，未用真实故事强行补指纹或改镜头，当前正式电影依旧第3镜暂停。
- 工具研发：新增result-guard.js。prepareStoryboardJob捕获sourceFingerprint、图片准备后检查源仍一致。syncComfyJob对比当前分镜/资产，旧任务或无指纹结果保留“历史结果（来源已变化或未记录）”，不更新分镜状态；generation保留sourceFingerprint。approveMaster改async并按项目查找、重新校验，旧结果不能设当前MASTER。尚未对旧MASTER做迁移失效处理，此前已批准历史条目仍保留。
- 171测试通过test-artifacts/result-guard-tests.txt：晚到结果/旧MASTER拦截/新来源匹配/资产改变/跨项目/删除/缺指纹，已有同步去重与入队切项目测试保留。本轮只前端变更无重启、无GPU调用、无实际生产镜头更新。正式全片仍3/66暂停。下一阶段可审查已经批准的MASTER在源变更后是否被下游错误复用。
- 用户新增：审片室删除、单镜加入队列留原地并提示。已实现review-delete.js删除generation与其MASTER引用，删除最后MASTER将原shot需重做；jobs/audio/磁盘视频保留；tombstone(projectId/jobId/videoUrl)阻止sync重新加回删除记录；先持久化后换内存。审片室真实UI显示22个删除入口，未擅删用户历史。queueById(id,button)不go、不render，预留镜头下方role=status提示添加中/成功/失败/重复/忙；按钮执行期间disabled。程序调用无button保留原失败alert兼容。页面?review=review-delete-inline-queue。
- 继续工具研发：masterSourceIsCurrent在4K与Premiere导出前校验generation存在/MASTER/来源匹配，阻止过期批准下游使用；4K原本只是状态标记，并非新增真实超分辨率能力。175测试通过test-artifacts/review-delete-tests.txt。此次前端无需服务重启，无新渲染。全片仍3/66paused。
- 下一步研发：独立渲染队列提交前双重来源检查。queue-controls.js在锁内比较ResultGuard，不匹配/旧任务无指纹则持久化提交已阻止，等待Worker的原镜需重做，不调用连接器、不记dispatchAttemptedAt；storyboard shotHasActiveJob不再把阻止项算活动任务。真正/comfy前再核对，准备期间改变则阻止GPU提交。已提交GPU的任务不自动中断。
- 全178测试通过 test-artifacts/dispatch-guard-tests.txt，覆盖缺来源/失配、持久化失败、并发点击、连接器准备中改变后不调用/comfy。无真实任务提交，此次仅前端，无服务重启。历史全片仍3/66paused。当前旧任务可被明确阻止，重新入队从当前分镜生成。
- 工具研发：清空渲染队列现在遵守删除标记与来源校验。远程已完成结果不复活被删generation；来源匹配才进入待审核并携带sourceFingerprint，旧/失配结果仅历史。原有待审核generation也须来源匹配才能改变等待Worker分镜状态。校验期间D改变则阻止本地覆盖，远程取消可能发生的提示保留。
- 181测试通过test-artifacts/clear-provenance-tests.txt：有效结果来源保留、已删结果不复活、旧审核不更新当前状态、校验中编辑不覆盖。未真正清空用户队列，没有新渲染，只有前端变更无需重启。正式成片仍3/66暂停。
- 用户要求持续研发到认为完善，再统一报告。本轮综合验收：直接saveStoryboardShot也使用依赖失效；MASTER批准改review-delete approveCurrentMaster原子写、同镜唯一当前MASTER、需真实videoUrl、旧批准保留历史；停用模拟完成及假4K标记，UI清楚说明4K未接入。新增static-path阻挡私有文件及畸形路径，后端空闲安全重启PID204496。
- 新增ProjectBackup/设置备份恢复，完整数据JSON、密钥字段过滤、数据结构验证、制作中禁止恢复、先存恢复前快照再替换，存储失败不换D。真实UI触发下载，未恢复用户数据。旧resetData停用，避免无备份重置。
- 全186测试通过，system-acceptance.js真实本地屏幕+黑屏+合成+HEAD/range+revision+recompose通过；独立验收片e249acada162f82d、声音版05fd65c5706b34c3，已看实际合成抽帧。10主页面正常、可见错误0、模拟/假4K按钮0。系统验收文档SYSTEM-ACCEPTANCE.md。正式film13da仍3/66paused，未新跑DeepSeek/H3，不能宣称整片或无人值守系统完成。服务端DeepSeek配置configured=false（会话刷新丢失属既有行为）。
- 用户要求成片删除功能：已加DELETE /api/film/:id，校验projectId、完成/暂停/失败且不busy/auditing/rechecking；film-delete.js验证16位hex ID及目录边界/拒绝符号链接，只删除当前run目录。删除前UI确认永久移除该版成片/缓存/记录，原分镜/资产/其他版保留；删除父版后UI不显示失效对比链接。
- 全188测试通过test-artifacts/film-delete-tests.txt。真实API删除独立验收子版film_05fd65c5706b34c3，文件目录确认不存在，父验收版film_e249acada162f82d与正式film13da仍保留。SYSTEM-ACCEPTANCE.md中的声音子版属于历史验证证据，现已作为删除测试移除。真实成片页7个删除按钮，未删除用户故事成片。4173空闲重启PID193864，页面?review=film-delete。
- 2026-09-19 本轮用户明确要求从故事到最终视频。已实际用DeepSeek从原故事新生成剧本版本3（18:22:35），手动恢复两段高中回忆、纠正头像归属及公交/街巷/楼道场景；新剧本仍遗漏850房租/3000汇款的具体数字，后续应核对。新分镜整片请求长度溢出，已新增storyboard-segments.js按7场分段、全片480秒按比例分配。严格台词/资产/原文校验遇到失败，已补3次有界纠错、原始失败JSON回传修正、localStorage逐段检查点。第一段已保存，当前第二段生成中；没有新分镜批次或新正式影片，不得宣称成片完成。
- 当前浏览器movieTab（browser1/tab2），?review=storyboard-model-repair，会话密钥已填写，切勿输出。当前新剧本已选中；无需询问用户继续许可。4173空闲重启PID56272；GPU队列已确认清空。194单元测试通过test-artifacts/full-story-unit-tests.txt。
- 本轮曾误用node --test自动发现test-*.js，触发独立QA片，已如实告知用户并取消/中断本次特定任务，未操作用户旧片。误触发ID：9357a0117e505452、193a01572265c167、45928bf6310ad4b1、0ccb508616f9f740、c60a3064af279876、4e121a9f975bb36b；另cf dc ambience测试、合成测试生成，勿当正式用户成片。独立帧prompt1867bb55-0407-425d-a4a0-2b8d0567ed58先完成，phone prompt d5027f55-7a01-442b-8ef2-463a9a3395c8已移除。后来运行中的016f918c-e6de-477d-88aa-cde8c0a3da8c已明确中断。新增run-unit-tests.ps1只跑*.test.js避免再次触发真实GPU脚本。
- 续：新增screenplay-api recoverDialogueExcerpt，拆长台词时模型重复人物标签导致sourceExcerpt非连续的问题，现仅在唯一同说话人原文行包含逐字台词片段时恢复为完整原行；不改写台词、不接受不同说话人或内容。195单测通过。API聚合整段所有校验错误，含具体屏幕值与原文引用；repair传原始JSON继续纠错；前端同时保存失败草稿供断点续修。当前第二段已通过，第三段自动修正第2次。4173 PID199852，GPU无正式任务。
- 新生成第4批 BOARD_mu89u1idh6gi：原98镜554秒，拆开第81镜街巷/楼梯后99镜仍554秒（9:14，目标8分钟是参考，当前未压缩）。检查包原始review_d8e7bf22af6a004a、修改中review_1b40d3e36a9c76f9，后续又有关键帧修改尚需重新导出。源剧本3仍是本轮新生成的2780字文学剧本，不是旧66镜批。
- 新资产同义名称重复建档造成67项缺图，已通过产品资产包导入 assets/laoshiren-v2/story-version3-assets.json 对应9张已有图，实际检查99镜0问题。修正65虚构递药、58擦手机变擦手、26无台词却开口、28跨两场、34吃青菜不合上下文；校服状态23/26/27/28/44、回家裸手80/81/82/84等已调整。第81旧镜归档，新增两镜，后续索引+1。
- 本地精确屏幕镜：30余额1603.72，32道歉，36转1000要求，39零头，41借同事，53转账1000，54转了，56收到，86妈问候，87再500，90回复妈，92/93/94三段未发送输入后删除，95余额603.72。消息保留发出者姓名另行显示，不显示（微信文字）解释。第59朋友圈仍模型画面+信息卡，需查看照片保真性；未用静态原图取代。
- 新增复用已导入项目环境音下拉；为工地无对白镜1,2,4,5,6,12,14,15,17,19,20,22,29,31,33,34,37,38,40,42,50,51,52,55,58,60,61,62,69,73,75,76,77绑定既有经过ASR验证的工地程序环境音。保留哨声13/通知18/关键震动等模型音轨，不擅自放行对白。shot-split-ui支持只填2段、空第三段忽略；仍需未来补独立镜头机位字段，目前81/82已手工设置相应单场机位，移除劳保手套引用。银行App界面也按余额样式绘制。
- 关键首帧：21及47-49使用frame_527119b5652f6029_1手机手部，24小卖部frame_a28ed9f7a69d166d_0右孙发声，25承接24尾帧递钱左陈→右孙；27与44学校school-first-frame右孙发声；78/79nightSUVframe_aa60d10629134b2d_2分别右刘/左陈，已补双方角色与SUV引用；98结尾face frame_50c63db33d2ce425_0，手机画外两震不翻。96仍无首帧，画面已明确桌面屏幕朝下/后摄朝上、杂志椅腿下；oldframe_ecb...看着像屏幕朝上所以未复用。
- H3提示词返回错长ID已修复：API仅传shot_1..shot_6短ID，严格验证并映射回原始长ID，新增roundtrip测试。整批提示词曾成功准备；修改镜头的提示词会在正式启动时重算。当前4173 PID210572。最新单测应196（上次全195，后新增1roundtrip单测通过）。
- 当前正式操作：浏览器movieTab browser1/tab2，?review=full-film-preflight；新第4批已选，刚点击“自动制作完整成片”，页面正在绑定资产参考图1/99。等待实际/api/film返回新ID后跟踪；当前尚不能说有新视频。旧66镜film13da依旧暂停不动。
- CUA已reset并重建，当前只有movieTab与amendShot helper；旧exactScreen/amendStates/bindFrame helper不再存在。UI会话密钥仍填写，禁止输出。需要上传文件可Playwright waitForEvent('filechooser') + chooser.setFiles，但先按工具文档读取file-uploads。getJsDialog支持accept/dismiss。不要调用隐藏浏览器状态；用产品导出检查包看项目数据。
- 正式99镜影片已创建 film_9a5d48d797374f1a，554秒，qualityGate=true。首镜GPU prompt1772291e-c9c0-487f-b196-361586b7d581，排在其他xm1_S2/S3/S4任务后，未动这些其他任务。
- 用户追加资产上传改5M：已新建asset-media-api.js/server路由和asset-media-ui.js，将角色/场景/道具图片与视频上传限制5*1024*1024；文件保存assets/imported内容哈希路径，项目只存URL避免5MB图片base64挤爆localStorage。更新页面提示和3个import函数，静态GIF/MP4/WebM/MOV MIME。首帧内部8MB/独立音频20MB不属于本次资产库限制，保留。198单元测试通过，实际API超5MB返回400、真实PNG201。当前页面已reload，DeepSeek会话key可能丢失，勿输出。
- 4173服务已安全重启PID173036，connector/Comfy未停；立即/api/film/film_9a5d48d797374f1a/resume恢复原ID，connector按既有jobId幂等复用，因此无重复提交。接着跟踪完整99镜，不能把排队当成最终完成。
- 用户“继续下一步，有问题自行修复”：当前在处理前镜资产造型漂移。film8045第3镜实际ASR快一点啊宫崎赶不赢了，未放行；第2/3画面不匹配刘头儿黄帽浅色短袖。已暂停8045保留所有素材。
- 新功能：film-api retry revision支持firstFrame通过验证，film-ui单镜修订增加上传首帧和发声位置，首帧修订禁止静默保存原分镜（原分镜需导入同图）。film-revision-frame.test.js验证父版不变/位置必填。local-first-frame模板把无关的face-down phone句子改为仅手机镜头插入，避免瓶子镜头冒出手机。201单元测试通过。
- 新frame_af9a540b3d95c7eb共2pass：_0.png角色服装正确且持瓶；_1.png错误持手机，未采用_1。已实际查看并选用_0，上传结果file保存在test-artifacts/liu-corrected-frame.json。第二pass误把瓶换手机可继续改进，不要宣称图片全合格。
- 最新正式子版 film_e976dcf9846df7b4 正在重做第2镜，第一镜和旧第3镜复用。预计2完成后因旧3对白检查再次暂停；下一步用同一正确首帧修订第3镜（画内发声者left），保留精确台词，可5秒。不要accept-review冒充听过。其后继续99镜并查实际视觉。
- 服务4173已在空闲时重启PID204204，Comfy8188/connector8080未重启。当前browser movieTab绑定可继续使用，页面尚未refresh以加载新单镜修订UI。
- 续：e976第2镜实际生成保持黄帽浅色衣/水瓶，已查看12帧。第3改首帧left重做3791087fe176224e，ASR“攻袭”；再加强gong qi读音6秒，最新正式film_e9841cda36195862，ASR“公鸡”，仍未通过，不能自动认定是正确或试听通过。
- 新增film-pending-quality.js：显式选择保留问题继续其他镜头时deferQualityReview=true。checkReadyShot失败仅收集pendingQuality不拦后镜，最终合成前holdBeforeAssembly强制暂停待所有问题解决，不绕过质量；UI按钮“保留问题，继续其他镜头”。resume补同项目忙碌互斥，retry/recompose继承defer标志。203单测通过含finalgate和missingchecks。black静音本地镜标not_applicable避免误拦。
- 当前4173 PID195460，已POST e984/resume {deferQualityReview:true}，应继续第4镜。第一二镜保留，三镜声音问题积压；后面继续99镜，最后处理所有pending再合成。不要把pending镜说成检查通过。当前用户授权所有问题自行修复，无需反复问继续。
- UI修订单镜新增首帧已用CUA验证入口，select位置显示已修正；页面最后停自动成片某旧版修订框，需刷新新UI。另外parentRun只有videoUrl才显示原版对比，采样100%文字说明等待解码保存。

- 2026-09-20 完整99镜 e984 已渲完，声音17项待处理。新增程序环境音10镜，子版 film_e17331fb07f8f361 复用全片并替换13/16/23/43/45/67/81/83/97/99音轨；不冒充真人试听。
- 新增批量修订 API /retry-batch 和审片UI分镜暂存/批量提交，一次复用其余素材；firstFrame与screen renderMode可修订，严格原文验证与首帧发声位置仍保留。新 batch/revision tests。首帧结果可查看并采用每轮候选，解决最终道具轮劣化只能采用末轮的问题。
- 安装本地 whisper-large-v3 + pypinyin0.55；无原文提示识别，保留原始转写。同字或逐音节/声调严格一致可通过，陈实/陈时不再误拦，不接受不同声调或缺词。新增 recheck-pending 批量增强复核。e173 剩3/9/65/70/72五镜台词存疑，未人工放行。subtitle-timing刚补同音原句时间映射，207隔离单测通过，需下次安全重启4173生效。
- 全99镜中帧总览已看，定位服装/校服年代/夜景/道具错误，已生成并逐张选36镜修订首帧，记录 test-artifacts/approved-repair-frames.json。84采用 frame_15e948733f38cf53_0.png（_1添加笔记本拒绝）。82用ebc..._3并要求先提起左侧编织袋再上楼。59改为引用既有朋友圈完整3照片本地屏幕展示52%，保持原文时间13:03。
- 当前真实新批量子版 film_2b2cc5d8e21a4d0d，父e173，99镜/556秒，36镜重做，其他63复用。2026-09-20 00:38:54 UTC提交，当前第3镜采样中。prepare-final-revision-batch.js与test-artifacts/final-revision-batch.json存全部修订。不要重复提交，等此批完成，逐镜ASR/画面复查，仍有问题继续修复，最后resume合成真正MP4。用户要求完成才通知，不能停在队列进度。
- 最新207测试通过 test-artifacts/full-story-unit-tests.txt。verify-model-bindings跳过本地screen镜，验证GPU输入适用于整片。4173 PID228872未重启，批量接口/screen修订已实测生效，只有最新subtitle-timing调整尚未加载。
- 续：批量UI可重新打开暂存项继续修改、移除单项；首帧发声位置正确显示继承值，修改时克隆不写原版。新增UI状态测试。重做前3/6/7/8抽帧已看，服装与左右发声正常；7/8模型自己画了字幕，最终可能重叠，需处理。dialogue-contract已加不要生成对白字幕规则。9结束边界暂停后重启4173 PID235268、8080 PID235664并resume同film2b2，无重复任务。字幕同音时间映射修复也已加载。
- 独立中文SenseVoice识别发现film2b2第3镜原句实际可以逐字识别：快一点啊工期赶不赢了；Whisper持续把工期识别宫崎、删一。新增sensevoice-transcription.js / transcribe-sensevoice.py，不向模型提供期待原句，保留tokens/timestamps。speech-audit支持sensevoice，recheck-pending/UI增加独立中文复核按钮；重启中断rechecking标志恢复。此后端改动尚未重启生效，等批完成再安全重启。211隔离测试通过。
- sensevoice模型来自官方k2-fsa release，项目.runtime/models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17，依赖.runtime/sensevoice；可几秒识别多段。原第9镜两模型均快乐是多少，仍待解决。没有人工accept-review。
- 探索本地语音控制：H3T8音频样本a1a2...已完成但同样漏一且工期误报。安装Qwen3TTS0.6BCustomVoice到.runtime/models/qwen3-tts-customvoice，组件.runtime/tts（与Comfy隔离），generate-local-dialogue.py使用CPU4线程。liu-3.wav也漏一，不采用。CPU当前session82990在生成zhang-9和65样本用于更可控的后续声音驱动画面测试；尚未接入生产。Qwen引用来源官方HF；本地H3Ref2VA group支持ref_audios.ref_audio_0,可由LoadAudio驱动口型，并在CreateVideo用同一源音轨，尚未实现/实测，别宣称具备。
- 最新215单测通过。新增 film-framing.js 通用底部0–20%裁切/保持比例与黑边；recompose与修订payload、UI支持，保留原始源视频，无需再走GPU。真实本地验收 film_21a9fd07a6edeb5e 已complete，test-artifacts/framing-composed-preview.png已看，15%去除模型内嵌字幕且原句字幕清晰。正式片7/8/9/10/11需要15%裁切（实际已看原始字幕，其中9–11带错误英文），后续新对白镜也需检查。不要认为禁止字幕提示一定有效，11仍生成了字幕。
- 独立SenseVoice已验证3原句完全一致；9识别快乐是多少，属于expected le5轻声助词与le4字形歧义。speech-audit仅对le/de/ma/ne/ba/a/zhe轻声音节允许ASR字形声调差，不许缺字、不同声韵或其他实词声调；新增正反例测试。UI不再声称实测声调一致，原始转写与模型记录保留。对9的人工意见：画面右老张发声正确，模型自己写快了是多少，可在增强复核后按音节对应通过，不手动accept-review。
- Qwen本地样本 zhang-9.wav同样识别快乐（说明中文识别上下文歧义），zhang-65.wav识别准确但5.84s长于当前5秒。均未接入成片，不必为了实验继续加语音驱动渲染功能；先完成现有批次。所有实验CPU/download会话已完成。
- 视频资产引用补齐：asset-media-api.videoPoster在MP4/WebM/MOV上传时实际解码首帧为JPG，上传失败不写项目；UI无图片或原自动封面时更新参考图，有手动肖像则保留。输入5MB限制不变。直接真实MP4提帧已通过；待安全重启后真实HTTP上传再验。后端新增SenseVoice/恢复复核标志/裁切/视频封面尚未加载，等film2b2渲完暂停后重启4173即可（8080禁止字幕规则已加载，无需再重启）。
- 当前 film2b2 渲染第31镜、74/99 ready，pending3/9，watch-final-render.js监视session6331还在运行，仅读状态。23/26新镜12帧已看：拍肩和左陈伸手要钱、白袖/蓝袖正确。旧口头镜21/24/27/44/47–49/78/79三帧总览已看，未见底部模型字幕，保留，不需要裁切；电话屏幕仍可能有模型文字细节，不宣称像素级微信UI准确。
- 2026-09-20 续：安全暂停film2b2第43镜后创建 film_6f98613215ff619c（父2b2，继承其余未完成镜继续），修订31/40/46。原因：31后半悬浮键盘、40悬浮微信计时界面；46原提示词同类风险，改为背面实物手机点击，准确消息由相邻本地屏幕镜展示。31新版12帧已看通过，当前40渲染中。原finish helper session80069已停止，未生成finalization-state。
- watch-production-review.js只读监视与自动生成新镜12帧联系表，session47007，对象film6f。已看的新43校服左右人物与空手动作正常。finish-current-film.js改为必须指定源ID，并在有该ID-visual-review.json（ready=99且unresolved为空）后才合成，避免未经视觉复核的自动成片；尚不要启动。
- 修订页继承firstFrame的左/右位置会错误访问未定义f.firstFrame导致崩溃，已修复并添加真实render回归测试。FilmSourceSync保存裁切比例，制作请求携带此比例。成片与自动制作列表按实际创建时间排序，进行中置顶；Studio显示真实当前制作状态。217隔离测试全部通过。
- screenplay-api H3改写规则补充反应镜不生成悬浮手机UI，屏幕朝角色/不要求可读文字，准确文字交给本地合成；此提示词更新待下次安全重启4173（不影响当前已提交手写修订）。新增verify-completed-film.py只读验证实际movie.mp4全量音视频解码、时长、尾部同步、HEAD与Range；尚未对本次最终文件执行，因为还在渲染。
- 续：发现第59镜只有朋友圈配文、三张图丢失，根因是旧模型镜切换screen时沿用已上传的文字替代图，并非新的screen原图上传条件失效。新增revision.screenReferenceFile，仅允许screen/image且保留同一props资产ID，文件名严格验证；修订页可导入替换屏幕原图，5MB限制。旧素材不覆写。218单测通过（含位置页崩溃与局部采样ETA）。
- 安全暂停film6f于第61镜后重启4173，当前PID220904，日志test-artifacts/server-final.*。创建screen修订子版 film_24a9215bf8c51a10（父6f），只改59原图，剩余17镜继续，当前第63镜。watch-production-review session19342在跟踪并输出联系表，旧47007已正常退出。
- 59用assets/laoshiren-v2/moments-v2.png真实原图ams-ref-623879c79e8e6ec2ee3c38f6ebe59745cba92899f3f70cdf0cd8ef7b43d6eca8.png，52%顶部包含头像、配文、车钥匙/包厢/举杯三图与13:03。实际12帧已看，正确。45垫班费、46点击实体手机（无悬浮UI）、61看完塞回裤兜均已看。最终source须改用film24或后续子版，尚无最终成片，尚不要运行finish helper直到视觉复核全部结束。
- 续：65已看，右老张发声、底部有模型中英字幕，最终需15%裁切；63/64无模型字幕，应保留全画面。final helper不再盲裁全部对白镜，改用visual-review.json的cropBottomShots，目前[7,8,9,10,11,65]。
- Whisper63漏哎、65识别获香蒸汽；独立SenseVoice实际识别两镜原句。已通过/recheck-pending写入正式结果，两镜pending清零，未人工放行。第65完成后安全重启4173到PID235696，启用FilmQuality.checkShotWithFallback：首次存疑且有口头对白时自动独立识别、保留初次历史；二次仍不匹配继续阻止合成，二次模型不可用保留初次结果而非覆盖，匹配/无对白不重复识别。222单元测试通过。
- 当前film24a9215bf8c51a10已85/99，渲染66，watch session9792；之前16955已因暂停正常退出。后续依次66,68,70,71,72,74,75,81,82,84,85,88,91,96。用户要求成片完成才通知，不要以队列进度结束。
- 续：66/68/70均12帧检查通过且无模型字幕，不能裁切它们。70为10秒长对白，真实自动fallback生效，Whisper还/缓误识别被SenseVoice整句匹配解开；状态text_match、automaticCrosscheck:true、初次结果留history，字幕自动对齐，未人工accept。当前88/99，正在71。watch仍session9792。
- 新增inspect-composed-film.py最终实际movie.mp4按时间抽取99镜中帧（不是source），每页12镜；verify-completed-film.py全量解码+音视频尾部/时长+HEAD/range+质量状态/人工放行计数。final helper必须读最新source的visual-review.json，当前文件film24...-visual-review.json已记录到70，remaining[71,72,74,75,81,82,84,85,88,91,96]，cropBottomShots[7,8,9,10,11,65]。还有结尾98替换two-vibration音轨待final recompose完成。
- 最新：71短答哦通过且陈实左侧发声、无字幕；72长15秒对白完整逐字匹配whisper-medium，subtitleTiming aligned，右老张发声，底部模型中英字幕需15%裁切。现在90/99，正在74，watch session9792。visual-review记录已更新，cropBottomShots=[7,8,9,10,11,65,72]，还需看74/75/81/82/84/85/88/91/96。
- 补修pending显示：刚渲完正在语音检查时隐藏临时“缺少结果”失败提示，仅影响publicRun展示；真实合成gate仍拦无结果/失败。新测试验证未放宽gate，全223项通过。此小改动尚未重启生效，等当前全部完成后安全重启4173即可，不要打断GPU。其他自动fallback与屏幕原图修复均已生效。
- 续：74左陈实短答通过、无模型字幕。全部24口头对白镜已ready且文字核对通过，无pending；23镜subtitleTiming aligned，仅21保留旧needs_review（旧同音检查版本遗留）。新增checkedSubtitleTiming：只复用原句完全相同、状态text/pronunciation_match的已核对转写时间；合成时优先使用，避免降级重新用medium识别。实际21离线验证返回5段正确原句时间。224单测通过。此修改连同pending显示需当前任务结束后重启4173加载，再执行最终recompose，别中断GPU。
- 最新生产候选 film_ec8f7ac4bbcabd80（父film24，/recompose在95/99暂停时创建），已纳入7/8/9/10/11/65/72底部15%裁切与98两次震动音轨；仅剩85/88/91/96四镜继续。为了避免重复全片合成，直接用这个候选完成并验收，不再调用finish-current-film.js创建另一个重复子版。final-candidate-active.json记录ID；visual-review记录已复制到ec8...并更新84通过。
- 84已看：单一陈实放袋子到门边地面、转身坐下，没有重复人物/笔记本。4173当前PID238876，已加载checkedSubtitleTiming及之前所有功能。首次重启审批超时无执行，按工具允许重试一次后成功，无阻塞。watch session34936，当前85渲染。
- 发现partial recompose把98原check清空后，在处理前显示缺少结果误报，visiblePendingQuality现在对运行中所有尚无结果的ready镜暂不显示失败；真实check_failed/needs_review仍显示，最终gate仍严拦缺结果。224测试全通过。此最后小UI状态后端修改尚待最终任务完成后重启，当前生产不受影响。
- ec8候选当前96/99，85已看通过（灰短袖、夜间独居房、手中实体手机无悬浮UI）。剩88/91/96，watch session34936。另session86364运行verify-final-candidate.js，仅读等待ec8 complete，然后并行执行verify-completed-film.py、verify-model-bindings.js、inspect-composed-film.py；这些是技术检查/生成复核图，不是视觉批准。最终要查看composed联系表和末尾动作、更新visual-review.json后才向用户报告完成。

- 2026-09-20 最终交付 film_6c37d0e6b017be7e，父 ec8，99/99、553.33秒、1280×720、95,171,956字节。ec8最后96已12帧核对翻手机背面朝上、放手到膝盖；全99合成中帧发现97残留陈实中英字幕，最终子版20%底部裁切已实际看图去除，无新GPU任务。全音视频解码、HEAD/range、83/83执行参考绑定通过，24/24对白字幕aligned，0人工试听放行。224单测通过。4173已安全重启到PID215988，加载最后pending显示修复。SYSTEM-ACCEPTANCE.md已加入最新证据和视觉局限。所有watch/verify会话已结束；不要重复提交自动制作。

## 2026-09-21 H3 FaceRefine 插件安装

- 用户指定仓库：https://github.com/Carasibana/ComfyUI-H3-FaceRefine ，版本 1.1.2，提交 d8521d14fe0d721d80cd9417fff5a559cbc21aba。
- 安装位置：C:\AI\Comfy UI\ComfyUI\custom_nodes\ComfyUI-H3-FaceRefine。补齐 face_yolov8m.pt、person_yolov8m-seg.pt，安装 insightface 2.0 / onnx 1.23.0 / ml_dtypes 0.6.0；原 PyTorch、NumPy、CPU onnxruntime 保留。
- 官方示例依赖 NativeAudioLock 已安装。没有安装整个 Impact Pack；现有模型目录注册已提供所需 detector 路径，工作流删去未启用的 SAM/GGUF 节点。
- 等待用户运行中的镜头结束、确认队列空后重启 ComfyUI。启动 PID 314204，绑定 127.0.0.1:8188；7 个 FaceRefine 节点与 NativeAudioLock 均可见。
- workflows/H3-FaceRefine-Auto.json 与 Manual.json 适配本地模型路径，另复制进 ComfyUI user/default/workflows。分镜尺寸设置下新增人脸精修入口与工作流下载，刷新页面可见。
- 默认位置跟踪，512px 精修画布；InsightFace 身份权重并未下载，开启身份跟踪首次需要下载。不是已实现全片自动人脸修复，也不自动替换审片/成片。
- 完整节点精修链实际运行成功：39 帧 / 1.625 秒，原声锁定，独立 MP4 输出；已检查前中后对比图，227 项隔离测试通过。证据 test-artifacts/face-refine-verification.json、face-refine-history.json、face-refine-comparison.jpg。

## 2026-09-22 制作流程优化
- 新增只读 /readiness：检查 Connector 到 ComfyUI 的真实连通性。模型与工作流仍由正式提交校验，不把连通性报告为模型已就绪。
- 单镜、整批入队及自动成片（非仅提示词）先检查时长、资产、对白和渲染器；批量预检失败不会上传或保存半批任务。
- 分镜页提供不渲染的检查，区分必须修复与对白节奏建议，可定位编辑镜头，不自动改写剧本或时长。
- 项目驾驶舱按实际故事/剧本/有效分镜/任务/审片数据提供下一步入口，创作基线使用当前项目圣经。
- 队列增加提交待生成/重试发送失败入口，只处理当前项目未取得渲染编号的任务，仍经过来源版本校验。
- 验证：232 单元测试通过（test-artifacts/workflow-optimization-tests.txt）；实际当前第二批10镜检查0阻断、1节奏建议，第7镜可定位。没有新增渲染或修改镜头。
- Connector 已在 ComfyUI 队列为空时重启加载新接口。既有浏览器页需保存编辑后刷新，新页面已加载。
- 此轮范围为流程入口、预检与恢复；模型资产完整性预检、原文锁定编辑器、完整剪辑时间线仍非本轮新增功能。

## 2026-09-22 统一时间线工作台
- 侧栏分镜/AI生成/审片室/声音/自动成片合并为时间线工作台。新增 timeline-model.js、timeline-ui.js、timeline.css。
- 布局：镜头素材栏、中央真实视频/首帧预览、右侧分镜/生成/审片/声音属性，下方按真实时长的画面/声音/对白轨道。支持批次切换、选镜、缩放、播放头定位、相邻可用视频顺序预览，缺片停止不跳过。
- 审片版本筛选限定项目及镜头，批准仍调用来源校验；声音修改检查对白限制、跨标签页镜头变化，保留旧素材并通过依赖关系标记需重做。
- 完整分镜编辑、生成队列、全部审片、声音任务、样片及自动成片使用原 DOM 在工作区工具面板展开，保持原功能与 ID。未保存声音/展开分镜编辑阻止换镜；批次选择联动成片批次。
- 已实际验证10镜53秒轨道、选第7镜切换声音/审片、视频readyState=4且duration=8/error=null；阻止对白静音，未保存换镜拦截；自动成片展开10镜53秒。没有提交渲染或更改作品内容。
- 235测试通过，test-artifacts/timeline-tests.txt。当前是按分镜编排的制作时间线，不含拖动裁切/重排、转场或实时音频混音；预览原声，替换音轨与字幕在合成时应用。

## 2026-09-22 自由剪辑、转场与实时混音
- 新增 timeline-edit.js / timeline-edit-ui.js / timeline-export-api.js。剪辑数据保存项目 timelineEdits[batch]，包括独立顺序、入出点、版本、转场、每镜音量、音乐素材/音量、总音量。不改原始分镜、视频或生成校验记录。
- V1 镜头可拖放排序，左右手柄按24fps量化裁切；数值入出点可精调；撤销/重做保留最近30步（当前会话）。自动保存校验其他页面是否已修改同批剪辑。
- 叠化/淡入黑场/左向擦除，转场0.1–2秒且不超过相邻较短镜头的一半；重叠计入时间线总长。
- 双视频实时预览 + Web Audio 原声/环境音/背景音乐混合、总音量、转场交叉淡化；同源素材代理严格限制本机渲染输出和工作室成片文件。
- “导出当前剪辑”使用现有视频，校准源视频实际时长后保存计划快照，执行裁切/重排/转场/音量/音乐合成，生成独立720p24fps MP4。原自动成片入口仍用于制作源素材，界面已明确区分。缺视频会明确阻止，导出不表示自动审片通过。
- 浏览器实测第8镜右手柄4→3秒、拖动第8镜至第7镜前、撤销恢复；第7镜原声音量100→50%实时播放并保存后撤销；7→8叠化两路实际视频readyState4、7.7s/0.2s且新视频透明度0.4。测试编辑已撤销。
- 240单元测试通过。真实FFmpeg集成：三种转场各3.5秒、混合硬切+叠化5.5秒，全量音视频解码和混音能量通过。证据 test-artifacts/timeline-edit-integration.json / timeline-edit-tests.txt。HTTP导出另见 timeline-api-test-result.json。
- 本地工作室服务空闲重启 PID340764；ComfyUI与Connector未重启。试验使用合成色块/正弦音测试素材，不是用户成片。

## 2026-09-22 — 故事自动创作与易用性优化
- story-document-api.js / story-document.py: 本地读取 TXT、MD、DOCX、文字型 PDF、ODT、HTML；10 MB / 60,000 字限制；扫描 PDF、旧 DOC、损坏文件有明确提示。可用 STORY_PYTHON 指定带 pypdf 的 Python，默认使用已安装的桌面运行环境。
- story-flow-ui.js / story-flow-model.js: 上传后串联现有 DeepSeek 剧本、分镜及 H3 接口；每阶段保存，支持继续、重新生成、步骤间暂停和手动剧本作为入口。按剧本场次组织镜头，原文/剧本/镜头/提示词可编辑，保留最近 5 份上传前原文。H3 分批每 6 镜写入，失败不覆盖手工修改。
- asset-bulk-ui.js: 多张图片选择、同名匹配、手动关联、重复目标检查、逐项导入和失败重试；JSON 资产包收进高级选项。
- result-guard.js / review-explanation-ui.js: 采用版本按钮取代 MASTER 术语，区分无视频、旧记录缺少来源、源分镜/资产变更等情况。
- 验证：255 项测试通过；包含真实文档提取、HTTP 上传及模拟 DeepSeek 全流程/失败续接；实际页面确认 3 场 10 镜与多图入口。本轮未向 DeepSeek 实际提交用户故事。
- 服务已重启启用上传接口，本地服务器 PID 342792；重启前确认没有活动成片任务。现有暂停任务未恢复。
