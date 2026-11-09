import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/client/entry.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  // The card scenes and the no-WebGL page load without the 3D code.
  splitting: true,
  outdir: 'public/build',
  chunkNames: 'chunks/[name]-[hash]',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  await (await context(options)).watch();
} else {
  await build(options);
}
