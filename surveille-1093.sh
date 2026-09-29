#!/bin/sh
i=0
while [ $i -lt 30 ]; do
  etat=$(gh pr view 1093 --json state --jq '.state')
  fusionne=$(gh pr view 1093 --json mergedAt --jq '.mergedAt')
  echo "$(date +%H:%M:%S) etat=$etat mergedAt=$fusionne"
  if [ "$etat" = "MERGED" ]; then
    echo "RESULTAT=MERGED"
    exit 0
  fi
  if [ "$etat" = "CLOSED" ]; then
    echo "RESULTAT=CLOSED_NON_FUSIONNEE"
    exit 1
  fi
  i=$((i+1))
  sleep 60
done
echo "RESULTAT=TIMEOUT"
exit 2
