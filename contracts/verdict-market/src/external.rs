//! Clients for the deployed 8004 registries.
//!
//! These traits mirror the ABI of the contracts published by
//! [trionlabs/stellar-8004](https://github.com/trionlabs/stellar-8004), already
//! live on testnet and mainnet. We declare the interface rather than depending
//! on their crate: they pin `soroban-sdk` 25.3.0 and we are on 27.0.6, so a
//! source dependency would not link.
//!
//! Only the functions Verdict actually calls are declared. Everything else in
//! those registries is irrelevant to us.

use soroban_sdk::{contractclient, Address, BytesN, Env, String};

/// 8004 Identity Registry — agents as SEP-50 NFTs.
///
/// `agent_id` is `u32` in the deployed contract. (The other Soroban 8004
/// implementation uses `u64`; we target trionlabs.)
#[contractclient(name = "IdentityClient")]
pub trait IdentityRegistry {
    /// Whether an agent id has been registered.
    fn agent_exists(env: Env, agent_id: u32) -> bool;

    /// Current owner of the agent NFT, if it exists.
    fn find_owner(env: Env, agent_id: u32) -> Option<Address>;
}

/// 8004 Reputation Registry — public, portable feedback.
///
/// Verdict writes here on settlement so an agent's record survives outside this
/// protocol. It does **not** read here on any write path: `get_summary` walks
/// every feedback entry a client has written for an agent, which is unbounded.
/// Verdict keeps its own O(1) counters for weighting. See docs/SPEC.md §4.3.
#[contractclient(name = "ReputationClient")]
pub trait ReputationRegistry {
    /// `caller` must authorise. A contract satisfies this for its own address.
    ///
    /// The registry rejects feedback from an agent's own owner (`SelfFeedback`);
    /// Verdict never owns an agent, so that guard never fires for us.
    #[allow(clippy::too_many_arguments)]
    fn give_feedback(
        env: Env,
        caller: Address,
        agent_id: u32,
        value: i128,
        value_decimals: u32,
        tag1: String,
        tag2: String,
        endpoint: String,
        feedback_uri: String,
        feedback_hash: BytesN<32>,
    );
}
