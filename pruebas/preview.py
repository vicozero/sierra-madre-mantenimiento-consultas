"""Vista local de la rama; proxy GET del mismo paquete público, sin claves ni SQLite.
Uso: python pruebas/preview.py --port 15923
No desplegar este servidor de desarrollo en internet.
"""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
from urllib.error import HTTPError,URLError
import argparse,re,json
ROOT=Path(__file__).resolve().parents[1]
API='https://sierra-madre-consulta-api.vicozero559.chatgpt.site/api/portal'
class Preview(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  path=urlsplit(self.path).path
  if path.startswith('/_preview/portal'):
   suffix=path[len('/_preview/portal'):]
   if suffix not in ('','/supervision-evidence') and not re.fullmatch(r'/evidence/[a-f0-9]{64}',suffix):self.send_error(404);return
   query=urlsplit(self.path).query
   if len(query)>1024:self.send_error(400);return
   try:
    headers={'User-Agent':'SierraMadre-Portal-Audit','Origin':'https://vicozero.github.io'}
    if self.headers.get('Range'):headers['Range']=self.headers['Range']
    with urlopen(Request(API+suffix+('?' + query if query else ''),headers=headers),timeout=30) as response:
     body=response.read();self.send_response(response.status)
     for name in ['Content-Type','Content-Length','Content-Range','Accept-Ranges']:
      if response.headers.get(name):self.send_header(name,response.headers[name])
     self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
   except (HTTPError,URLError,TimeoutError):
    body=json.dumps({'error':'La API de consulta no respondió.'}).encode();self.send_response(502);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
   return
  if path in ('/app.js','/supervision-videos.js'):
   body=(ROOT/path[1:]).read_text(encoding='utf-8').replace(API,'http://127.0.0.1:'+str(self.server.server_port)+'/_preview/portal').encode()
   self.send_response(200);self.send_header('Content-Type','application/javascript; charset=utf-8');self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body);return
  if any(part.startswith('.') for part in Path(path).parts) or path.startswith(('/docs/','/pruebas/')):self.send_error(404);return
  super().do_GET()
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=15923);args=parser.parse_args()
 print('Vista de desarrollo: http://127.0.0.1:'+str(args.port),flush=True)
 ThreadingHTTPServer(('127.0.0.1',args.port),Preview).serve_forever()
