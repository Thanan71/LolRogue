export function confirmRunAbandonment(isActive: boolean, confirm: () => boolean): boolean {
  return !isActive || confirm();
}
