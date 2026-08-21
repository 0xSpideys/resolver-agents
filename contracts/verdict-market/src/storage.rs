//! Typed storage accessors and the TTL policy.
//!
//! Every read of a live market bumps its TTL. A market whose entries expire
//! before settlement would strand escrow, which is the worst failure this
//! contract could have, so bumping is done on the read path rather than left to
//! callers to remember.

use soroban_sdk::{Address, Env, Vec};

use crate::errors::Error;
use crate::types::{AgentStats, Challenge, Config, DataKey, Market, Submission};

/// ~1 day of ledgers at 5s each. Below this, extend.
pub const TTL_THRESHOLD: u32 = 17_280;
/// ~30 days of ledgers. Comfortably longer than any v1 market.
pub const TTL_EXTEND: u32 = 518_400;

/// Cap on resolver submissions per market so `tally` can never exceed the
/// resource budget. Measured, not guessed — see docs/SPEC.md §10.
pub const MAX_SUBMISSIONS: u32 = 32;

/* ------------------------------------------------------------------ config */

pub fn has_config(e: &Env) -> bool {
    e.storage().instance().has(&DataKey::Config)
}

pub fn set_config(e: &Env, cfg: &Config) {
    e.storage().instance().set(&DataKey::Config, cfg);
    bump_instance(e);
}

pub fn get_config(e: &Env) -> Result<Config, Error> {
    e.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(Error::NotInitialized)
}

pub fn bump_instance(e: &Env) {
    e.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND);
}

/* ------------------------------------------------------------------ counter */

pub fn next_market_id(e: &Env) -> u64 {
    let id: u64 = e
        .storage()
        .instance()
        .get(&DataKey::MarketCount)
        .unwrap_or(0);
    e.storage().instance().set(&DataKey::MarketCount, &(id + 1));
    bump_instance(e);
    id
}

pub fn market_count(e: &Env) -> u64 {
    e.storage()
        .instance()
        .get(&DataKey::MarketCount)
        .unwrap_or(0)
}

/* ------------------------------------------------------------------ market */

pub fn set_market(e: &Env, m: &Market) {
    let key = DataKey::Market(m.id);
    e.storage().persistent().set(&key, m);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

pub fn get_market(e: &Env, id: u64) -> Result<Market, Error> {
    let key = DataKey::Market(id);
    let m: Market = e
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::MarketNotFound)?;
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(m)
}

/* ------------------------------------------------------------------- pools */

pub fn get_pool(e: &Env, market_id: u64, outcome: u32) -> i128 {
    e.storage()
        .persistent()
        .get(&DataKey::Pool(market_id, outcome))
        .unwrap_or(0)
}

pub fn add_to_pool(e: &Env, market_id: u64, outcome: u32, amount: i128) -> Result<i128, Error> {
    let key = DataKey::Pool(market_id, outcome);
    let current: i128 = e.storage().persistent().get(&key).unwrap_or(0);
    let next = current.checked_add(amount).ok_or(Error::MathOverflow)?;
    e.storage().persistent().set(&key, &next);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(next)
}

/* --------------------------------------------------------------- positions */

pub fn get_position(e: &Env, market_id: u64, user: &Address, outcome: u32) -> i128 {
    e.storage()
        .persistent()
        .get(&DataKey::Position(market_id, user.clone(), outcome))
        .unwrap_or(0)
}

pub fn add_position(
    e: &Env,
    market_id: u64,
    user: &Address,
    outcome: u32,
    amount: i128,
) -> Result<i128, Error> {
    let key = DataKey::Position(market_id, user.clone(), outcome);
    let current: i128 = e.storage().persistent().get(&key).unwrap_or(0);
    let next = current.checked_add(amount).ok_or(Error::MathOverflow)?;
    e.storage().persistent().set(&key, &next);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(next)
}

pub fn has_claimed(e: &Env, market_id: u64, user: &Address) -> bool {
    e.storage()
        .persistent()
        .get(&DataKey::Claimed(market_id, user.clone()))
        .unwrap_or(false)
}

pub fn mark_claimed(e: &Env, market_id: u64, user: &Address) {
    let key = DataKey::Claimed(market_id, user.clone());
    e.storage().persistent().set(&key, &true);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

/* ------------------------------------------------------------- submissions */

pub fn set_submission(e: &Env, market_id: u64, s: &Submission) {
    let key = DataKey::Submission(market_id, s.agent_id);
    e.storage().persistent().set(&key, s);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

pub fn get_submission(e: &Env, market_id: u64, agent_id: u32) -> Option<Submission> {
    e.storage()
        .persistent()
        .get(&DataKey::Submission(market_id, agent_id))
}

pub fn submission_ids(e: &Env, market_id: u64) -> Vec<u32> {
    e.storage()
        .persistent()
        .get(&DataKey::SubmissionIds(market_id))
        .unwrap_or(Vec::new(e))
}

pub fn push_submission_id(e: &Env, market_id: u64, agent_id: u32) -> Result<(), Error> {
    let key = DataKey::SubmissionIds(market_id);
    let mut ids: Vec<u32> = e.storage().persistent().get(&key).unwrap_or(Vec::new(e));
    if ids.len() >= MAX_SUBMISSIONS {
        return Err(Error::SubmissionLimitReached);
    }
    ids.push_back(agent_id);
    e.storage().persistent().set(&key, &ids);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    Ok(())
}

/* ---------------------------------------------------------------- disputes */

pub fn set_challenge(e: &Env, market_id: u64, c: &Challenge) {
    let key = DataKey::Challenge(market_id);
    e.storage().persistent().set(&key, c);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

pub fn get_challenge(e: &Env, market_id: u64) -> Option<Challenge> {
    e.storage().persistent().get(&DataKey::Challenge(market_id))
}

/* ------------------------------------------------------------ agent stats */

pub fn get_stats(e: &Env, agent_id: u32) -> AgentStats {
    e.storage()
        .persistent()
        .get(&DataKey::Stats(agent_id))
        .unwrap_or(AgentStats {
            correct: 0,
            wrong: 0,
        })
}

pub fn record_result(e: &Env, agent_id: u32, correct: bool) {
    let key = DataKey::Stats(agent_id);
    let mut s = get_stats(e, agent_id);
    if correct {
        s.correct = s.correct.saturating_add(1);
    } else {
        s.wrong = s.wrong.saturating_add(1);
    }
    e.storage().persistent().set(&key, &s);
    e.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
}

/* ---------------------------------------------------------------- treasury */

pub fn accrue_treasury(e: &Env, token: &Address, amount: i128) -> Result<i128, Error> {
    if amount == 0 {
        return Ok(treasury_balance(e, token));
    }
    let key = DataKey::Treasury(token.clone());
    let current: i128 = e.storage().instance().get(&key).unwrap_or(0);
    let next = current.checked_add(amount).ok_or(Error::MathOverflow)?;
    e.storage().instance().set(&key, &next);
    bump_instance(e);
    Ok(next)
}

pub fn treasury_balance(e: &Env, token: &Address) -> i128 {
    e.storage()
        .instance()
        .get(&DataKey::Treasury(token.clone()))
        .unwrap_or(0)
}

pub fn drain_treasury(e: &Env, token: &Address) -> i128 {
    let key = DataKey::Treasury(token.clone());
    let current: i128 = e.storage().instance().get(&key).unwrap_or(0);
    e.storage().instance().set(&key, &0i128);
    bump_instance(e);
    current
}
