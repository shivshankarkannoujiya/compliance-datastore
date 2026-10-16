import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EvidenceService } from './evidence.service';

@Module({
  imports: [PrismaModule],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
