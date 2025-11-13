import cv2
from cv2 import aruco
import numpy as np
from pythonosc import udp_client
from PIL import Image
from annotate import annotate_fps
import time  # For throttling
import json  # For saving calibration
import os  # For file paths

# *** ArUco marker configuration ***
MARKER_SIZE_CM = 18.7  # Physical size of the marker in centimeters
MARKER_DICT = aruco.DICT_ARUCO_ORIGINAL  # ArUco dictionary to use

# Specific marker ID to track (set to None to track any marker)
# If you want to track only marker ID 42, set: TARGET_MARKER_ID = 42
# To see which marker ID you have, run the script and look at the display
TARGET_MARKER_ID = 5  # Set to specific ID (e.g., 0, 1, 2...) or None for any marker

# *** Calibration file ***
CALIBRATION_FILE = "camera_calibration.json"

def load_calibration():
    """Load calibration from file if it exists."""
    if os.path.exists(CALIBRATION_FILE):
        try:
            with open(CALIBRATION_FILE, 'r') as f:
                data = json.load(f)
                print(f"Loaded calibration from {CALIBRATION_FILE}")
                return data['calibration_points']
        except Exception as e:
            print(f"Error loading calibration: {e}")
    return None

def save_calibration(calibration_points):
    """Save calibration to file."""
    try:
        with open(CALIBRATION_FILE, 'w') as f:
            json.dump({'calibration_points': calibration_points}, f, indent=2)
        print(f"Calibration saved to {CALIBRATION_FILE}")
        return True
    except Exception as e:
        print(f"Error saving calibration: {e}")
        return False

# *** Perspective calibration ***
# Camera sees in perspective - need to map camera view to physical room positions
# Calibration points: [camera_x, physical_x] where both are 0-1 normalized
# Load from file or use default

loaded_calibration = load_calibration()
if loaded_calibration:
    CALIBRATION_POINTS = loaded_calibration
else:
    # Default calibration (no correction)
    CALIBRATION_POINTS = [
        [0.0, 0.0],   # Camera left edge -> Physical left edge (default: no correction)
        [0.5, 0.5],   # Camera center -> Physical center
        [1.0, 1.0]    # Camera right edge -> Physical right edge (default: no correction)
    ]
    print("Using default calibration (no correction)")
    print("Press 'c' to start interactive calibration")

def apply_perspective_correction(camera_x):
    """
    Apply perspective correction using calibration points.
    Values outside calibrated range are clamped.
    
    Args:
        camera_x: Normalized camera x position (0-1)
    
    Returns:
        Corrected physical x position (0-1), or None if outside calibrated range
    """
    # If no calibration or only one point, return as-is
    if len(CALIBRATION_POINTS) < 2:
        return camera_x
    
    # Get calibrated camera range
    cam_min = CALIBRATION_POINTS[0][0]
    cam_max = CALIBRATION_POINTS[-1][0]
    
    # Clamp to calibrated range (ignore values outside calibration)
    # Return None if outside range to indicate invalid position
    if camera_x < cam_min or camera_x > cam_max:
        # Allow small tolerance for edge values
        tolerance = 0.02
        if camera_x < cam_min - tolerance or camera_x > cam_max + tolerance:
            return None  # Outside calibrated range - ignore
    
    # Clamp to valid calibration range
    camera_x = max(cam_min, min(cam_max, camera_x))
    
    # Find the two calibration points to interpolate between
    left_point = CALIBRATION_POINTS[0]
    right_point = CALIBRATION_POINTS[-1]
    
    for i in range(len(CALIBRATION_POINTS) - 1):
        if CALIBRATION_POINTS[i][0] <= camera_x <= CALIBRATION_POINTS[i + 1][0]:
            left_point = CALIBRATION_POINTS[i]
            right_point = CALIBRATION_POINTS[i + 1]
            break
    
    # Handle edge cases
    if camera_x <= CALIBRATION_POINTS[0][0]:
        return CALIBRATION_POINTS[0][1]
    if camera_x >= CALIBRATION_POINTS[-1][0]:
        return CALIBRATION_POINTS[-1][1]
    
    # Linear interpolation between the two points
    cam_left, phys_left = left_point
    cam_right, phys_right = right_point
    
    t = (camera_x - cam_left) / (cam_right - cam_left)
    physical_x = phys_left + t * (phys_right - phys_left)
    
    return physical_x

