// components/NavApps.tsx — l'onglet « Apps » : replié par défaut, il se déplie en un bouton par AUTRE app du parc.
// Un <details> natif (clavier et lecteur d'écran gratuits), zéro état, liens dans le même onglet. Aucune donnée financière.
import { autresApps, type AppId } from '../utils/appsDuParc';

export default function NavApps({ courant }: { courant: AppId }) {
  return (
    <details className="nav-apps">
      <summary className="nav-apps-onglet" aria-label="Apps du parc">
        Apps
      </summary>
      <nav className="nav-apps-panneau" aria-label="Autres apps du parc">
        {autresApps(courant).map((app) => (
          <a key={app.id} className="nav-apps-lien" href={app.adresse}>
            {app.nom}
          </a>
        ))}
      </nav>
    </details>
  );
}
