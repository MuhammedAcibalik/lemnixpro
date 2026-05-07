import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";

import type {
  FacilityStatus,
  UpdateFacilityRequest
} from "@lemnixpro/shared-contracts";

import type { FacilityRecord } from "../../infrastructure/db/schema";

import { FacilityResponseDto } from "./dto/facility-response.dto";
import type { CreateFacilityRequestDto } from "./dto/create-facility-request.dto";
import type { UpdateFacilityRequestDto } from "./dto/update-facility-request.dto";
import {
  FacilitiesRepository,
  type CreateFacilityRecord,
  type UpdateFacilityRecord
} from "./facilities.repository";

const FACILITY_CODE_MAX_LENGTH = 64;
const FACILITY_NAME_MAX_LENGTH = 200;
const FACILITY_CODE_UNIQUE = "facility_facilities_code_unique";

type DatabaseErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

@Injectable()
export class FacilitiesService {
  constructor(
    @Inject(FacilitiesRepository)
    private readonly facilitiesRepository: FacilitiesRepository
  ) {}

  async create(
    request: CreateFacilityRequestDto
  ): Promise<FacilityResponseDto> {
    const createInput = this.toCreateRecord(request);

    await this.ensureCodeAvailable(createInput.code);

    try {
      const createdFacility =
        await this.facilitiesRepository.create(createInput);

      return this.toResponse(createdFacility);
    } catch (error) {
      this.rethrowDuplicateFacilityCode(error, createInput.code);
      throw error;
    }
  }

  async findAll(): Promise<FacilityResponseDto[]> {
    const facilities = await this.facilitiesRepository.findAll();

    return facilities.map((facility) => this.toResponse(facility));
  }

  async findById(id: string): Promise<FacilityResponseDto> {
    return this.toResponse(await this.getFacilityOrThrow(id));
  }

  async update(
    id: string,
    request: UpdateFacilityRequestDto
  ): Promise<FacilityResponseDto> {
    const existingFacility = await this.getFacilityOrThrow(id);
    const updateInput = this.toUpdateRecord(request);

    if (Object.keys(updateInput).length === 0) {
      throw new BadRequestException(
        "At least one facility field must be provided for update."
      );
    }

    if (
      updateInput.code !== undefined &&
      updateInput.code !== existingFacility.code
    ) {
      const conflictingFacility =
        await this.facilitiesRepository.findByCode(updateInput.code);

      if (conflictingFacility && conflictingFacility.id !== id) {
        throw new ConflictException(
          `Facility code "${updateInput.code}" is already in use.`
        );
      }
    }

    try {
      const updatedFacility = await this.facilitiesRepository.update(
        id,
        updateInput
      );

      if (!updatedFacility) {
        throw new NotFoundException(`Facility "${id}" was not found.`);
      }

      return this.toResponse(updatedFacility);
    } catch (error) {
      this.rethrowDuplicateFacilityCode(error, updateInput.code);
      throw error;
    }
  }

  async activate(id: string): Promise<FacilityResponseDto> {
    return this.setStatus(id, "active");
  }

  async deactivate(id: string): Promise<FacilityResponseDto> {
    return this.setStatus(id, "inactive");
  }

  private async setStatus(
    id: string,
    status: FacilityStatus
  ): Promise<FacilityResponseDto> {
    const existingFacility = await this.getFacilityOrThrow(id);

    if (existingFacility.status === status) {
      return this.toResponse(existingFacility);
    }

    const updatedFacility = await this.facilitiesRepository.update(id, {
      status
    });

    if (!updatedFacility) {
      throw new NotFoundException(`Facility "${id}" was not found.`);
    }

    return this.toResponse(updatedFacility);
  }

  private toCreateRecord(
    request: CreateFacilityRequestDto
  ): CreateFacilityRecord {
    return {
      code: this.normalizeRequiredText(request.code, "code", {
        maxLength: FACILITY_CODE_MAX_LENGTH,
        uppercase: true
      }),
      name: this.normalizeRequiredText(request.name, "name", {
        maxLength: FACILITY_NAME_MAX_LENGTH
      }),
      status: this.normalizeStatus(request.status) ?? "active"
    };
  }

  private toUpdateRecord(
    request: UpdateFacilityRequest
  ): UpdateFacilityRecord {
    const updateInput: UpdateFacilityRecord = {};

    if (request.code !== undefined) {
      updateInput.code = this.normalizeRequiredText(request.code, "code", {
        maxLength: FACILITY_CODE_MAX_LENGTH,
        uppercase: true
      });
    }

    if (request.name !== undefined) {
      updateInput.name = this.normalizeRequiredText(request.name, "name", {
        maxLength: FACILITY_NAME_MAX_LENGTH
      });
    }

    if (request.status !== undefined) {
      const normalizedStatus = this.normalizeStatus(request.status);

      if (normalizedStatus !== undefined) {
        updateInput.status = normalizedStatus;
      }
    }

    return updateInput;
  }

  private normalizeStatus(value: unknown): FacilityStatus | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === "active" || value === "inactive") {
      return value;
    }

    throw new BadRequestException("status must be active or inactive.");
  }

  private normalizeRequiredText(
    value: unknown,
    fieldName: string,
    options: {
      maxLength: number;
      uppercase?: boolean;
    }
  ): string {
    if (typeof value !== "string") {
      throw new BadRequestException(`${fieldName} must be a string.`);
    }

    const normalizedValue = value.trim();

    if (normalizedValue.length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    if (normalizedValue.length > options.maxLength) {
      throw new BadRequestException(
        `${fieldName} must be at most ${options.maxLength} characters.`
      );
    }

    return options.uppercase ? normalizedValue.toUpperCase() : normalizedValue;
  }

  private async getFacilityOrThrow(id: string): Promise<FacilityRecord> {
    const facility = await this.facilitiesRepository.findById(id);

    if (!facility) {
      throw new NotFoundException(`Facility "${id}" was not found.`);
    }

    return facility;
  }

  private async ensureCodeAvailable(code: string): Promise<void> {
    const existingFacility = await this.facilitiesRepository.findByCode(code);

    if (existingFacility) {
      throw new ConflictException(`Facility code "${code}" is already in use.`);
    }
  }

  private rethrowDuplicateFacilityCode(
    error: unknown,
    code: string | undefined
  ): void {
    const databaseError = error as DatabaseErrorLike | undefined;

    if (
      databaseError?.code === "23505" &&
      databaseError?.constraint === FACILITY_CODE_UNIQUE
    ) {
      throw new ConflictException(
        `Facility code "${code ?? "unknown"}" is already in use.`
      );
    }
  }

  private toResponse(facility: FacilityRecord): FacilityResponseDto {
    return {
      id: facility.id,
      code: facility.code,
      name: facility.name,
      status: facility.status,
      createdAt: facility.createdAt,
      updatedAt: facility.updatedAt
    };
  }
}
