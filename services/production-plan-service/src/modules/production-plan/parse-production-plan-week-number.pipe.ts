import {
  BadRequestException,
  Injectable,
  PipeTransform
} from "@nestjs/common";

@Injectable()
export class ParseProductionPlanWeekNumberPipe
  implements PipeTransform<string, number>
{
  transform(value: string): number {
    if (!/^\d+$/.test(value)) {
      throw new BadRequestException(
        "weekNumber must be a positive integer."
      );
    }

    const weekNumber = Number(value);

    if (!Number.isInteger(weekNumber) || weekNumber <= 0) {
      throw new BadRequestException(
        "weekNumber must be a positive integer."
      );
    }

    return weekNumber;
  }
}
