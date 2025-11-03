import cv2
from ultralytics import YOLO
from pythonosc import udp_client
from PIL import Image
import numpy as np
from id_pool import IdPool
from annotate import annotate_fps, annotate_object

# *** Load the detection model (uncomment the model you want to use) ***
# model = YOLO('yolov8n.pt')
model = YOLO('yolo11n.pt') # nano model (faster, less accurate)
# model = YOLO('yolo11s.pt') # small model (slower, more accurate)
# model = YOLO('best.pt')

# *** Load the video capture ***
capture_source = 0  # Use the default camera
cap = cv2.VideoCapture(capture_source) # Load video capture from a file

# Get the resolution of the video capture
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
print(f"Resolution: {width}x{height}")

# Set up the OSC client
osc_client = udp_client.SimpleUDPClient("127.0.0.1", 6448)  # Assuming you're sending to localhost on port 6448

window_name = "Tracking"
cv2.namedWindow(window_name, cv2.WINDOW_AUTOSIZE | cv2.WINDOW_GUI_EXPANDED)

pool = IdPool(12,2)

# Loop through the video frames
while cap.isOpened() and cv2.getWindowProperty(window_name, cv2.WND_PROP_VISIBLE)>=1:
    # Read a frame from the video
    success, frame = cap.read()
    # Define the polygon points
    polygon_points = np.array([[509, 335], [531, 441], [149, 830], [63, 707]], np.int32)
    polygon_points = polygon_points.reshape((-1, 1, 2))
    def click_event(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            print(f"Screen coordinates: ({x}, {y})")

    # cv2.setMouseCallback(window_name, click_event)

    # Draw the polygon on the frame
    # cv2.fillPoly(frame, [polygon_points], color=(0, 0, 0))

    if success:
        # Run YOLO tracking on the frame, persisting tracks between frames
        # You may want to experiment with editing the following attributes:
        # - conf:  set the confidence threshold between 0 and 1
        # - half: set to True to use half precision (faster, less accurate)
        # - imgsz: set the input image size (height, width) - default is 640, but using actual size may improve accuracy
        results = model.track(frame, persist=True, classes=[0], conf=0.1, device="mps", half=False, verbose=False, imgsz=(544, 960) )
        try:
            boxes = results[0].boxes.xyxyn.cpu()
            conf = results[0].boxes.conf.cpu().tolist()
            ids = results[0].boxes.id.cpu().tolist()
        except AttributeError:
            boxes=[]
            conf=[]
            ids=[]
        # Visualize the results on the frame
        # annotated_frame = results[0].plot(font_size=28,conf=False)
        annotated_frame = Image.fromarray(frame)
        height, width, c = frame.shape
        for detection,conf,track_id in zip( boxes, conf, ids ):
            x1,y1,x2,y2=detection
            center_x = ( x1 + x2 ) / 2
            center_y = ( y1 + y2 ) / 2
            print(f"Center: ({center_x*width:.1f}, {center_y*height:.1f}) Confidence: {conf:.2f} Track ID: {track_id}")
            msg = [float (center_x), float(y2), float(conf)*100, float(x2-x1), float(y2-y1)]
            id=pool.get_id(track_id)

            if id==None:
                #was not able to get a new pooled id
                continue
            annotate_object(annotated_frame,f"id={id}",x1,y1,x2,y2)
            osc_address = f"/person/{id}"  # OSC address pattern for each person
            try:
                osc_client.send_message(osc_address, msg)
                pass
            except OSError as e:
                print(e)

        annotate_fps(annotated_frame)
        # Display the annotated frame
        cv2.imshow(window_name, np.asarray(annotated_frame))

        # Break the loop if 'q' or escape is pressed
        if ( cv2.waitKey(1) & 0xFF ) in [27, ord('q'), ord('Q')]:
            break
    else:
        # Break the loop if the end of the video is reached
        break

# Release the video capture object and close the display window
cap.release()
cv2.destroyAllWindows()