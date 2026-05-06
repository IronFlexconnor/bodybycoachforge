// Extract N evenly-spaced frames from a video File, returns base64 data URLs.
export async function extractFrames(file: File, count = 8, maxWidth = 640): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Could not read video"));
  });

  const duration = video.duration || 0;
  if (!isFinite(duration) || duration <= 0) {
    URL.revokeObjectURL(url);
    throw new Error("Invalid video duration");
  }

  const w = Math.min(maxWidth, video.videoWidth);
  const h = Math.round((video.videoHeight / video.videoWidth) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (duration * (i + 0.5)) / count;
    await new Promise<void>((res) => {
      const onSeek = () => { video.removeEventListener("seeked", onSeek); res(); };
      video.addEventListener("seeked", onSeek);
      video.currentTime = Math.min(t, duration - 0.05);
    });
    ctx.drawImage(video, 0, 0, w, h);
    frames.push(canvas.toDataURL("image/jpeg", 0.7));
  }

  URL.revokeObjectURL(url);
  return frames;
}
