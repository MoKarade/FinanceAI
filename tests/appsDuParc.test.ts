import { describe, expect, it } from "vitest";
import { APPS_DU_PARC, autresApps } from "../utils/appsDuParc";

describe("APPS_DU_PARC : la liste figée", () => {
  it("contient exactement les 7 destinations, dans cet ordre", () => {
    expect(APPS_DU_PARC.map(({ id, nom, adresse }) => [id, nom, adresse])).toEqual([
      ["hub", "Hub", "https://www.hubperso.com"],
      ["financeai", "FinanceAI", "https://finance.hubperso.com"],
      ["driveai", "DriveAI", "https://drive.hubperso.com"],
      ["batchchef", "BatchChef", "https://batchchef.hubperso.com"],
      ["carai", "CarAI", "https://carai.hubperso.com"],
      ["jobai", "JobAI", "https://emploi.hubperso.com"],
      ["memoryai", "MemoryAI", "https://memoryai.hubperso.com"],
    ]);
  });

  it("n'a ni id ni adresse en double", () => {
    expect(new Set(APPS_DU_PARC.map((a) => a.id)).size).toBe(APPS_DU_PARC.length);
    expect(new Set(APPS_DU_PARC.map((a) => a.adresse)).size).toBe(APPS_DU_PARC.length);
  });

  it("n'a que des origines https sans chemin, requête, fragment ni identifiant, sur hubperso.com ou un sous-domaine", () => {
    for (const { adresse } of APPS_DU_PARC) {
      const url = new URL(adresse);
      expect(url.protocol, adresse).toBe("https:");
      expect(url.origin, adresse).toBe(adresse);
      expect(url.pathname, adresse).toBe("/");
      expect(url.search + url.hash, adresse).toBe("");
      expect(url.username + url.password, adresse).toBe("");
      expect(url.port, adresse).toBe("");
      expect(url.hostname === "hubperso.com" || url.hostname.endsWith(".hubperso.com"), adresse).toBe(true);
    }
  });

  it("est gelée", () => {
    expect(Object.isFrozen(APPS_DU_PARC)).toBe(true);
    for (const app of APPS_DU_PARC) expect(Object.isFrozen(app), app.id).toBe(true);
  });
});

describe("autresApps : toutes les destinations sauf l'app courante", () => {
  it("rend 6 entrées sans carai, dans l'ordre de la liste", () => {
    expect(autresApps("carai").map((a) => a.id)).toEqual(["hub", "financeai", "driveai", "batchchef", "jobai", "memoryai"]);
  });

  it("LÈVE une erreur sur un id inconnu", () => {
    expect(() => autresApps("inconnue" as never)).toThrow(/inconnue/);
    expect(() => autresApps("" as never)).toThrow();
  });
});
