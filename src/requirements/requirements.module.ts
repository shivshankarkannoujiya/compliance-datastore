import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RequirementsService } from './requirements.service';

@Module({
  imports: [PrismaModule],
  providers: [RequirementsService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
