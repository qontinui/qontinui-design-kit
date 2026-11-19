import json,sys
name, ref = sys.argv[1], sys.argv[2]
def L(t,v,src): return {"$type":t,"$value":v,"$extensions":{"qontinui":{"source":f"authored({ref})"}}}
def px(n): return {"value":n,"unit":"px"}
def D(n): return L("dimension",px(n),None)
doc={"$extensions":{"qontinui":{"name":name,"import":[{"package":"@qontinui/design-tokens","ref":"415be45","groups":["color","typeScale","durations","easings","reducedMotion"]}]}}}
doc["type"]={"unit":L("number",0.5,None),
  "weight":{"regular":L("fontWeight",400,None),"medium":L("fontWeight",500,None),"semibold":L("fontWeight",600,None),"bold":L("fontWeight",700,None)},
  "leading":{"body":L("number",1.5,None)},
  "family":{"sans":{"$type":"fontFamily","$extensions":{"qontinui":{"source":"undeclared"}}}}}
doc["space"]={"unit":D(4),"scale":{},"radius":{"sm":D(2),"md":D(6),"lg":D(8),"xl":D(12)}}
for m in (1,2,3,4,6,8,12,16):
    doc["space"]["scale"][str(m)]={"$type":"dimension","$extensions":{"qontinui":{"source":"derived(spacing-multiple)","derive":{"rule":"spacing-multiple","base":4,"multiple":m,"unit":"px"}}}}
doc["layout"]={"breakpoint":{"sm":D(640),"md":D(768),"lg":D(1024),"xl":D(1280)}}
doc["states"]={"contract":{"required":L("string","default hover focus-visible active disabled loading error selected",None)}}
doc["budgets"]={"density":{"max_interactive_per_viewport":L("number",40 if name!="x" else 0,None),},"first_viewport":{"max_text_blocks":L("number",24,None)}}
json.dump(doc,open(sys.argv[3],"w"),indent=2); open(sys.argv[3],"a").write("\n")
