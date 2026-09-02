import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListConflictsQueryDto } from './dtos/list-conflicts.dto';
import { ResolveConflictDto } from './dtos/resolve-conflict.dto';
import { toPaging } from '../common/pagination';
import type { ConflictEntityType, ConflictStatus, SourceType } from '@prisma/client';
import { ORDER_STATUSES } from '@erp/shared';

@Injectable()
export class ConflictsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListConflictsQueryDto) {
    const { page, pageSize, skip, take } = toPaging(query);
    const where = {
      ...(query.status ? { status: query.status as ConflictStatus } : {}),
      ...(query.entityType ? { entityType: query.entityType as ConflictEntityType } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.reconciliationConflict.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.reconciliationConflict.count({ where }),
    ]);
    return { data, total };
  }

  get(id: string) {
    return this.prisma.reconciliationConflict.findUnique({ where: { id } });
  }

  async resolve(
    id: string,
    dto: ResolveConflictDto,
    actor: string,
  ) {
    const conflict = await this.prisma.reconciliationConflict.findUnique({
      where: { id },
    });
    if (!conflict) throw new NotFoundException('Conflict not found');
    if (conflict.status !== 'OPEN') {
      throw new ConflictException(
        `Conflict is already ${conflict.status} - it cannot be resolved again`,
      );
    }

    let appliedDescription: string | null = null;

    if (dto.resolution === 'APPLY_INCOMING') {
      appliedDescription = await this.applyIncoming(conflict, actor);
    }

    const updated = await this.prisma.reconciliationConflict.update({
      where: { id },
      data: {
        status: dto.resolution === 'APPLY_INCOMING' ? 'RESOLVED_APPLIED' : 'RESOLVED_DISCARDED',
        resolvedBy: actor,
        resolvedAt: new Date(),
        resolution: dto.note,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actor,
        action: 'CONFLICT_RESOLVED',
        entityType: conflict.entityType,
        entityId: conflict.entityKey,
        source: conflict.source,
        batchId: conflict.batchId,
        details: {
          conflictId: conflict.id,
          resolution: dto.resolution,
          note: dto.note ?? null,
          applied: appliedDescription,
        },
      },
    });

    return updated;
  }

  private async applyIncoming(
    conflict: {
      id: string;
      entityType: ConflictEntityType;
      entityKey: string;
      field: string;
      incomingValue: string | null;
    },
    actor: string,
  ): Promise<string> {
    if (conflict.entityType === 'INVENTORY') {
      const product = await this.prisma.product.findUnique({
        where: { sku: conflict.entityKey },
        include: { stock: true },
      });
      if (!product || !conflict.incomingValue) {
        throw new BadRequestException(
          'Cannot apply: product or incoming value no longer exists',
        );
      }
      const value = conflict.incomingValue;
      if (conflict.field === 'quantityOnHand') {
        await this.prisma.stockItem.update({
          where: { productId: product.id },
          data: { quantityOnHand: Math.trunc(Number(value)) },
        });
        return `quantityOnHand set to ${value} for ${conflict.entityKey}`;
      }
      if (conflict.field === 'unitCost') {
        await this.prisma.product.update({
          where: { id: product.id },
          data: { unitCost: Number(value) },
        });
        return `unitCost set to ${value} for ${conflict.entityKey}`;
      }
      if (conflict.field === 'name') {
        await this.prisma.product.update({
          where: { id: product.id },
          data: { name: value },
        });
        return `name set to ${value} for ${conflict.entityKey}`;
      }
      if (conflict.field === 'location') {
        await this.prisma.stockItem.update({
          where: { productId: product.id },
          data: { location: value },
        });
        return `location set to ${value} for ${conflict.entityKey}`;
      }
      throw new BadRequestException(`Unknown inventory field: ${conflict.field}`);
    }

    // ORDER entity
    const order = await this.prisma.order.findUnique({
      where: { number: conflict.entityKey },
    });
    if (!order || !conflict.incomingValue) {
      throw new BadRequestException('Cannot apply: order no longer exists');
    }
    if (!ORDER_STATUSES.includes(conflict.incomingValue as (typeof ORDER_STATUSES)[number])) {
      throw new BadRequestException(`Invalid order status: ${conflict.incomingValue}`);
    }
    await this.prisma.order.update({
      where: { id: order.id },
      data: { status: conflict.incomingValue as typeof order.status },
    });
    return `order ${conflict.entityKey} status set to ${conflict.incomingValue}`;
  }
}
