# 7715-testbed
Test out 7715 permissions with MetaMask Flask

## Run locally

```bash
npm install
npm run dev
```

## Deploy on GitHub Pages

This repo includes `.github/workflows/deploy-pages.yml` to deploy the Vite app to GitHub Pages on every push to `main`.

One-time setup in GitHub:

1. Open repo **Settings** -> **Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually from **Actions**).

Your site URL will be:

`https://1shot-api.github.io/7715-testbed/`

## Future custom domain setup

When you are ready to move to a custom domain, add these **Repository Variables** in GitHub:

- `PAGES_BASE_PATH` = `/`
- `CUSTOM_DOMAIN` = `your-domain.com`

How to add them:

1. Open **Settings** -> **Secrets and variables** -> **Actions** -> **Variables**.
2. Create `PAGES_BASE_PATH` and `CUSTOM_DOMAIN`.
3. Re-run the deploy workflow (or push to `main`).

Notes:

- If `PAGES_BASE_PATH` is not set, the app automatically uses `/<repo-name>/`.
- If `CUSTOM_DOMAIN` is set, the workflow writes a `dist/CNAME` file for GitHub Pages.
