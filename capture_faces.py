import cv2
import os

USER_NAME  = "chadha"
SAVE_DIR   = f"auth/faces/{USER_NAME}"
NUM_PHOTOS = 5
COUNTDOWN  = 3
WINDOW     = "FinanceIQ - Face Registration"

os.makedirs(SAVE_DIR, exist_ok=True)

print(f"\nFace Registration - FinanceIQ")
print(f"Saving to: {SAVE_DIR}")
print("Press SPACE to capture each photo. Press Q to quit.\n")

cap = cv2.VideoCapture(0)
if not cap.isOpened():
    print("Cannot open webcam.")
    raise SystemExit

photo_count = 0

while photo_count < NUM_PHOTOS:
    ret, frame = cap.read()
    if not ret:
        print("Cannot read frame.")
        break

    # Mirrored preview only (display), never saved
    display = cv2.flip(frame, 1)
    cv2.putText(display, f"Photos: {photo_count}/{NUM_PHOTOS}",
                (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(display, "SPACE = capture | Q = quit",
                (20, display.shape[0] - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)
    cv2.imshow(WINDOW, display)

    key = cv2.waitKey(1) & 0xFF

    if key == ord('q'):
        print("Registration cancelled.")
        break

    elif key == ord(' '):
        for i in range(COUNTDOWN, 0, -1):
            ret2, frame2 = cap.read()
            if not ret2:
                continue
            frame2 = cv2.flip(frame2, 1)
            cv2.putText(frame2, str(i),
                        (frame2.shape[1] // 2 - 30, frame2.shape[0] // 2),
                        cv2.FONT_HERSHEY_SIMPLEX, 4, (0, 255, 255), 4)
            cv2.imshow(WINDOW, frame2)
            cv2.waitKey(1000)

        # Capture the RAW frame (no flip) to match what the browser sends
        ret3, frame3 = cap.read()
        if not ret3:
            print("Capture failed, try again.")
            continue

        path = os.path.join(SAVE_DIR, f"face_{photo_count + 1}.jpg")
        cv2.imwrite(path, frame3)
        photo_count += 1
        print(f"Photo {photo_count}/{NUM_PHOTOS} saved -> {path}")

        white = frame3.copy()
        white[:] = (255, 255, 255)
        cv2.imshow(WINDOW, white)
        cv2.waitKey(200)

cap.release()
cv2.destroyAllWindows()

if photo_count == NUM_PHOTOS:
    print(f"\nRegistration complete! {NUM_PHOTOS} photos in {SAVE_DIR}")
else:
    print(f"\nOnly {photo_count}/{NUM_PHOTOS} captured. Run again to complete.")