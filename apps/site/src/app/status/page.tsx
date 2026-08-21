import type { Metadata } from "next";
import { Card, Hash, Mono, Page, Section } from "@/components/ui";
import { deployment, transactions } from "@/lib/project";
import report from "@/data/report.json";

export const metadata: Metadata = {
  title: "Status — Verdict",
  description: "Build, test and deployment status for the Verdict market contract.",
};

function bytes(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export default function StatusPage() {
  const green = report.test.ok && report.build.ok;
  const total = report.test.passed + report.test.failed + report.test.ignored;

  return (
    <Page>
      <Section
        first
        eyebrow="Status"
        title="Build, tests and deployment"
        lead="Everything on this page comes from a real run — make report executes the test suite and the wasm build, then writes the result to JSON that this page renders. No status number here is typed by hand."
      />

      {/* ---------------------------------------------------------- summary */}
      <section className="border-t border-edge py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded-md px-3 py-1.5 font-mono text-sm font-medium ${
              green
                ? "bg-done/15 text-done"
                : "bg-red-500/15 text-red-500 dark:text-red-400"
            }`}
          >
            {green ? "PASSING" : "FAILING"}
          </span>
          <span className="font-mono text-sm text-muted">
            {report.test.passed}/{total} tests
          </span>
          {report.commit ? (
            <span className="font-mono text-sm text-muted">@{report.commit}</span>
          ) : null}
        </div>

        <dl className="mt-8 grid gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-2">
          {[
            ["Generated", new Date(report.generatedAt).toUTCString()],
            ["Toolchain", report.toolchain.rustc],
            ["soroban-sdk", report.toolchain.sorobanSdk],
            ["Target", report.toolchain.target],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface p-4">
              <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                {k}
              </dt>
              <dd className="mt-1.5 truncate font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ------------------------------------------------------------ wasm */}
      <Section
        eyebrow="Artifact"
        title="Compiled contract"
        lead="The release profile is deterministic — pinned toolchain, tracked lockfile, opt-level z, LTO, single codegen unit. A fresh checkout produces a byte-identical wasm, so a deployed contract can be verified against source."
      >
        {report.build.wasm ? (
          <div className="space-y-3">
            <div className="grid gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-2">
              <div className="bg-surface p-4">
                <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                  File
                </p>
                <p className="mt-1.5 font-mono text-xs">{report.build.wasm.name}</p>
              </div>
              <div className="bg-surface p-4">
                <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                  Size
                </p>
                <p className="mt-1.5 font-mono text-xs">{bytes(report.build.wasm.bytes)}</p>
              </div>
            </div>
            <Hash label="sha256" value={report.build.wasm.sha256} />
            <p className="text-sm leading-relaxed text-muted">
              Verify locally with <Mono>make hash</Mono>, or against a live network
              with <Mono>stellar contract fetch --id &lt;id&gt; -o fetched.wasm</Mono>.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">No wasm artifact in the last run.</p>
        )}
      </Section>

      {/* ----------------------------------------------------------- tests */}
      <Section
        eyebrow="Tests"
        title="Suite"
        lead="Named after the property each one protects, so a failure says what broke rather than which line number moved."
      >
        <div className="space-y-6">
          {report.test.suites.map((s) => (
            <div key={s.suite}>
              <h3 className="font-mono text-xs text-muted">{s.suite}</h3>
              <ul className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-edge bg-surface">
                {s.tests.map((t) => (
                  <li
                    key={t.name}
                    className="flex items-center justify-between gap-4 px-4 py-2.5"
                  >
                    <span className="font-mono text-xs">{t.name}</span>
                    <span
                      className={`font-mono text-[0.7rem] uppercase tracking-wider ${
                        t.result === "ok"
                          ? "text-done"
                          : t.result === "ignored"
                            ? "text-todo"
                            : "text-red-500 dark:text-red-400"
                      }`}
                    >
                      {t.result === "ok" ? "pass" : t.result}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Card className="mt-6">
          <h3 className="font-medium">Run it yourself</h3>
          <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-4 font-mono text-xs leading-relaxed">
{`make test      # unit tests
make build     # wasm32v1-none release build
make hash      # sha256 of the artifact
make report    # all of the above, regenerates this page's data`}
          </pre>
        </Card>
      </Section>

      {/* ------------------------------------------------------ deployment */}
      <Section
        eyebrow="Chain"
        title="Deployment"
        lead="Verdict's own contract, and the transactions worth checking."
      >
        {deployment ? (
          <div className="space-y-3">
            <Hash label={`contract · ${deployment.network}`} value={deployment.contractId} />
            <Hash label="wasm hash" value={deployment.wasmHash} />
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-edge px-5 py-6 text-sm text-muted">
            Not yet deployed. The contract goes to testnet once the market core is
            complete; the id and its wasm hash appear here, and the hash must match
            the artifact above.
          </div>
        )}

        {transactions.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {transactions.map((t) => (
              <li key={t.hash}>
                <Hash label={t.label} value={t.hash} />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>
    </Page>
  );
}
