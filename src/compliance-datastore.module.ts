import { Module } from '@nestjs/common';
import { CatalogueModule } from './catalogue/catalogue.module';
import { EvidenceModule } from './evidence/evidence.module';
import { PublishingModule } from './publishing/publishing.module';
import { RequirementsModule } from './requirements/requirements.module';
import { SubjectsModule } from './subjects/subjects.module';

/** Everything the compliance data store offers; import this into the host application. */
@Module({
  imports: [SubjectsModule, CatalogueModule, RequirementsModule, EvidenceModule, PublishingModule],
  exports: [SubjectsModule, CatalogueModule, RequirementsModule, EvidenceModule, PublishingModule],
})
export class ComplianceDatastoreModule {}
