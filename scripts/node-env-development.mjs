/**
 * Pré-carregado pelos scripts `dev` da API e do worker (`tsx watch --import ...`).
 *
 * Os dois processos exigem NODE_ENV explícito (G3, Trilha F: fail-fast de configuração). Rodar
 * `pnpm dev` é declarar desenvolvimento; um NODE_ENV que venha do shell é mantido. Os scripts
 * `start` e a imagem de produção não carregam este arquivo.
 */
process.env.NODE_ENV ??= 'development';
