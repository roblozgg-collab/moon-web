import { copyFile, access } from "node:fs/promises";
import { constants } from "node:fs";

try {
  await access("out/index.html", constants.R_OK);
  await copyFile("out/index.html", "out/404.html");
  console.log("Moon Pages fallback: out/404.html created from index.html");
} catch (error) {
  console.error("Moon Pages fallback failed:", error);
  process.exitCode = 1;
}
