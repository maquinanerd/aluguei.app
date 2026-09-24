'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@aluguei/ui';
import { CampoSenha } from '@/components/campo-senha';
import { ACCOUNT_STATUS_PATH } from '@/lib/account-status';
import { TOTAL_ETAPAS, erroDaEtapa } from '@/lib/cadastro-etapas';
import type { DadosDoCadastro } from '@/lib/cadastro-etapas';

export interface PlanoDoCadastro {
  code: string;
  name: string;
  description: string | null;
  /** Como o plano é cobrado, já em uma linha (a página não recalcula). */
  cobranca: string;
}

export interface RegisterFormProps {
  planos: PlanoDoCadastro[];
  /** Plano que veio no `?plano=` do portal, se existir e estiver ativo. */
  planoInicial: string | null;
}

/**
 * Cadastro em seis etapas (Onda 3), uma pergunta por tela.
 *
 * O formulário de uma coluna só pedia tudo de uma vez e era abandonado no meio;
 * a entrega de design troca por etapas com "N de 6". Nada é enviado antes da
 * última: o cadastro continua sendo **uma** chamada, que nasce em análise.
 *
 * O plano é pedido, não contratado — quem decide é o admin na aprovação
 * (ADR-060). Por isso a etapa 5 diz isso em vez de falar em cobrança.
 */

export function RegisterForm({ planos, planoInicial }: RegisterFormProps) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(1);
  const [dados, setDados] = useState<DadosDoCadastro>({
    name: '',
    email: '',
    organizationName: '',
    document: '',
    phone: '',
    creci: '',
    requestedPlanCode: planoInicial ?? '',
    password: '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const escolhido = planos.find((plano) => plano.code === dados.requestedPlanCode);

  function muda<C extends keyof DadosDoCadastro>(campo: C, valor: DadosDoCadastro[C]): void {
    setDados((atual) => ({ ...atual, [campo]: valor }));
    setErro(null);
  }

  async function enviar(): Promise<void> {
    setEnviando(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: dados.name,
          email: dados.email,
          password: dados.password,
          organizationName: dados.organizationName,
          phone: dados.phone,
          document: dados.document,
          creci: dados.creci,
          requestedPlanCode: dados.requestedPlanCode,
        }),
      });
      const corpo: unknown = await res.json().catch(() => ({}));
      if (!res.ok) {
        const mensagem =
          typeof corpo === 'object' &&
          corpo !== null &&
          'message' in corpo &&
          typeof corpo.message === 'string'
            ? corpo.message
            : 'Falha no cadastro';
        setErro(mensagem);
        return;
      }
      // Cadastro aberto: a imobiliária só opera depois da aprovação da plataforma.
      router.push(ACCOUNT_STATUS_PATH);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  function avancar(): void {
    const problema = erroDaEtapa(etapa, dados);
    if (problema !== null) {
      setErro(problema);
      return;
    }
    if (etapa < TOTAL_ETAPAS) {
      setEtapa(etapa + 1);
      return;
    }
    void enviar();
  }

  return (
    <form
      className="peg-stack cadastro"
      style={{ gap: 16 }}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        avancar();
      }}
    >
      <div className="cadastro__topo">
        {etapa > 1 ? (
          <button
            type="button"
            className="cadastro__voltar"
            onClick={() => {
              setEtapa(etapa - 1);
              setErro(null);
            }}
          >
            ← Voltar
          </button>
        ) : (
          <span />
        )}
        <span className="cadastro__contador" aria-live="polite">
          {etapa} de {TOTAL_ETAPAS}
        </span>
      </div>

      {escolhido === undefined ? null : <p className="cadastro__plano">Plano: {escolhido.name}</p>}

      {erro === null ? null : (
        <p className="cadastro__erro" role="alert">
          {erro}
        </p>
      )}

      {etapa === 1 ? (
        <Input
          id="cadastro-nome"
          label="Qual é o seu nome?"
          autoComplete="name"
          autoFocus
          value={dados.name}
          onChange={(evento) => {
            muda('name', evento.target.value);
          }}
        />
      ) : null}

      {etapa === 2 ? (
        <Input
          id="cadastro-email"
          type="email"
          label="Qual é o seu e-mail?"
          helper="É com ele que você entra no sistema."
          autoComplete="email"
          autoFocus
          value={dados.email}
          onChange={(evento) => {
            muda('email', evento.target.value);
          }}
        />
      ) : null}

      {etapa === 3 ? (
        <>
          <Input
            id="cadastro-imobiliaria"
            label="Qual é a sua imobiliária?"
            autoComplete="organization"
            autoFocus
            value={dados.organizationName}
            onChange={(evento) => {
              muda('organizationName', evento.target.value);
            }}
          />
          <Input
            id="cadastro-documento"
            label="CNPJ ou CPF"
            optional
            inputMode="numeric"
            helper="Usado só na análise do cadastro."
            value={dados.document}
            onChange={(evento) => {
              muda('document', evento.target.value);
            }}
          />
        </>
      ) : null}

      {etapa === 4 ? (
        <>
          <Input
            id="cadastro-creci"
            label="Qual é o CRECI da imobiliária?"
            optional
            helper="Aparece nos seus anúncios no portal."
            autoFocus
            value={dados.creci}
            onChange={(evento) => {
              muda('creci', evento.target.value);
            }}
          />
          <Input
            id="cadastro-telefone"
            label="Telefone com DDD"
            optional
            inputMode="tel"
            autoComplete="tel"
            value={dados.phone}
            onChange={(evento) => {
              muda('phone', evento.target.value);
            }}
          />
        </>
      ) : null}

      {etapa === 5 ? (
        <fieldset className="cadastro__planos">
          <legend>Qual plano você quer usar?</legend>
          {planos.length === 0 ? (
            <p className="cadastro__ajuda">
              Não conseguimos carregar os planos agora. Pode seguir sem escolher: a equipe combina o
              plano na análise da conta.
            </p>
          ) : (
            planos.map((plano) => (
              <label key={plano.code} className="cadastro__plano-opcao">
                <input
                  type="radio"
                  name="requestedPlanCode"
                  value={plano.code}
                  checked={dados.requestedPlanCode === plano.code}
                  onChange={() => {
                    muda('requestedPlanCode', plano.code);
                  }}
                />
                <span>
                  <strong>{plano.name}</strong>
                  {plano.description === null ? null : <em>{plano.description}</em>}
                  <small>{plano.cobranca}</small>
                </span>
              </label>
            ))
          )}
          <p className="cadastro__ajuda">
            Sem cobrança agora. A equipe confirma o plano na análise da conta.
          </p>
        </fieldset>
      ) : null}

      {etapa === 6 ? (
        <CampoSenha
          id="cadastro-senha"
          name="password"
          label="Crie sua senha"
          autoComplete="new-password"
          autoFocus
          helper="Mínimo de 8 caracteres."
          value={dados.password}
          onChange={(valor) => {
            muda('password', valor);
          }}
        />
      ) : null}

      <Button type="submit" variant="primary" fullWidth loading={enviando}>
        {etapa === TOTAL_ETAPAS ? 'Criar conta' : 'Próximo'}
      </Button>

      <p className="cadastro__ajuda">
        Já tem conta?{' '}
        <a href="/login" style={{ fontWeight: 500 }}>
          Entrar
        </a>
      </p>
    </form>
  );
}
