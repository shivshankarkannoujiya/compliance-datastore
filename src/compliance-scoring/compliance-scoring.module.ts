import { Inject, Injectable, Module, type DynamicModule } from '@nestjs/common';
import { EXCEL_PARITY_POLICY, type CompliancePolicy } from '../compliance-rules';
import { scoreCompliance, type ScoreInput, type ScoreResult } from '../scoring';

export const COMPLIANCE_POLICY = Symbol('COMPLIANCE_POLICY');

/** Application entry point to the pure rules and scoring code. Persistence and transport stay outside. */
@Injectable()
export class ComplianceScoringService {
  constructor(@Inject(COMPLIANCE_POLICY) private readonly policy: CompliancePolicy) {}

  get policyVersion(): string {
    return this.policy.version;
  }

  score(input: ScoreInput): ScoreResult {
    return scoreCompliance(input, this.policy);
  }
}

export interface ComplianceScoringOptions {
  policy?: CompliancePolicy;
}

@Module({
  providers: [{ provide: COMPLIANCE_POLICY, useValue: EXCEL_PARITY_POLICY }, ComplianceScoringService],
  exports: [ComplianceScoringService],
})
export class ComplianceScoringModule {
  /** Import with a specific policy version; plain imports use EXCEL_PARITY_POLICY. */
  static forRoot(options: ComplianceScoringOptions = {}): DynamicModule {
    return {
      module: ComplianceScoringModule,
      providers: [{ provide: COMPLIANCE_POLICY, useValue: options.policy ?? EXCEL_PARITY_POLICY }, ComplianceScoringService],
      exports: [ComplianceScoringService],
    };
  }
}
