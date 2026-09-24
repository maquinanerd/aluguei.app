import type { Metadata } from 'next';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { FaqPlanos, TabelaPlanos } from '@/components/b2b';
import { buscarPlanos } from '@/lib/api';
import { metadataDaPagina } from '@/lib/seo';
import { FAQ_PLANOS } from '../b2b-conteudo';

/**
 * Planos (Onda 3). A tabela inteira — colunas, preço, limite e o que cada plano
 * inclui — vem de `GET /public/plans`; nada aqui é valor escrito na página.
 * Plano sem preço publicado aparece como "Fale com a gente", não como zero.
 */

export const metadata: Metadata = metadataDaPagina({
  titulo: 'Planos do AchouImóvel Gestão',
  descricao:
    'Todos os planos publicam no AchouImóvel, no Canal Pro, na OLX e no Imovelweb. Gestão Locação é contratado pelo número de contratos de locação ativos; Gestão Vendas, pelo número de corretores.',
  caminho: '/planos',
  robots: 'index, follow',
});

export const revalidate = 300;

export default async function PlanosPage() {
  const dados = await buscarPlanos().catch(() => ({ plans: [] }));

  return (
    <>
      <SiteHeader variante="b2b" />

      <main className="pagina pagina--b2b">
        <header className="cabecalho-pagina">
          <h1 className="cabecalho-pagina__titulo">Planos</h1>
          <p className="cabecalho-pagina__texto">
            Todos os planos publicam no AchouImóvel, no Canal Pro, na OLX e no Imovelweb. Gestão
            Locação é contratado pelo número de contratos de locação ativos; Gestão Vendas, pelo
            número de corretores.
          </p>
        </header>

        <TabelaPlanos planos={dados.plans} />

        <p className="nota">
          Trocar de plano não apaga dados. Módulos fora do plano ficam visíveis com cadeado no
          sistema.
        </p>

        <FaqPlanos titulo="Perguntas sobre os planos" perguntas={FAQ_PLANOS} />
      </main>

      <SiteFooter />
    </>
  );
}
