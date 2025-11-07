# Camera Robustness Improvements

## Summary
Enhanced `markertrack.py` with robust camera initialization and error recovery mechanisms to address issues with black screens, frozen cameras, and "fps 1.0" problems.

## Changes Made

### 1. **Robust Camera Initialization** (`initialize_camera()` function)
- **Retry Logic**: Attempts camera initialization up to 3 times with 2-second delays
- **Extended Warm-up**: Increased initialization delay from 1s to 2s
- **More Frame Flushing**: Flushes 10 initial frames (up from 5) using faster `grab()` method
- **Frame Validation**: Tests 5 frames to ensure camera is producing valid, non-black images
- **Brightness Check**: Validates frame mean brightness > 1.0 to detect black frames
- **Better Error Messages**: Clear, actionable error messages with troubleshooting steps

### 2. **Camera Recovery** (`reinitialize_camera()` function)
- Allows runtime camera reinitialization when issues are detected
- Gracefully releases and recreates camera connection
- Uses shorter retry cycle (2 attempts, 1.5s delays) for faster recovery

### 3. **Camera Health Monitoring**
Added comprehensive health checks in main loop:

#### Frame Failure Detection
- Tracks consecutive frame read failures
- Triggers reinitialization after 30 consecutive failures
- Also triggers if no successful frame for 5 seconds

#### Frozen Frame Detection
- Monitors frame brightness to detect identical frames
- Tracks when same frame content appears repeatedly
- Triggers reinitialization after 60 frozen frames (~2 seconds at 30fps)

#### Visual Health Indicator
- Green "CAM: OK" when healthy
- Orange warnings when issues detected:
  - "CAM: X fails" for frame failures
  - "CAM: frozen? (X)" for potential freeze

### 4. **Exception Handling**
- Wrapped entire frame processing in try-except block
- Catches unexpected errors without crashing
- Includes full traceback logging for debugging
- Attempts recovery after 10 consecutive processing errors
- Continues operation instead of exiting on minor errors

### 5. **Recovery Behavior**
When camera issues are detected, the system:
1. Logs the problem with clear diagnostic information
2. Releases the current camera connection
3. Waits 1 second for hardware to reset
4. Attempts reinitialization (2-3 retry attempts)
5. Resets all health monitoring counters
6. Resumes tracking if successful
7. Only exits if recovery fails completely

## Expected Improvements

### Black Screen Issues
- Better initial frame validation prevents starting with black frames
- Extended warm-up time gives cameras more time to initialize
- Multiple validation attempts catch intermittent initialization failures

### Frozen Camera Issues
- Frozen frame detection automatically identifies stuck cameras
- Automatic reinitialization recovers from freezes without manual restart
- Visual indicator shows when freeze is detected

### "fps 1.0" Issues
This was likely caused by:
- Slow frame processing due to camera read blocking
- Camera returning frames very slowly
- The new health monitoring will detect and recover from these situations

### Overall Robustness
- System continues operating through temporary camera glitches
- Automatic recovery reduces need for manual intervention
- Better diagnostic information helps identify hardware issues
- Graceful degradation instead of sudden crashes

## Testing Recommendations

1. **Normal Operation**: Verify tracking still works correctly
2. **Camera Disconnect**: Unplug camera during operation - should recover when reconnected
3. **Other App Using Camera**: Start another app using camera, close it - should recover
4. **System Suspend/Resume**: Put computer to sleep and wake - should recover
5. **Long Running**: Leave running for extended periods to verify stability

## Configuration

Key parameters that can be tuned:
- `MAX_CONSECUTIVE_FAILURES = 30` - Failures before reinit
- `CAMERA_TIMEOUT = 5.0` - Seconds without frame before reinit
- `MAX_FROZEN_FRAMES = 60` - Frozen frames before reinit
- Camera initialization retry count and delays in `initialize_camera()`

## Backward Compatibility

All changes are backward compatible:
- Same command-line usage
- Same calibration file format
- Same OSC output behavior
- Same keyboard controls
