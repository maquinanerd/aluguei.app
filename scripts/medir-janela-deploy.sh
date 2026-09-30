#!/usr/bin/env bash
# Janela de indisponibilidade de um deploy (ADR-106). Laço de curl, a cada INTERVALO
# segundos, no portal (/robots.txt, o mesmo alvo do healthcheck dele), no painel
# (/login) e na API (/health). Mostra cada troca de status na hora, avisa quando o
# processo da API reinicia (pelo `uptimeMs` do /health) e, ao fim (DURACAO esgotada
# ou Ctrl-C), resume por alvo as janelas sem 200, com resolução de ~INTERVALO.
#
#   bash scripts/medir-janela-deploy.sh [amostras.tsv]
#   Opcionais: DURACAO=1800 INTERVALO=1 PORTAL_URL=... PAINEL_URL=... API_URL=...
#
# Deixe rodando, dispare o deploy no Coolify (o build vem antes da parada, por isso a
# duração longa) e espere o resumo. Só GET em endereço público, sem credencial:
# nenhum segredo vai para a tela nem para o arquivo.
set -euo pipefail

PORTAL_URL=${PORTAL_URL:-https://achouimovel.online/robots.txt}
PAINEL_URL=${PAINEL_URL:-https://app.achouimovel.online/login}
API_URL=${API_URL:-https://api.achouimovel.online/health}
DURACAO=${DURACAO:-1800}
INTERVALO=${INTERVALO:-1}
SAIDA=${1:-janela-deploy-$(date -u +%Y%m%dT%H%M%SZ).tsv}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

hora() { # epoch -> ISO 8601 em UTC (date do GNU ou do BSD)
  date -u -d "@$1" +%FT%TZ 2>/dev/null || date -u -r "$1" +%FT%TZ
}

sonda() { # alvo url -> status HTTP em $TMP/alvo (000 = sem resposta) e corpo em $TMP/alvo.corpo
  rm -f "$TMP/$1.corpo"
  curl -sS -o "$TMP/$1.corpo" -w '%{http_code}' --connect-timeout 2 -m 4 \
    -H 'cache-control: no-cache' "$2" > "$TMP/$1" 2>/dev/null || true
  [ -s "$TMP/$1" ] || echo 000 > "$TMP/$1"
}

resumo() { # janela = do primeiro status diferente de 200 até o primeiro 200 seguinte
  awk -F '\t' '
    function fecha(a, t, h) {
      janelas[a] = janelas[a] sprintf("    %s -> %s  %4ds  (%s)\n", ini_h[a], h, t - ini[a], codigos[a])
      total[a] += t - ini[a]
      delete ini[a]
    }
    NR == 1 { next }
    {
      t = $2; a = $3; s = $4
      if (!(a in visto)) { visto[a] = 1; ordem[++n] = a }
      if (s != "200") {
        if (!(a in ini)) { ini[a] = t; ini_h[a] = $1; codigos[a] = "" }
        if (index(" " codigos[a] " ", " " s " ") == 0) codigos[a] = codigos[a] (codigos[a] == "" ? "" : " ") s
        ult[a] = t
      } else if (a in ini) {
        fecha(a, t, $1)
      }
    }
    END {
      for (i = 1; i <= n; i++) {
        a = ordem[i]
        if (a in ini) {
          janelas[a] = janelas[a] sprintf("    %s -> (sem 200 até o fim)  %4ds+  (%s)\n", ini_h[a], ult[a] - ini[a], codigos[a])
          total[a] += ult[a] - ini[a]
        }
        printf "%-6s %s\n", a, (janelas[a] == "" ? "sempre 200" : sprintf("%ds sem 200", total[a]))
        printf "%s", janelas[a]
      }
    }' "$SAIDA"
}

printf 'hora\tepoch\talvo\tstatus\n' > "$SAIDA"
echo "Amostrando a cada ${INTERVALO}s por até ${DURACAO}s (Ctrl-C encerra e resume). Amostras: $SAIDA"
fim=$(($(date +%s) + DURACAO))
ultimo_portal='' ultimo_painel='' ultimo_api='' inicio_api=''
parar=0
trap 'parar=1' INT TERM

while [ "$parar" = 0 ] && [ "$(date +%s)" -lt "$fim" ]; do
  agora=$(date +%s)
  sonda portal "$PORTAL_URL" &
  sonda painel "$PAINEL_URL" &
  sonda api "$API_URL" &
  wait || true
  for alvo in portal painel api; do
    status=$(cat "$TMP/$alvo")
    printf '%s\t%s\t%s\t%s\n' "$(hora "$agora")" "$agora" "$alvo" "$status" >> "$SAIDA"
    var=ultimo_$alvo
    if [ "${!var}" != "$status" ]; then
      printf '%s  %-6s %s -> %s\n' "$(hora "$agora")" "$alvo" "${!var:-início}" "$status"
      printf -v "$var" '%s' "$status"
    fi
  done
  # Início do processo da API = agora - uptimeMs; se andar mais de 5 s, ela reiniciou.
  up=$(sed -n 's/.*"uptimeMs":\([0-9][0-9]*\).*/\1/p' "$TMP/api.corpo" 2>/dev/null || true)
  if [ -n "$up" ]; then
    ini=$((agora - up / 1000))
    if [ -z "$inicio_api" ]; then
      printf '%s  api    processo no ar desde %s\n' "$(hora "$agora")" "$(hora "$ini")"
      inicio_api=$ini
    elif [ $((ini - inicio_api)) -gt 5 ] || [ $((inicio_api - ini)) -gt 5 ]; then
      printf '%s  api    processo reiniciado às %s\n' "$(hora "$agora")" "$(hora "$ini")"
      inicio_api=$ini
    fi
  fi
  sleep "$INTERVALO" || true
done

echo
echo "Resumo ($SAIDA):"
resumo
