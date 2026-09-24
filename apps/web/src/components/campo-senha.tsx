'use client';

import { useId, useState } from 'react';
import { Input } from '@aluguei/ui';

export interface CampoSenhaProps {
  id?: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  required?: boolean;
  autoFocus?: boolean;
  helper?: string;
  error?: string;
  value?: string;
  onChange?: (valor: string) => void;
}

/**
 * Campo de senha com "Mostrar" (tela de referência: login e nova senha).
 *
 * Quem digita senha longa no celular erra sem ver o que digitou, e o resultado é
 * senha curta. O botão é um alvo de toque de verdade e anuncia o estado por
 * `aria-pressed`; o padrão continua sendo oculto.
 */
export function CampoSenha({
  id,
  name,
  label,
  autoComplete,
  required = false,
  autoFocus = false,
  helper,
  error,
  value,
  onChange,
}: CampoSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  const idGerado = useId();
  const idCampo = id ?? idGerado;

  return (
    <Input
      id={idCampo}
      name={name}
      type={visivel ? 'text' : 'password'}
      label={label}
      autoComplete={autoComplete}
      required={required}
      autoFocus={autoFocus}
      placeholder="••••••••"
      {...(helper === undefined ? {} : { helper })}
      {...(error === undefined ? {} : { error })}
      {...(value === undefined ? {} : { value })}
      {...(onChange === undefined
        ? {}
        : {
            onChange: (evento: React.ChangeEvent<HTMLInputElement>) => {
              onChange(evento.target.value);
            },
          })}
      suffix={
        <button
          type="button"
          className="campo-senha__alternar"
          aria-pressed={visivel}
          aria-controls={idCampo}
          onClick={() => {
            setVisivel((atual) => !atual);
          }}
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      }
    />
  );
}
