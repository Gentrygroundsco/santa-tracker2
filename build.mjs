import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/client/main.js'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'public/build/app.js',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  await (await context(options)).watch();
} else {
  await build(options);
}
