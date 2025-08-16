let video, poseNet;
let noseX = null, noseY = null;
let noseXHistory = [], noseYHistory = [];
const SMOOTHING_WINDOW = 10;

const videoWidth = 200;
const videoHeight = 150;

// store the last position nose 
let lastProcessedNoseX = null;
let lastProcessedNoseY = null;

const NOSE_MOVE_THRESHOLD = 5;
let framesWithoutNose = 0;
const MAX_MISSING_FRAMES = 5;


function setup() {
  createCanvas(videoWidth, videoHeight).position(window.innerWidth - videoWidth - 10, 600);

  // video = createCapture(VIDEO);

  let constraints = {
    video: {
      deviceId: "1296e2f23b12efafe20cb3e27134590a208fdbc3128cf4f86a60681c1a8e8a7a"
    }
  };

  video = createCapture(constraints);
  video.size(videoWidth, videoHeight);
  video.hide();

  poseNet = ml5.poseNet(video, () => {
    console.log("PoseNet ready");
    poseNet.on("pose", function (poses) {
      if (poses.length > 0) {
        const nose = poses[0].pose.keypoints.find(k => k.part === "nose");
        if (nose && nose.score > 0.5) {
          // noseXHistory.push(nose.position.x);
          // noseYHistory.push(nose.position.y);
          framesWithoutNose = 0;

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
            lastProcessedNoseY = newNoseY;


            updateVisibleData(noseX);
          } else {

            noseX = lastProcessedNoseX;
            noseY = lastProcessedNoseY;
          }
        } else {
          framesWithoutNose++;
          if (framesWithoutNose < MAX_MISSING_FRAMES) {

            noseX = lastProcessedNoseX;
            noseY = lastProcessedNoseY;
          } else {

            noseX = null;
            noseY = null;
          }
        }
      }
    });
  });
}

// function draw() {
//   background(255);
//   image(video, 0, 0, videoWidth, videoHeight);


//   if (noseX !== null && noseY !== null) {
//     fill(255, 0, 0);
//     noStroke();
//     ellipse(noseX, noseY, 5, 5);
//   }
// }
