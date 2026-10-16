import struct, sys, os
from pathlib import Path

def aup(x,a): return (x+a-1)//a*a

def parse_ico(path):
    d=Path(path).read_bytes()
    if len(d)<6: raise ValueError('ICO troppo corto')
    r,t,n=struct.unpack_from('<HHH',d,0)
    if r!=0 or t!=1 or n<1: raise ValueError('ICO non valido')
    imgs=[]; ents=[]
    for i in range(n):
        o=6+i*16
        w,h,cc,res,planes,bpp,size,off=struct.unpack_from('<BBBBHHII',d,o)
        blob=d[off:off+size]
        if len(blob)!=size: raise ValueError('ICO troncato')
        imgs.append(blob)
        ents.append((w,h,cc,res,planes,bpp,size,i+1))
    grp=struct.pack('<HHH',0,1,n)
    for e in ents:
        w,h,cc,res,planes,bpp,size,iid=e
        grp += struct.pack('<BBBBHHIH',w,h,cc,res,planes,bpp,size,iid)
    return imgs,grp

def build_rsrc(icon_path, base_rva):
    imgs, grp = parse_ico(icon_path)
    # Build directory tree in bytearray, offsets relative to .rsrc start.
    b=bytearray()
    def alloc(n,align=4):
        while len(b)%align: b.append(0)
        off=len(b); b.extend(b'\0'*n); return off
    def dirhdr(named,ids): return struct.pack('<IIHHHH',0,0,0,0,named,ids)
    # Root: types 3 (ICON), 14 (GROUP_ICON)
    root=alloc(16+2*8)
    icon_type=alloc(16+len(imgs)*8)
    icon_lang_dirs=[alloc(16+8) for _ in imgs]
    group_type=alloc(16+8)
    group_lang=alloc(16+8)
    icon_data_entries=[alloc(16) for _ in imgs]
    group_data_entry=alloc(16)
    # blobs
    icon_blob_offs=[]
    for blob in imgs:
        off=alloc(len(blob),4); b[off:off+len(blob)]=blob; icon_blob_offs.append(off)
    grp_off=alloc(len(grp),4); b[grp_off:grp_off+len(grp)]=grp
    # root
    b[root:root+16]=dirhdr(0,2)
    struct.pack_into('<II',b,root+16,3,0x80000000|icon_type)
    struct.pack_into('<II',b,root+24,14,0x80000000|group_type)
    # icon type ids
    b[icon_type:icon_type+16]=dirhdr(0,len(imgs))
    for i,lang_off in enumerate(icon_lang_dirs,1):
        struct.pack_into('<II',b,icon_type+16+(i-1)*8,i,0x80000000|lang_off)
    # each lang -> data entry
    for idx,(lang_off,de,blob,boff) in enumerate(zip(icon_lang_dirs,icon_data_entries,imgs,icon_blob_offs)):
        b[lang_off:lang_off+16]=dirhdr(0,1)
        struct.pack_into('<II',b,lang_off+16,0x0409,de)
        struct.pack_into('<IIII',b,de,base_rva+boff,len(blob),0,0)
    # group type id 1
    b[group_type:group_type+16]=dirhdr(0,1)
    struct.pack_into('<II',b,group_type+16,1,0x80000000|group_lang)
    b[group_lang:group_lang+16]=dirhdr(0,1)
    struct.pack_into('<II',b,group_lang+16,0x0409,group_data_entry)
    struct.pack_into('<IIII',b,group_data_entry,base_rva+grp_off,len(grp),0,0)
    return bytes(b)

def patch(exe, icon):
    p=Path(exe); d=bytearray(p.read_bytes())
    if d[:2]!=b'MZ': raise ValueError('non PE')
    pe=struct.unpack_from('<I',d,0x3c)[0]
    if d[pe:pe+4]!=b'PE\0\0': raise ValueError('firma PE')
    nsec=struct.unpack_from('<H',d,pe+6)[0]
    optsz=struct.unpack_from('<H',d,pe+20)[0]
    opt=pe+24
    magic=struct.unpack_from('<H',d,opt)[0]
    if magic!=0x20b: raise ValueError('serve PE32+')
    sect_align=struct.unpack_from('<I',d,opt+32)[0]
    file_align=struct.unpack_from('<I',d,opt+36)[0]
    size_image_off=opt+56
    size_headers=struct.unpack_from('<I',d,opt+60)[0]
    dd=opt+112
    sectab=opt+optsz
    first_raw=10**18; max_end_va=0; max_end_raw=0
    sections=[]
    for i in range(nsec):
        o=sectab+i*40
        name=bytes(d[o:o+8]).rstrip(b'\0')
        vs,va,rs,rp=struct.unpack_from('<IIII',d,o+8)
        sections.append((name,vs,va,rs,rp,o))
        if rp: first_raw=min(first_raw,rp); max_end_raw=max(max_end_raw,rp+rs)
        max_end_va=max(max_end_va,va+max(vs,rs))
    newhdr=sectab+nsec*40
    if newhdr+40>first_raw: raise ValueError('nessuno spazio per nuova sezione')
    va=aup(max_end_va,sect_align)
    raw=aup(max(len(d),max_end_raw),file_align)
    rsrc=build_rsrc(icon,va)
    rawsize=aup(len(rsrc),file_align)
    # extend to raw and append
    if len(d)<raw: d.extend(b'\0'*(raw-len(d)))
    d.extend(rsrc)
    if len(rsrc)<rawsize: d.extend(b'\0'*(rawsize-len(rsrc)))
    # section header
    name=b'.rsrc\0\0\0'
    d[newhdr:newhdr+8]=name
    struct.pack_into('<IIIIIIHHI',d,newhdr+8,len(rsrc),va,rawsize,raw,0,0,0,0,0x40000040)
    struct.pack_into('<H',d,pe+6,nsec+1)
    struct.pack_into('<II',d,dd+2*8,va,len(rsrc))
    struct.pack_into('<I',d,size_image_off,aup(va+len(rsrc),sect_align))
    out=p.with_suffix('.icon.exe')
    out.write_bytes(d)
    os.replace(out,p)
    return va,len(rsrc),nsec+1

if __name__=='__main__':
    for exe in sys.argv[2:]:
        print(exe, patch(exe,sys.argv[1]))
