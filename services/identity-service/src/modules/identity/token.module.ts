import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { TokenService } from "./token.service";

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: "jwt"
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          issuer: configService.getOrThrow<string>("JWT_ISSUER"),
          audience: configService.getOrThrow<string>("JWT_AUDIENCE"),
          expiresIn: configService.getOrThrow<string>("JWT_EXPIRES_IN")
        }
      })
    })
  ],
  providers: [TokenService],
  exports: [TokenService, JwtModule, PassportModule]
})
export class TokenModule {}
