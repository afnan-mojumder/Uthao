/**
 * Makes everything outside `overlay` inert, so Tab and Enter cannot reach the
 * screen behind a modal (audit: focus leaked into hidden menu buttons). It walks
 * up from the overlay and marks every sibling along the way. Returns the
 * function that undoes it.
 */
export function makeRestInert(overlay: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  let node: HTMLElement = overlay;
  while (node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
    node = node.parentElement;
  }
  return () => {
    for (const el of marked) el.removeAttribute('inert');
  };
}
