#!/usr/bin/env python3
"""[ENGINE-IMPLICIT-ORDER] Banc d'inversion CHIRURGICALE de la boucle mensuelle.

Ne touche JAMAIS le dépôt : il écrit une COPIE du moteur (ORDRE_DST, défaut /tmp/ordre-inv/…),
dans un répertoire où node_modules du dépôt est symlinké pour que `tsx` résolve les imports.
  mkdir -p /tmp/ordre-inv && ln -s <repo>/node_modules /tmp/ordre-inv/node_modules
  cp -r <repo>/services /tmp/ordre-inv/services   # une fois — le script réécrit projection.ts
  python3 scripts/inverserOrdreBoucle.py <clef>
  npx tsx scripts/mesureOrdreBoucle.ts /tmp/ordre-inv/services/projection.ts > apres.json
  diff base.json apres.json   # vide == inversion INERTE (mesuré : avril_dec)
Référence des mesures (2026-09-04) : tests/services/projection.engineOrder.test.ts (en-tête).
Clefs : pristine | avril_dec | melt_avant_revenus | avril_apres_alloc | dec_fin_de_mois
        | dec_psv_fin_de_mois | revenu_avant_janvier | sonde_income0
"""
import os, shutil, sys
# SRC = le moteur du dépôt ; DST = une COPIE hors dépôt (répertoire inv/ avec node_modules
# symlinké) — jamais le dépôt lui-même. Surchargés par ORDRE_SRC / ORDRE_DST.
SRC = os.environ.get('ORDRE_SRC', os.path.join(os.path.dirname(__file__), '..', 'services', 'projection.ts'))
DST = os.environ.get('ORDRE_DST', '/tmp/ordre-inv/services/projection.ts')

def lines():
    return open(DST).read().split('\n')

def bloc(L, debut, fin_exclusive):
    s = next(i for i, l in enumerate(L) if debut in l)
    e = next(i for i in range(s, len(L)) if fin_exclusive in L[i])
    b = L[s:e]
    while b and b[-1].strip() == '': b.pop()
    assert b[-1].strip() == '}', b[-1]
    return s, b

def deplacer(debut, fin_exclusive, ancre_insertion):
    L = lines(); s, b = bloc(L, debut, fin_exclusive)
    rest = L[:s] + L[s+len(b):]
    ins = next(i for i, l in enumerate(rest) if ancre_insertion in l)
    open(DST, 'w').write('\n'.join(rest[:ins] + b + [''] + rest[ins:]))

MELT   = 'Cycle 15 split: REER Meltdown'
AVRIL  = 'APRIL SETTLEMENT ---'
DEC    = 'Cycle 11 split: December tax filing'
OAS    = 'Cycle 10 split: OAS Clawback'
JAN    = 'Cycle 12 split: January reset'
TRANSF = 'Transfert NonReg → CELI/REER si espace'
PHASE  = '// ---- PHASE RETRAITE ----'

def main(k):
    shutil.copy(SRC, DST)
    if k == 'pristine': pass
    elif k == 'avril_dec':            # échange littéral des deux sites nommés par le ticket
        L = lines(); s, a = bloc(L, AVRIL, DEC); _, b = bloc(L, DEC, OAS)
        i = L.index(b[0]); j = i + len(b)
        open(DST, 'w').write('\n'.join(L[:s] + b + [''] + a + L[j:]))
    elif k == 'melt_avant_revenus':   # paire 1 : le meltdown lit incomeRetirement AVANT sa publication
        deplacer(MELT, TRANSF, PHASE)
    elif k == 'avril_apres_alloc':    deplacer(AVRIL, DEC, MELT)
    elif k == 'dec_fin_de_mois':      deplacer(DEC, OAS, TRANSF)
    elif k == 'dec_psv_fin_de_mois':  deplacer(DEC, JAN, TRANSF)
    elif k == 'revenu_avant_janvier':
        L = lines()
        s = next(i for i, l in enumerate(L) if 'Versement du revenu gagné du mois, APRÈS le reset' in l)
        e = next(i for i in range(s, len(L)) if 'grossIncomeEnAttenteByUser = [0, 0];' in L[i])
        b = L[s:e+1]; rest = L[:s] + L[e+1:]
        ins = next(i for i, l in enumerate(rest) if JAN in l)
        open(DST, 'w').write('\n'.join(rest[:ins] + b + [''] + rest[ins:]))
    elif k == 'sonde_income0':
        s = open(DST).read()
        old = 'taxFilers, incomeRetirement,\n              accRetraitsReerYear'
        assert old in s
        open(DST, 'w').write(s.replace(old, 'taxFilers, incomeRetirement: 0,\n              accRetraitsReerYear'))
    else:
        raise SystemExit(__doc__)
    print('appliqué :', k)

main(sys.argv[1] if len(sys.argv) > 1 else 'pristine')
