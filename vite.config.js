import { defineConfig } from 'vite';

// Ruta base para GitHub Pages (https://USUARIO.github.io/<repo>/).
// En GitHub Actions se toma el nombre real del repositorio (GitHub Pages
// distingue mayúsculas en la ruta); en local se usa '/megabrick/'.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'megabrick';

export default defineConfig({
  base: `/${repo}/`,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1000,
  },
  server: {
    open: false,
  },
});
