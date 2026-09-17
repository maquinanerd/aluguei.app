'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { formatCentsForInput, MONEY_INPUT_MAX_CENTS, parseMoneyInput } from '../lib/money';

export interface MoneyInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode' | 'size' | 'prefix' | 'children'
> {
  /** Valor em centavos inteiros; `null` é campo vazio. */
  valueCents: number | null;
  /** Centavos inteiros do texto digitado — `null` quando vazio ou inválido. */
  onValueChange: (cents: number | null) => void;
  /** Mensagem do erro de digitação (`null` quando o texto é válido). */
  onValidityChange?: (message: string | null) => void;
  maxCents?: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  optional?: boolean;
  helper?: ReactNode;
  /** Erro vindo do formulário; o erro de digitação tem precedência. */
  error?: string;
}

/**
 * Campo de dinheiro em pt-BR (P0-07, auditoria 2026-09-10): "3.500" é
 * R$ 3.500,00 e "3.500,50" é R$ 3.500,50. Emite centavos inteiros. Texto
 * inválido ou ambíguo ("3.50") não vira valor: a mensagem aparece no campo e a
 * validação nativa (`setCustomValidity`) bloqueia o envio do formulário.
 * Estrutura rótulo/ajuda/erro no padrão FieldShell do design system de
 * referência, sobre os tokens e classes `.peg-field`/`.peg-input` do Aluguei.
 */
export function MoneyInput({
  valueCents,
  onValueChange,
  onValidityChange,
  maxCents = MONEY_INPUT_MAX_CENTS,
  size = 'md',
  label,
  optional,
  helper,
  error,
  id,
  className,
  placeholder = '0,00',
  disabled,
  onBlur,
  onInvalid,
  ...rest
}: MoneyInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** Último valor emitido: distingue digitação de troca do valor por fora. */
  const emitted = useRef<number | null>(valueCents);
  const [text, setText] = useState(() =>
    valueCents === null ? '' : formatCentsForInput(valueCents),
  );
  const [typingError, setTypingError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (valueCents === emitted.current) {
      return;
    }
    emitted.current = valueCents;
    setText(valueCents === null ? '' : formatCentsForInput(valueCents));
    setTypingError(null);
    setTouched(false);
  }, [valueCents]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(typingError ?? '');
  }, [typingError]);

  function handleChange(next: string): void {
    setText(next);
    const result = parseMoneyInput(next, { maxCents });
    const message = result.ok ? null : result.message;
    setTypingError(message);
    onValidityChange?.(message);
    const cents = result.ok ? result.cents : null;
    if (cents !== emitted.current) {
      emitted.current = cents;
      onValueChange(cents);
    }
  }

  const visibleError = (touched ? typingError : null) ?? error ?? null;

  return (
    <div className="peg-field">
      {label ? (
        <label className="peg-field__label" htmlFor={inputId}>
          {label}
          {optional ? <span className="peg-field__label--optional"> · opcional</span> : null}
        </label>
      ) : null}
      <div
        className={cx(
          'peg-input',
          `peg-input--${size}`,
          visibleError !== null && 'peg-input--error',
          disabled && 'peg-input--disabled',
        )}
      >
        <span className="peg-input__prefix" aria-hidden="true">
          R$
        </span>
        <input
          {...rest}
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={cx('peg-input__control', 'peg-money-input__control', className)}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={visibleError !== null}
          aria-describedby={visibleError !== null ? messageId : undefined}
          onChange={(event) => {
            handleChange(event.target.value);
          }}
          onBlur={(event) => {
            setTouched(true);
            const result = parseMoneyInput(text, { maxCents });
            if (result.ok && result.cents !== null) {
              setText(formatCentsForInput(result.cents));
            }
            onBlur?.(event);
          }}
          onInvalid={(event) => {
            setTouched(true);
            onInvalid?.(event);
          }}
        />
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
