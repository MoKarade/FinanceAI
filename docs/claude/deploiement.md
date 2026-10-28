<!-- Extrait de CLAUDE.md, déplacé le 2026-09-26 (texte copié à l'identique, rien supprimé). Index : CLAUDE.md -->

## 6. Après un merge : vérifier le DÉPLOIEMENT, pas seulement la CI

**CI verte ne veut pas dire « en ligne ».** Ce sont deux systèmes indépendants : la CI juge le
code, l'hébergeur construit et sert. Un merge peut passer le gate et ne jamais être déployé — la
branche reste verte, le site continue de servir l'ancien build, et rien n'est rouge nulle part.

Vécu le 31/07/2026 : quatre projets Vercel ont cessé de créer des déploiements pendant ~3 h.
DriveAI et JobAI ont rattrapé au push suivant ; Hubperso et BatchChef n'en ont pas eu — leur
commit d'en-têtes de sécurité est resté **cinq jours** en attente sans que personne ne le voie.

Donc, après un merge qui change ce qui est SERVI : vérifier qu'un déploiement de production a
bien été créé et qu'il est `READY`, puis **contrôler l'effet sur la réponse réelle** — un en-tête
se lit dans la réponse, il ne se déduit pas du fichier source. Ici, ça vise en particulier la
**CSP de `vercel.json`**, qui est **enforcée** (pas en `Report-Only`) : y ajouter un domaine à
`connect-src` sans vérifier la réponse revient à couper l'app d'une API en silence, et un `fetch`
bloqué par CSP ne casse ni le build ni les tests.

Corollaire : un merge qui ne change QUE de la doc n'a pas de déploiement à vérifier. Le dire
plutôt que de laisser croire qu'on a vérifié.

⚠️ **Et la seconde moitié (« contrôler l'effet sur la RÉPONSE réelle ») n'est PAS mesurable depuis ce
conteneur** — mesuré le 2026-09-14, à ne pas retenter à l'aveugle :

| hôte | verdict |
|---|---|
| `api.github.com` | **200** (autorisé) |
| `finance.hubperso.com` | **403 au CONNECT** (refus de POLITIQUE du proxy, pas un DNS) |
| `hubperso.com` | 403 au CONNECT |
| `vercel.com` | 403 au CONNECT |

L'URL `*.vercel.app` du déploiement ne sauve pas la mise : elle est derrière la **protection
Vercel** et rend un `302` vers `vercel.com/sso-api` (vérifié par `web_fetch_vercel_url`, qui existe
exactement pour ce cas et bute quand même sur le SSO).

**Ce qui RESTE vérifiable, et c'est la moitié pour laquelle §6 a été écrite** : qu'un déploiement de
production ait bien été **CRÉÉ** et soit `READY` sur le bon SHA (`mcp__Vercel__list_deployments`) —
l'incident du 31/07/2026 était l'ABSENCE de déploiement, pas un contenu faux. Donc : vérifier la
création + l'état, **dire** que la réponse servie n'a pas pu l'être et pourquoi, et router à Marc
tout contrôle qui exige de LIRE la réponse (un en-tête CSP, notamment — lui seul peut le faire depuis
son navigateur).

