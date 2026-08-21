//! Every state transition emits one typed event.
//!
//! The frontend and any future indexer are built on these alone, so adding
//! analytics later never requires a contract change. `#[contractevent]` gives
//! them a spec entry, which means generated bindings can decode them without a
//! hand-written parser on the client.
//!
//! `market_id` is a topic on every market event so a client can subscribe to a
//! single market rather than filtering the whole stream.

use soroban_sdk::{contractevent, Address, BytesN, String};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketCreated {
    #[topic]
    pub market_id: u64,
    pub creator: Address,
    pub token: Address,
    pub close_ts: u64,
    pub question_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BetPlaced {
    #[topic]
    pub market_id: u64,
    #[topic]
    pub user: Address,
    pub outcome: u32,
    pub amount: i128,
    pub pool: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketClosed {
    #[topic]
    pub market_id: u64,
    pub pool_no: i128,
    pub pool_yes: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketVoided {
    #[topic]
    pub market_id: u64,
    /// One of: `onesided`, `noresolvers`, `tie`, `nowinner`, `curator`.
    pub reason: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OutcomeSubmitted {
    #[topic]
    pub market_id: u64,
    #[topic]
    pub agent_id: u32,
    pub outcome: u32,
    pub weight: u32,
    pub evidence_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tallied {
    #[topic]
    pub market_id: u64,
    pub outcome: u32,
    pub weight_for: u32,
    pub weight_total: u32,
    pub submission_count: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverSettled {
    #[topic]
    pub market_id: u64,
    #[topic]
    pub agent_id: u32,
    pub correct: bool,
    /// Reward paid, or the slashed bond as a negative number.
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Challenged {
    #[topic]
    pub market_id: u64,
    pub challenger: Address,
    pub bond: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeResolved {
    #[topic]
    pub market_id: u64,
    pub final_outcome: u32,
    pub upheld: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketSettled {
    #[topic]
    pub market_id: u64,
    pub final_outcome: u32,
    pub distributable: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub market_id: u64,
    #[topic]
    pub user: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub market_id: u64,
    #[topic]
    pub user: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeAccrued {
    #[topic]
    pub token: Address,
    pub amount: i128,
}
