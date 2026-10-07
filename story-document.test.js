const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process'),path=require('node:path'),os=require('node:os');
const {extractDocument,storyDocumentApi}=require('./story-document-api');
function fixture(code){const python=process.env.STORY_PYTHON||path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');const r=spawnSync(python,['-'],{input:code,maxBuffer:15000000});assert.equal(r.status,0,r.stderr?.toString()||r.error?.message);return r.stdout}
function epub({version='3.0',href='Text/second.xhtml',spine='<itemref idref="second"/><itemref idref="first"/>',extra={},second='<html><head><title>书名</title><style>hidden</style></head><body><h1>第二章</h1><p>西门清走回家。</p><script>bad()</script></body></html>'}={}){
 const files={'mimetype':'application/epub+zip','META-INF/container.xml':'<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="Book/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
 'Book/package.opf':`<package xmlns="http://www.idpf.org/2007/opf" version="${version}"><manifest><item id="first" href="Text/first.xhtml" media-type="application/xhtml+xml"/><item id="second" href="${href}" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/></manifest><spine>${spine}<itemref idref="nav"/><itemref idref="notes" linear="no"/></spine></package>`,
 'Book/Text/first.xhtml':'<html><body><p>第一章：买单。</p></body></html>','Book/Text/second.xhtml':second,'Book/nav.xhtml':'<html><body><nav>目录，不是正文。</nav></body></html>','Book/notes.xhtml':'<html><body>非线性注释，不是故事。</body></html>',...extra};
 return fixture(`import io,zipfile,sys,json\nb=io.BytesIO()\nfiles=json.loads(${JSON.stringify(JSON.stringify(files))})\nwith zipfile.ZipFile(b,'w',compression=zipfile.ZIP_DEFLATED) as z:\n for name,text in files.items(): z.writestr(name,text)\nsys.stdout.buffer.write(b.getvalue())`);
}
test('EPUB 2 and 3 preserve spine reading order and omit navigation and active content',async()=>{
 for(const version of ['2.0','3.0'])assert.equal(await extractDocument(epub({version}),'epub'),'第二章\n西门清走回家。\n\n第一章：买单。');
 const text=await extractDocument(epub({href:'../Text/%E7%AB%A0%E8%8A%82.xhtml#start',extra:{'Text/章节.xhtml':'<html><body><p>中文路径 &amp; 内容。</p></body></html>'}}),'epub');
 assert.equal(text,'中文路径 & 内容。\n\n第一章：买单。');
});
test('EPUB reports broken, encrypted, external and oversized book content',async()=>{
 await assert.rejects(extractDocument(epub({spine:'<itemref idref="missing"/>'}),'epub'),/缺失章节/);
 await assert.rejects(extractDocument(epub({href:'https://example.com/chapter.xhtml'}),'epub'),/外部文件/);
 await assert.rejects(extractDocument(epub({href:'../../escape.xhtml'}),'epub'),/超出书籍目录/);
 const encryption=uri=>`<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><CipherData><CipherReference URI="${uri}"/></CipherData></EncryptedData></encryption>`;
 await assert.rejects(extractDocument(epub({extra:{'META-INF/encryption.xml':encryption('Book/Text/second.xhtml')}}),'epub'),/正文已加密/);
 assert.match(await extractDocument(epub({extra:{'META-INF/encryption.xml':encryption('Book/fonts/font.otf')}}),'epub'),/西门清/);
 await assert.rejects(extractDocument(epub({extra:{'META-INF/container.xml':'<!DOCTYPE x [<!ENTITY boom "evil">]><container>&boom;</container>'}}),'epub'),/外部声明/);
 await assert.rejects(extractDocument(epub({second:'<html><body><p>'+'字'.repeat(60001)+'</p></body></html>'}),'epub'),/60,000/);
 await assert.rejects(extractDocument(epub({spine:'<itemref idref="second"/>',second:'<html><body><img src="cover.png"/></body></html>'}),'epub'),/没有可提取正文/);
});
test('FB2 preserves main text and rejects declarations without reading book metadata',async()=>{
 const xml='<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><annotation><p>元数据</p></annotation></title-info></description><body><section><title><p>场次八</p></title><p>西门清<b>微醺</b>回家。</p></section></body></FictionBook>';
 assert.equal(await extractDocument(Buffer.from(xml),'fb2'),'场次八\n西门清微醺回家。');
 await assert.rejects(extractDocument(Buffer.from('<root/>'),'fb2'),/有效的 FB2/);
 await assert.rejects(extractDocument(Buffer.from('\ufeff<!DOCTYPE FictionBook [<!ENTITY x "bad">]><FictionBook/>','utf16le'),'fb2'),/外部声明/);
});
test('ebook upload endpoint accepts EPUB and FB2 and the file picker exposes both',async()=>{
 const http=require('node:http'),fs=require('node:fs'),server=http.createServer((req,res)=>storyDocumentApi(req,res,'/api/story-document'));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{for(const [ext,body]of [['epub',epub()],['fb2',Buffer.from('<FictionBook><body><p>原文</p></body></FictionBook>')]]){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/story-document?ext=${ext}`,{method:'POST',body});assert.equal(r.status,200);assert.ok((await r.json()).text);}}
 finally{await new Promise(r=>server.close(r))}
 assert.match(fs.readFileSync('story-flow-ui.js','utf8'),/accept="[^"]*\.epub[^\"]*\.fb2/);
});
test('imports Chinese TXT and strips active HTML content',async()=>{assert.equal(await extractDocument(Buffer.from('西门清：我不是西门庆。'),'txt'),'西门清：我不是西门庆。');assert.equal(await extractDocument(Buffer.from('<p>故事</p><script>bad()</script><p>结尾</p>'),'html'),'故事\n\n结尾')});
test('reads DOCX and ODT paragraphs without losing Chinese',async()=>{for(const [ext,name,xml] of [['docx','word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>广州</w:t></w:r></w:p><w:p><w:r><w:t>湘满楼</w:t></w:r></w:p></w:body></w:document>'],['odt','content.xml','<root xmlns:t="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><t:p>广州</t:p><t:p>湘满楼</t:p></root>']]){const data=fixture(`import io,zipfile,sys\nb=io.BytesIO()\nwith zipfile.ZipFile(b,'w') as z: z.writestr(${JSON.stringify(name)},${JSON.stringify(xml)})\nsys.stdout.buffer.write(b.getvalue())`);assert.equal(await extractDocument(data,ext),'广州\n湘满楼')}});
test('extracts text PDF and rejects image-only PDF without creating a story',async()=>{const data=fixture("import io,sys\nfrom reportlab.pdfgen import canvas\nb=io.BytesIO();c=canvas.Canvas(b);c.drawString(30,700,'A story begins.');c.save();sys.stdout.buffer.write(b.getvalue())");assert.match(await extractDocument(data,'pdf'),/A story begins/);const blank=fixture("import io,sys\nfrom pypdf import PdfWriter\nb=io.BytesIO();w=PdfWriter();w.add_blank_page(width=100,height=100);w.write(b);sys.stdout.buffer.write(b.getvalue())");await assert.rejects(extractDocument(blank,'pdf'),/没有可提取文字/)});
test('rejects oversized, empty, corrupt and legacy documents',async()=>{await assert.rejects(extractDocument(Buffer.alloc(10485761),'txt'),/10 MB/);await assert.rejects(extractDocument(Buffer.from(' '),'txt'),/有效故事文字/);await assert.rejects(extractDocument(Buffer.from('not zip'),'docx'),/读取失败/);await assert.rejects(extractDocument(Buffer.from('old doc'),'doc'),/另存为 DOCX/);await assert.rejects(extractDocument(Buffer.from('文'.repeat(60001)),'txt'),/60,000/)});
test('upload endpoint checks origin and returns extracted text',async()=>{const http=require('node:http'),server=http.createServer((req,res)=>storyDocumentApi(req,res,'/api/story-document'));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url=`http://127.0.0.1:${server.address().port}/api/story-document?ext=txt`;const r=await fetch(url,{method:'POST',body:'原文'});assert.equal((await r.json()).text,'原文');const bad=await fetch(url,{method:'POST',headers:{Origin:'https://example.com'},body:'x'});assert.equal(bad.status,403)}finally{await new Promise(r=>server.close(r))}});
