import type { ReactNode } from 'react';
import type { PublicPlan } from '@aluguei/contracts';
import { BotaoLink } from './Botao';
import { Acordeao } from './Acordeao';
import type { ItemAcordeao } from './Acordeao';
import { EstadoVazio } from './EstadoVazio';
import { urlCadastro } from '@/lib/plataforma';
import { RECURSOS, limiteDoPlano, planoTemRecurso, precoDoPlano } from '@/lib/planos';

/**
 * Peças das telas B2B do portal (Onda 3): `/para-imobiliarias`, `/anunciar`,
 * `/gestao` e `/planos`.
 *
 * Duas regras atravessam tudo aqui:
 * 1. **Nada de número fixo na página.** Preço, limite e recursos de cada plano
 *    saem de `GET /public/plans`; a tabela se ajusta sozinha quando o plano muda.
 * 2. **"Em breve" é literal.** Assinatura e cobrança real estão implementadas mas
 *    não ligadas; o selo diz isso em vez de a página prometer o que não entrega.
 */

export interface SeloEmBreveProps {
  children?: ReactNode;
}

export function SeloEmBreve({ children = 'em breve' }: SeloEmBreveProps) {
  return <span className="selo-breve">{children}</span>;
}

export interface HeroB2BProps {
  sobretitulo: string;
  titulo: string;
  texto: string;
  acaoPrincipal: { href: string; rotulo: string };
  acaoSecundaria?: { href: string; rotulo: string };
  legendaDaArte?: string;
}

export function HeroB2B({
  sobretitulo,
  titulo,
  texto,
  acaoPrincipal,
  acaoSecundaria,
  legendaDaArte,
}: HeroB2BProps) {
  return (
    <section className="hero-b2b">
      <div className="hero-b2b__texto">
        <p className="hero-b2b__sobretitulo">{sobretitulo}</p>
        <h1 className="hero-b2b__titulo">{titulo}</h1>
        <p className="hero-b2b__descricao">{texto}</p>
        <div className="hero-b2b__acoes">
          <BotaoLink href={acaoPrincipal.href} grande>
            {acaoPrincipal.rotulo}
          </BotaoLink>
          {acaoSecundaria ? (
            <BotaoLink href={acaoSecundaria.href} variante="contorno" grande>
              {acaoSecundaria.rotulo}
            </BotaoLink>
          ) : null}
        </div>
      </div>
      {legendaDaArte === undefined ? null : (
        <div className="hero-b2b__arte" role="img" aria-label={legendaDaArte}>
          <span>{legendaDaArte}</span>
        </div>
      )}
    </section>
  );
}

export interface CanalParceiro {
  nome: string;
  status: string;
  descricao: string;
}

export interface CanaisIntegradosProps {
  titulo: string;
  texto: string;
  beneficios: string[];
  canais: CanalParceiro[];
}

