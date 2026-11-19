import json,sys,re
gen=json.load(open(sys.argv[1])); com=json.load(open(sys.argv[2]))
def canon(v):
    m=re.fullmatch(r'#([0-9a-fA-F]{6})',v)
    if m: h=m.group(1); return 'rgb(%d, %d, %d)'%tuple(int(h[i:i+2],16) for i in (0,2,4))
    return v
g=gen['tokens']['colors']; c=com['tokens']['colors']
gv={}
for k,v in g.items(): gv.setdefault(v,[]).append(k)
for k,v in c.items():
    cv=canon(v)
    if g.get(k)==cv: st='SAME'
    elif cv in gv: st='SAME VALUE, other key: '+','.join(gv[cv])
    else: st='DIFF gen[%s]=%s'%(k,g.get(k))
    print(f'{k:20} {v:40} {st}')
print('generated-only keys:',len([k for k in g if k not in c and canon_ok(k) if False]) if False else '')
