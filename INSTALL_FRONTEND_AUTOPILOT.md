# Instalação

1. Feche o OpenCode.
2. Extraia este ZIP na raiz do repositório `Aluguei-app`.
3. Não mova a pasta `design-source/`.
4. Reabra o OpenCode na raiz do projeto.
5. Execute `git status`.
6. Confirme que os novos arquivos são apenas documentação/orquestração/referências.
7. Faça commit do pacote antes da implementação:

```bash
git add .
git commit -m "chore: add full frontend orchestration and design sources"
git push
```

8. Inicie:

`/frontend-autopilot`

Se a sessão terminar:

`/frontend-resume`

O agente deve trabalhar até o final sem pedir decisões técnicas reversíveis.
