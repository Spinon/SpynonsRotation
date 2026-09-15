import { build, readPins, run } from "./runner.mjs";
const command = process.argv[2];
if (command === "check") { const pins = readPins(); console.log(`Wowless pins OK: ${pins.commit}; Retail PENDING`); }
else if (command === "build") build();
else if (command === "run") run();
else throw new Error("Use check | build | run");
