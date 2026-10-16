import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CatalogueService } from './catalogue.service';

@Module({
  imports: [PrismaModule],
  providers: [CatalogueService],
  exports: [CatalogueService],
})
export class CatalogueModule {}
