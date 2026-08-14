import type { ReactNode } from 'react';
import { SearchInput } from '@aluguei/ui';

export interface PageToolbarProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  filters?: ReactNode;
}

/** Cabeçalho padrão de páginas de listagem (pattern PEG List/Index). */
export function PageToolbar({ title, description, actions, search, filters }: PageToolbarProps) {
  return (
    <div className="peg-stack" style={{ gap: 16 }}>
      <div className="peg-group between" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div className="peg-stack" style={{ gap: 2 }}>
          <h1 className="app-page__title">{title}</h1>
          {description ? <p className="app-page__desc">{description}</p> : null}
        </div>
        {actions ? <div className="peg-group" style={{ gap: 8 }}>{actions}</div> : null}
      </div>
      {search || filters ? (
        <div className="peg-group" style={{ gap: 12, flexWrap: 'wrap' }}>
          {search ? (
            <SearchInput
              size="md"
              value={search.value}
              onChange={(e) => { search.onChange(e.target.value); }}
              placeholder={search.placeholder ?? 'Buscar…'}
              style={{ width: 280 }}
              aria-label="Buscar"
            />
          ) : null}
          <div className="peg-group" style={{ gap: 8, flexWrap: 'wrap' }}>
            {filters}
          </div>
        </div>
      ) : null}
    </div>
  );
}
