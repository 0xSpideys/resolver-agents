#!/usr/bin/env node
/**
 * Generates apps/site/src/data/report.json from a real build + test run.
 *
 * Nothing in here is hand-written status. `make report` runs the actual test
 * suite and the actual wasm build, parses the output, and writes it. If the
 * suite fails, that lands in the JSON and shows up red on /status.
 *
 * Usage:  node scripts/report.mjs        (from the repo root)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/site/src/data");
const outFile = join(outDir, "report.json");

const cargo = process.env.CARGO ?? join(process.env.HOME, ".cargo/bin/cargo");

function run(args, opts = {}) {
  try {
    return {
      ok: true,
      out: execFileSync(cargo, args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        ...opts,
      }),
    };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** Parse `cargo test` libtest output into per-test records. */
function parseTests(text) {
  const tests = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^test\s+(\S+)\s+\.\.\.\s+(ok|FAILED|ignored)/);
    if (m) tests.push({ name: m[1], result: m[2] });
  }
  const summary = text.match(
    /test result:\s+(\w+)\.\s+(\d+) passed;\s+(\d+) failed;\s+(\d+) ignored/,
  );
  return {
    tests,
    passed: summary ? Number(summary[2]) : tests.filter((t) => t.result === "ok").length,
    failed: summary ? Number(summary[3]) : tests.filter((t) => t.result === "FAILED").length,
    ignored: summary ? Number(summary[4]) : 0,
    ok: summary ? summary[1] === "ok" : tests.every((t) => t.result !== "FAILED"),
  };
}

console.log("· cargo test");
const test = run(["test", "--all", "--", "--test-threads=1"]);
const parsed = parseTests(test.out);

console.log("· cargo build --target wasm32v1-none --release");
const build = run(["build", "--target", "wasm32v1-none", "--release"]);

let wasm = null;
const wasmPath = join(root, "target/wasm32v1-none/release/verdict_market.wasm");
try {
  const buf = readFileSync(wasmPath);
  wasm = {
    name: "verdict_market.wasm",
    bytes: statSync(wasmPath).size,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
} catch {
  wasm = null;
}

const rustc = (() => {
  try {
    return execFileSync(join(process.env.HOME, ".cargo/bin/rustc"), ["--version"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
})();

const commit = (() => {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
})();

const report = {
  generatedAt: new Date().toISOString(),
  commit,
  toolchain: { rustc, sorobanSdk: "27.0.6", target: "wasm32v1-none" },
  test: {
    ok: parsed.ok && test.ok,
    passed: parsed.passed,
    failed: parsed.failed,
    ignored: parsed.ignored,
    // Grouped by the module path libtest reports, so the page can show
    // "math::tests" rather than one flat wall of names.
    suites: Object.entries(
      parsed.tests.reduce((acc, t) => {
        const i = t.name.lastIndexOf("::");
        const suite = i === -1 ? "root" : t.name.slice(0, i);
        const name = i === -1 ? t.name : t.name.slice(i + 2);
        (acc[suite] ??= []).push({ name, result: t.result });
        return acc;
      }, {}),
    ).map(([suite, tests]) => ({ suite, tests })),
  },
  build: { ok: build.ok, wasm },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");

console.log(
  `\n${report.test.ok ? "PASS" : "FAIL"}  ${report.test.passed} passed, ${report.test.failed} failed` +
    `${wasm ? `  ·  wasm ${wasm.bytes}B ${wasm.sha256.slice(0, 12)}…` : "  ·  no wasm"}`,
);
console.log(`written: ${outFile}`);

if (!report.test.ok || !report.build.ok) process.exitCode = 1;
