import { Module } from '@nestjs/common';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { ComplianceScoringModule } from '../compliance-scoring/compliance-scoring.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RequirementsModule } from '../requirements/requirements.module';
import { PublishingService } from './publishing.service';

@Module({
  imports: [PrismaModule, CatalogueModule, RequirementsModule, EvidenceModule, ComplianceScoringModule],
  providers: [PublishingService],
  exports: [PublishingService],
})
export class PublishingModule {}
