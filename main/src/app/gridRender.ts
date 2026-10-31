import type { AlgCase } from '../data/types';
import { renderCard } from './cardHTML';

/**
 * Keyed, in-place reconcile of the grid against `items`.
 *
 * Port of the legacy `_reconcileRender` (legacy/js/rendering.js). Instead of
 * tearing the whole list down with `innerHTML = ...` (which collapses the
 * document height and makes the browser clamp the scroll position back to the
 * top) this:
 *   - reuses existing card DOM nodes keyed by `data-case-name`,
 *   - only replaces a node when its freshly-generated markup actually differs,
 *   - removes nodes no longer in the result set,
 *   - and re-orders nodes to match the new sort order.
 *
 * Untouched cards keep their identity, so no repaint/flash and scroll position
 * is preserved. `renderCard` is the single source of truth for card content, so
 * comparing normalized `outerHTML` reliably catches every per-card change.
 */
// Set refreshExisting=false for an explicit reorder: card content is already
// current, so skip generating/parsing/serializing SVG-heavy markup for it.
export function reconcileGrid(
  grid: HTMLElement,
  items: readonly AlgCase[],
  refreshExisting = true,
): void {
  const placeholder = grid.querySelector('#_render_placeholder');
  if (placeholder) placeholder.remove();

  // Index existing cards by case name; drop anything unexpected.
  const existing = new Map<string, Element>();
  Array.from(grid.children).forEach((node) => {
    const id = node.getAttribute && node.getAttribute('data-case-name');
    if (id) existing.set(id, node);
    else node.remove();
  });

  // Remove cards that are no longer in the result set.
  const desired = new Set(items.map((item) => String(item.id)));
  existing.forEach((node, name) => {
    if (!desired.has(name)) {
      node.remove();
      existing.delete(name);
    }
  });

  // Walk items in target order, reusing/updating/creating + positioning nodes.
  const ordered: Element[] = [];
  for (const item of items) {
    const id = String(item.id);
    let node = existing.get(id);
    if (!node || refreshExisting) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderCard(item);
      const fresh = tmp.firstElementChild;
      if (!fresh) continue;

      if (node) {
        if (node.outerHTML !== fresh.outerHTML) {
          node.replaceWith(fresh);
          node = fresh;
        }
      } else {
        node = fresh;
      }
    }
    existing.set(id, node);

    ordered.push(node);
  }
  positionCards(grid, ordered);
}

/** Keep the longest already-ordered sequence connected; move only the rest. */
function positionCards(grid: HTMLElement, ordered: readonly Element[]): void {
  const positions = new Map(Array.from(grid.children).map((node, index) => [node, index]));
  const tails: number[] = [];
  const previous = new Array<number>(ordered.length).fill(-1);
  for (let i = 0; i < ordered.length; i++) {
    const position = positions.get(ordered[i]);
    if (position === undefined) continue;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (positions.get(ordered[tails[middle]])! < position) low = middle + 1;
      else high = middle;
    }
    if (low > 0) previous[i] = tails[low - 1];
    tails[low] = i;
  }

  const stationary = new Set<number>();
  for (let i = tails[tails.length - 1] ?? -1; i !== -1; i = previous[i]) stationary.add(i);
  let next: Element | null = null;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const node = ordered[i];
    if (!stationary.has(i)) grid.insertBefore(node, next);
    next = node;
  }
}
