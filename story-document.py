import io, json, posixpath, re, sys, zipfile
from urllib.parse import unquote, urlsplit
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

class PlainHTML(HTMLParser):
    def __init__(self, ignored=('script','style')):
        super().__init__(); self.parts=[]; self.skip=0; self.ignored=ignored
    def handle_starttag(self, tag, attrs):
        if tag in self.ignored: self.skip+=1
        if tag in ('p','br','div','h1','h2','h3','li','tr'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in self.ignored: self.skip=max(0,self.skip-1)
        if tag in ('p','div','li','tr'): self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def safe_xml(data):
    # Check declarations even in UTF-16 XML; ElementTree must not expand entities.
    if re.search(br'<!\s*(?:DOCTYPE|ENTITY)', data.replace(b'\x00',b''), re.I):
        raise ValueError('不支持包含外部声明的文档。')
    return ET.fromstring(data)

def ebook_path(href, base=''):
    uri=urlsplit(href)
    if uri.scheme or uri.netloc: raise ValueError('电子书正文引用外部文件，无法本地读取。')
    value=unquote(uri.path)
    if not value or '\\' in value or '\x00' in value or value.startswith('/'):
        raise ValueError('电子书文件路径无效。')
    name=posixpath.normpath(posixpath.join(base,value))
    if name=='..' or name.startswith('../'): raise ValueError('电子书文件路径超出书籍目录。')
    return name

def extract_epub(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        if len(archive.infolist())>2000: raise ValueError('电子书文件过多，请拆分章节。')
        expanded=0
        def read(name):
            nonlocal expanded
            try: info=archive.getinfo(name)
            except KeyError: raise ValueError('EPUB 缺少正文或目录文件：'+name)
            if info.flag_bits&1: raise ValueError('此 EPUB 正文已加密，请上传可读取的版本。')
            expanded+=info.file_size
            if info.file_size>12000000 or expanded>24000000:
                raise ValueError('电子书展开后过大，请拆分章节。')
            return archive.read(info)
        container=safe_xml(read('META-INF/container.xml'))
        roots=container.findall('.//{*}rootfile')
        entry=next((r for r in roots if r.get('media-type')=='application/oebps-package+xml'),None)
        if entry is None: raise ValueError('EPUB 缺少有效书籍目录。')
        package_name=ebook_path(entry.get('full-path',''))
        package=safe_xml(read(package_name));base=posixpath.dirname(package_name)
        manifest=package.find('{*}manifest');spine=package.find('{*}spine')
        if manifest is None or spine is None: raise ValueError('EPUB 缺少正文阅读顺序。')
        items={item.get('id'):item for item in manifest.findall('{*}item')}
        sections=spine.findall('{*}itemref')
        if len(sections)>300: raise ValueError('EPUB 超过 300 个章节，请按章节上传。')
        encrypted=set()
        if 'META-INF/encryption.xml' in archive.namelist():
            encrypted={ebook_path(ref.get('URI','')) for ref in safe_xml(read('META-INF/encryption.xml')).findall('.//{*}CipherReference')}
        parts=[]
        for section in sections:
            if section.get('linear','yes')=='no': continue
            item=items.get(section.get('idref'))
            if item is None: raise ValueError('EPUB 正文阅读顺序引用了缺失章节。')
            if 'nav' in item.get('properties','').split() or 'cover-image' in item.get('properties','').split(): continue
            if item.get('media-type') not in ('application/xhtml+xml','text/html'):
                raise ValueError('EPUB 包含无法提取文字的正文，请转换为文字型 EPUB 或 TXT。')
            name=ebook_path(item.get('href',''),base)
            if name in encrypted: raise ValueError('此 EPUB 正文已加密，请上传可读取的版本。')
            raw=read(name)
            try: html=raw.decode('utf-16' if raw.startswith((b'\xff\xfe',b'\xfe\xff')) else 'utf-8-sig')
            except UnicodeError: raise ValueError('EPUB 正文编码无效，请转换为 UTF-8 EPUB。')
            parser=PlainHTML(('script','style','head','nav'));parser.feed(html)
            text=''.join(parser.parts).strip()
            if text: parts.append(text)
            if sum(map(len,parts))>60000: raise ValueError('故事超过 60,000 字，请按章节上传。')
        if not parts: raise ValueError('此 EPUB 没有可提取正文，图片电子书请先识别为文字。')
        return '\n\n'.join(parts)

def extract(data, ext):
    if ext in ('txt','md','html','htm'):
        for encoding in (('utf-16',) if data.startswith((b'\xff\xfe', b'\xfe\xff')) else ('utf-8-sig','gb18030')):
            try: text=data.decode(encoding); break
            except UnicodeError: continue
        else: raise ValueError('无法识别文本编码，请另存为 UTF-8。')
        if ext in ('html','htm'):
            parser=PlainHTML(); parser.feed(text); text=''.join(parser.parts)
    elif ext=='epub': text=extract_epub(data)
    elif ext=='fb2':
        root=safe_xml(data)
        if root.tag.split('}')[-1]!='FictionBook': raise ValueError('不是有效的 FB2 电子书。')
        bodies=root.findall('{*}body')
        text='\n'.join(''.join(p.itertext()) for body in bodies for p in body.iter() if p.tag.split('}')[-1] in ('p','v','subtitle','text-author'))
    elif ext in ('docx','odt'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            name='word/document.xml' if ext=='docx' else 'content.xml'
            info=archive.getinfo(name)
            if info.file_size>12000000: raise ValueError('文档展开后过大，请拆分章节。')
            xml=archive.read(name)
            if b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper(): raise ValueError('不支持包含外部声明的文档。')
            root=ET.fromstring(xml)
            if ext=='docx':
                ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
                text='\n'.join(''.join(n.text or '' if n.tag==ns+'t' else '\n' if n.tag==ns+'br' else '\t' if n.tag==ns+'tab' else '' for n in p.iter()) for p in root.iter(ns+'p'))
            else:
                ns='{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'
                text='\n'.join(''.join(p.itertext()) for p in root.iter() if p.tag in (ns+'p',ns+'h'))
    elif ext=='pdf':
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(data))
        if reader.is_encrypted: raise ValueError('请先解除 PDF 密码后再上传。')
        if len(reader.pages)>300: raise ValueError('PDF 超过 300 页，请按章节上传。')
        text='\n\n'.join(page.extract_text() or '' for page in reader.pages)
        if not text.strip(): raise ValueError('此 PDF 没有可提取文字，扫描件请先识别为文字或 DOCX。')
    else: raise ValueError('支持 EPUB、FB2、TXT、MD、DOCX、PDF、ODT 和 HTML；旧版 DOC 请另存为 DOCX。')
    text=re.sub(r'\n{4,}','\n\n\n',text.replace('\r\n','\n')).strip()
    if not text or '\x00' in text: raise ValueError('文件没有有效故事文字。')
    if len(text)>60000: raise ValueError('故事超过 60,000 字，请按章节上传。')
    return text

if __name__=='__main__':
    try: result={'text':extract(sys.stdin.buffer.read(10485761),sys.argv[1])}
    except Exception as error: result={'error':str(error) if isinstance(error,ValueError) else '文档读取失败，请检查格式，或另存为 DOCX / TXT 后重试。'}
    sys.stdout.buffer.write(json.dumps(result,ensure_ascii=False).encode('utf-8'))
