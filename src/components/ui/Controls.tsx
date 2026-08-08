import {
  type AriaAttributes,
  type ButtonHTMLAttributes,
  Children,
  cloneElement,
  type InputHTMLAttributes,
  isValidElement,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useId,
} from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant} ${className}`.trim()}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;
  const hasHint = Boolean(hint);
  const hasError = Boolean(error);

  const childList = Children.toArray(children);
  const onlyChild = childList.length === 1 ? childList[0] : null;
  const control =
    isValidElement<FormControlAriaProps>(onlyChild) && isFormControl(onlyChild) ? onlyChild : null;

  let fieldControl = children;
  if (control && (hasHint || hasError)) {
    const describedBy = mergeAriaReferences(
      control.props['aria-describedby'],
      hasHint ? hintId : undefined,
      hasError ? errorId : undefined,
    );

    fieldControl = cloneElement(control, {
      'aria-describedby': describedBy,
      'aria-invalid':
        control.props['aria-invalid'] === undefined && hasError
          ? true
          : control.props['aria-invalid'],
    });
  }

  return (
    <div className="ui-field">
      <div className="ui-field__label">{label}</div>
      {fieldControl}
      {hint && (
        <div id={hintId} className="ui-field__hint">
          {hint}
        </div>
      )}
      {error && (
        <div id={errorId} className="ui-field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${props.className ?? ''}`.trim()} {...props} />;
}

export function Tabs({ label, children }: { label: string; children: ReactNode }) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const currentTab = target.closest<HTMLButtonElement>('button[role="tab"]');
    if (!currentTab || currentTab.closest('[role="tablist"]') !== event.currentTarget) return;

    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]'),
    ).filter(
      (tab) =>
        !tab.disabled &&
        tab.getAttribute('aria-disabled') !== 'true' &&
        tab.closest('[role="tablist"]') === event.currentTarget,
    );
    const currentIndex = tabs.indexOf(currentTab);
    if (currentIndex === -1 || tabs.length === 0) return;

    let nextIndex: number;
    switch (event.key) {
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabs.length - 1;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      default:
        nextIndex = (currentIndex + 1) % tabs.length;
    }

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    nextTab.click();
  };

  return (
    <div className="ui-tabs" role="tablist" aria-label={label} onKeyDown={handleKeyDown}>
      {children}
    </div>
  );
}

export function Tab({
  selected,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      {...props}
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={`ui-tab ${className}`.trim()}
    />
  );
}

type FormControlAriaProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
};

function isFormControl(element: ReactElement<FormControlAriaProps>) {
  return (
    element.type === TextInput ||
    (typeof element.type === 'string' && ['input', 'select', 'textarea'].includes(element.type))
  );
}

function mergeAriaReferences(...references: Array<string | undefined>) {
  const ids = references.flatMap((reference) => reference?.split(/\s+/).filter(Boolean) ?? []);
  return [...new Set(ids)].join(' ') || undefined;
}
