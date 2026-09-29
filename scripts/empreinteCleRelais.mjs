#!/usr/bin/env node
// scripts/empreinteCleRelais.mjs — [DURCISSEMENT-RELAIS] calcule l'empreinte salée d'une clé Anthropic, à COLLER dans
// la variable Vercel RELAIS_CLES_LOCALES. À lancer PAR MARC, sur son PC : la clé n'est jamais lue par un agent.
//
//   $env:RELAIS_SEL_EMPREINTE = "<le même sel que sur Vercel>"; node scripts/empreinteCleRelais.mjs
//
// La clé se tape à l'invite (masquée, rien n'est affiché ni écrit) ou arrive par l'entrée standard (tuyau). Seule
// l'EMPREINTE (SHA-256 de « sel NUL clé », en hexadécimal) sort sur la sortie standard : même formule que
// `empreinteCle` de api/_lib/relay.ts. Le sel vient de l'env, jamais d'un argument (l'historique du shell le garderait).
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const sel = process.env.RELAIS_SEL_EMPREINTE;
if (!sel || sel.length < 16) {
    console.error('RELAIS_SEL_EMPREINTE absent ou trop court (16 caractères minimum) : même valeur que sur Vercel.');
    process.exit(1);
}

function lireCleMasquee() {
    return new Promise((resolve) => {
        if (!process.stdin.isTTY) {
            let t = '';
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (c) => { t += c; });
            process.stdin.on('end', () => resolve(t.trim()));
            return;
        }
        process.stderr.write('Clé Anthropic (saisie masquée) : ');
        const rl = createInterface({ input: process.stdin, terminal: true });
        rl._writeToOutput = () => undefined; // rien n'est réécrit à l'écran
        rl.question('', (rep) => { rl.close(); process.stderr.write('\n'); resolve(rep.trim()); });
    });
}

const cle = await lireCleMasquee();
if (!cle) {
    console.error('Aucune clé reçue.');
    process.exit(1);
}
console.log(createHash('sha256').update(`${sel}\0${cle}`, 'utf8').digest('hex'));
