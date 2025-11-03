from PIL import ImageDraw, Image, ImageFont
from fps import fps_counter
font = ImageFont.truetype("Arial.ttf", 24)
font2 = ImageFont.truetype("Arial.ttf", 36)

def annotate_fps(frame):
    width,height=frame.size
    draw=ImageDraw.Draw(frame)
    draw.rectangle((10,20,100,40), fill=(100,100,100), width=2)
    draw.text( (10,20), f"fps {round(fps_counter(),1)}", font=font  )

def annotate_object(frame,text,x1,y1,x2,y2):
    width,height=frame.size
    draw=ImageDraw.Draw(frame)
    draw.rectangle((x1*width,y1*height,x2*width,y2*height), outline=(100,200,100), width=2)
    draw.rectangle((x1*width,y1*height-20,x2*width,y1*height), fill=(100,200,100), width=2)
    draw.text( (x1*width,y1*height-20), text, font=font  )


    