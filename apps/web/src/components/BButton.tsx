/** PS2 "○ BACK" legend used to close pop-ups and dialogs. `label` is the accessible name. */
export function BButton({ label, onClick, disabled, className = '' }: { label: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" className={`b-button b-button-small ${className}`} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
    <span className="b-ring" aria-hidden="true" /><span className="b-label" aria-hidden="true">Back</span>
  </button>;
}
