import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { json, urlencoded } from "express";

import { requestHeaders } from "@lemnixpro/shared-contracts";
import {
  createStructuredLogger,
  installInternalServiceAuthMiddleware,
  installRequestContextMiddleware
} from "@lemnixpro/shared-utils";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false
  });

  const configService = app.get(ConfigService);
  const bodyLimit = configService.get<string>("HTTP_JSON_BODY_LIMIT", "50mb");
  app.use(json({ limit: bodyLimit }));
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  app.enableShutdownHooks();

  const serviceName = configService.getOrThrow<string>("SERVICE_NAME");
  const logLevel = configService.get<string>("LOG_LEVEL", "log");
  const nodeEnv = configService.get<string>("NODE_ENV", "development");
  const enableSwagger = configService.get<boolean>(
    "ENABLE_SWAGGER",
    nodeEnv !== "production"
  );
  const internalServiceAuthSecret = configService.get<string>(
    "INTERNAL_SERVICE_AUTH_SECRET"
  );
  const port = configService.get<number>("PORT", 3007);

  app.useLogger(createStructuredLogger({ serviceName, minimumLevel: logLevel }));
  installRequestContextMiddleware(app, {
    requestIdHeader: requestHeaders.requestId,
    correlationIdHeader: requestHeaders.correlationId,
    serviceName
  });
  installInternalServiceAuthMiddleware(app, {
    enabled: nodeEnv === "production" || Boolean(internalServiceAuthSecret),
    serviceName,
    tokenHeader: requestHeaders.internalServiceToken,
    ...(internalServiceAuthSecret
      ? { expectedToken: internalServiceAuthSecret }
      : {}),
    publicPaths: ["/health/live", "/health/ready"]
  });

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle(serviceName)
      .setDescription("Result boundary for LemnixPRO.")
      .setVersion("0.1.0")
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }

  await app.listen(port);
}

void bootstrap();
