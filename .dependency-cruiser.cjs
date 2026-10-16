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
      name: 'pure-domain-stays-pure',
      severity: 'error',
      comment: 'Rules and scoring may only import each other and shared helpers, never the Nest or storage modules.',
      from: { path: PURE },
      to: { path: '^src/', pathNot: PURE },
    },
    {
      name: 'storage-modules-do-not-depend-on-publishing',
      severity: 'error',
      comment: 'Publishing reads the other modules through their services; they never call back into it.',
      from: { path: '^src/(subjects|catalogue|requirements|evidence)/' },
      to: { path: '^src/publishing/' },
    },
    {
      name: 'storage-modules-independent',
      severity: 'error',
      comment: 'Subjects, catalogue, requirements and evidence each own their tables and do not import each other.',
      from: { path: '^src/(subjects|catalogue|requirements|evidence)/' },
      to: { path: '^src/(subjects|catalogue|requirements|evidence)/', pathNot: '^src/$1/' },
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
