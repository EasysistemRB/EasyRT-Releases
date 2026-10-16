"""Build EasyRT artifacts from a pinned, verified Electron runtime."""
import argparse,hashlib,json,os,re,subprocess,sys,zipfile
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parents[1]
VERSION=(ROOT/'version').read_text().strip()
ELECTRON=(ROOT/'electron-version').read_text().strip()
OUT=ROOT/'dist';OUT.mkdir(exist_ok=True)
def sha(data):return hashlib.sha256(data).hexdigest()
def archive(path,entries):
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,data in sorted(entries.items()):
   info=zipfile.ZipInfo(name,(2026,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,data)
 return sha(path.read_bytes())
def build(runtime,tag,compile_go=True):
 if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-rc\.\d+)?',tag):raise ValueError('Invalid release tag')
 if tag[1:].split('-rc.')[0]!=VERSION:raise ValueError('Release tag differs from packaged version')
 package=json.loads((ROOT/'resources/app/package.json').read_text())
 if package.get('version')!=VERSION:raise ValueError('App version differs from packaged version')
 if package.get('runtimeVersion')!=ELECTRON:raise ValueError('Runtime version differs from packaged version')
 core={}
 with zipfile.ZipFile(runtime) as z:
  if z.testzip():raise ValueError('Invalid Electron ZIP')
  for i in z.infolist():
   name=i.filename
   if '\\' in name or ':' in name or PurePosixPath(name).is_absolute() or '..' in PurePosixPath(name).parts:raise ValueError('Unsafe runtime ZIP path')
   if i.is_dir() or i.filename.startswith('resources/app/') or i.filename in ['EasyRT_App.ico','runtime.json']:continue
   core['EasyRT.exe' if i.filename=='electron.exe' else i.filename]=z.read(i.filename)
 for f in sorted((ROOT/'resources/tools').glob('*.exe')):core['resources/tools/'+f.name]=f.read_bytes()
 # Reassemble large vendor binaries split only for repository transport.
 vendor_manifest=ROOT/'release/vendor-parts.json'
 vendors=json.loads(vendor_manifest.read_text()) if vendor_manifest.exists() else []
 for vendor in vendors:
  def checked_path(name):
   candidate=PurePosixPath(name)
   if candidate.is_absolute() or '..' in candidate.parts or '\\' in name or ':' in name or not name.startswith('resources/tools/'):raise ValueError('Unsafe vendor path')
   return ROOT.joinpath(*candidate.parts)
  checked_path(vendor['path'])
  chunks=[]
  for part in vendor['parts']:
   data=checked_path(part['path']).read_bytes()
   if sha(data)!=part['sha256']:raise ValueError('Vendor part checksum mismatch')
   chunks.append(data)
  data=b''.join(chunks)
  if len(data)!=vendor['size'] or sha(data)!=vendor['sha256']:raise ValueError('Vendor checksum mismatch')
  core[vendor['path']]=data
 core['EasyRT_App.ico']=(ROOT/'EasyRT_App.ico').read_bytes()
 if 'EasyRT.exe' not in core:raise ValueError('Electron executable missing')
 core_name='EasyRT_Runtime_'+ELECTRON+'.zip'
 core_digest=archive(OUT/core_name,core)
 app={}
 for f in sorted((ROOT/'resources/app').iterdir()):
  if f.is_file() and not f.name.startswith('test') and f.suffix in ['.cjs','.html','.css','.js','.json','.png','.jpg','.ico','.svg','.txt']:app['resources/app/'+f.name]=f.read_bytes()
 app['runtime.json']=json.dumps({'runtimeVersion':ELECTRON,'sha256':core_digest}).encode()
 app_name='EasyRT_App_'+VERSION+'.zip';app_digest=archive(OUT/app_name,app)
 listing=json.dumps([{'path':n,'sha256':sha(b)}for n,b in sorted(app.items())]).encode()
 runtime_listing=json.dumps([{'path':n,'sha256':sha(b)}for n,b in sorted(core.items())]).encode()
 base={'version':VERSION,'runtimeVersion':ELECTRON,'distributionSchema':2,'runtimeUrl':f'https://github.com/EasysistemRB/EasyRT-Releases/releases/download/{tag}/{core_name}','runtimeSha256':core_digest,'appSha256':app_digest}
 assets={'runtime-files.json':runtime_listing,'app.zip':(OUT/app_name).read_bytes(),'app-files.json':listing,'logo.png':(ROOT/'resources/app/logo.png').read_bytes(),'EasyRT_App.ico':(ROOT/'EasyRT_App.ico').read_bytes()}
 for mode,name in [('online','EasyRT_Setup_Leggero'),('offline','EasyRT_Unico')]:
  entries=dict(assets);entries['installer.json']=json.dumps(dict(base,mode=mode)).encode()
  if mode=='offline':entries['runtime.zip']=(OUT/core_name).read_bytes()
  archive(ROOT/'standalone/payload.zip',entries)
  if compile_go:
   env=dict(os.environ,GOOS='windows',GOARCH='amd64',CGO_ENABLED='0',GO111MODULE='off')
   target=OUT/f'{name}_{VERSION}.exe'
   subprocess.run(['go','build','-trimpath','-ldflags','-s -w -H=windowsgui','-o',str(target.resolve()),'main.go'],cwd=ROOT/'standalone',env=env,check=True)
   subprocess.run([sys.executable,str(ROOT/'patch_icon.py'),str(ROOT/'EasyRT_App.ico'),str(target)],check=True)
 # Portable complete ZIP keeps the manufacturer tools and all original sections.
 complete=dict(core);complete.update(app)
 complete['LEGGIMI.txt']=(ROOT/'INSTALLAZIONE.md').read_bytes()
 archive(OUT/f'EasyRT_Windows_{VERSION}.zip',complete)
 source={str(p.relative_to(ROOT)):p.read_bytes()for p in ROOT.rglob('*')if p.is_file()and not any(x in {'dist','.git','node_modules','__pycache__','qa'}for x in p.relative_to(ROOT).parts)and str(p.relative_to(ROOT)) not in {v['path'] for v in vendors}and p.name not in {'payload.zip','electron.zip','electron-checksums.txt'}and not p.name.endswith('.pyc')}
 archive(OUT/f'EasyRT_Sorgenti_{VERSION}.zip',source)
 (OUT/'SHA256SUMS.txt').write_text(''.join(sha(p.read_bytes())+'  '+p.name+'\n'for p in sorted(OUT.iterdir())if p.is_file()and p.name!='SHA256SUMS.txt'))
 print(json.dumps({p.name:p.stat().st_size for p in OUT.iterdir()if p.is_file()},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--runtime',required=True);p.add_argument('--tag',required=True);p.add_argument('--no-go',action='store_true');a=p.parse_args();build(a.runtime,a.tag,not a.no_go)
