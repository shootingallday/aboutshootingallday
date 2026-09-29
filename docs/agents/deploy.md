# Deploy

The site deploys by hand to Cloudflare as the Worker `shootingallday`, static assets only, at
https://shootingallday.jomardippiton2005.workers.dev. Nothing deploys on push.

1. `pnpm build`.
2. In a fresh folder outside the repo: copy `dist` in, run `npm init -y`, `npm pkg set type=module`
   and `npm i -D wrangler cf`, then write `cloudflare.config.ts`:
   `import { defineConfig } from "cf/config"; export default defineConfig({ worker: { name: "shootingallday", compatibilityDate: "2026-09-25" } });`
   and `wrangler.config.ts`:
   `import { defineWranglerConfig } from "wrangler/experimental-config"; export default defineWranglerConfig({ assetsDirectory: "dist" });`
3. `npx cf auth whoami` (sign in with `npx cf auth login` if it fails), then `npx cf deploy`.
4. Prove it landed: the live page's title reads "shootingallday · futures trader who builds his own
   tools" and `/og.png` returns 200.

When shootingallday.com is bought, add it as a custom domain on the Worker and change the
`og:image` URL in `index.html` to it.
