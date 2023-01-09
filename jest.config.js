module.exports = {
  preset: "ts-jest",
  globals: {
    "ts-jest": {
      tsconfig: "./tsconfig.json",
    },
  },
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  testMatch: ["**/+(*.)*(test).ts", "**/+(*.)*(test).tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx"],
  name: "task-cache",
  displayName: "task-cache"
}
