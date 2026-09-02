import { defineConfig, Plugin } from 'vitest/config';
import * as ts from 'typescript';

/**
 * esbuild (vitest's default TS transform) does not support emitDecoratorMetadata,
 * so NestJS cannot resolve constructor-injected dependencies in tests. This
 * pre-plugin recompiles project TS with the TypeScript compiler using the same
 * decorator settings as the real build (see tsconfig.json).
 */
function tsDecoratorMetadata(): Plugin {
  return {
    name: 'ts-decorator-metadata',
    enforce: 'pre',
    async transform(code, id) {
      if (id.includes('node_modules')) return null;
      if (!id.endsWith('.ts') || id.endsWith('.d.ts')) return null;
      const result = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
          esModuleInterop: true,
        },
        fileName: id,
        reportDiagnostics: false,
      });
      return {
        code: result.outputText,
        map: result.outputSourceMap ? JSON.parse(result.outputSourceMap) : null,
      };
    },
  };
}

export default defineConfig({
  plugins: [tsDecoratorMetadata()],
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    globalSetup: 'test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      DATABASE_URL: 'postgresql://erp:erp_pass@127.0.0.1:5432/erp_test',
      JWT_SECRET: 'test-jwt-secret',
      SYNC_ENABLED: 'false',
      PARTNER_TIMEOUT_MS: '1500',
      PARTNER_RETRIES: '3',
      PORT: '4000',
    },
  },
});
