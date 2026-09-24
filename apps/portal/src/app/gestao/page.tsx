import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { FluxoSistema, HeroB2B, SeloEmBreve } from '@/components/b2b';
import { metadataDaPagina } from '@/lib/seo';
import { urlCadastro } from '@/lib/plataforma';
import { FLUXO } from '../b2b-conteudo';

/**
 * Gestão (Onda 3): o sistema por módulo, que é como o plano é montado
 * (`PLAN_MODULES` no domínio, ADR-095). Cada bloco daqui corresponde a um módulo
 * de verdade — e o que ainda não foi ligado leva selo, em vez de sumir da página
 * ou ser prometido como pronto.
 */

export const metadata: Metadata = metadataDaPagina({
  titulo: 'O sistema do AchouImóvel Gestão, módulo por módulo',
  descricao:
    'CRM, atendimento no WhatsApp, locação, financeiro, vendas e marketing no mesmo sistema, com o portal incluído. Contrate só os módulos que você usa.',
  caminho: '/gestao',
  robots: 'index, follow',
});

interface ModuloNaPagina {
  nome: string;
  texto: string;
  itens: string[];
  emBreve?: string;
}

const MODULOS: ModuloNaPagina[] = [
  {
    nome: 'CRM',
    texto: 'O funil de quem procura imóvel, do primeiro contato à proposta.',
    itens: ['Leads com imóvel e origem', 'Visitas e tarefas', 'Propostas e contrapropostas'],
  },
  {
    nome: 'Atendimento',
    texto: 'WhatsApp da imobiliária, com resposta automática e passagem para a equipe.',
    itens: ['Número próprio conectado', 'Atendimento automático', 'Caixa de entrada por conversa'],
  },
  {
    nome: 'Locação',
    texto: 'Do candidato ao contrato assinado e à vistoria.',
    itens: [
      'Análise cadastral com autorização LGPD',
      'Contrato por modelo versionado',
      'Vistoria com fotos e áudio no celular',
    ],
    emBreve: 'assinatura em breve',
  },
  {
    nome: 'Financeiro',
    texto: 'Cobrança do inquilino, divisão do valor e repasse ao proprietário.',
    itens: ['Cobranças com multa e juros', 'Divisão do valor por participação', 'Conciliação'],
    emBreve: 'cobrança real em breve',
  },
  {
    nome: 'Vendas',
    texto: 'A frente de venda, com negociação e comissão.',
    itens: ['Negociação com histórico', 'Documentação da venda', 'Comissão por corretor'],
  },
  {
    nome: 'Marketing',
    texto: 'Publicação nos portais parceiros e acompanhamento por canal.',
    itens: ['Canal Pro, OLX e Imovelweb', 'Status por canal', 'Retirada automática'],
  },
];

export default function GestaoPage() {
  return (
    <>
      <SiteHeader variante="b2b" />

      <main className="pagina pagina--b2b">
        <HeroB2B
          sobretitulo="AchouImóvel Gestão"
          titulo="O sistema inteiro, contratado por módulo."
          texto="Você contrata as frentes que usa. O que fica fora do plano continua visível no sistema, com cadeado, e abre no dia em que você contratar — sem migração e sem perder dado."
          acaoPrincipal={{ href: urlCadastro(), rotulo: 'Começar' }}
          acaoSecundaria={{ href: '/planos', rotulo: 'Ver planos' }}
        />

        <section className="secao">
          <h2 className="secao__titulo">Módulos</h2>
          <ul className="modulos">
            {MODULOS.map((modulo) => (
              <li key={modulo.nome} className="modulo">
                <h3 className="modulo__nome">
                  {modulo.nome}
                  {modulo.emBreve === undefined ? null : (
                    <SeloEmBreve>{modulo.emBreve}</SeloEmBreve>
                  )}
                </h3>
                <p className="modulo__texto">{modulo.texto}</p>
                <ul className="modulo__itens">
                  {modulo.itens.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <FluxoSistema titulo="Como o sistema encadeia isso" passos={FLUXO} />
      </main>

      <SiteFooter />
    </>
  );
}
