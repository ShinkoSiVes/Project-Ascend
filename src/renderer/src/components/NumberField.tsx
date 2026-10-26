interface NumberFieldProps {
  id: string;
  label: string;
  value: string;
  min: number;
  max: number;
  // What the number counts, shown after the label, for example "min".
  unit?: string;
  error?: string;
  onChange: (value: string) => void;
}

// A labelled whole-number input with its error message underneath.
function NumberField({
  id,
  label,
  value,
  min,
  max,
  unit,
  error,
  onChange
}: NumberFieldProps): React.JSX.Element {
  return (
    <div className="pixel-field">
      <label className="pixel-label" htmlFor={id}>
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        id={id}
        className="pixel-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="pixel-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default NumberField;
