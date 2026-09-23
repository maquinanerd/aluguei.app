'use client';

import { useState } from 'react';
import {
  Acordeao,
  BlocoGrade,
  Botao,
  BotaoLink,
  Breadcrumb,
  Campo,
  CheckboxLgpd,
  Chip,
  EstadoVazio,
  Gaveta,
  ImovelCard,
  Logotipo,
  Segmentado,
  SiteFooter,
  SiteHeader,
} from '@/components';
import type { ImovelResumo } from '@/components';
import { TIPOS_IMOVEL, TIPO_IMOVEL } from '@/lib/tipos';

/**
 * Todos os componentes com os seus estados. Os valores são fictícios e estão
 * marcados como tal: nenhum número daqui vai para tela pública.
 */

const IMOVEL_ALUGUEL: ImovelResumo = {
  slug: 'exemplo-aluguel',
  tipo: 'apartamento',
  finalidade: 'aluguel',
  bairro: 'Setor Bueno',
  cidade: 'Goiânia',
  uf: 'GO',
  aluguelCents: 240_000,
  condominioCents: 42_000,
  iptuCents: 9_000,
  totalMensalCents: 291_000,
  quartos: 2,
  banheiros: 2,
  vagas: 1,
  areaM2: 68,
  fotos: 12,
  anunciante: { nome: 'Imobiliária Exemplo', creci: 'GO-00000' },
};

const IMOVEL_VENDA: ImovelResumo = {
  ...IMOVEL_ALUGUEL,
  slug: 'exemplo-venda',
  tipo: 'casa',
  finalidade: 'venda',
  precoVendaCents: 74_000_000,
  aluguelCents: null,
  totalMensalCents: null,
};

const IMOVEL_AMBOS: ImovelResumo = {
  ...IMOVEL_ALUGUEL,
  slug: 'exemplo-ambos',
  tipo: 'cobertura',
  finalidade: 'ambos',
  precoVendaCents: 98_000_000,
};

const IMOVEL_SEM_FOTO: ImovelResumo = {
  ...IMOVEL_ALUGUEL,
  slug: 'exemplo-sem-foto',
  tipo: 'kitnet-studio',
  fotos: 0,
  anunciante: null,
};

