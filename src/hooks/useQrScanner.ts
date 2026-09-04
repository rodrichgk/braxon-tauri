import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

export interface VideoInput {
  deviceId: string;
  label: string;
}

interface UseQrScannerOpts {
  /** Only touches the camera while true. */
  active: boolean;
  /** Preferred camera; falls back to the environment-facing one. */
  deviceId?: string;
  /** Fires on every successful decode (deduped for ~2s per payload). */
  onDecode: (text: string) => void;
}

interface UseQrScannerResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  devices: VideoInput[];
  error: string | null;
  /** True once frames are flowing. */
  streaming: boolean;
}

/**
 * Decodes QR codes from a webcam using `getUserMedia` + `jsqr`, entirely
 * in the webview. On WebView2 the first use raises a camera permission
 * prompt; if it's denied, `error` is set and the phone-via-URL path stays
 * the working route.
 */
export function useQrScanner({ active, deviceId, onDecode }: UseQrScannerOpts): UseQrScannerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<VideoInput[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);

  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const lastHit = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  useEffect(() => {
    if (!active) return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      const video = videoRef.current;
      if (cancelled || !video || !ctx) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (found?.data) {
          const now = Date.now();
          if (found.data !== lastHit.current.text || now - lastHit.current.at > 2000) {
            lastHit.current = { text: found.data, at: now };
            onDecodeRef.current(found.data);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('no-camera');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStreaming(true);
        setError(null);

        // Labels are only populated once permission is granted.
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(
            all
              .filter(d => d.kind === 'videoinput')
              .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })),
          );
        }
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'permission-denied'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'no-camera'
              : e instanceof Error ? e.message : String(e),
        );
        setStreaming(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setStreaming(false);
    };
  }, [active, deviceId]);

  return { videoRef, devices, error, streaming };
}
