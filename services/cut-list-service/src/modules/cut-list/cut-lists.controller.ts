import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post
} from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags
} from "@nestjs/swagger";

import type {
  CutListSnapshotDetail,
  CutListSnapshotSummary
} from "@lemnixpro/shared-contracts";

import { CutListsService } from "./cut-lists.service";

@ApiTags("cut-lists")
@Controller("cut-lists")
export class CutListsController {
  constructor(
    @Inject(CutListsService)
    private readonly cutListsService: CutListsService
  ) {}

  @Post("weeks/:weekNumber/snapshots")
  @HttpCode(201)
  @ApiOperation({ summary: "Aktif haftadan kesim listesi snapshot üretir." })
  @ApiCreatedResponse({ description: "Kesim listesi snapshot üretildi." })
  async createSnapshot(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsService.createSnapshot(weekNumber);
  }

  @Get()
  @ApiOperation({ summary: "Kesim listesi snapshot listesini döndürür." })
  @ApiOkResponse({ description: "Kesim listesi snapshot listesi döndürüldü." })
  async findAll(): Promise<CutListSnapshotSummary[]> {
    return this.cutListsService.findAll();
  }

  @Get("weeks/:weekNumber/latest")
  @ApiOperation({ summary: "Haftanın son kesim listesi snapshot detayını döndürür." })
  @ApiOkResponse({ description: "Kesim listesi snapshot detayı döndürüldü." })
  @ApiNotFoundResponse({ description: "Hafta için snapshot bulunamadı." })
  async findLatestByWeekNumber(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsService.findLatestByWeekNumber(weekNumber);
  }

  @Get("years/:planYear/weeks/:weekNumber/latest")
  @ApiOperation({ summary: "Yıl ve haftanın son kesim listesi snapshot detayını döndürür." })
  @ApiOkResponse({ description: "Kesim listesi snapshot detayı döndürüldü." })
  @ApiNotFoundResponse({ description: "Yıl/hafta için snapshot bulunamadı." })
  async findLatestByPlanYearAndWeekNumber(
    @Param("planYear", ParseIntPipe) planYear: number,
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsService.findLatestByPlanYearAndWeekNumber(
      planYear,
      weekNumber
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Kesim listesi snapshot detayını döndürür." })
  @ApiOkResponse({ description: "Kesim listesi snapshot detayı döndürüldü." })
  @ApiNotFoundResponse({ description: "Snapshot bulunamadı." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsService.findById(id);
  }
}
