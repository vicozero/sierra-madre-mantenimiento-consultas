from pathlib import Path
import unittest,re,json,hashlib,subprocess
ROOT=Path(__file__).resolve().parents[1]
class Integridad(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.contracts=json.loads((ROOT/'docs/contratos_originales.json').read_text(encoding='utf-8'));cls.js=(ROOT/'app.js').read_text(encoding='utf-8');cls.html=(ROOT/'index.html').read_text(encoding='utf-8')
 def test_original_functions_remain(self):
  actual=set(re.findall(r'^(?:async )?function\s+(\w+)\s*\(',self.js,re.M));self.assertFalse(set(self.contracts['funciones'])-actual)
 def test_original_ids_remain_unique(self):
  ids=re.findall(r'\bid="([^"]+)"',self.html);self.assertEqual(len(ids),len(set(ids)));self.assertFalse(set(self.contracts['ids'])-set(ids))
 def test_original_calculations_and_exports_unchanged(self):
  for name,expected in self.contracts['contratos_sha256'].items():
   m=re.search(r'^(?:async )?function '+name+r'\(',self.js,re.M);nextfn=re.search(r'\n(?:async )?function \w+\(',self.js[m.start()+1:]);end=m.start()+1+nextfn.start() if nextfn else len(self.js)
   self.assertEqual(hashlib.sha256(self.js[m.start():end].encode()).hexdigest(),expected,name)
 def test_visual_dependencies_local_and_identical(self):
  entries=json.loads((ROOT/'docs/dependencias_visuales.json').read_text(encoding='utf-8'))
  for item in entries:self.assertEqual(hashlib.sha256((ROOT/'assets/vendor'/item['archivo']).read_bytes()).hexdigest(),item['sha256'])
  for src in re.findall(r'<script[^>]*src="([^"]+)"',self.html):self.assertTrue(src.startswith('./'),src)
 def test_valid_javascript(self):
  for name in ['app.js','mechanics.js','supervision-videos.js','assets/enterprise.js']:
   r=subprocess.run(['node','--check',str(ROOT/name)],capture_output=True,text=True);self.assertEqual(r.returncode,0,r.stderr)
if __name__=='__main__':unittest.main(verbosity=2)
