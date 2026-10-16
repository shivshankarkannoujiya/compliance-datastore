import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubjectsService } from './subjects.service';

@Module({
  imports: [PrismaModule],
  providers: [SubjectsService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
