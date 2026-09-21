const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture(){
 const source=fs.readFileSync(require.resolve('./film-ui.js'),'utf8');
 const context=vm.createContext({structuredClone,renderEdit(){},DialogueContract:{eventText:e=>e.text},filmRevisionBusy:false});
 vm.runInContext(source.slice(source.indexOf('function selectFilmRevision('),source.indexOf('function renderFilmRevision(')),context);
 vm.runInContext(source.slice(source.indexOf('function setFilmRevisionFramePosition('),source.indexOf('async function importFilmRevisionFrame(')),context);
 return context;
}
test('returning to a staged revision restores its snapshot without mutating it',()=>{
 const c=fixture(),staged={prompt:'new',subtitle:'new words',duration:6,firstFrame:{file:'new',speakerPosition:'right'},audioMode:'model'};
 c.filmRevision={run:{shots:[{prompt:'old',duration:4,dialogueEvents:[],firstFrame:{file:'old',speakerPosition:'left'}}]},batchRevisions:[{index:0,revision:staged}]};
 c.selectFilmRevision(0);assert.equal(c.filmRevision.prompt,'new');assert.equal(c.filmRevision.firstFrame.file,'new');
 c.setFilmRevisionFramePosition('left');assert.equal(staged.firstFrame.speakerPosition,'right');
 c.removeStagedFilmRevision(0);assert.equal(c.filmRevision.batchRevisions.length,0);assert.equal(c.filmRevision.run.shots[0].prompt,'old');
});
test('editing an inherited first-frame position clones it and busy selection stays unchanged',()=>{
 const c=fixture(),shot={prompt:'old',duration:4,dialogueEvents:[],firstFrame:{file:'original',speakerPosition:'left'}};
 c.filmRevision={run:{shots:[shot]},index:0};c.setFilmRevisionFramePosition('right');assert.equal(shot.firstFrame.speakerPosition,'left');assert.equal(c.filmRevision.firstFrame.speakerPosition,'right');
 c.filmRevisionBusy=true;c.selectFilmRevision(8);assert.equal(c.filmRevision.index,0);
});

test('revision editor renders an inherited speaker position before a new frame is imported',()=>{
 const source=fs.readFileSync(require.resolve('./film-ui.js'),'utf8');
 const c=vm.createContext({D:{activeProjectId:'p'},esc:v=>String(v??''),filmRevisionBusy:false,
  filmRevision:{run:{projectId:'p',title:'film',shots:[{shotId:'s',dialogueEvents:[],references:[],firstFrame:{file:'frame.png',speakerPosition:'left'}}]},index:0,prompt:'visual',subtitle:'',duration:5}});
 vm.runInContext(source.slice(source.indexOf('function renderFilmRevision('),source.indexOf('async function saveFilmRevisionToSource(')),c);
 const html=c.renderFilmRevision();
 assert.match(html,/<option value="left" selected>左侧/);
 assert.ok(!c.filmRevision.firstFrame);
});
