import contextlib, json, os, sys
import cv2
os.environ['YOLO_CONFIG_DIR']=os.path.join(os.path.dirname(os.path.abspath(__file__)),'.runtime','ultralytics')
os.makedirs(os.environ['YOLO_CONFIG_DIR'],exist_ok=True)
with contextlib.redirect_stdout(sys.stderr):
    from ultralytics import YOLO
    model=YOLO(sys.argv[2])
    video=cv2.VideoCapture(sys.argv[1]);count=int(video.get(cv2.CAP_PROP_FRAME_COUNT));samples=[]
    for ratio in (0.1,0.3,0.5,0.7,0.9):
        video.set(cv2.CAP_PROP_POS_FRAMES,max(0,int((count-1)*ratio)));ok,frame=video.read()
        if not ok: continue
        boxes=model.predict(frame,conf=0.55,device='cpu',verbose=False)[0].boxes.xyxy.cpu().tolist()
        faces=[]
        for box in boxes:
            x1,y1,x2,y2=[int(v) for v in box];crop=frame[max(0,y1):y2,max(0,x1):x2]
            if not crop.size: continue
            faces.append({'pixels':min(x2-x1,y2-y1),'blur':float(cv2.Laplacian(cv2.cvtColor(crop,cv2.COLOR_BGR2GRAY),cv2.CV_64F).var())})
        samples.append(faces)
    video.release()
sys.stdout.write(json.dumps({'samples':samples}))
