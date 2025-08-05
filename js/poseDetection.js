let video, poseNet;
let noseX = null, noseY = null;
let noseXHistory = [], noseYHistory = [];
const SMOOTHING_WINDOW = 10;

const videoWidth = 200;
const videoHeight = 150;

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

          noseX = noseXHistory.reduce((a, b) => a + b, 0) / noseXHistory.length;
          noseY = noseYHistory.reduce((a, b) => a + b, 0) / noseYHistory.length;
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
    if (!isAnimating) {
      isAnimating = true;
      updateVisibleData(noseX);


      setTimeout(() => {
        isAnimating = false;
      }, 5000 + 4000);
    }
  } else {
    if (g) g.selectAll("rect").remove();
  }
}