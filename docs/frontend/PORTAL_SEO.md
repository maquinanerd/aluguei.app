# Portal AchouImóvel · SEO (diagnóstico e regras)

Este documento ocupa o lugar do `PROMPT_apps-portal.md`, citado pelo prompt orquestrado e ausente do
repositório (ADR-097). Ele vale para `apps/portal` e amarra o que a Onda 2A precisa entregar no
backend.

- Data: 23/09/2026 · Portal ainda **não publicado**: isto é planejamento, não auditoria de site no ar.
- Método: padrões de SEO programático (URL, limiares, conteúdo único, links internos, index bloat)
  aplicados ao que este repositório realmente tem, mais as regras de privacidade do `AGENTS.md`.

---

## 1. Onde está a busca neste mercado

Quem procura imóvel digita **finalidade + tipo + lugar**, e o lugar vai afunilando:

| Intenção                      | Exemplo de consulta                         | Página que responde                          |
| ----------------------------- | ------------------------------------------- | -------------------------------------------- |
| Cidade + finalidade           | "apartamento para alugar em goiânia"        | `/alugar/goiania-go/apartamento`             |
| Bairro (a cauda que converte) | "aluguel setor bueno goiânia"               | `/alugar/goiania-go/setor-bueno`             |
| Bairro + tipo                 | "apartamento para alugar no setor bueno"    | `/alugar/goiania-go/setor-bueno/apartamento` |
| Modificador                   | "apartamento 2 quartos aluguel setor bueno" | `.../apartamento/2-quartos`                  |
| Venda                         | "casas à venda em goiânia"                  | `/comprar/goiania-go/casa`                   |
| Marca do anunciante           | "imobiliária x goiânia"                     | `/imobiliaria/[slug]`                        |
| Imóvel específico             | raro, vem de link e de imagem               | `/imovel/[slug]`                             |

Três consequências para o produto:

1. **A briga se ganha nas páginas de busca (cidade e bairro), não no anúncio individual.** O anúncio
   é quase sempre o mesmo texto publicado também no ZAP, no OLX e no Imovelweb — conteúdo não
   original aos olhos do Google. A página de bairro, com a nossa estatística, é o que ninguém copia.
2. **Bairro é o ativo**: volume menor, intenção muito maior, concorrência menor que cidade.
3. **O estoque muda toda semana.** Página que hoje tem 12 anúncios amanhã tem 2. A política de
   indexação precisa ser calculada, não fixa.

---

## 2. Padrão de URL (decidido)

```
/alugar/[cidade-uf]                                  → 48 imóveis para alugar em Goiânia, GO
/alugar/[cidade-uf]/[tipo]                           → apartamentos para alugar em Goiânia
/alugar/[cidade-uf]/[bairro]                         → imóveis para alugar no Setor Bueno
/alugar/[cidade-uf]/[bairro]/[tipo]                  → apartamentos no Setor Bueno
/alugar/[cidade-uf]/[bairro]/[tipo]/[n]-quartos      → apartamentos de 2 quartos no Setor Bueno
/comprar/...                                          → mesma árvore, finalidade venda
/imovel/[slug]                                        → anúncio (slug único no Brasil)
/imobiliaria/[slug]                                   → vitrine da imobiliária
/planos, /para-imobiliarias, /mapa-do-site            → institucional
```

Regras:

- **Ordem fixa**: finalidade → cidade → bairro → tipo → quartos. O único salto permitido é cidade →
  tipo (consulta de volume alto). A leitura do caminho é determinística: o vocabulário de tipos é
  fechado (7 slugs), então o segmento que casa com um tipo é tipo; o que não casa é bairro.
- **Cidade sempre com UF** (`goiania-go`): cidade homônima existe em mais de um estado.
- **Minúsculas, sem acento, hífen**, sem barra final, abaixo de 100 caracteres.
- **Filtro fino, ordenação e página são query string** (`?ordem=menor-preco&pagina=2`), nunca
  caminho. Caminho é o que indexa; query string é conforto de navegação.
- **Slug do anúncio é único no país**, não por imobiliária — hoje o banco só garante
  `UNIQUE (org_id, slug)`. É mudança de schema da Onda 2A.

---

## 3. Política de indexação (o coração do plano)

