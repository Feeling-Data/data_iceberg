import time

def fps_counter():
    current_time = time.time()
    if not hasattr(fps_counter, 'last_time'):
        fps_counter.last_time = current_time
        fps_counter.last_fps = 0.0
        return 0.0  # No fps estimation for the first call

    elapsed_time = current_time - fps_counter.last_time
    fps = 1.0/elapsed_time
    fps_counter.last_time = current_time
    fps_counter.last_fps = fps
    return fps