export function Catalogo() {
  const [finalidade, setFinalidade] = useState('aluguel');
  const [gaveta, setGaveta] = useState(false);

  return (
    <>
      <SiteHeader />
      <main className="catalogo">
        <div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>
            Componentes do portal
          </h1>
          <p className="catalogo__nota">
            Base da Onda 1B. Os números são fictícios e servem só para ver o componente; as telas
            reais chegam na Onda 2B, ligadas aos dados do anúncio.
          </p>
        </div>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Logotipo</h2>
          <div className="catalogo__linha" style={{ alignItems: 'center' }}>
            <Logotipo cor="acento" tamanho="lg" />
            <Logotipo cor="apartamento" tamanho="md" />
            <Logotipo cor="casa" tamanho="md" />
            <BlocoGrade cor="acento" grade="band">
              <Logotipo cor="branco" tamanho="md" />
            </BlocoGrade>
          </div>
          <p className="catalogo__nota">
            &quot;Achou&quot; sempre em #111111; &quot;Imóvel&quot; na cor da seção — acento nas
            páginas gerais, cor do tipo nas páginas de cada tipo, branco sobre bloco colorido.
          </p>
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Botão</h2>
          <div className="catalogo__linha" style={{ alignItems: 'center' }}>
            <Botao>Falar com a imobiliária</Botao>
            <Botao variante="contorno">Ver no mapa</Botao>
            <Botao variante="texto">Como funciona</Botao>
            <Botao carregando>Enviando</Botao>
            <Botao disabled>Indisponível</Botao>
            <BotaoLink href="#">Link com cara de botão</BotaoLink>
          </div>
          <div style={{ maxWidth: 360 }}>
            <Botao grande>Buscar imóveis para alugar</Botao>
          </div>
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Campo e consentimento</h2>
          <div className="catalogo__linha">
            <div style={{ minWidth: 280 }}>
              <Campo id="c-nome" rotulo="Nome" placeholder="Como quer ser chamado" />
            </div>
            <div style={{ minWidth: 280 }}>
              <Campo
                id="c-telefone"
                rotulo="Telefone"
                defaultValue="(62) 9"
                erro="Telefone incompleto"
              />
            </div>
            <div style={{ minWidth: 280 }}>
              <Campo
                id="c-mensagem"
                rotulo="Mensagem"
                multilinha
                defaultValue="Tenho interesse neste imóvel."
                ajuda="A imobiliária responde por WhatsApp ou e-mail."
              />
            </div>
          </div>
          <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <CheckboxLgpd id="c-lgpd" />
            <CheckboxLgpd id="c-lgpd-erro" erro="Precisa autorizar para enviar o contato." />
          </div>
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Chip, segmentado e trilha</h2>
          <div className="catalogo__linha" style={{ alignItems: 'center' }}>
            <Chip>2 quartos</Chip>
            <Chip aoRemover={() => undefined} rotuloRemover="Tirar o filtro de garagem">
              Com garagem
            </Chip>
            <div style={{ minWidth: 260 }}>
              <Segmentado
                rotulo="Finalidade"
                valor={finalidade}
                aoEscolher={setFinalidade}
                opcoes={[
                  { valor: 'aluguel', rotulo: 'Alugar' },
                  { valor: 'venda', rotulo: 'Comprar' },
                ]}
              />
            </div>
          </div>
          <Breadcrumb
            trilhos={[
              { rotulo: 'Início', href: '/' },
              { rotulo: 'Alugar', href: '/alugar' },
              { rotulo: 'Goiânia, GO', href: '/alugar/goiania-go' },
              { rotulo: 'Setor Bueno' },
            ]}
          />
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Bloco colorido com grade</h2>
          <div className="catalogo__grade">
            {TIPOS_IMOVEL.map((tipo) => (
              <BlocoGrade key={tipo} cor={tipo} grade="tile">
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>Bloco do tipo</span>
                <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {TIPO_IMOVEL[tipo].nome}
                </span>
              </BlocoGrade>
            ))}
          </div>
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Card de imóvel</h2>
          <div className="catalogo__grade">
            <ImovelCard imovel={IMOVEL_ALUGUEL} />
            <ImovelCard imovel={IMOVEL_VENDA} />
            <ImovelCard imovel={IMOVEL_AMBOS} />
            <ImovelCard imovel={IMOVEL_SEM_FOTO} />
          </div>
          <div style={{ maxWidth: 420 }}>
            <ImovelCard imovel={IMOVEL_ALUGUEL} variante="compacto" />
          </div>
          <p className="catalogo__nota">
            O card inteiro é o link e nunca traz rua, número, CEP nem coordenada — só bairro e
            cidade.
          </p>
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Gaveta e acordeão</h2>
          <div className="catalogo__linha">
            <Botao
              variante="contorno"
              onClick={() => {
                setGaveta(true);
              }}
            >
              Abrir gaveta de filtros
            </Botao>
          </div>
          <Gaveta
            aberta={gaveta}
            titulo="Filtros"
            aoFechar={() => {
              setGaveta(false);
            }}
            rodape={
              <Botao
                grande
                onClick={() => {
                  setGaveta(false);
                }}
              >
                Ver imóveis
              </Botao>
            }
          >
            <Segmentado
              rotulo="Finalidade"
              valor={finalidade}
              aoEscolher={setFinalidade}
              opcoes={[
                { valor: 'aluguel', rotulo: 'Alugar' },
                { valor: 'venda', rotulo: 'Comprar' },
              ]}
            />
            <Campo id="g-bairro" rotulo="Bairro" placeholder="Qualquer bairro" />
          </Gaveta>

          <Acordeao
            itens={[
              {
                pergunta: 'O valor do anúncio já inclui condomínio e IPTU?',
                resposta:
                  'O valor em destaque é o total do mês. A linha abaixo dele mostra aluguel, condomínio e IPTU separados.',
              },
              {
                pergunta: 'Por que o endereço não aparece?',
                resposta:
                  'O portal mostra bairro e cidade. O endereço exato você recebe no contato com a imobiliária.',
              },
            ]}
          />
        </section>

        <section className="catalogo__secao">
          <h2 className="catalogo__titulo">Estado vazio</h2>
          <EstadoVazio
            titulo="Nenhum imóvel com esses filtros"
            acao={<BotaoLink href="#">Criar alerta de imóvel</BotaoLink>}
          >
            Tente tirar um filtro ou procurar num bairro vizinho. Criando um alerta, você recebe
            quando aparecer algo assim.
          </EstadoVazio>
        </section>
      </main>
      <SiteFooter versao="Onda 1B" />
    </>
  );
}
