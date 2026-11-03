import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication, ValidationPipe } from '@nestjs/common';

function addDocs(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Arogyam Integrations')
    .setDescription('Integration for Arogyam FHIR')
    .setVersion('1.0')
    .build();

  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  // app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('/api');
  const port = process.env.PORT || 300;
  app.enableCors();
  addDocs(app);
  await app.listen(port);

  console.log(`Using FHIR server ${process.env.FHIR_BASE_URL}`);
}

void bootstrap();