def run_calibration_wizard(cap, width, height, detector):
    """
    Interactive calibration wizard.
    Returns new calibration points or None if cancelled.
    """
    print("\n" + "="*60)
    print("INTERACTIVE CALIBRATION WIZARD")
    print("="*60)
    print("\nYou will collect camera positions for 5 screen locations:")
    print("  1. Left edge of SCREEN 1 (physical position 0.0000)")
    print("  2. Center of SCREEN 1 (physical position 0.1667)")
    print("  3. Center of SCREEN 2 (physical position 0.5000)")
    print("  4. Center of SCREEN 3 (physical position 0.8333)")
    print("  5. Right edge of SCREEN 3 (physical position 1.0000)")
    print("\nFor each position:")
    print("  - Stand at the specified location with the marker")
    print("  - Current camera x position will be shown in the window")
    print("  - Press SPACE to confirm and record the position")
    print("  - Press ESC to cancel calibration")
    print("\nReady? Press any key to start...")
    input()
    
    physical_positions = [0.0, 0.1667, 0.5, 0.8333, 1.0]
    position_names = [
        "Left edge of SCREEN 1",
        "Center of SCREEN 1", 
        "Center of SCREEN 2",
        "Center of SCREEN 3",
        "Right edge of SCREEN 3"
    ]
    calibration_points = []
    
    for i, (phys_pos, pos_name) in enumerate(zip(physical_positions, position_names)):
        print(f"\n[{i+1}/5] Move to {pos_name} (physical position {phys_pos:.2f})")
        print(f"Current camera position will be shown in the window title.")
        print("Press SPACE when in position, ESC to cancel...")
        
        current_camera_x = None
        confirmed = False
        cancelled = False
        
        while not confirmed and not cancelled:
            success, frame = cap.read()
            if not success:
                continue
            
            # Detect marker
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            corners, ids, rejected = detector.detectMarkers(gray)
            
            annotated_frame = frame.copy()
            
            if ids is not None and len(ids) > 0:
                # Get first marker position
                marker_corners = corners[0][0]
                M = cv2.moments(marker_corners)
                if M["m00"] != 0:
                    cX = int(M["m10"] / M["m00"])
                    current_camera_x = cX / width
                    
                    # Draw marker
                    aruco.drawDetectedMarkers(annotated_frame, corners, ids)
                    cv2.circle(annotated_frame, (cX, int(M["m01"] / M["m00"])), 10, (0, 255, 0), -1)
                    
                    # Show instruction
                    text1 = f"CALIBRATION: Position {i+1}/5 - {pos_name}"
                    text2 = f"Physical: {phys_pos:.2f} | Camera: {current_camera_x:.3f}"
                    text3 = "Press SPACE to confirm, ESC to cancel"
                    
                    cv2.putText(annotated_frame, text1, (20, 40), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                    cv2.putText(annotated_frame, text2, (20, 80), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                    cv2.putText(annotated_frame, text3, (20, 120), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            else:
                # No marker detected
                text = "NO MARKER DETECTED - Show marker to camera"
                cv2.putText(annotated_frame, text, (20, height//2), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            
            cv2.imshow(window_name, annotated_frame)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord(' '):  # Space to confirm
                if current_camera_x is not None:
                    calibration_points.append([current_camera_x, phys_pos])
                    print(f"✓ Recorded: Camera {current_camera_x:.3f} -> Physical {phys_pos:.2f}")
                    confirmed = True
                else:
                    print("! No marker detected - cannot confirm position")
            elif key == 27:  # ESC to cancel
                print("\nCalibration cancelled.")
                cancelled = True
        
        if cancelled:
            return None
    
    print("\n" + "="*60)
    print("CALIBRATION COMPLETE!")
    print("="*60)
    print("\nCalibration points collected:")
    for cam_x, phys_x in calibration_points:
        print(f"  Camera {cam_x:.3f} -> Physical {phys_x:.2f}")
    
    # Calculate camera range
    cam_min = min(p[0] for p in calibration_points)
    cam_max = max(p[0] for p in calibration_points)
    print(f"\nCamera range: {cam_min:.3f} to {cam_max:.3f}")
    print(f"Values outside this range will be clamped.")
    
    # Save calibration
    if save_calibration(calibration_points):
        print(f"\n✓ Calibration saved to {CALIBRATION_FILE}")
    
    print("\nPress any key to continue with normal tracking...")
    input()
    
    return calibration_points

# *** Camera initialization with retry logic ***
def initialize_camera(capture_source=0, max_retries=3, retry_delay=2.0):
    """
    Initialize camera with robust error handling and retry logic.
    
    Args:
        capture_source: Camera index (0 for default)
        max_retries: Number of initialization attempts
        retry_delay: Delay between retries in seconds
    
    Returns:
        tuple: (cap, width, height, fps) or (None, None, None, None) on failure
    """
    for attempt in range(max_retries):
        print(f"\n{'='*60}")
        print(f"Camera initialization attempt {attempt + 1}/{max_retries}")
        print(f"{'='*60}")
        
        try:
            # Release any existing capture
            cap = cv2.VideoCapture(capture_source)
            
            if not cap.isOpened():
                print("❌ Failed to open camera device")
                if attempt < max_retries - 1:
                    print(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    continue
                else:
                    return None, None, None, None
            
            # Set backend and buffering to improve reliability
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer to get latest frames
            cap.set(cv2.CAP_PROP_FPS, 30)  # Request 30fps
            
            # Try to set a reasonable resolution
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            
            # Give camera time to initialize
            print("⏳ Initializing camera hardware...")
            time.sleep(2.0)  # Increased from 1.0 to 2.0 seconds
            
            # Flush initial frames (sometimes first frames are black)
            print("⏳ Flushing initial frames...")
            for i in range(10):  # Increased from 5 to 10 frames
                success = cap.grab()  # Use grab() instead of read() - faster
                if not success:
                    print(f"⚠️  Failed to grab frame {i+1}/10")
            
            # Get the actual resolution
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            
            # Verify camera is actually working by reading a real frame
            print("⏳ Testing frame capture...")
            test_success = False
            test_frame = None
            
            for test_attempt in range(5):
                success, test_frame = cap.read()
                if success and test_frame is not None and test_frame.size > 0:
                    # Check if frame is not all black (common issue)
                    if test_frame.mean() > 1.0:  # Average pixel value should be > 1
                        test_success = True
                        break
                    else:
                        print(f"⚠️  Frame {test_attempt + 1}/5 is black (mean: {test_frame.mean():.2f})")
                else:
                    print(f"⚠️  Failed to read test frame {test_attempt + 1}/5")
                time.sleep(0.2)  # Small delay between test reads
            
            if not test_success:
                print("❌ Camera not responding with valid frames")
                cap.release()
                if attempt < max_retries - 1:
                    print(f"Retrying in {retry_delay} seconds...")
                    time.sleep(retry_delay)
                    continue
                else:
                    return None, None, None, None
            
            # Success!
            print(f"✅ Camera initialized successfully!")
            print(f"   Resolution: {width}x{height}")
            print(f"   FPS: {fps}")
            print(f"   Test frame mean brightness: {test_frame.mean():.2f}")
            return cap, width, height, fps
            
        except Exception as e:
            print(f"❌ Exception during camera initialization: {e}")
            if 'cap' in locals():
                cap.release()
            if attempt < max_retries - 1:
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                return None, None, None, None
    
    return None, None, None, None


def reinitialize_camera(cap, capture_source=0):
    """
    Reinitialize camera when it appears to be frozen.
    
    Args:
        cap: Existing capture object to release
        capture_source: Camera index
    
    Returns:
        tuple: (cap, width, height, fps) or (None, None, None, None) on failure
    """
    print("\n⚠️  Camera appears frozen - attempting reinitialization...")
    if cap is not None:
        cap.release()
    time.sleep(1.0)
    return initialize_camera(capture_source, max_retries=2, retry_delay=1.5)


# Initialize camera with retry logic
capture_source = 0  # Use the default camera
cap, width, height, fps = initialize_camera(capture_source)

if cap is None:
    print("\n" + "="*60)
    print("❌ CAMERA INITIALIZATION FAILED")
    print("="*60)
    print("Please check:")
    print("  1. Camera is connected properly")
    print("  2. Camera permissions are granted to Python/Terminal")
    print("  3. No other application is using the camera")
    print("  4. Camera drivers are up to date")
    print("  5. Try unplugging and reconnecting the camera")
    print("="*60)
    exit(1)

# Set up the OSC client
osc_client = udp_client.SimpleUDPClient("127.0.0.1", 6448)  # Sending to localhost on port 6448

# Initialize ArUco detector (OpenCV 4.7+ API)
dictionary = aruco.getPredefinedDictionary(MARKER_DICT)
parameters = aruco.DetectorParameters()
detector = aruco.ArucoDetector(dictionary, parameters)

window_name = "ArUco Marker Tracking"
cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)  # WINDOW_NORMAL allows resizing
# Set window to a smaller size (50% of camera resolution)
cv2.resizeWindow(window_name, width // 2, height // 2)
# Position window on primary monitor (top-left area of main screen)
# Using coordinates near 0,0 should place it on the primary display
cv2.moveWindow(window_name, 100, 100)

print("\n" + "="*60)
print("ArUco Marker Tracking with Perspective Calibration")
print("="*60)
print(f"\nMarker Configuration:")
if TARGET_MARKER_ID is None:
    print(f"  Tracking: ANY marker from {MARKER_DICT}")
    print(f"  (To track specific marker, set TARGET_MARKER_ID in config)")
else:
    print(f"  Tracking: ONLY Marker ID {TARGET_MARKER_ID}")
    print(f"  Dictionary: {MARKER_DICT}")
print(f"\nCurrent calibration points: {len(CALIBRATION_POINTS)} points")
for i, (cam_x, phys_x) in enumerate(CALIBRATION_POINTS):
    print(f"  {i+1}. Camera {cam_x:.3f} -> Physical {phys_x:.2f}")
print("\nControls:")
print("  'c' - Start interactive calibration wizard")
print("  'q' or ESC - Quit")
print("="*60 + "\n")

frame_count = 0
calibration_mode = False

# Throttling configuration
last_sent_x = None  # Last x position that was sent
last_send_time = 0  # Last time we sent an OSC message
last_marker_id = None  # Track which marker we're following
MIN_CHANGE_THRESHOLD = 0.005  # Minimum change in normalized x (0.5% of screen)
MAX_SEND_RATE = 10  # Maximum messages per second (50ms between messages)
MIN_SEND_INTERVAL = 1.0 / MAX_SEND_RATE  # Minimum time between sends in seconds

# Marker persistence settings
MARKER_LOST_TIMEOUT = 1.0  # Seconds to wait before considering marker truly lost
last_valid_marker_time = 0  # Last time we saw our target marker
last_valid_position = None  # Last known valid position

# Camera health monitoring
last_successful_frame_time = time.time()
consecutive_frame_failures = 0
MAX_CONSECUTIVE_FAILURES = 30  # Allow 30 consecutive failures before reinit
CAMERA_TIMEOUT = 5.0  # If no successful frame for 5 seconds, reinitialize
last_frame_hash = None  # Track frame content hash to detect truly frozen frames
last_frame_time = time.time()  # Track when we got a new unique frame
frozen_frame_count = 0
MAX_FROZEN_FRAMES = 150  # If exact same frame for 5 seconds @ 30fps, reinitialize
FROZEN_TIMEOUT = 10.0  # If no new frame content for 10 seconds, consider frozen

# Loop through the video frames
while cap.isOpened() and cv2.getWindowProperty(window_name, cv2.WND_PROP_VISIBLE) >= 1:
    # Read a frame from the video
    success, frame = cap.read()
    frame_count += 1

    # Camera health check
    if not success or frame is None or frame.size == 0:
        consecutive_frame_failures += 1
        print(f"⚠️  Frame read failed ({consecutive_frame_failures}/{MAX_CONSECUTIVE_FAILURES})")
        
        # Check if we should attempt recovery
        time_since_success = time.time() - last_successful_frame_time
        
        if consecutive_frame_failures >= MAX_CONSECUTIVE_FAILURES or time_since_success >= CAMERA_TIMEOUT:
            print(f"❌ Camera health check failed:")
            print(f"   Consecutive failures: {consecutive_frame_failures}")
            print(f"   Time since last success: {time_since_success:.1f}s")
            
            # Attempt to reinitialize camera
            cap, width, height, fps = reinitialize_camera(cap, capture_source)
            
            if cap is None:
                print("❌ Failed to recover camera - exiting")
                break
            
            # Reset health counters
            consecutive_frame_failures = 0
            last_successful_frame_time = time.time()
            frozen_frame_count = 0
            last_frame_hash = None
            last_frame_time = time.time()
            print("✅ Camera reinitialized successfully - resuming tracking")
            continue
        else:
            # Wait a bit and try again
            time.sleep(0.1)
            continue
    
    # Frame read succeeded - check if frame is actually frozen (exact same data)
    # Use a hash of a subsample of the frame for efficiency
    # Sample every 10th pixel to create a lightweight fingerprint
    frame_sample = frame[::10, ::10].tobytes()
    current_frame_hash = hash(frame_sample)
    
    # Check if this is the exact same frame as before
    if current_frame_hash == last_frame_hash and last_frame_hash is not None:
        frozen_frame_count += 1
        time_since_new_frame = time.time() - last_frame_time
        
        # Only trigger if we've had the same frame for a significant time
        if frozen_frame_count >= MAX_FROZEN_FRAMES or time_since_new_frame >= FROZEN_TIMEOUT:
            print(f"⚠️  Camera appears frozen (exact same frame data)")
            print(f"   Frozen for {frozen_frame_count} iterations ({time_since_new_frame:.1f}s)")
            
            # Attempt to reinitialize
            cap, width, height, fps = reinitialize_camera(cap, capture_source)
            
            if cap is None:
                print("❌ Failed to recover camera - exiting")
                break
            
            # Reset health counters
            consecutive_frame_failures = 0
            last_successful_frame_time = time.time()
            frozen_frame_count = 0
            last_frame_hash = None
            last_frame_time = time.time()
            print("✅ Camera reinitialized successfully - resuming tracking")
            continue
    else:
        # New frame content detected
        frozen_frame_count = 0
        last_frame_time = time.time()
    
    last_frame_hash = current_frame_hash
    
    # Reset failure counter on success
    consecutive_frame_failures = 0
    last_successful_frame_time = time.time()

    # Wrap frame processing in try-except to handle any unexpected errors
    try:
        if success:
            # Convert to grayscale for ArUco detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            
            # Detect ArUco markers (OpenCV 4.7+ API)
            corners, ids, rejected = detector.detectMarkers(gray)
            
            # Create annotated frame (make a copy so it's writable)
            annotated_frame = frame.copy()
        
        if ids is not None and len(ids) > 0:
            # Find the target marker (either specific ID or first one detected)
            target_marker_index = None
            marker_id = None
            
            if TARGET_MARKER_ID is None:
                # Track any marker, but prefer the one we were tracking last
                if last_marker_id is not None:
                    # Try to find the marker we were tracking
                    for idx, mid in enumerate(ids):
                        if mid[0] == last_marker_id:
                            target_marker_index = idx
                            marker_id = mid[0]
                            break
                
                # If we didn't find our previous marker, take the first one
                if target_marker_index is None:
                    target_marker_index = 0
                    marker_id = ids[0][0]
            else:
                # Track only the specific marker ID
                for idx, mid in enumerate(ids):
                    if mid[0] == TARGET_MARKER_ID:
                        target_marker_index = idx
                        marker_id = mid[0]
                        break
                
                # If target marker not found, show message and skip
                if target_marker_index is None:
                    text = f"Target Marker ID {TARGET_MARKER_ID} not detected"
                    cv2.putText(annotated_frame, text, (20, 40), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2)
                    
                    # Check if marker has been lost for too long
                    if time.time() - last_valid_marker_time > MARKER_LOST_TIMEOUT:
                        # Marker truly lost - could reset state here if needed
                        pass
            
            # Process the target marker if found
            if target_marker_index is not None:
                marker_corners = corners[target_marker_index][0]
            
                # Update marker tracking state
                last_marker_id = marker_id
                last_valid_marker_time = time.time()
                
                # Calculate centroid using moments
                M = cv2.moments(marker_corners)
                if M["m00"] != 0:
                    cX = int(M["m10"] / M["m00"])
                    cY = int(M["m01"] / M["m00"])
                
                    # Normalize center_x to 0-1 range (raw camera view)
                    center_x_normalized = cX / width
                    center_y_normalized = cY / height
                    
                    # Apply perspective correction to map camera view to physical room position
                    center_x_corrected = apply_perspective_correction(center_x_normalized)
                
                    # Store as last valid position
                    last_valid_position = center_x_corrected
                    
                    # Skip if outside calibrated range
                    if center_x_corrected is None:
                        # Outside calibrated range - show warning in annotation
                        cv2.circle(annotated_frame, (cX, cY), 5, (0, 0, 255), -1)  # Red circle
                        text1 = f"Marker {marker_id}"
                        text2 = f"Raw: {center_x_normalized:.3f} - OUTSIDE CALIBRATED RANGE"
                        cv2.putText(annotated_frame, text1, (cX - 80, cY - 35), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                        cv2.putText(annotated_frame, text2, (cX - 120, cY - 10), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)
                        # Skip to next frame
                        annotated_frame_pil = Image.fromarray(annotated_frame)
                        annotate_fps(annotated_frame_pil)
                        cv2.imshow(window_name, np.asarray(annotated_frame_pil))
                        key = cv2.waitKey(1) & 0xFF
                        if key in [27, ord('q'), ord('Q')]:
                            break
                        elif key == ord('c') or key == ord('C'):
                            print("\nStarting calibration wizard...")
                            new_calibration = run_calibration_wizard(cap, width, height, detector)
                            if new_calibration:
                                CALIBRATION_POINTS = new_calibration
                                print("Calibration updated! Resuming normal tracking...")
                            else:
                                print("Calibration cancelled. Resuming normal tracking...")
                        continue
                
                    # Throttling: only send if enough time has passed AND position changed significantly
                    # BUT: continue sending the same position if marker is still detected (keep-alive)
                    current_time = time.time()
                    time_since_last_send = current_time - last_send_time
                    
                    should_send = False
                    
                    # Check if enough time has passed since last send
                    if time_since_last_send >= MIN_SEND_INTERVAL:
                        # Check if position changed significantly (compare corrected positions)
                        if last_sent_x is None:
                            # First detection, always send
                            should_send = True
                        elif abs(center_x_corrected - last_sent_x) >= MIN_CHANGE_THRESHOLD:
                            # Position changed enough to warrant sending
                            should_send = True
                        elif time_since_last_send >= (MIN_SEND_INTERVAL * 3):
                            # Keep-alive: if marker hasn't moved but is still detected,
                            # send periodic updates to prevent false marker from stopping transmission
                            should_send = True
                
                    # Send OSC message if throttling conditions are met
                    if should_send:
                        osc_address = "/marker/x"
                        try:
                            # Send the CORRECTED position
                            osc_client.send_message(osc_address, float(center_x_corrected))
                            last_sent_x = center_x_corrected
                            last_send_time = current_time
                            # Optionally print for debugging
                            # print(f"Sent: {osc_address} {center_x_corrected:.3f} (raw: {center_x_normalized:.3f})")
                        except OSError as e:
                            print(f"OSC Error: {e}")
                
                    # Draw the marker on the frame (always show visual feedback)
                    # Only draw the target marker, not all detected markers
                    aruco.drawDetectedMarkers(annotated_frame, [corners[target_marker_index]], np.array([[ids[target_marker_index][0]]]))
                    
                    # Draw centroid
                    cv2.circle(annotated_frame, (cX, cY), 5, (255, 0, 255), -1)
                    
                    # Add text annotation with both raw and corrected values
                    text1 = f"Marker {marker_id}"
                    if TARGET_MARKER_ID is not None:
                        text1 += f" (TRACKING ID {TARGET_MARKER_ID})"
                    text2 = f"Raw: {center_x_normalized:.3f} -> Corrected: {center_x_corrected:.3f}"
                    if should_send:
                        text2 += " (SENT)"
                    
                    cv2.putText(annotated_frame, text1, (cX - 80, cY - 35), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                    cv2.putText(annotated_frame, text2, (cX - 80, cY - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
        
        # Show detected but non-target markers in gray (if any)
        if ids is not None and len(ids) > 1:
            for idx, mid in enumerate(ids):
                if TARGET_MARKER_ID is None or mid[0] != TARGET_MARKER_ID:
                    # Show other markers in gray to indicate they're ignored
                    other_corners = corners[idx][0]
                    M_other = cv2.moments(other_corners)
                    if M_other["m00"] != 0:
                        cX_other = int(M_other["m10"] / M_other["m00"])
                        cY_other = int(M_other["m01"] / M_other["m00"])
                        cv2.circle(annotated_frame, (cX_other, cY_other), 5, (128, 128, 128), -1)
                        cv2.putText(annotated_frame, f"ID {mid[0]} (ignored)", 
                                   (cX_other - 50, cY_other - 20), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.4, (128, 128, 128), 1)
        
        # Add camera health status indicator
        health_color = (0, 255, 0)  # Green = healthy
        health_text = "CAM: OK"
        
        if consecutive_frame_failures > 0:
            health_color = (0, 165, 255)  # Orange = warning
            health_text = f"CAM: {consecutive_frame_failures} fails"
        
        if frozen_frame_count > 100:
            health_color = (0, 165, 255)  # Orange = warning  
            health_text = f"CAM: frozen? ({frozen_frame_count})"
        
        cv2.putText(annotated_frame, health_text, (width - 200, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, health_color, 2)
        
        # Convert to PIL Image for annotate_fps
        annotated_frame_pil = Image.fromarray(annotated_frame)
        annotate_fps(annotated_frame_pil)
        
        # Display the annotated frame
        cv2.imshow(window_name, np.asarray(annotated_frame_pil))
        
        # Break the loop if 'q' or escape is pressed
        key = cv2.waitKey(1) & 0xFF
        if key in [27, ord('q'), ord('Q')]:
            break
        elif key == ord('c') or key == ord('C'):
            # Start calibration wizard
            print("\nStarting calibration wizard...")
            new_calibration = run_calibration_wizard(cap, width, height, detector)
            if new_calibration:
                CALIBRATION_POINTS = new_calibration
                print("Calibration updated! Resuming normal tracking...")
            else:
                print("Calibration cancelled. Resuming normal tracking...")
    
    except Exception as e:
        # Handle any unexpected errors during frame processing
        print(f"⚠️  Error processing frame: {e}")
        import traceback
        traceback.print_exc()
        
        # Increment failure counter
        consecutive_frame_failures += 1
        
        # If too many errors, try to reinitialize
        if consecutive_frame_failures >= 10:
            print("Too many processing errors - attempting camera reinitialization")
            cap, width, height, fps = reinitialize_camera(cap, capture_source)
            
            if cap is None:
                print("❌ Failed to recover camera - exiting")
                break
            
            consecutive_frame_failures = 0
            last_successful_frame_time = time.time()
            frozen_frame_count = 0
            last_frame_hash = None
            last_frame_time = time.time()
        
        # Continue to next frame
        continue

# Release the video capture object and close the display window
cap.release()
cv2.destroyAllWindows()
