import { useEffect, useRef, useState } from 'react';
import styles from './SortSelect.module.css';

export interface SortSelectProps<T extends string> {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange(value: T): void;
  className?: string;
}

/**
 * The pill dropdown in the top-left of each tab ("OVR↓").
 *
 * Drawn rather than a native <select>: the reference is a dark pill with a solid
 * caret, and a native control renders the browser's own chrome on the open list.
 */
export default function SortSelect<T extends string>({
  value,
  options,
  onChange,
  className,
}: SortSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Closes on any press outside, the way a native select does.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const current = options.find((option) => option.id === value) ?? options[0];

  return (
    <div ref={rootRef} className={`${styles.root} ${className ?? ''}`}>
      <button
        type="button"
        className={styles.pill}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <span className={styles.label}>{current?.label}</span>
        <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`} />
      </button>

      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="option"
                aria-selected={option.id === value}
                className={`${styles.option} ${option.id === value ? styles.optionOn : ''}`}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
