import argparse,hashlib,json,struct,zipfile
p=argparse.ArgumentParser();p.add_argument("--archives-only",action="store_true");args=p.parse_args()
from pathlib import Path
root=Path(__file__).resolve().parents[1];dist=root/'dist';version=(root/'version').read_text().strip()
for line in (dist/'SHA256SUMS.txt').read_text().splitlines():
 digest,name=line.split('  ',1);assert hashlib.sha256((dist/name).read_bytes()).hexdigest()==digest,name
for file in dist.glob('*.zip'):
 with zipfile.ZipFile(file) as z:assert z.testzip() is None,file.name
if not args.archives_only:assert len(list(dist.glob('*.exe')))==2,'Setup EXE non ancora compilati'
for file in dist.glob('*.exe'):
 data=file.read_bytes();assert data[:2]==b'MZ';pe=struct.unpack_from('<I',data,0x3c)[0];assert data[pe:pe+4]==b'PE\0\0'
 # Windows GUI subsystem and icon resource directory present.
 assert struct.unpack_from('<H',data,pe+24+68)[0]==2
 assert struct.unpack_from('<I',data,pe+24+112+16)[0]>0
with zipfile.ZipFile(dist/f'EasyRT_App_{version}.zip') as z:
 pkg=json.loads(z.read('resources/app/package.json'));assert pkg['version']==version
 assert b'ui-icons.js' in z.read('resources/app/index.html')
 assert hashlib.sha256(z.read('resources/app/willy-expressions.png')).hexdigest()=='34421fc882f1d4010e191830be5b0f2f9742adb3bccb50ccbd5ecbf980ee2331'
print('ZIP, checksum, versioni: OK' if args.archives_only else 'ZIP, checksum, versioni, formato EXE GUI e risorsa icona: OK')
