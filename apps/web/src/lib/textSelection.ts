import type { SyntheticEvent } from 'react';

/** Props that keep `onChange` in sync with the selected text of a textarea, however it was selected. */
export function selectionProps(onChange: (selected: string) => void) {
  const read = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    onChange(field.value.slice(field.selectionStart, field.selectionEnd));
  };
  return { onSelect: read, onMouseUp: read, onKeyUp: read, onTouchEnd: read };
}
