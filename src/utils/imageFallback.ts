export function applyLocalImageFallback(
  image: HTMLImageElement,
  localUrl: string,
  hideAfterFailure = false,
): void {
  if (image.dataset.localFallback !== 'true') {
    image.dataset.localFallback = 'true';
    image.src = localUrl;
    return;
  }

  if (hideAfterFailure) image.hidden = true;
}
