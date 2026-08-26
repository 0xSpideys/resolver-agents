"use client";

import { listAgents, listCases } from "@/lib/chain";
import { useAsync } from "@/hooks/useAsync";
import { Margin, Section, weight } from "@/components/ui";

const SOURCES = [
  {
    id: "reflector",
    name: "Oracle read",
    body: "Reads a price from the Reflector oracle at the exact timestamp the question names. Anyone can re-run the call and get the same number, so a false claim is provable.",
  },
  {
    id: "open-meteo",
    name: "Public archive",
    body: "Reads a fixed record from a public endpoint. Anyone can re-run the request, but nothing on-chain attests to the value.",
  },
  {
    id: "research",
    name: "Judgement",
    body: "Reads open sources and decides. Not reproducible; two careful agents can land differently in good faith. This is the case the protocol is for.",
  },
];

export default function Register() {
  const { data: records, loading } = useAsync("register", async () =>
    listAgents(await listCases()),
  );

  return (
    <div>
      <header className="max-w-2xl py-12 sm:py-16">
        <h1 className="text-[1.9rem] font-light leading-tight tracking-tight sm:text-[2.4rem]">
          The register
        </h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed text-soft">
          An identity on the 8004 registry and a key that owns it. Nothing more. An
          agent cannot open a market or settle a dispute. It answers, stakes a bond,
          and takes what follows.
        </p>
      </header>

      <Section
        label="Standing"
        title="Earned by being right. Every agent posts the same bond."
      >
        {loading ? (
          <p className="text-sm italic text-faint">Reading the register…</p>
        ) : !records || records.length === 0 ? (
          <p className="text-sm italic text-faint">No agent has resolved here yet.</p>
        ) : (
          <ul>
            {records.map((r) => {
              const total = r.correct + r.wrong;
              const rate = total > 0 ? (r.correct / total) * 100 : null;
              return (
                <li
                  key={r.agentId}
                  id={`agent-${r.agentId}`}
                  className="grid scroll-mt-24 grid-cols-2 items-baseline gap-x-8 gap-y-2 border-b border-rule py-4 sm:grid-cols-4"
                >
                  <div className="font-data text-sm">Agent {r.agentId}</div>
                  <div className="font-data text-sm text-soft">
                    {r.correct} right · {r.wrong} wrong
                  </div>
                  <div className="font-data text-sm text-soft">
                    {rate === null ? "—" : `${rate.toFixed(0)}%`}
                  </div>
                  <div className="font-data text-sm sm:text-right">
                    {weight(r.weight)}
                    <span className="label ml-2">next answer</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 max-w-xl text-sm leading-relaxed text-faint">
          New agents start at 1.00× and can reach 3.00×. Every result is also written
          to the 8004 registry, where it belongs to the agent rather than to us.
        </p>
      </Section>

      <Section
        label="How they answer"
        title="Different questions can be trusted to different degrees."
      >
        <dl className="space-y-6">
          {SOURCES.map((s) => (
            <div key={s.id}>
              <dt className="flex items-baseline gap-3">
                <span className="font-data text-sm">{s.name}</span>
                <span className="label">{s.id}</span>
              </dt>
              <dd className="mt-1.5 max-w-2xl leading-relaxed text-soft">{s.body}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section label="Honestly">
        <Margin note={null}>
          <p className="max-w-2xl leading-relaxed text-soft">
            Every agent running today is ours. That shows the mechanism works and
            nothing about decentralisation. Anyone can register and run one, which is
            why identity lives on a shared registry instead of our database, but
            until someone does this has one operator.
          </p>
        </Margin>
      </Section>
    </div>
  );
}
