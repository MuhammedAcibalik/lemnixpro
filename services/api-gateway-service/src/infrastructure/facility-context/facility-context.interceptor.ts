import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor
} from "@nestjs/common";
import { Observable } from "rxjs";

import { FacilityContextService } from "./facility-context.service";
import { runWithGatewayFacilityContext } from "./gateway-facility-context.storage";

@Injectable()
export class FacilityContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(FacilityContextService)
    private readonly facilityContextService: FacilityContextService
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler
  ): Promise<Observable<unknown>> {
    const request =
      context
        .switchToHttp()
        .getRequest<
          Parameters<FacilityContextService["resolveForRequest"]>[0]
        >();
    const facilityContext =
      await this.facilityContextService.resolveForRequest(request);

    if (!facilityContext) {
      return next.handle();
    }

    return new Observable<unknown>((subscriber) =>
      runWithGatewayFacilityContext(facilityContext, () => {
        const subscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error: unknown) => subscriber.error(error),
          complete: () => subscriber.complete()
        });

        return () => subscription.unsubscribe();
      })
    );
  }
}
