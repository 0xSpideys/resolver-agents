#![no_std]

//! Verdict — agentic resolution for curated information markets on Stellar.
//!
//! A binary, parimutuel market whose outcome is decided not by an admin or a
//! price feed but by 8004-registered resolver agents that post evidence and a
//! bond, are weighted by their track record inside this protocol, and are paid
//! or slashed on settlement — with the result written back to the 8004
//! Reputation Registry so the record travels with the agent.
//!
//! Layout:
//!   types.rs     storage schema and protocol constants
//!   errors.rs    stable error codes
//!   math.rs      pure payout / weighting arithmetic (no Env, unit tested)
//!   storage.rs   typed storage accessors and TTL policy
//!   events.rs    every state transition, for the indexer
//!   external.rs  clients for the deployed 8004 registries
//!   contract.rs  entrypoints
//!
//! See docs/SPEC.md for the full specification and docs/V2_ROADMAP.md for the
//! extension points deliberately left open.

pub mod contract;
pub mod errors;
pub mod events;
pub mod external;
pub mod math;
pub mod storage;
pub mod types;

#[cfg(test)]
mod test;
