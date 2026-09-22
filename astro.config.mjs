// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://bdmnsa.com',
  // Pages are prerendered by default; staff pages and the events pages opt out with `prerender = false`.
  output: 'static',
  adapter: cloudflare({
    // 'passthrough' = no Cloudflare Images binding. Images is a paid product; we resize in the browser instead.
    imageService: 'passthrough',
  }),
  // Our own signed-cookie sessions (src/lib/session.ts). Astro's KV sessions would cost KV writes for nothing.
  session: false,
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
});
