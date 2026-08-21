use soroban_sdk::{contracttype, Address, BytesN, String};

/// Basis-point denominator used for every ratio in this contract.
pub const BPS_DENOM: u32 = 10_000;

/// Weight fixed-point base. `100` == 1.00x.
pub const WEIGHT_BASE: u32 = 100;

/// v1 ships binary markets. The type system is already multi-outcome (`u32`);
/// this constant is the only thing gating it. See docs/V2_ROADMAP.md item 1.
pub const V1_OUTCOME_COUNT: u32 = 2;

pub const OUTCOME_NO: u32 = 0;
pub const OUTCOME_YES: u32 = 1;

/// Reputation tag written to the 8004 Reputation Registry so a client can ask
/// for "this agent's Verdict track record" specifically, filtering out feedback
/// this protocol did not produce.
pub const FEEDBACK_TAG: &str = "verdict";

/// Feedback values written to 8004 on settlement. `value_decimals` is 0, so the
/// on-chain average over a client's feedback lands in [-100, 100].
pub const FEEDBACK_CORRECT: i128 = 100;
pub const FEEDBACK_WRONG: i128 = -100;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MarketState {
    /// Trading is open until `close_ts`.
    Open,
    /// Trading closed. Registered resolver agents may submit outcomes.
    Resolving,
    /// Weighted tally produced a provisional outcome; challenge window running.
    Tallied,
    /// Someone challenged the provisional outcome. Awaiting `dispute_resolver`.
    Disputed,
    /// Final outcome locked. Users can claim, resolvers can be settled.
    Settled,
    /// Market produced no valid result. Every stake is refundable 1:1 and every
    /// resolver bond is returned. No fee is taken.
    Void,
}

/// Protocol-wide, curator-adjustable parameters.
///
/// Everything here lives in storage rather than in `const`s on purpose: v2
/// hands these to governance without a contract migration.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    /// Can pause, upgrade, and rotate the roles below.
    pub admin: Address,
    /// v1: the only address allowed to create markets. v2: replaced by
    /// permissionless creation behind a creator bond.
    pub curator: Address,
    /// v1: points at `curator` — the trusted dispute backstop.
    /// v2: points at the staked arbitration contract. One-line swap.
    pub dispute_resolver: Address,
    /// Receives protocol fees and slashed resolver bonds.
    pub treasury: Address,

    /// 8004 Identity Registry (agent existence + ownership checks).
    pub identity_registry: Address,
    /// 8004 Reputation Registry (portable, public track record).
    pub reputation_registry: Address,

    /// Fee taken from the losing pool at settlement, in bps. 200 == 2%.
    pub fee_bps: u32,
    /// Share of the fee routed to correct resolvers, in bps. 6000 == 60%.
    pub resolver_fee_bps: u32,
    /// Flat bond every resolver posts alongside a submission. Identical for
    /// every agent — influence comes from reputation, never from capital.
    pub resolver_bond: i128,
    /// Challenge bond = `resolver_bond * challenge_bond_mult`.
    pub challenge_bond_mult: u32,
    /// Paid from the treasury to a challenger whose challenge is upheld.
    pub challenger_reward: i128,

    /// Seconds after `close_ts` during which resolvers may submit.
    pub resolve_window: u64,
    /// Seconds after tally during which anyone may challenge.
    pub challenge_window: u64,

    /// Clamp for `weight_of`, in WEIGHT_BASE units. 100..=300 == 1.00x..3.00x.
    pub weight_min: u32,
    pub weight_max: u32,

    pub paused: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Market {
    pub id: u64,
    pub creator: Address,
    /// SEP-41 token used for stakes, bonds and payouts. Passed in rather than
    /// hardcoded so the same wasm serves a test token, testnet USDC and
    /// mainnet USDC.
    pub token: Address,

    /// Off-chain document: the question text, resolution criteria, and the
    /// sources a resolver is expected to consult. IPFS or HTTPS.
    pub question_uri: String,
    /// sha256 of the document above, so the criteria cannot be edited after
    /// people have staked against them.
    pub question_hash: BytesN<32>,

    /// v1 is always 2. Stored per market so old markets keep their semantics
    /// after v2 unlocks larger values.
    pub outcome_count: u32,

    pub close_ts: u64,
    /// close_ts + resolve_window, snapshotted at creation.
    pub resolve_deadline: u64,
    /// Set when `tally` runs. 0 until then.
    pub challenge_deadline: u64,

    pub state: MarketState,
    pub provisional_outcome: u32,
    pub final_outcome: u32,

    /// Sum of every stake across every outcome.
    pub total_staked: i128,
    /// Sum of every resolver bond currently held for this market.
    pub bond_pool: i128,

    /// Snapshotted at settlement so `claim` is a pure lookup and every claimer
    /// computes against the same numbers.
    pub distributable: i128,
    pub resolver_pool: i128,
    /// Set once `settle_resolvers` has run, so it cannot run twice.
    pub resolvers_settled: bool,

    /// Economic terms are snapshotted at creation. Changing `Config` must never
    /// retroactively change the deal a user already staked into.
    pub fee_bps: u32,
    pub resolver_fee_bps: u32,
    pub resolver_bond: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Submission {
    /// 8004 identity registry token id. `u32` to match the deployed registry.
    pub agent_id: u32,
    /// Owner of the agent NFT at submission time — the address that posted the
    /// bond and that gets refunded or slashed.
    pub submitter: Address,
    pub outcome: u32,
    /// Evidence document: sources, reasoning, timestamps. Required.
    pub evidence_uri: String,
    pub evidence_hash: BytesN<32>,
    /// Weight applied to this submission, snapshotted at submission time so a
    /// later reputation change cannot retroactively alter a past tally.
    pub weight: u32,
    pub bond: i128,
    pub submitted_at: u64,
    pub settled: bool,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Challenge {
    pub challenger: Address,
    pub bond: i128,
    pub reason_uri: String,
    pub raised_at: u64,
}

/// Verdict's own hot-path record of an agent's track record.
///
/// This exists because 8004's `get_summary` walks every feedback entry a client
/// has ever written for an agent — O(n) storage reads, unbounded as the agent
/// resolves more markets. That is fine for a UI read; it is not fine inside
/// `submit_outcome`. So Verdict keeps an O(1) counter locally and *also* writes
/// to 8004 for the public, portable record. The two are kept in lockstep in
/// `settle_resolvers`.
#[contracttype]
#[derive(Clone, Copy, Debug, Default)]
pub struct AgentStats {
    pub correct: u32,
    pub wrong: u32,
}

/// Result of a weighted tally, returned by read calls and used by the UI.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TallyResult {
    pub outcome: u32,
    pub weight_for: u32,
    pub weight_total: u32,
    pub submission_count: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    // --- instance ---
    Config,
    MarketCount,

    // --- persistent ---
    Market(u64),
    /// (market_id, outcome) -> total staked on that outcome
    Pool(u64, u32),
    /// (market_id, user, outcome) -> that user's stake on that outcome.
    /// Keyed per outcome so a user can hold both sides, and so v2 can make
    /// positions transferable without a storage migration.
    Position(u64, Address, u32),
    /// (market_id, user) -> already claimed
    Claimed(u64, Address),
    /// (market_id, agent_id) -> Submission
    Submission(u64, u32),
    /// market_id -> list of agent ids that submitted, for iteration
    SubmissionIds(u64),
    /// market_id -> Challenge
    Challenge(u64),
    /// agent_id -> AgentStats (Verdict-local, O(1) weight source)
    Stats(u32),
    /// token -> accrued protocol fees awaiting withdrawal
    Treasury(Address),
}
