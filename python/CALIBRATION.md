# Camera Perspective Calibration Guide

## Quick Start - Interactive Calibration

The easiest way to calibrate is using the **interactive calibration wizard**:

1. **Run the marker tracking:**
   ```bash
   cd python
   python markertrack.py
   ```

2. **Press 'c' to start calibration wizard**

3. **Follow the on-screen prompts - stand at each screen position:**
   - **Left edge of SCREEN 1** (0.0000) → Press SPACE to record
   - **Center of SCREEN 1** (0.1667) → Press SPACE
   - **Center of SCREEN 2** (0.5000) → Press SPACE
   - **Center of SCREEN 3** (0.8333) → Press SPACE
   - **Right edge of SCREEN 3** (1.0000) → Press SPACE

4. **Done!** Calibration is automatically saved to `camera_calibration.json`

The calibration file persists across restarts, so you only need to calibrate once.

## Why Screen-Based Calibration?

With 3 projector screens side-by-side, you have **built-in reference points**:
- Screen edges and centers are easy to locate
- No need to measure or use floor tape
- 5 points give excellent accuracy across the full width

**Physical positions** (assuming 3 equal-width screens):
- Left edge of Screen 1: **0.0000** (far left)
- Center of Screen 1: **0.1667** (1/6 from left)
- Center of Screen 2: **0.5000** (room center)
- Center of Screen 3: **0.8333** (5/6 from left)
- Right edge of Screen 3: **1.0000** (far right)

## What the Wizard Does

## What the Wizard Does

- Collects 5 calibration points across the room
- Shows current camera x position in real-time
- Saves calibration to `camera_calibration.json`
- Loads saved calibration automatically on next run

## Using Screen Boundaries

For the 5 calibration positions, you can use your 3 projector screens:

**Standing positions:**
1. **Left edge of Screen 1** - Stand at far left edge
2. **Center of Screen 1** - Stand in middle of left screen
3. **Center of Screen 2** - Stand in middle of center screen  
4. **Center of Screen 3** - Stand in middle of right screen
5. **Right edge of Screen 3** - Stand at far right edge

**Physical positions** (assuming equal-width screens covering full room):
- Position 1: 0.0000 (0% from left)
- Position 2: 0.1667 (16.67% from left = 1/6)
- Position 3: 0.5000 (50% from left = center)
- Position 4: 0.8333 (83.33% from left = 5/6)
- Position 5: 1.0000 (100% from left)

This gives you precise reference points without measuring!

## What Gets Saved

The wizard creates `camera_calibration.json`:
```json
{
  "calibration_points": [
    [0.22, 0.0],
    [0.35, 0.1667],
    [0.50, 0.5],
    [0.65, 0.8333],
    [0.78, 1.0]
  ]
}
```

Format: `[camera_x, physical_x]` - both normalized 0-1.

**Physical positions correspond to:**
- 0.0000 = Left edge of Screen 1
- 0.1667 = Center of Screen 1 (1/6 from left)
- 0.5000 = Center of Screen 2 (middle)
- 0.8333 = Center of Screen 3 (5/6 from left)
- 1.0000 = Right edge of Screen 3

## Out of Range Detection

**Camera values outside the calibrated range are ignored!**

If you calibrate with camera range 0.22-0.78:
- ✅ Camera 0.50 → Valid, will be mapped
- ❌ Camera 0.10 → Ignored (too far left)
- ❌ Camera 0.90 → Ignored (too far right)

This prevents tracking errors when marker is detected outside the intended room area.

## Re-calibrating

To recalibrate:
1. Run `python markertrack.py`
2. Press 'c' at any time
3. Follow wizard again
4. New calibration overwrites the old file

## Manual Calibration (Advanced)

You can also manually edit `camera_calibration.json`:

```json
{
  "calibration_points": [
    [0.20, 0.0],      // Left edge of Screen 1
    [0.35, 0.1667],   // Center of Screen 1
    [0.50, 0.5],      // Center of Screen 2
    [0.65, 0.8333],   // Center of Screen 3
    [0.80, 1.0]       // Right edge of Screen 3
  ]
}
```

Restart the script to load changes.

## Troubleshooting

### Calibration wizard shows "NO MARKER DETECTED"
- Ensure marker is clearly visible to camera
- Check lighting is adequate
- Verify you're using correct ArUco dictionary (DICT_ARUCO_ORIGINAL)

### Bars still don't align with position
- Try re-running calibration wizard
- Ensure you're standing at correct physical positions
- Add more calibration points by editing the file manually

### Calibration file not loading
- Check file exists: `ls camera_calibration.json`
- Verify JSON is valid (no syntax errors)
- Check console output when starting script

## Testing Calibration

After calibration, the video window shows:
- **Raw**: Camera x position (what camera sees)
- **Corrected**: Physical x position (after calibration)
- **(SENT)**: OSC message was sent

Walk across room and verify:
- Raw value changes
- Corrected value matches your physical position (0.0 = left, 1.0 = right)
- Bars appear directly in front of you on screens

## Controls

While running:
- **'c'** - Start calibration wizard
- **'q' or ESC** - Quit

During calibration wizard:
- **SPACE** - Confirm current position
- **ESC** - Cancel calibration

## Why 5 Points?

5 calibration points aligned with your screen layout provide excellent accuracy:
- **Screen 1 edges/center** (0.0, 0.1667): Left third of room
- **Screen 2 center** (0.5): Middle third of room
- **Screen 3 center/edge** (0.8333, 1.0): Right third of room

This ensures:
- Accurate tracking in front of each screen
- Smooth transitions between screens
- Proper alignment of data bars with physical position

You can manually add more points to the JSON file for even better accuracy in specific areas (e.g., screen boundaries at 0.333 and 0.667).