export function CanaisIntegrados({ titulo, texto, beneficios, canais }: CanaisIntegradosProps) {
  return (
    <section className="secao">
      <h2 className="secao__titulo">{titulo}</h2>
      <p className="secao__texto">{texto}</p>
      <ul className="lista-beneficios">
        {beneficios.map((beneficio) => (
          <li key={beneficio}>{beneficio}</li>
        ))}
      </ul>
      <ul className="canais">
        {canais.map((canal) => (
          <li key={canal.nome} className="canal">
            {/* O logotipo de cada portal depende de autorização de uso da marca
                (pendência do dono em ACHOUIMOVEL_PLAN.md); até lá, o nome. */}
            <p className="canal__nome">{canal.nome}</p>
            <p className="canal__status">{canal.status}</p>
            <p className="canal__descricao">{canal.descricao}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface PassoDoFluxo {
  numero: string;
  titulo: string;
  texto: string;
  emBreve?: string;
}

export function FluxoSistema({ titulo, passos }: { titulo: string; passos: PassoDoFluxo[] }) {
  return (
    <section className="secao">
      <h2 className="secao__titulo">{titulo}</h2>
      <ol className="fluxo">
        {passos.map((passo) => (
          <li key={passo.numero} className="fluxo__passo">
            <span className="fluxo__numero" aria-hidden="true">
              {passo.numero}
            </span>
            <h3 className="fluxo__titulo">
              {passo.titulo}
              {passo.emBreve === undefined ? null : <SeloEmBreve>{passo.emBreve}</SeloEmBreve>}
            </h3>
            <p className="fluxo__texto">{passo.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface CaminhoB2B {
  chapeu: string;
  titulo: string;
  texto: string;
  link: { href: string; rotulo: string };
}

export function DoisCaminhos({ caminhos }: { caminhos: CaminhoB2B[] }) {
  return (
    <section className="caminhos">
      {caminhos.map((caminho) => (
        <article key={caminho.titulo} className="caminho">
          <p className="caminho__chapeu">{caminho.chapeu}</p>
          <h2 className="caminho__titulo">{caminho.titulo}</h2>
          <p className="caminho__texto">{caminho.texto}</p>
          <a className="caminho__link" href={caminho.link.href}>
            {caminho.link.rotulo} <span aria-hidden="true">→</span>
          </a>
        </article>
      ))}
    </section>
  );
}

/**
 * Tabela de planos. Colunas vindas da API; células derivadas dos módulos do
 * plano. Lista vazia é estado de tela, não "nenhum plano": a página não pode
 * afirmar que a empresa não tem plano porque a API não respondeu.
 */
export function TabelaPlanos({ planos }: { planos: PublicPlan[] }) {
  if (planos.length === 0) {
    return (
      <EstadoVazio titulo="Planos indisponíveis agora">
        Não conseguimos carregar os planos neste momento. Fale com a gente e passamos os valores do
        seu tamanho de carteira.
      </EstadoVazio>
    );
  }

  return (
    <div className="tabela-planos__area">
      <div className="tabela-planos__cartoes">
        {planos.map((plano) => {
          const preco = precoDoPlano(plano);
          return (
            <article key={plano.code} className="plano-cartao">
              <h3 className="plano-cartao__nome">{plano.name}</h3>
              {plano.description === null ? null : (
                <p className="plano-cartao__descricao">{plano.description}</p>
              )}
              <p className="plano-cartao__preco">
                {preco.valor}
                {preco.porMes ? <span className="plano-cartao__mes">/mês</span> : null}
              </p>
              <p className="plano-cartao__limite">{limiteDoPlano(plano)}</p>
              <BotaoLink href={urlCadastro(plano.code)} grande>
                Começar
              </BotaoLink>
            </article>
          );
        })}
      </div>

      <table className="tabela-planos">
        <caption className="tabela-planos__legenda">
          O que cada plano inclui. Módulo fora do plano continua visível no sistema, com cadeado.
        </caption>
        <thead>
          <tr>
            <th scope="col">Recurso</th>
            {planos.map((plano) => (
              <th key={plano.code} scope="col">
                {plano.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {RECURSOS.map((recurso) => (
            <tr key={recurso.nome}>
              <th scope="row">
                <span className="tabela-planos__recurso">{recurso.nome}</span>
                <span className="tabela-planos__descricao">{recurso.descricao}</span>
              </th>
              {planos.map((plano) => {
                const tem = planoTemRecurso(plano, recurso);
                return (
                  <td key={plano.code}>
                    {tem ? (
                      <>
                        <span aria-hidden="true">✓</span>
                        <span className="visualmente-oculto">Incluído</span>
                        {recurso.emBreve === true ? <SeloEmBreve /> : null}
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">—</span>
                        <span className="visualmente-oculto">Não incluído</span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface PerguntaFrequente {
  pergunta: string;
  resposta: string;
}

/**
 * FAQ com `FAQPage` no JSON-LD. A pergunta e a resposta são as mesmas do HTML —
 * dado estruturado que não bate com a página visível é violação de diretriz, não
 * otimização.
 */
export function FaqPlanos({
  titulo,
  perguntas,
}: {
  titulo: string;
  perguntas: PerguntaFrequente[];
}) {
  const itens: ItemAcordeao[] = perguntas.map((item) => ({
    pergunta: item.pergunta,
    resposta: <p>{item.resposta}</p>,
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: perguntas.map((item) => ({
      '@type': 'Question',
      name: item.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: item.resposta },
    })),
  };

  return (
    <section className="secao">
      <h2 className="secao__titulo">{titulo}</h2>
      <Acordeao itens={itens} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </section>
  );
}
