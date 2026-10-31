import { isValidElement, type ReactNode } from 'react';
import InfoTip from './InfoTip';

export function settingsRow(labelHtml: string, controlHtml: ReactNode, tipHtml?: string): ReactNode {
  const controlId = isValidElement<{ id?: string }>(controlHtml) ? controlHtml.props.id : undefined;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
        <label htmlFor={controlId} style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.92rem' }}>{labelHtml}</label>
        {tipHtml ? <InfoTip tipHtml={tipHtml} /> : null}
      </div>
      <div style={{ flexShrink: 0 }}>{controlHtml}</div>
    </div>
  );
}

export function sectionTitle(text: string): ReactNode {
  return (
    <div
      style={{
        fontSize: '0.8rem',
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        margin: '18px 0 10px',
        paddingBottom: 4,
        borderBottom: '1px solid var(--surface-border)',
      }}
    >
      {text}
    </div>
  );
}
