import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import { execSync } from 'child_process';

let buildCommit = 'unknown';
try {
    buildCommit = execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8' }).trim();
} catch {
    // not a git repo or git not available
}

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    sourcemap: true,
    banner: `var __BUILD_COMMIT__ = "${buildCommit}";`,
  },
  plugins: [resolve(), typescript()],
};
