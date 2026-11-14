import math, sys
from PIL import Image, ImageDraw
SS=4; N=1024*SS
# Apple grid: 824 body centred on 1024, continuous corners (superellipse n=5)
def squircle(cx,cy,r,n=5.0,steps=720):
    pts=[]
    for i in range(steps):
        t=2*math.pi*i/steps; c=math.cos(t); s=math.sin(t)
        pts.append((cx+r*math.copysign(abs(c)**(2/n),c), cy+r*math.copysign(abs(s)**(2/n),s)))
    return pts
body=Image.new("L",(N,N),0)
ImageDraw.Draw(body).polygon(squircle(N/2,N/2,412*SS),fill=255)
# flat #262626, as in the Figma branding section
grad=Image.new("RGB",(1,N))
for y in range(N):
    t=max(0,min(1,(y-100*SS)/(824*SS))); v=0x26; grad.putpixel((0,y),(v,v,v))
grad=grad.resize((N,N))
# The brand mark (28 viewBox): four bars around a square
mark=Image.new("L",(N,N),0); d=ImageDraw.Draw(mark)
size=0.62*824*SS            # mark is 62% of the body, as in the Figma branding
k=size/(25.3604-2.02637); ox=N/2-size/2-2.02637*k; oy=N/2-size/2-2.02637*k
def R(x0,y0,x1,y1,r,corners):
    d.rounded_rectangle((ox+x0*k,oy+y0*k,ox+x1*k,oy+y1*k),radius=r*k,fill=255,corners=corners)
r=2.8877
R(6.56348,2.02637,21.1484,6.4043,r,(True,True,False,False))     # top
R(6.56348,20.9893,21.1484,25.3613,r,(False,False,True,True))    # bottom
R(2.02637,6.4043,6.56348,20.9893,r,(True,False,False,True))     # left
R(21.1484,6.4043,25.3604,20.9893,r,(False,True,True,False))     # right
out=Image.new("RGBA",(N,N),(0,0,0,0))
out.paste(grad,(0,0),body)
white=Image.new("RGBA",(N,N),(255,255,255,255))
out.paste(white,(0,0),mark)
out=out.resize((1024,1024),Image.LANCZOS)
out.save("icon-1024.png")