A combinação cidade × bairro × tipo × quartos gera dezenas de milhares de endereços. Publicar todos
é o caminho clássico para index bloat e para a política de "scaled content abuse" do Google. A regra
é **a página existe para a pessoa sempre; para o Google, só quando tem o que mostrar**:

| Situação da página                         | Robots                                           | Sitemap | Estatística                     |
| ------------------------------------------ | ------------------------------------------------ | ------- | ------------------------------- |
| ≥ 5 anúncios ativos                        | `index, follow`                                  | sim     | sim                             |
| 3 ou 4 anúncios                            | `index, follow`                                  | sim     | **não** (amostra pequena mente) |
| 1 ou 2 anúncios                            | `noindex, follow`                                | não     | não                             |
| 0 anúncio                                  | `noindex, follow`                                | não     | não                             |
| Com modificador (quartos, característica)  | só indexa com **≥ 5**                            | idem    | idem                            |
| Página 2+ da paginação                     | `noindex, follow`, canônica para si mesma        | não     | —                               |
| Qualquer query string (ordem, filtro fino) | `noindex, follow`, canônica para a URL sem query | não     | —                               |

- Esses três números (**≥5 estatística, ≥3 indexar, ≥5 com modificador**) vêm do prompt orquestrado e
  são os mesmos que o `AGENTS.md` já exige para não publicar número sem amostra.
- A decisão é **calculada a cada render** a partir da contagem real; nada é fixado à mão.
- `noindex` nunca vira 404: a página continua navegável, com bairros vizinhos e o alerta de imóvel em
  destaque. É o que o design já desenhou em `busca-poucos` e `busca-vazia`.

### Lançamento em lotes

Nada de publicar o país inteiro num dia. A Onda 2B sobe **por cidade**, em lotes de 50 a 100 páginas
indexáveis, com revisão humana de 5 a 10% das páginas do lote e duas a quatro semanas de observação
antes do lote seguinte. Registro do lote e do que foi revisado vai no PR.

---

## 4. O que faz cada página ser única

O risco real do SEO programático é a página "mad-libs": o mesmo texto com o nome do bairro trocado.
Cada página de busca nossa carrega dado que só ela tem:

1. **A lista real de anúncios** — foto, valor total, atributos.
2. **Estatística do recorte** (≥5): mediana do total, faixa (mínimo e máximo), mediana por número de
   quartos. É o bloco `ResumoPreco` do design.
3. **Bairros vizinhos com contagem e mediana** — comparação que o visitante usa e nenhum concorrente
   publica igual.
