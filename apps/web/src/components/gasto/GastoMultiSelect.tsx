import { useId } from "react";

type Option = { codigo: number; nombre: string };
export default function GastoMultiSelect({
  label,
  options,
  selected,
  onChange,
  allLabel,
}: {
  label: string;
  options: Option[];
  selected: number[];
  onChange: (values: number[]) => void;
  allLabel: string;
}) {
  const id = useId();
  const description = selected.length ? selected.join(" + ") : allLabel;
  return (
    <div className="sf-group desagregado-chapter-filter">
      <span className="desagregado-filter-label" id={id}>
        {label}
      </span>
      <details
        className="gasto-multi-dropdown"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          className="gasto-multi-trigger"
          aria-label={`${label}: ${description}`}
          title={description}
        >
          <span>{description}</span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className="gasto-multi-menu" role="group" aria-labelledby={id}>
          <button
            type="button"
            className="desagregado-chapter-preset"
            aria-pressed={!selected.length}
            onClick={() => onChange([])}
          >
            {allLabel}
          </button>
          {options.map((option) => (
            <label key={option.codigo} className="gasto-multi-option">
              <input
                type="checkbox"
                checked={selected.includes(option.codigo)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option.codigo].sort((a, b) => a - b)
                      : selected.filter((code) => code !== option.codigo),
                  )
                }
              />
              <span>
                {option.codigo} · {option.nombre}
              </span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
