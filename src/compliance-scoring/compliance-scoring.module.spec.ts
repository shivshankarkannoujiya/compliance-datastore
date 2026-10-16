import { Test } from '@nestjs/testing';
import { entry, record, requirement } from '../../test/fixtures';
import { EXCEL_PARITY_POLICY, type CompliancePolicy } from '../compliance-rules';
import { ComplianceScoringModule, ComplianceScoringService } from './compliance-scoring.module';

const input = {
  asOf: '2026-10-16',
  catalogue: [entry({ complianceType: 'DBS' })],
  requirements: [requirement('a', 'DBS')],
  records: [record({ subjectId: 'a', complianceType: 'DBS', dueDate: null })],
};

describe('ComplianceScoringModule', () => {
  it('uses the Excel parity policy by default', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ComplianceScoringModule] }).compile();
    const service = moduleRef.get(ComplianceScoringService);
    expect(service.policyVersion).toBe('excel-parity-1');
    expect(service.score(input).requirements[0]!.compliant).toBe(true);
  });

  it('accepts a different policy version', async () => {
    const strict: CompliancePolicy = {
      ...EXCEL_PARITY_POLICY,
      version: 'strict-1',
      rules: { ...EXCEL_PARITY_POLICY.rules, dueDate: { blankDueDateCompliant: false } },
    };
    const moduleRef = await Test.createTestingModule({ imports: [ComplianceScoringModule.forRoot({ policy: strict })] }).compile();
    const service = moduleRef.get(ComplianceScoringService);
    expect(service.score(input)).toMatchObject({ policyVersion: 'strict-1', requirements: [{ compliant: false }] });
  });
});
