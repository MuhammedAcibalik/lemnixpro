import { Controller, Get, HttpCode, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
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

import { CutListsClient } from "../../infrastructure/http/cut-lists.client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("cut-lists")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("cut-lists")
export class CutListsController {
  constructor(
    @Inject(CutListsClient)
    private readonly cutListsClient: CutListsClient
  ) {}

  @Post("weeks/:weekNumber/snapshots")
  @HttpCode(201)
  @ApiOperation({ summary: "Proxy create for a weekly cut list snapshot." })
  @ApiCreatedResponse({ description: "Cut list snapshot created." })
  async createSnapshot(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsClient.createSnapshot(weekNumber);
  }

  @Get()
  @ApiOperation({ summary: "Proxy list for cut list snapshots." })
  @ApiOkResponse({ description: "Cut list snapshots returned." })
  async findAll(): Promise<CutListSnapshotSummary[]> {
    return this.cutListsClient.findAll();
  }

  @Get("weeks/:weekNumber/latest")
  @ApiOperation({ summary: "Proxy read for the latest weekly cut list snapshot." })
  @ApiOkResponse({ description: "Cut list snapshot returned." })
  @ApiNotFoundResponse({ description: "Cut list snapshot was not found." })
  async findLatestByWeekNumber(
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsClient.findLatestByWeekNumber(weekNumber);
  }

  @Get("years/:planYear/weeks/:weekNumber/latest")
  @ApiOperation({ summary: "Proxy read for the latest yearly weekly cut list snapshot." })
  @ApiOkResponse({ description: "Cut list snapshot returned." })
  @ApiNotFoundResponse({ description: "Cut list snapshot was not found." })
  async findLatestByPlanYearAndWeekNumber(
    @Param("planYear", ParseIntPipe) planYear: number,
    @Param("weekNumber", ParseIntPipe) weekNumber: number
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsClient.findLatestByPlanYearAndWeekNumber(
      planYear,
      weekNumber
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Proxy read for one cut list snapshot." })
  @ApiOkResponse({ description: "Cut list snapshot returned." })
  @ApiNotFoundResponse({ description: "Cut list snapshot was not found." })
  async findById(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string
  ): Promise<CutListSnapshotDetail> {
    return this.cutListsClient.findById(id);
  }
}
