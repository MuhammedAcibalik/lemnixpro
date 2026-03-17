import argon2 from "argon2";
import { Injectable } from "@nestjs/common";

const ARGON2_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32
} as const;

@Injectable()
export class PasswordHasherService {
  async hash(value: string): Promise<string> {
    return argon2.hash(value, ARGON2_HASH_OPTIONS);
  }

  async verify(passwordHash: string, plainTextPassword: string): Promise<boolean> {
    return argon2.verify(passwordHash, plainTextPassword);
  }
}
