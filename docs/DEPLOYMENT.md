# Deployment record

2026-09-14.

- GitHub repository: `benjamintd/open-landmarks` (private), containing this curated project at its root.
- Vercel project: `benjamin-td/open-landmarks`.
- GitHub integration connected; production branch: `main`.
- Custom hostname: https://open-landmarks.benmaps.fr.
- Public fallback: https://open-landmarks-xi.vercel.app.
- Preview catalogue: `/api/v1/collections/paris/preview.json` (30 drafts, including the Louvre Pyramid and the Colonne de Juillet).
- Approved catalogue: `/api/v1/collections/paris/latest.json` (0 approved).
- Original scene generation and photograph caches are excluded. Public source scenes contain no local user paths, embedded scripts, image textures or linked libraries.

For updates, run `npm ci`, `npm test` and `npm run snapshot`, then commit collection changes and retained releases and push to `main`. GitHub Actions validates the collection; the connected Vercel project deploys automatically. Vercel uses the repository root, `npm ci`, `npm run build` and output directory `build/` from `vercel.json`.

The project directory contains ignored local Vercel metadata and an environment file. These are excluded from Git and deployments.
