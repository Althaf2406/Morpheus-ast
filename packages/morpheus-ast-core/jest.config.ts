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
        types: ["node", "jest"],
        // Tests are allowed unused locals — they use helper arbitraries
        // and stub variables for readability, not for tree-shaking.
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    }],
  },
  // Map *.js extension imports (used in src/ ESM-style) to their *.ts sources
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};

export default config;
