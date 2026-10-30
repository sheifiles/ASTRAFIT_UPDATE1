// Opens the Raspberry Pi camera if the browser can see it, otherwise any camera.
// Pi Camera Module 3 reports as "imx708", Module 2 as "imx219".
// If the Pi camera never shows up, start Chromium through libcamera, e.g.  libcamerify chromium-browser --kiosk ...
const PI_CAM = /imx708|imx219|unicam|libcamera|raspberry|rpi/i;

export async function openCamera(video: HTMLVideoElement): Promise<MediaStream | null> {
  try {
    let stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const pi = cams.find((d) => PI_CAM.test(d.label));
    if (pi && stream.getVideoTracks()[0].getSettings().deviceId !== pi.deviceId) {
      stream.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: pi.deviceId }, width: 640, height: 480 } });
    }
    video.srcObject = stream;
    await video.play().catch(() => {});
    return stream;
  } catch {
    return null;
  }
}
