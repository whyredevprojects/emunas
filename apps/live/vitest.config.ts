import base from "@emunas/config/vitest";
import { defineConfig, mergeConfig } from "vitest/config";

// Separate from vite.config.ts so unit tests do not load the React Router plugin.
export default mergeConfig(base, defineConfig({}));
