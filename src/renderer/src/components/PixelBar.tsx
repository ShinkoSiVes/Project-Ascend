interface PixelBarProps {
  label: string;
  value: number;
  max: number;
  kind: 'hp' | 'xp';
  // Text shown at the end of the bar. It defaults to "value/max".
  valueText?: string;
}

// A segmented progress bar for HP and XP.
function PixelBar({ label, value, max, kind, valueText }: PixelBarProps): React.JSX.Element {
  // Keep the fill between 0 and 100 percent even if the value overshoots.
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className="pixel-bar">
      <span className="pixel-bar__label">{label}</span>
      <div
        className="pixel-bar__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <div
          className={`pixel-bar__fill pixel-bar__fill--${kind}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="pixel-bar__value">{valueText ?? `${value}/${max}`}</span>
    </div>
  );
}

export default PixelBar;
