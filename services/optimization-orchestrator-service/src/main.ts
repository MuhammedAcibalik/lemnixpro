import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

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
  const port = configService.get<number>("PORT", 3006);

  const swaggerConfig = new DocumentBuilder()
    .setTitle(serviceName)
    .setDescription("Optimization orchestration boundary scaffold for LemnixPRO.")
    .setVersion("0.1.0")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen(port);
}

void bootstrap();
