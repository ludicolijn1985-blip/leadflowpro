export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  transform: {},
  collectCoverageFrom: ["controllers/**/*.js", "middleware/**/*.js", "routes/**/*.js"],
  coveragePathIgnorePatterns: ["/node_modules/"],
  verbose: false
};
