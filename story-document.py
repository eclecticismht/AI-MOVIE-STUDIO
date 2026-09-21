import io, json, re, sys, zipfile
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.skip=0
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.skip+=1
        if tag in ('p','br','div','h1','h2','h3','li','tr'): self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.skip=max(0,self.skip-1)
        if tag in ('p','div','li','tr'): self.parts.append('\n')
    def handle_data(self, data):
        if not self.skip: self.parts.append(data)

def extract(data, ext):
    if ext in ('txt','md','html','htm'):
        for encoding in (('utf-16',) if data.startswith((b'\xff\xfe', b'\xfe\xff')) else ('utf-8-sig','gb18030')):
            try: text=data.decode(encoding); break
            except UnicodeError: continue
        else: raise ValueError('无法识别文本编码，请另存为 UTF-8。')
        if ext in ('html','htm'):
            parser=PlainHTML(); parser.feed(text); text=''.join(parser.parts)
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
    else: raise ValueError('支持 TXT、MD、DOCX、PDF、ODT 和 HTML；旧版 DOC 请另存为 DOCX。')
    text=re.sub(r'\n{4,}','\n\n\n',text.replace('\r\n','\n')).strip()
    if not text or '\x00' in text: raise ValueError('文件没有有效故事文字。')
    if len(text)>60000: raise ValueError('故事超过 60,000 字，请按章节上传。')
    return text

if __name__=='__main__':
    try: result={'text':extract(sys.stdin.buffer.read(10485761),sys.argv[1])}
    except Exception as error: result={'error':str(error) if isinstance(error,ValueError) else '文档读取失败，请检查格式，或另存为 DOCX / TXT 后重试。'}
    sys.stdout.buffer.write(json.dumps(result,ensure_ascii=False).encode('utf-8'))
