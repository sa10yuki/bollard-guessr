import { defineConfig } from 'vite';

// Relative asset paths, so the build works under a sub-path such as
// https://<user>.github.io/bollard-guessr/.
export default defineConfig({
  base: './',
});
