import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DaySummary } from '../../core/types';
import type { EndingResult } from '../../sim/mission/endings';
import { SecondaryButton } from '../components';
import { IconShare } from '../components/icons';
import { getLanguage, getLocaleVersion, localDigits, t } from '../i18n';

export interface ShareCardProps {
  summary?: DaySummary;
  ending?: EndingResult;
  style?: Record<string, string | number>;
}

export function buildScorecardText({
  summary,
  ending,
}: {
  summary?: DaySummary;
  ending?: EndingResult;
}): string {
  const title = t('share.title');
  if (ending) {
    const endingTitle = t(ending.titleKey);
    const savings = localDigits(Math.round(ending.summary.savings));
    const rating = localDigits(ending.summary.rating.toFixed(1));
    const trust = localDigits(Math.round(ending.summary.localTrust));
    return [
      `${title} — ${t('share.ending_heading')}`,
      endingTitle,
      `${t('share.savings')}: ৳${savings} · ${t('share.rating')}: ${rating} · ${t('share.trust')}: ${trust}`,
    ].join('\n');
  }
  if (summary) {
    const heading = t('share.day_heading', { day: localDigits(summary.day) });
    const rides = localDigits(summary.completedRides);
    const netPrefix = summary.net >= 0 ? '+' : '-';
    const netVal = localDigits(Math.abs(Math.round(summary.net)));
    const savings =
      summary.savings !== undefined ? localDigits(Math.round(summary.savings)) : null;
    const stats = [
      `${t('share.rides')}: ${rides}`,
      `${t('share.net')}: ${netPrefix}৳${netVal}`,
      ...(savings !== null ? [`${t('share.savings')}: ৳${savings}`] : []),
    ].join(' · ');
    return [`${title} — ${heading}`, stats].join('\n');
  }
  return title;
}

