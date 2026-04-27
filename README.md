# Cube Coach

Cube Coach is a static Rubik's cube helper that lets people enter the current sticker colors of a 3x3 cube, then follow an animated solve with autoplay and one-step-at-a-time controls.

## Run locally

Open [index.html](./index.html) in a browser.

## Deploy on GitHub Pages

This repository is already configured for GitHub Pages through GitHub Actions.

1. Create a new GitHub repository.
2. Push this folder to the `main` branch.
3. In GitHub, open `Settings` -> `Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Push to `main` again if the workflow has not already started.

The workflow in `.github/workflows/deploy-pages.yml` will publish the app automatically.

## Solver dependency

The app ships with a local copy of the solver under `vendor/cubejs`, so GitHub Pages does not depend on any external script CDN.

## Files used in production

- `index.html`
- `style.css`
- `app.js`
- `vendor/cubejs`
