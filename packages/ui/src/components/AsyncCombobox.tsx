'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './icons';

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export type ComboboxNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

/** Próximo índice ativo da lista (setas circulam); -1 quando não há opções. */
export function nextActiveIndex(
  current: number,
  key: ComboboxNavigationKey,
  count: number,
): number {
  if (count <= 0) {
    return -1;
  }
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    case 'ArrowDown':
      return current < 0 || current >= count - 1 ? 0 : current + 1;
    case 'ArrowUp':
      return current <= 0 ? count - 1 : current - 1;
  }
}

export interface AsyncComboboxProps {
  label: string;
  value: ComboboxOption | null;
  onChange: (option: ComboboxOption | null) => void;
  /** Busca no servidor: recebe o texto digitado ('' ao abrir) e um AbortSignal. */
  loadOptions: (query: string, signal: AbortSignal) => Promise<ComboboxOption[]>;
  id?: string;
  name?: string;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  placeholder?: string;
  helper?: ReactNode;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  emptyLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
  requiredMessage?: string;
  debounceMs?: number;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Seleção com busca no servidor (P1-01, auditoria 2026-09-10): substitui os
 * selects que carregavam a organização inteira com `limit=200` — recusado pela
 * API — e ficavam vazios. Padrão combobox + listbox do WAI-ARIA: setas, Home,
 * End, Enter seleciona, Escape fecha sem fechar o modal. Reimplementado a
 * partir do TokenPicker do design system de referência (busca + lista +
 * clique fora fecha), para uma única seleção assíncrona, sobre os tokens do
 * Aluguei. Campo obrigatório sem seleção bloqueia o envio nativo do formulário.
 */
export function AsyncCombobox({
  label,
  value,
  onChange,
  loadOptions,
  id,
  name,
  required = false,
  optional,
  disabled = false,
  placeholder = 'Buscar…',
  helper,
  error,
  size = 'md',
  emptyLabel = 'Nada encontrado.',
  loadingLabel = 'Buscando…',
  errorLabel = 'Não foi possível carregar as opções.',
  requiredMessage = 'Selecione uma opção da lista.',
  debounceMs = 250,
}: AsyncComboboxProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const listboxId = `${inputId}-listbox`;
  const messageId = `${inputId}-message`;
  const optionId = (index: number): string => `${inputId}-option-${String(index)}`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Callback do pai em ref: um `loadOptions` novo a cada render não reinicia a busca.
  const loadRef = useRef(loadOptions);
  const [text, setText] = useState(value?.label ?? '');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    loadRef.current = loadOptions;
  }, [loadOptions]);

  // Fechado, o campo mostra a seleção atual (inclusive quando o pai a troca ou limpa).
  useEffect(() => {
    if (!open) {
      setText(value?.label ?? '');
    }
  }, [value, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    const timer = setTimeout(() => {
      loadRef
        .current(query, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setOptions(result);
          setStatus('ready');
          setActiveIndex(result.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setOptions([]);
          setStatus('error');
          setActiveIndex(-1);
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, debounceMs]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(required && value === null ? requiredMessage : '');
  }, [required, value, requiredMessage]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open]);

  function openList(): void {
    if (!disabled) {
      setOpen(true);
    }
  }

  function select(option: ComboboxOption): void {
    onChange(option);
    setText(option.label);
    setQuery('');
    setOpen(false);
    setTouched(true);
  }

  function clear(): void {
    onChange(null);
    setText('');
    setQuery('');
    setTouched(true);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        const key = event.key;
        setActiveIndex((current) => nextActiveIndex(current, key, options.length));
        return;
      }
      case 'Home':
      case 'End':
        if (open && options.length > 0) {
          event.preventDefault();
          setActiveIndex(nextActiveIndex(activeIndex, event.key, options.length));
        }
        return;
      case 'Enter':
        if (open) {
          event.preventDefault();
          const option = options[activeIndex];
          if (option) {
            select(option);
          }
        }
        return;
      case 'Escape':
        if (open) {
          // Não deixa o Escape chegar ao modal: fecha só a lista.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          setQuery('');
        }
        return;
      case 'Tab':
        setOpen(false);
        setQuery('');
        return;
    }
  }

  const visibleError =
    error ?? (touched && required && value === null ? requiredMessage : null) ?? null;
  const statusText =
    status === 'loading'
      ? loadingLabel
      : status === 'error'
        ? errorLabel
        : status === 'ready' && options.length === 0
          ? emptyLabel
          : '';

  return (
    <div ref={rootRef} className="peg-field peg-combobox">
      <label className="peg-field__label" htmlFor={inputId}>
        {label}
        {optional ? <span className="peg-field__label--optional"> · opcional</span> : null}
      </label>
      {/* Âncora do popup: a lista abre logo abaixo do campo, não do texto de ajuda. */}
      <div className="peg-combobox__anchor">
        <div
          className={cx(
            'peg-input',
            `peg-input--${size}`,
            visibleError !== null && 'peg-input--error',
            disabled && 'peg-input--disabled',
          )}
        >
          <span className="peg-input__prefix" aria-hidden="true">
            <Icon name="search" size={14} />
          </span>
          <input
            ref={inputRef}
            id={inputId}
            name={name}
            type="text"
            role="combobox"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-invalid={visibleError !== null}
            aria-describedby={visibleError !== null ? messageId : undefined}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            className="peg-input__control"
            value={text}
            onFocus={openList}
            onClick={openList}
            onChange={(event) => {
              setText(event.target.value);
              setQuery(event.target.value);
              openList();
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              setOpen(false);
              setQuery('');
            }}
            onInvalid={() => {
              setTouched(true);
            }}
          />
          {value !== null && !disabled ? (
            <button
              type="button"
              className="peg-input__suffix peg-combobox__clear"
              aria-label={`Limpar ${label}`}
              onClick={clear}
            >
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </div>
        <div className="peg-combobox__popup" hidden={!open}>
          <ul
            id={listboxId}
            role="listbox"
            aria-label={`Opções de ${label}`}
            className="peg-combobox__listbox"
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={value?.value === option.value}
                className={cx(
                  'peg-combobox__option',
                  index === activeIndex && 'peg-combobox__option--active',
                )}
                onMouseDown={(event) => {
                  // Mantém o foco no campo: o clique seleciona sem disparar o blur.
                  event.preventDefault();
                }}
                onMouseEnter={() => {
                  setActiveIndex(index);
                }}
                onClick={() => {
                  select(option);
                }}
              >
                <span className="peg-combobox__option-label">{option.label}</span>
                {option.description ? (
                  <span className="peg-combobox__option-description">{option.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {statusText ? (
            <div className="peg-combobox__status" role="status">
              {statusText}
            </div>
          ) : null}
        </div>
      </div>
      {visibleError !== null ? (
        <span id={messageId} className="peg-field__error" role="alert">
          {visibleError}
        </span>
      ) : helper ? (
        <span className="peg-field__helper">{helper}</span>
      ) : null}
    </div>
  );
}
