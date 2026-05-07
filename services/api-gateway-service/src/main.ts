import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { requestHeaders } from "@lemnixpro/shared-contracts";
import {
  createStructuredLogger,
  installRequestContextMiddleware
} from "@lemnixpro/shared-utils";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const serviceName = configService.getOrThrow<string>("SERVICE_NAME");
  const logLevel = configService.get<string>("LOG_LEVEL", "log");
  const nodeEnv = configService.get<string>("NODE_ENV", "development");
  const enableSwagger = configService.get<boolean>(
    "ENABLE_SWAGGER",
    nodeEnv !== "production"
  );
  const port = configService.get<number>("PORT", 3001);

  app.useLogger(createStructuredLogger({ serviceName, minimumLevel: logLevel }));
  installRequestContextMiddleware(app, {
    requestIdHeader: requestHeaders.requestId,
    correlationIdHeader: requestHeaders.correlationId,
    serviceName
  });

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(serviceName)
      .setDescription(
        "API gateway for authentication and upstream service access."
      )
      .setVersion("0.1.0")
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(port);
}

void bootstrap();
