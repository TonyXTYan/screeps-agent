import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { execSync } from 'child_process';

let buildCommit = 'unknown';
try {
    buildCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim().slice(0, 8);
} catch {
    // not a git repo or git not available
}
console.log(`[build] commit ${buildCommit}`);

export default {
  input: 'src/main.ts',
  output: {
    file: 'dist/main.js',
    format: 'cjs',
    sourcemap: true,
    banner: `var __BUILD_COMMIT__ = "${buildCommit}";`,
  },
  plugins: [resolve(), commonjs(), typescript()],
};
