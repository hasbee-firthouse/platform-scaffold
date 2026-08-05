/**
 * Global test setup. jsdom does not implement the pointer-capture, layout, or
 * resize APIs that Radix UI overlays (DropdownMenu, Dialog, …) call when they
 * open. Without these, opening a Radix popover in a test throws. We polyfill the
 * minimum surface so component tests can drive real overlays. Guarded by a DOM
 * check so it is a no-op in the default `node` test environment.
 */
if (typeof window !== 'undefined' && typeof Element !== 'undefined') {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  if (typeof proto.hasPointerCapture !== 'function') {
    proto.hasPointerCapture = () => false;
  }
  if (typeof proto.setPointerCapture !== 'function') {
    proto.setPointerCapture = () => undefined;
  }
  if (typeof proto.releasePointerCapture !== 'function') {
    proto.releasePointerCapture = () => undefined;
  }
  if (typeof proto.scrollIntoView !== 'function') {
    proto.scrollIntoView = () => undefined;
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }
}
