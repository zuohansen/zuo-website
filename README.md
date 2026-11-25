# Zuo Property Management website

The website for Zuo Property Management, a repair-first property manager for owners of single-family rentals and
multi-family rentals with up to four units.

Live site: https://zuopropertymanagement.com

The whole site is one file, `index.html`, with four pages: Home, About us, Pricing and Contact. The page needs no build
step. Cloudflare serves it, and `worker/index.js` receives the contact form and saves each lead (see `wrangler.jsonc` and `schema.sql`).

Every push to `main` deploys the site to Cloudflare. This repository is published from another repository, so changes made here directly will be overwritten.
