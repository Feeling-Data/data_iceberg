let video, poseNet;
// Person 1 tracking
let noseX = null, noseY = null;
let noseXHistory = [], noseYHistory = [];
let lastProcessedNoseX = null;
let lastProcessedNoseY = null;
let framesWithoutNose1 = 0;

// Person 2 tracking
let noseX2 = null, noseY2 = null;
let noseXHistory2 = [], noseYHistory2 = [];
let lastProcessedNoseX2 = null;
let lastProcessedNoseY2 = null;
let framesWithoutNose2 = 0;

const SMOOTHING_WINDOW = 10;
const videoWidth = 200;
const videoHeight = 150;
const NOSE_MOVE_THRESHOLD = 3;
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
      // Process Person 1 (first detected person)
      if (poses.length > 0) {
        const nose = poses[0].pose.keypoints.find(k => k.part === "nose");
        if (nose && nose.score > 0.5) {
          framesWithoutNose1 = 0;

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

            updateVisibleData(noseX, 1); // Pass person ID
          } else {
            noseX = lastProcessedNoseX;
            noseY = lastProcessedNoseY;
          }
        } else {
          framesWithoutNose1++;
          if (framesWithoutNose1 < MAX_MISSING_FRAMES) {
            noseX = lastProcessedNoseX;
            noseY = lastProcessedNoseY;
          } else {
            noseX = null;
            noseY = null;
          }
        }
      }

      // Process Person 2 (second detected person)
      if (poses.length > 1) {
        const nose2 = poses[1].pose.keypoints.find(k => k.part === "nose");
        if (nose2 && nose2.score > 0.5) {
          framesWithoutNose2 = 0;

          noseXHistory2.push(nose2.position.x);
          noseYHistory2.push(nose2.position.y);

          if (noseXHistory2.length > SMOOTHING_WINDOW) noseXHistory2.shift();
          if (noseYHistory2.length > SMOOTHING_WINDOW) noseYHistory2.shift();

          const newNoseX2 = noseXHistory2.reduce((a, b) => a + b, 0) / noseXHistory2.length;
          const newNoseY2 = noseYHistory2.reduce((a, b) => a + b, 0) / noseYHistory2.length;

          if (lastProcessedNoseX2 === null ||
            Math.abs(newNoseX2 - lastProcessedNoseX2) > NOSE_MOVE_THRESHOLD) {
            noseX2 = newNoseX2;
            noseY2 = newNoseY2;
            lastProcessedNoseX2 = newNoseX2;
            lastProcessedNoseY2 = newNoseY2;

            updateVisibleData(noseX2, 2); // Pass person ID
          } else {
            noseX2 = lastProcessedNoseX2;
            noseY2 = lastProcessedNoseY2;
          }
        } else {
          framesWithoutNose2++;
          if (framesWithoutNose2 < MAX_MISSING_FRAMES) {
            noseX2 = lastProcessedNoseX2;
            noseY2 = lastProcessedNoseY2;
          } else {
            noseX2 = null;
            noseY2 = null;
          }
        }
      } else {
        // No second person detected
        framesWithoutNose2++;
        if (framesWithoutNose2 < MAX_MISSING_FRAMES) {
          noseX2 = lastProcessedNoseX2;
          noseY2 = lastProcessedNoseY2;
        } else {
          noseX2 = null;
          noseY2 = null;
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
