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
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/site/src/data");
const outFile = join(outDir, "report.json");

const cargo = process.env.CARGO ?? join(process.env.HOME, ".cargo/bin/cargo");

// `stellar contract build` shells out to cargo, so the child needs cargo on its
// PATH. Node does not inherit a login shell, so prepend it explicitly.
const childEnv = {
  ...process.env,
  PATH: [
    join(process.env.HOME, ".cargo/bin"),
    join(process.env.HOME, ".local/bin"),
    process.env.PATH,
  ].join(":"),
};

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

// Build with `stellar contract build`, not plain cargo: the CLI embeds contract
// metadata (SDK version, spec entries) into the wasm, so a cargo-only build
// produces a different hash from the artifact that actually gets deployed.
const stellarBin = process.env.STELLAR ?? join(process.env.HOME, ".local/bin/stellar");
const plainPath = join(root, "target/wasm32v1-none/release/verdict_market.wasm");
const optimizedPath = join(root, "target/wasm32v1-none/release/verdict_market.optimized.wasm");

// Remove the previous artifacts first. Cargo considers the wasm fresh if a
// plain `cargo build` produced one earlier in this session, and `stellar
// contract build` would then skip the rebuild — leaving the optimizer to hash
// an artifact that was never built the way we deploy it.
for (const p of [plainPath, optimizedPath]) rmSync(p, { force: true });

console.log("· stellar contract build");
let build = { ok: false };
try {
  execFileSync(stellarBin, ["contract", "build"], { cwd: root, stdio: "ignore", env: childEnv });
  build = { ok: true };
} catch {
  // No CLI (e.g. CI). Fall back to cargo so the suite still reports, but the
  // hash below will not be comparable to a deployment.
  console.log("  (stellar CLI unavailable, falling back to cargo)");
  build = run(["build", "--target", "wasm32v1-none", "--release"]);
}

console.log("· stellar contract optimize");
try {
  execFileSync(stellarBin, ["contract", "optimize", "--wasm", plainPath], {
    cwd: root,
    stdio: "ignore",
    env: childEnv,
  });
} catch {
  // Same fallback: report the unoptimized artifact rather than a wrong hash.
}

function hashOf(path, name) {
  try {
    return {
      name,
      bytes: statSync(path).size,
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    };
  } catch {
    return null;
  }
}

// The optimized artifact is the one that gets deployed, so it is the hash worth
// publishing — comparing the plain build against an on-chain contract would
// always mismatch.
const wasm =
  hashOf(optimizedPath, "verdict_market.optimized.wasm") ??
  hashOf(plainPath, "verdict_market.wasm");

/** Fetch the deployed wasm and check it against what we just built. */
let onChain = null;
try {
  const contractId = readFileSync(join(root, ".testnet-contract"), "utf8").trim();
  const out = join(root, "target/fetched.wasm");
  execFileSync(
    stellarBin,
    ["contract", "fetch", "--network", "testnet", "--id", contractId, "-o", out],
    { cwd: root, stdio: "ignore", env: childEnv },
  );
  const fetched = hashOf(out, "deployed");
  onChain = {
    contractId,
    sha256: fetched?.sha256 ?? null,
    matchesLocalBuild: !!fetched && !!wasm && fetched.sha256 === wasm.sha256,
  };
} catch {
  onChain = null;
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
  build: { ok: build.ok, wasm, onChain },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");

console.log(
  `\n${report.test.ok ? "PASS" : "FAIL"}  ${report.test.passed} passed, ${report.test.failed} failed` +
      `${wasm ? `  ·  wasm ${wasm.bytes}B ${wasm.sha256.slice(0, 12)}…` : "  ·  no wasm"}` +
    `${onChain ? `  ·  on-chain ${onChain.matchesLocalBuild ? "MATCHES" : "DIFFERS"}` : ""}`,
);
console.log(`written: ${outFile}`);

if (!report.test.ok || !report.build.ok) process.exitCode = 1;
