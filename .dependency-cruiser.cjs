/**
 * Architecture rules. The compliance rules and scoring code is pure policy: it must stay free of
 * NestJS, persistence, transport and any other module, so it can be tested and reused on its own.
 */
const PURE = '^src/(compliance-rules|scoring|shared)/';

module.exports = {
  forbidden: [
    {
      name: 'pure-domain-no-framework',
      severity: 'error',
      comment: 'Rules and scoring must not import NestJS, an ORM, HTTP or other runtime libraries.',
      from: { path: PURE },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-peer', 'npm-optional', 'core'] },
    },
    {
      name: 'pure-domain-no-nest-layer',
      severity: 'error',
      comment: 'Rules and scoring must not depend on the Nest module that wraps them.',
      from: { path: PURE },
      to: { path: '^src/compliance-scoring/' },
    },
    {
      name: 'rules-do-not-depend-on-scoring',
      severity: 'error',
      comment: 'Scoring builds on rules, never the reverse.',
      from: { path: '^src/compliance-rules/' },
      to: { path: '^src/scoring/' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.spec\\.ts$' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
