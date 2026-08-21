import type { Metadata } from "next";
import { Card, Hash, Mono, Page, Section } from "@/components/ui";
import { demoRun, deployment } from "@/lib/project";
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

            {report.build.onChain ? (
              <div className="rounded-lg border border-edge bg-surface p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded px-2 py-1 font-mono text-[0.7rem] uppercase tracking-wider ${
                      report.build.onChain.matchesLocalBuild
                        ? "bg-done/15 text-done"
                        : "bg-red-500/15 text-red-500 dark:text-red-400"
                    }`}
                  >
                    {report.build.onChain.matchesLocalBuild
                      ? "matches the deployed contract"
                      : "differs from the deployed contract"}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  The report fetches the wasm actually running on testnet and hashes
                  it against this build. A green badge means the source in the repo
                  compiles, byte for byte, to the contract holding the escrow.
                </p>
                <p className="mt-2 truncate font-mono text-xs text-muted">
                  on-chain {report.build.onChain.sha256}
                </p>
              </div>
            ) : null}

            <p className="text-sm leading-relaxed text-muted">
              Reproduce it with <Mono>make report</Mono>, or check any deployment
              yourself with{" "}
              <Mono>stellar contract fetch --id &lt;id&gt; -o fetched.wasm</Mono>.
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
        lead="Verdict's own contract, live on Stellar testnet."
      >
        {deployment ? (
          <div className="space-y-3">
            <Hash label={`contract · ${deployment.network}`} value={deployment.contractId} />
            <Hash label="demo token (VUSD SAC)" value={deployment.token} />
            <Hash label="deploy transaction" value={deployment.deployTx} />
            <p className="text-sm text-muted">
              Browse it on{" "}
              <a
                className="text-accent underline underline-offset-4"
                href={`https://stellar.expert/explorer/testnet/contract/${deployment.contractId}`}
                target="_blank"
                rel="noreferrer"
              >
                stellar.expert
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-edge px-5 py-6 text-sm text-muted">
            Not yet deployed.
          </div>
        )}
      </Section>

      {/* -------------------------------------------------------- demo run */}
      <Section
        eyebrow="Live run"
        title={`Market #${demoRun.marketId}, settled on testnet`}
        lead="A full lifecycle against the deployed contract and the live 8004 registries — three agents disagreeing, a reputation-weighted tally, and real money moving. Reproduce it with ./scripts/demo.sh."
      >
        <dl className="grid gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-2">
          <div className="bg-surface p-4">
            <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
              Stakes
            </dt>
            <dd className="mt-1.5 text-sm">
              {demoRun.stakes.map((s) => `${s.who} ${s.amount} on ${s.side}`).join(" · ")}
            </dd>
          </div>
          <div className="bg-surface p-4">
            <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
              Weighted tally
            </dt>
            <dd className="mt-1.5 text-sm">
              {demoRun.tally.outcome} — {demoRun.tally.weightFor}/{demoRun.tally.weightTotal}{" "}
              weight across {demoRun.tally.submissions} submissions
            </dd>
          </div>
          <div className="bg-surface p-4">
            <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
              Winner payout
            </dt>
            <dd className="mt-1.5 text-sm">{demoRun.settlement.alicePayout}</dd>
          </div>
          <div className="bg-surface p-4">
            <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
              Treasury
            </dt>
            <dd className="mt-1.5 text-sm">{demoRun.settlement.treasury}</dd>
          </div>
        </dl>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                {["8004 agent", "Called", "Settlement", "Record", "Next weight", "On 8004"].map(
                  (h) => (
                    <th
                      key={h}
                      className="py-2.5 pr-4 font-mono text-[0.7rem] font-medium uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {demoRun.agents.map((a) => (
                <tr key={a.id} className="border-b border-edge">
                  <td className="py-3 pr-4 font-mono text-xs">#{a.id}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{a.call}</td>
                  <td
                    className={`py-3 pr-4 ${a.correct ? "text-done" : "text-red-500 dark:text-red-400"}`}
                  >
                    {a.settled}
                  </td>
                  <td className="py-3 pr-4 text-muted">{a.stats}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{a.nextWeight}</td>
                  <td className="py-3 font-mono text-xs">{a.onChainRecord}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card className="mt-6">
          <h3 className="font-medium">Read back from the live registry</h3>
          <pre className="mt-3 overflow-x-auto rounded-md bg-surface-2 p-4 font-mono text-xs leading-relaxed">
{demoRun.reputationReadback}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The public record on the 8004 Reputation Registry and Verdict&apos;s own
            counters agree exactly. That agreement is the whole point: the weighting
            that decides future markets is cheap to compute locally, while the record
            it is derived from is portable and readable by anyone.
          </p>
        </Card>
      </Section>
    </Page>
  );
}