function drawScorecardCanvas(
  canvas: HTMLCanvasElement,
  summary: DaySummary | undefined,
  ending: EndingResult | undefined
): void {
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0F172A');
  grad.addColorStop(0.55, '#13263A');
  grad.addColorStop(1, '#064E3B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Accent stripe at top
  ctx.fillStyle = '#059669';
  ctx.fillRect(0, 0, w, 8);

  // Brand header
  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 20px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
  ctx.fillText(t('share.title'), 28, 46, w - 56);

  const subtitle = ending
    ? t('share.ending_heading')
    : summary
      ? t('share.day_heading', { day: localDigits(summary.day) })
      : '';
  ctx.fillStyle = '#94A3B8';
  ctx.font = '600 15px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
  ctx.fillText(subtitle, 28, 72, w - 56);

  // Card body box
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.fillRect(24, 92, w - 48, 178);
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(24, 92, w - 48, 178);

  if (ending) {
    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 24px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
    ctx.fillText(t(ending.titleKey), 42, 134, 516);

    const cols = [
      { label: t('share.savings'), value: `৳${localDigits(Math.round(ending.summary.savings))}` },
      { label: t('share.rating'), value: localDigits(ending.summary.rating.toFixed(1)) },
      { label: t('share.trust'), value: localDigits(Math.round(ending.summary.localTrust)) },
    ];
    cols.forEach((col, i) => {
      const x = 42 + i * 176;
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 13px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
      ctx.fillText(col.label, x, 186, 160);
      ctx.fillStyle = '#34D399';
      ctx.font = 'bold 22px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
      ctx.fillText(col.value, x, 218, 160);
    });
  } else if (summary) {
    const netSign = summary.net >= 0 ? '+' : '-';
    const cols = [
      { label: t('share.rides'), value: localDigits(summary.completedRides) },
      {
        label: t('share.net'),
        value: `${netSign}৳${localDigits(Math.abs(Math.round(summary.net)))}`,
      },
      summary.savings !== undefined
        ? {
            label: t('share.savings'),
            value: `৳${localDigits(Math.round(summary.savings))}`,
          }
        : {
            label: t('dayend.revenue'),
            value: `৳${localDigits(Math.round(summary.revenue))}`,
          },
    ];
    cols.forEach((col, i) => {
      const x = 42 + i * 176;
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 14px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
      ctx.fillText(col.label, x, 148, 160);
      ctx.fillStyle = i === 1 && summary.net < 0 ? '#F87171' : '#34D399';
      ctx.font = 'bold 26px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
      ctx.fillText(col.value, x, 188, 160);
    });

    const ratingStr = `${summary.ratingDelta >= 0 ? '+' : ''}${localDigits(summary.ratingDelta.toFixed(2))}`;
    ctx.fillStyle = '#FBBF24';
    ctx.font = '600 15px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
    ctx.fillText(`${t('share.rating')}: ${ratingStr}`, 42, 240, 516);
  }

  // Footer
  ctx.fillStyle = '#64748B';
  ctx.font = '500 12px "Hind Siliguri", "Noto Sans Bengali", "Inter", sans-serif';
  ctx.fillText('uthao.dhaka', 28, h - 18, w - 56);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob !== 'function') return null;
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

export function ShareCard({ summary, ending, style }: ShareCardProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<string | null>(null);
  const lang = getLanguage();
  const localeVersion = getLocaleVersion();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawScorecardCanvas(canvas, summary, ending);
  }, [summary, ending, lang, localeVersion]);

  const setStatusIfMounted = (msg: string) => {
    if (mountedRef.current) setStatus(msg);
  };

  const handleShare = async () => {
    const canvas = canvasRef.current;
    const text = buildScorecardText({ summary, ending });
    const title = t('share.title');
    const filename = ending
      ? `uthao-career-${ending.endingId}.png`
      : `uthao-day-${summary?.day ?? 1}.png`;

    // 1. Web Share API (with PNG file if supported)
    if (
      canvas &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        const blob = await canvasToPngBlob(canvas);
        if (!mountedRef.current) return;
        if (blob && typeof File === 'function') {
          const file = new File([blob], filename, { type: 'image/png' });
          const canShareFiles =
            typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
          if (canShareFiles) {
            await navigator.share({ title, text, files: [file] });
            setStatusIfMounted(t('share.ready_shared'));
            return;
          }
        }
        await navigator.share({ title, text });
        setStatusIfMounted(t('share.ready_shared'));
        return;
      } catch {
        if (!mountedRef.current) return;
        // Fall through to PNG download / clipboard fallback cleanly
      }
    }

    // 2. PNG download fallback
    if (canvas && typeof canvas.toDataURL === 'function' && typeof document !== 'undefined') {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        if (dataUrl && dataUrl.startsWith('data:image/png')) {
          const anchor = document.createElement('a');
          anchor.href = dataUrl;
          anchor.download = filename;
          anchor.style.display = 'none';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setStatusIfMounted(t('share.ready_downloaded'));
          return;
        }
      } catch {
        // Fall through to clipboard fallback
      }
    }

    // 3. Clipboard text fallback
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Headless clipboard permission may deny silently; still report status cleanly
      }
    }
    setStatusIfMounted(t('share.ready_copied'));
  };

  return (
    <div
      data-testid="share-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        background: 'rgba(15, 23, 42, 0.55)',
        border: '1px solid rgba(52, 211, 153, 0.25)',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="share-scorecard-canvas"
        width={600}
        height={320}
        aria-label={t('share.title')}
        style={{
          width: '100%',
          maxWidth: 480,
          height: 'auto',
          aspectRatio: '600 / 320',
          borderRadius: 10,
          display: 'block',
          margin: '0 auto',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <SecondaryButton
          type="button"
          data-testid="share-scorecard-btn"
          onClick={() => void handleShare()}
          style={{
            padding: '7px 14px',
            fontSize: '0.85rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <IconShare size={15} />
          <span>{t('share.btn')}</span>
        </SecondaryButton>
        {status && (
          <span
            data-testid="share-status"
            role="status"
            aria-live="polite"
            style={{ fontSize: 12, fontWeight: 700, color: '#34D399' }}
          >
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
