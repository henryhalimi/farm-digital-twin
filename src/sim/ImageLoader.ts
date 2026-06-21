// Module-level image cache. Images are loaded once and reused.
const cache = new Map<string, HTMLImageElement>()

/**
 * Returns the cached HTMLImageElement for src.
 * Calls onLoad() once the image is ready (immediately if already loaded).
 */
export function getImage(src: string, onLoad?: () => void): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    // Only call onLoad on the actual async load event, never synchronously
    img.onload = () => onLoad?.()
    // Prepend base URL so paths work when served from a subdirectory
    const base = import.meta.env.BASE_URL ?? '/'
    img.src = src.startsWith('/') ? base + src.slice(1) : src
    cache.set(src, img)
  } else if (!isReady(img) && onLoad) {
    // Image is still loading — chain the callback
    const prev = img.onload as (() => void) | null
    img.onload = () => { prev?.(); onLoad() }
  }
  // If image is already ready, caller uses it directly — no callback needed
  return img
}

export function isReady(img: HTMLImageElement): boolean {
  return img.complete && img.naturalWidth > 0
}
