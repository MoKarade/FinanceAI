import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NavApps from "../components/NavApps";
import { APPS_DU_PARC } from "../utils/appsDuParc";

const html = renderToStaticMarkup(<NavApps courant="financeai" />);
const liens = [...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)].map((m) => ({ attrs: m[1] ?? "", nom: m[2] ?? "" }));
const css = readFileSync(join(__dirname, "..", "index.css"), "utf8");

describe("NavApps : rendu serveur", () => {
  it("6 liens aux adresses de utils/appsDuParc.ts, dans l'ordre, sans l'app courante", () => {
    const attendues = APPS_DU_PARC.filter((a) => a.id !== "financeai");
    expect(attendues).toHaveLength(6);
    expect(liens.map((l) => l.attrs.match(/href="([^"]*)"/)?.[1])).toEqual(attendues.map((a) => a.adresse));
    expect(liens.map((l) => l.nom)).toEqual(attendues.map((a) => a.nom));
    expect(liens.map((l) => l.nom)).not.toContain("FinanceAI");
  });

  it("liens sans target, replié par défaut, résumé nommé, zéro script", () => {
    for (const { attrs } of liens) expect(attrs).not.toContain("target");
    expect(html).toMatch(/^<details class="nav-apps">/);
    expect(html).not.toContain(" open");
    expect(html).toMatch(/<summary[^>]*aria-label="[^"]+"/);
    expect(html).not.toContain("<script");
  });

  it("un id inconnu lève", () => {
    // @ts-expect-error id volontairement hors AppId
    expect(() => renderToStaticMarkup(<NavApps courant="inconnue" />)).toThrow();
  });

  it("cibles d'au moins 44 px (2.75rem) et texte 16 px pour l'onglet et chaque lien", () => {
    for (const classe of ["nav-apps-onglet", "nav-apps-lien"]) {
      const bloc = new RegExp(`\\.${classe}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(bloc, classe).toMatch(/min-height:\s*2\.75rem/);
      expect(bloc, classe).toMatch(/font-size:\s*1rem/);
    }
  });
});

describe("montage dans App.tsx", () => {
  it('monte NavApps courant="financeai"', () => {
    const app = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");
    expect(app).toContain('<NavApps courant="financeai" />');
  });
});
