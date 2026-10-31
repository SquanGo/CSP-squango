import { createRoot } from 'react-dom/client';
import InfoTip from './InfoTip';

/**
 * Mount an {@link InfoTip} into a plain-DOM host. Used by non-React modals that
 * are built from HTML template strings (e.g. the training selector modal).
 */
export function mountInfoTip(host: HTMLElement, tipHtml: string, label?: string): void {
  createRoot(host).render(<InfoTip tipHtml={tipHtml} label={label} />);
}