4. **FAQ calculado**: perguntas respondidas com os números daquele recorte ("Quanto custa alugar um
   apartamento de 2 quartos no Setor Bueno?" → mediana e faixa reais).
5. **Texto de abertura com dados**, não adjetivo: contagem, faixa, quantos aceitam pet, quantos são
   mobiliados. Sem IA gerando parágrafo em massa — `AGENTS.md` já proíbe número inventado, e texto
   gerado em escala é exatamente o que a política de conteúdo em escala pune.

Meta: **≥40% do texto da página é próprio**. Abaixo de 30% a página não vai ao ar indexada — é a
mesma régua do gate de conteúdo fino.

O anúncio individual ganha o que o texto copiado do anunciante não tem: valor **total** do mês,
comparação com a mediana do bairro e os imóveis parecidos ali perto.

---

## 5. Links internos

- **Trilha (BreadcrumbList)** em toda página de busca e de anúncio.
- **Cidade → bairros** com contagem (hub); **bairro → tipos**; **tipo → modificadores** (só os que
  indexam, senão vira link para página `noindex`).
- **Bairros vizinhos** cruzando páginas irmãs — é o que distribui autoridade na cauda longa.
- **Anúncio → bairro** de volta ("outros imóveis no bairro"), fechando o ciclo.
- Texto do link descritivo e variado ("apartamentos de 2 quartos no Setor Bueno"), nunca a mesma
  âncora exata repetida.
- **Mapa do site** por UF, com as páginas indexáveis — é a porta de entrada do rastreamento.

---

## 6. Tags, dados estruturados e cache

- **`<title>` estável**, sem contagem: "Apartamentos para alugar no Setor Bueno, Goiânia - GO |
  AchouImóvel". A contagem fica no H1, que o design já define ("48 apartamentos para alugar...").
  Título que muda a cada rastreamento é sinal ruim e estraga o CTR histórico.
- **Meta description** com dado estável do recorte (faixa de preço arredondada), não com contagem.
- **Canônica própria** em toda página; variação de query aponta para a URL sem query; paginação
  aponta para si mesma.
- **JSON-LD**: `BreadcrumbList` (todas), `ItemList` na busca, `RealEstateListing` + `Offer` no
  anúncio, `RealEstateAgent` na vitrine (com CRECI e cidade — é aqui que existe ganho de entidade
  local), `Organization` + `WebSite` no site. `FAQPage` entra como marcação semântica, sem esperar
  rich result: o Google restringiu FAQ a sites de governo e saúde desde 2023.
- **Nada de `force-dynamic` em página pública.** HTML estático com revalidação por tag: a tag é o
  recorte (cidade, bairro, tipo) e o anúncio; publicar, pausar ou arquivar um anúncio invalida as
  tags dele.
- **Cidade por IP é camada do cliente**, por cima do HTML genérico em cache (decisão 1 do prompt).
  O que o Google lê é sempre o texto genérico.
- **Imagem**: `width`/`height` fixos (o card já é 4:3, o que mata CLS), a primeira foto da página é o
  LCP e entra com `fetchpriority="high"`. Gerar variantes menores em WebP fica como pendência de
  performance da Onda 2B.

---

## 7. Privacidade não é negociável, e ajuda

O portal nunca publica rua, número, complemento, CEP ou coordenada — regra de produto e teste
Playwright da Onda 2B. Para SEO isso não custa nada: quem busca digita bairro, não endereço. Os
dados estruturados usam só `addressLocality` (cidade), `addressRegion` (UF) e o bairro como
`areaServed`. Mapa é aproximado por bairro.

---

## 8. Ciclo de vida da URL (o detalhe que derruba portal imobiliário)

| Evento                             | Resposta                                     | Sitemap      |
| ---------------------------------- | -------------------------------------------- | ------------ |
| Anúncio pausado ou arquivado       | `410 Gone` com "imóveis parecidos no bairro" | sai na hora  |
| Imóvel alugado ou vendido          | `410 Gone` (mesma tela)                      | sai na hora  |
| Anúncio republicado com outro slug | `301` do slug antigo para o novo             | entra o novo |
| Recorte que ficou abaixo do limiar | `noindex, follow`, página continua viva      | sai          |

410 em vez de 404 porque a remoção é definitiva e conhecida: o Google tira do índice mais rápido e
não fica revisitando. A tela "Indisponível" do design já é a resposta certa — falta só o status HTTP.

---

## 9. O que isto exige da Onda 2A (backend)

Sem estes itens, a Onda 2B não tem como cumprir nada do que está acima:

1. **Slug público único no país** para o anúncio, resolvido na publicação, com histórico do slug
   anterior para o 301.
2. **Busca pública nacional** com filtros por cidade, bairro, tipo, quartos, faixa e finalidade, e a
   **contagem total** do recorte — é dela que sai a decisão de indexar.
3. **Estatística do recorte** (`page_stats`): contagem, mediana e faixa do total e do preço de venda,
   mediana por número de quartos, com o limiar de 5 aplicado no servidor.
4. **Bairros vizinhos** com contagem e mediana.
5. **Fonte do sitemap**: endpoint que lista os recortes indexáveis (≥3) e os anúncios publicados, com
   a data da última alteração de verdade.
6. **URL de foto pública** que não vaza `storage_key` e não muda a cada requisição (senão o HTML em
   cache aponta para URL morta).
7. **Finalidade e valores de venda** no imóvel, e os **7 tipos** com o vocabulário do design — sem
   isso não existe `/comprar` nem página por tipo.
8. **Status de remoção** legível no público, para o 410 e o 301.

---

## 10. O que fica pendente do dono

- Domínio definitivo e certificado (`achouimovel.online`), para registrar no Search Console.
- Conta do Search Console e do Analytics — sem elas não há medição, só planejamento.
- Cidades do primeiro lote (sugestão: começar pela cidade com mais estoque real).
- CNPJ e razão social do rodapé, que entram no `Organization`.
