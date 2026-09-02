import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPaging } from '../common/pagination';
import { CreateSupplierDto, UpdateSupplierDto } from './dtos/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(page: number, pageSize: number) {
    const { skip, take } = { skip: (page - 1) * pageSize, take: pageSize };
    return Promise.all([
      this.prisma.supplier.findMany({
        orderBy: { code: 'asc' },
        skip,
        take,
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.supplier.count(),
    ]);
  }

  get(id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
  }

  async create(dto: CreateSupplierDto) {
    const code = dto.code.trim().toUpperCase();
    try {
      return await this.prisma.supplier.create({
        data: {
          code,
          name: dto.name,
          contactEmail: dto.contactEmail,
          phone: dto.phone,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Supplier ${code} already exists`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supplier not found');
    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.contactEmail !== undefined ? { contactEmail: dto.contactEmail } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Supplier not found');
    await this.prisma.supplier.delete({ where: { id } });
    return { deleted: true };
  }
}
