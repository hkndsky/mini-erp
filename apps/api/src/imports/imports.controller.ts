import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportBatch } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types';
import { PaginationQueryDto, pageMeta, toPaging, Paginated } from '../common/pagination';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('csv')
  @Roles('ADMIN', 'WAREHOUSE')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importCsv(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportBatch> {
    if (!file) {
      throw new BadRequestException('No file uploaded (expected multipart field "file")');
    }
    return this.imports.runImport('CSV', { fileBuffer: file.buffer, actor: user.email });
  }

  @Post('partner')
  @Roles('ADMIN', 'WAREHOUSE')
  importPartner(@CurrentUser() user: AuthenticatedUser): Promise<ImportBatch> {
    return this.imports.runImport('PARTNER_API', { actor: user.email });
  }

  @Post('legacy')
  @Roles('ADMIN', 'WAREHOUSE')
  importLegacy(@CurrentUser() user: AuthenticatedUser): Promise<ImportBatch> {
    return this.imports.runImport('LEGACY', { actor: user.email });
  }

  @Get()
  async list(@Query() query: PaginationQueryDto): Promise<Paginated<ImportBatch>> {
    const { page, pageSize } = toPaging(query);
    const { data, total } = await this.imports.list(page, pageSize);
    return { data, meta: pageMeta(page, pageSize, total) };
  }
}
