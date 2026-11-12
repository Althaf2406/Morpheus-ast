import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", {
      tsconfig: {
        strict: true,
        esModuleInterop: true,
        moduleResolution: "node",
        target: "ES2022",
      },
    }],
  },
  // Map *.js imports (used in src/) to their *.ts sources for testing
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  extensionsToTreatAsEsm: [],
  testPathPattern: "tests/",
};

export default config;
