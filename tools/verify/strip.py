# strip.py <prefix> <c0> <c1> <lo0> <lo1> <ticks...> — полоса вырезок области взрыва по тикам, x4
import sys; from PIL import Image
pre,c0,c1,lo0,lo1=sys.argv[1],*map(int,sys.argv[2:6]); ticks=sys.argv[6].split(",")
x0=max(0,(c0-1)*8); x1=min(256,(c1+2)*8); y0=max(0,191-lo1-8); y1=min(192,191-lo0+8)
tiles=[]
for t in ticks:
    try: im=Image.open(f"{pre}_{t}.png").crop((x0,y0,x1,y1)); tiles.append(im.resize((im.width*4,im.height*4),Image.NEAREST))
    except Exception as e: print("нет",t,e)
W=sum(t.width for t in tiles)+8*len(tiles); H=max(t.height for t in tiles)
out=Image.new("RGB",(W,H),(90,90,90)); x=0
for t in tiles: out.paste(t,(x,0)); x+=t.width+8
out.save(f"{pre}_strip.png"); print("strip", f"{pre}_strip.png", out.size)
