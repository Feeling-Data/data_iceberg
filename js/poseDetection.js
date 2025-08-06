let video, poseNet;
let noseX = null, noseY = null;
let noseXHistory = [], noseYHistory = [];
const SMOOTHING_WINDOW = 10;

const videoWidth = 200;
const videoHeight = 150;

// store the last position nose 
let lastProcessedNoseX = null;

const NOSE_MOVE_THRESHOLD = 5;

function setup() {
  createCanvas(videoWidth, videoHeight).position(window.innerWidth - videoWidth - 10, 600);

  video = createCapture(VIDEO);
  video.size(videoWidth, videoHeight);
  video.hide();

  poseNet = ml5.poseNet(video, () => {
    console.log("PoseNet ready");
    poseNet.on("pose", function (poses) {
      if (poses.length > 0) {
        const nose = poses[0].pose.keypoints.find(k => k.part === "nose");
        if (nose && nose.score > 0.5) {
          noseXHistory.push(nose.position.x);
          noseYHistory.push(nose.position.y);

          if (noseXHistory.length > SMOOTHING_WINDOW) noseXHistory.shift();
          if (noseYHistory.length > SMOOTHING_WINDOW) noseYHistory.shift();

          const newNoseX = noseXHistory.reduce((a, b) => a + b, 0) / noseXHistory.length;
          const newNoseY = noseYHistory.reduce((a, b) => a + b, 0) / noseYHistory.length;


          if (lastProcessedNoseX === null ||
            Math.abs(newNoseX - lastProcessedNoseX) > NOSE_MOVE_THRESHOLD) {
            noseX = newNoseX;
            noseY = newNoseY;
            lastProcessedNoseX = newNoseX;


            updateVisibleData(noseX);
          }
        } else {

          noseX = null;
          noseY = null;
          if (g) g.selectAll("*").remove();
        }
      }
    });
  });
}

function draw() {
  background(255);
  image(video, 0, 0, videoWidth, videoHeight);


  if (noseX !== null && noseY !== null) {
    fill(255, 0, 0);
    noStroke();
    ellipse(noseX, noseY, 5, 5);
  }
}
