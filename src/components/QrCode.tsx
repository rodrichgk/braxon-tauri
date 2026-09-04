import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeProps {
  value: string;
  /** Rendered box size in px. */
  size?: number;
  /** Quiet-zone width in modules. 0 to match a ZPL `^BQ` (no quiet zone). */
  margin?: number;
  /** Transparent light modules — lets content behind show through, the way
   *  a thermal print composites two overlapping fields. */
  transparent?: boolean;
  className?: string;
}

/**
 * Inline-SVG QR code. `qrcode` is bundled by Vite (no CDN) so this works on
 * the offline shop LAN. SVG stays crisp at any size and on a thermal
 * printer.
 */
export default function QrCode({ value, size = 200, margin = 1, transparent = false, className }: QrCodeProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    QRCode.toString(value, {
      type: 'svg',
      margin,
      width: size,
      errorCorrectionLevel: 'M',
      ...(transparent ? { color: { light: '#ffffff00' } } : {}),
    })
      .then(markup => { if (!cancelled) setSvg(markup); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [value, size, margin, transparent]);

  if (error) {
    return (
      <div className={className} style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}>
        <span className="text-[10px] text-danger">QR error</span>
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size, lineHeight: 0 }}
      // eslint-disable-next-line react/no-danger -- markup is from the qrcode lib, not user input
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
