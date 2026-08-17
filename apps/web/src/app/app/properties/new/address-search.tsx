'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Icon, Input, Spinner } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';

/**
 * Autocomplete de endereço via Google Places (proxy /api/backend).
 *
 * Wire contracts (apps/api/src/routes/places.ts):
 * - POST /places/autocomplete {input} →
 *     { predictions: Array<{ placeId, mainText, secondaryText, types }> }
 * - GET /places/details?placeId= → { address: StructuredAddress }
 *
 * Fallback obrigatório: qualquer erro (PROVIDER_ERROR 400/503, offline, 5xx)
 * mostra um aviso discreto e o cadastro manual permanece intacto — a busca
 * nunca bloqueia o formulário.
 */

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;
const MAX_SUGGESTIONS = 6;
const LIST_MAX_HEIGHT = 240;

export interface PlacesPrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
  types: string[];
}

export interface PlacesAddress {
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
}

/** Campos estruturados exibidos no formulário (lat/lng ficam de fora do PUT). */
export interface AddressFields {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface AddressSearchProps {
  onPick: (address: PlacesAddress) => void;
}

/** Texto da sugestão: "Rua X · Bela Vista, São Paulo - SP". */
export function predictionDescription(p: PlacesPrediction): string {
  return [p.mainText, p.secondaryText]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' · ');
}

/** Normaliza o endereço do provider para os campos do formulário ('' quando ausente). */
export function structuredAddressToFields(a: PlacesAddress): AddressFields {
  return {
    street: a.street ?? '',
    number: a.number ?? '',
    neighborhood: a.neighborhood ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    zipCode: a.zipCode ?? '',
    country: a.country ?? '',
  };
}

type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export function AddressSearch({ onPick }: AddressSearchProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** Incrementa a cada nova busca/edição — respostas antigas são ignoradas. */
  const seqRef = useRef(0);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacesPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      // Chamada desnecessária: cancela em voo e limpa a lista.
      seqRef.current += 1;
      setPredictions([]);
      setOpen(false);
      setStatus('idle');
      setUnavailable(false);
      return;
    }
    const seq = ++seqRef.current;
    setStatus('loading');
    setUnavailable(false);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await apiClient<{ predictions: PlacesPrediction[] }>('/places/autocomplete', {
            method: 'POST',
            body: { input: q },
          });
          if (seq !== seqRef.current) return;
          setPredictions(res.predictions.slice(0, MAX_SUGGESTIONS));
          setActiveIndex(0);
          setOpen(true);
          setStatus('ready');
        } catch {
          if (seq !== seqRef.current) return;
          setPredictions([]);
          setOpen(false);
          setStatus('error');
          setUnavailable(true);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  async function pick(prediction: PlacesPrediction) {
    const seq = ++seqRef.current;
    setOpen(false);
    setStatus('loading');
    try {
      const res = await apiClient<{ address: PlacesAddress }>(
        `/places/details?placeId=${encodeURIComponent(prediction.placeId)}`,
      );
      if (seq !== seqRef.current) return;
      setStatus('ready');
      onPick(res.address);
    } catch {
      if (seq !== seqRef.current) return;
      setStatus('error');
      setUnavailable(true);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (!open || predictions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % predictions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + predictions.length) % predictions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = predictions[activeIndex] ?? predictions[0];
      if (p) void pick(p);
    }
  }

  const hasOptions = open && predictions.length > 0;
  const showEmpty = open && status === 'ready' && predictions.length === 0;
  const busy = status === 'loading';

  return (
    <div
      ref={rootRef}
      className="peg-stack"
      style={{ gap: 4, position: 'relative' }}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <Input
        id="address-search-input"
        label="Buscar endereço (Google Places)"
        optional
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={hasOptions || showEmpty}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={hasOptions ? `${listId}-option-${String(activeIndex)}` : undefined}
        placeholder="Digite rua, bairro ou cidade (mín. 3 letras)"
        helper="Preenche os campos abaixo automaticamente — o cadastro manual continua disponível."
        suffix={busy ? <Spinner size={14} /> : <Icon name="search" size={14} />}
      />
      {hasOptions || showEmpty ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Sugestões de endereço"
          aria-busy={busy}
          className="peg-menu"
          style={{
            left: 0,
            right: 0,
            top: 'calc(100% + 6px)',
            maxHeight: LIST_MAX_HEIGHT,
            overflowY: 'auto',
          }}
        >
          {showEmpty ? (
            <div
              role="option"
              aria-disabled="true"
              className="peg-menu__item"
              style={{ cursor: 'default' }}
            >
              <span className="peg-menu__icon">
                <Icon name="mapPin" size={14} />
              </span>
              <span className="peg-text-secondary">Nenhum endereço encontrado</span>
            </div>
          ) : (
            predictions.map((p, i) => (
              <button
                key={p.placeId}
                type="button"
                role="option"
                id={`${listId}-option-${String(i)}`}
                aria-selected={i === activeIndex}
                className="peg-menu__item"
                style={i === activeIndex ? { background: 'var(--peg-surface-subtle)' } : undefined}
                onMouseEnter={() => {
                  setActiveIndex(i);
                }}
                onClick={() => {
                  void pick(p);
                }}
              >
                <span className="peg-menu__icon">
                  <Icon name="mapPin" size={14} />
                </span>
                <span style={{ textAlign: 'left', minWidth: 0 }}>{predictionDescription(p)}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
      {unavailable ? (
        <span role="status" className="peg-field__helper" style={{ color: 'var(--peg-warning)' }}>
          Busca indisponível — preencha manualmente.
        </span>
      ) : null}
    </div>
  );
}
