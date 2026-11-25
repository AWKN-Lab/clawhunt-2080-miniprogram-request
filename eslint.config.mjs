import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'scripts'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.d.ts'],
    rules: {
      // 环境声明文件里全局 wx 只能用 `var` 声明（declare global 语法要求）。
      'no-var': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
