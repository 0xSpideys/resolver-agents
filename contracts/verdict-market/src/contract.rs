//! Verdict market contract entrypoints.
//!
//! Read docs/SPEC.md before changing anything here. The invariants in
//! CLAUDE.md are not suggestions — several of them are the only thing standing
//! between a rounding bug and stranded escrow.

use soroban_sdk::{contract, contractimpl, token, Address, BytesN, Env, String, Vec};

use crate::errors::Error;
use crate::events::*;
use crate::external::{IdentityClient, ReputationClient};
use crate::math;
use crate::storage as st;
use crate::types::*;

#[contract]
pub struct VerdictMarket;

#[contractimpl]
impl VerdictMarket {
    /* ================================================================= init */

    pub fn __constructor(e: Env, cfg: Config) {
        if st::has_config(&e) {
            panic_with(&e, Error::AlreadyInitialized);
        }
        validate_config(&e, &cfg);
        st::set_config(&e, &cfg);
    }

    /* ================================================================ admin */

    pub fn set_config(e: Env, cfg: Config) -> Result<(), Error> {
        let current = st::get_config(&e)?;
        current.admin.require_auth();
        validate_config(&e, &cfg);
        st::set_config(&e, &cfg);
        Ok(())
    }

    /// The v2 hook. Point this at a staked arbitration contract and the trusted
    /// backstop is gone without touching anything else.
    pub fn set_dispute_resolver(e: Env, resolver: Address) -> Result<(), Error> {
        let mut cfg = st::get_config(&e)?;
        cfg.admin.require_auth();
        cfg.dispute_resolver = resolver;
        st::set_config(&e, &cfg);
        Ok(())
    }

    /// Escape hatch: the 8004 registries carry their own upgrade mechanism and
    /// could be redeployed under us.
    pub fn set_registries(e: Env, identity: Address, reputation: Address) -> Result<(), Error> {
        let mut cfg = st::get_config(&e)?;
        cfg.admin.require_auth();
        cfg.identity_registry = identity;
        cfg.reputation_registry = reputation;
        st::set_config(&e, &cfg);
        Ok(())
    }

    pub fn set_paused(e: Env, paused: bool) -> Result<(), Error> {
        let mut cfg = st::get_config(&e)?;
        cfg.admin.require_auth();
        cfg.paused = paused;
        st::set_config(&e, &cfg);
        Ok(())
    }

    /// Moves accrued protocol fees out of the contract. Only fees — user escrow
    /// and live bonds are never part of this balance.
    pub fn withdraw_fees(e: Env, token_addr: Address) -> Result<i128, Error> {
        let cfg = st::get_config(&e)?;
        cfg.admin.require_auth();
        let amount = st::drain_treasury(&e, &token_addr);
        if amount > 0 {
            token::TokenClient::new(&e, &token_addr).transfer(
                &e.current_contract_address(),
                &cfg.treasury,
                &amount,
            );
        }
        Ok(amount)
    }

    /* ====================================================== market lifecycle */

    pub fn create_market(
        e: Env,
        token_addr: Address,
        question_uri: String,
        question_hash: BytesN<32>,
        outcome_count: u32,
        close_ts: u64,
    ) -> Result<u64, Error> {
        let cfg = st::get_config(&e)?;
        require_active(&cfg)?;
        cfg.curator.require_auth();

        // v1 is binary. Typed as u32 throughout so v2 lifts this guard alone.
        if outcome_count != V1_OUTCOME_COUNT {
            return Err(Error::UnsupportedOutcomeCount);
        }
        if close_ts <= e.ledger().timestamp() {
            return Err(Error::InvalidCloseTime);
        }
        if question_uri.is_empty() {
            return Err(Error::InvalidConfig);
        }

        let id = st::next_market_id(&e);
        let m = Market {
            id,
            creator: cfg.curator.clone(),
            token: token_addr.clone(),
            question_uri,
            question_hash: question_hash.clone(),
            outcome_count,
            close_ts,
            resolve_deadline: close_ts + cfg.resolve_window,
            challenge_deadline: 0,
            state: MarketState::Open,
            provisional_outcome: 0,
            final_outcome: 0,
            total_staked: 0,
            bond_pool: 0,
            distributable: 0,
            resolver_pool: 0,
            resolvers_settled: false,
            // Snapshot the economics. A later set_config must not change the
            // deal someone already staked into.
            fee_bps: cfg.fee_bps,
            resolver_fee_bps: cfg.resolver_fee_bps,
            resolver_bond: cfg.resolver_bond,
        };
        st::set_market(&e, &m);
        MarketCreated {
            market_id: id,
            creator: cfg.curator.clone(),
            token: token_addr.clone(),
            close_ts,
            question_hash: question_hash.clone(),
        }
        .publish(&e);
        Ok(id)
    }

    pub fn bet(
        e: Env,
        user: Address,
        market_id: u64,
        outcome: u32,
        amount: i128,
    ) -> Result<i128, Error> {
        let cfg = st::get_config(&e)?;
        require_active(&cfg)?;
        user.require_auth();

        let mut m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Open {
            return Err(Error::InvalidState);
        }
        if e.ledger().timestamp() >= m.close_ts {
            return Err(Error::TradingClosed);
        }
        if outcome >= m.outcome_count {
            return Err(Error::InvalidOutcome);
        }
        if amount <= 0 {
            return Err(Error::AmountTooSmall);
        }

        let escrow = e.current_contract_address();
        token::TokenClient::new(&e, &m.token).transfer(&user, &escrow, &amount);

        let pool = st::add_to_pool(&e, market_id, outcome, amount)?;
        let position = st::add_position(&e, market_id, &user, outcome, amount)?;
        m.total_staked = m
            .total_staked
            .checked_add(amount)
            .ok_or(Error::MathOverflow)?;
        st::set_market(&e, &m);

        BetPlaced {
            market_id,
            user,
            outcome,
            amount,
            pool,
        }
        .publish(&e);
        Ok(position)
    }

    /// Permissionless. A book with an empty side has no counterparty and cannot
    /// pay anyone, so it voids rather than pretending to settle.
    pub fn close_market(e: Env, market_id: u64) -> Result<(), Error> {
        let mut m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Open {
            return Err(Error::InvalidState);
        }
        if e.ledger().timestamp() < m.close_ts {
            return Err(Error::TradingStillOpen);
        }

        let no = st::get_pool(&e, market_id, OUTCOME_NO);
        let yes = st::get_pool(&e, market_id, OUTCOME_YES);
        MarketClosed {
            market_id,
            pool_no: no,
            pool_yes: yes,
        }
        .publish(&e);

        if no <= 0 || yes <= 0 {
            m.state = MarketState::Void;
            st::set_market(&e, &m);
            void_event(&e, market_id, "onesided");
            return Ok(());
        }

        m.state = MarketState::Resolving;
        st::set_market(&e, &m);
        Ok(())
    }

    /// Curator escape hatch for a question that turned out unresolvable.
    pub fn void_market(e: Env, market_id: u64) -> Result<(), Error> {
        let cfg = st::get_config(&e)?;
        cfg.curator.require_auth();
        let mut m = st::get_market(&e, market_id)?;
        if matches!(m.state, MarketState::Settled | MarketState::Void) {
            return Err(Error::InvalidState);
        }
        m.state = MarketState::Void;
        st::set_market(&e, &m);
        void_event(&e, market_id, "curator");
        Ok(())
    }

    /* ======================================================= resolver layer */

    pub fn submit_outcome(
        e: Env,
        submitter: Address,
        agent_id: u32,
        market_id: u64,
        outcome: u32,
        evidence_uri: String,
        evidence_hash: BytesN<32>,
    ) -> Result<u32, Error> {
        let cfg = st::get_config(&e)?;
        require_active(&cfg)?;
        submitter.require_auth();

        let mut m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Resolving {
            return Err(Error::InvalidState);
        }
        if e.ledger().timestamp() >= m.resolve_deadline {
            return Err(Error::ResolveWindowClosed);
        }
        if outcome >= m.outcome_count {
            return Err(Error::InvalidOutcome);
        }
        // Evidence is not optional. A resolution nobody can audit is worth
        // nothing, and this is the cheapest place to enforce it.
        if evidence_uri.is_empty() {
            return Err(Error::EvidenceRequired);
        }
        if st::get_submission(&e, market_id, agent_id).is_some() {
            return Err(Error::AlreadySubmitted);
        }

        // 8004 identity gate.
        let identity = IdentityClient::new(&e, &cfg.identity_registry);
        if !identity.agent_exists(&agent_id) {
            return Err(Error::AgentNotRegistered);
        }
        match identity.find_owner(&agent_id) {
            Some(owner) if owner == submitter => {}
            _ => return Err(Error::NotAgentOwner),
        }

        // Weight is read from Verdict's own O(1) counters, never from the
        // registry's O(n) get_summary. See docs/SPEC.md §4.3.
        let stats = st::get_stats(&e, agent_id);
        let weight =
            math::weight_from_stats(stats.correct, stats.wrong, cfg.weight_min, cfg.weight_max);

        let escrow = e.current_contract_address();
        token::TokenClient::new(&e, &m.token).transfer(&submitter, &escrow, &m.resolver_bond);

        st::push_submission_id(&e, market_id, agent_id)?;
        st::set_submission(
            &e,
            market_id,
            &Submission {
                agent_id,
                submitter,
                outcome,
                evidence_uri,
                evidence_hash: evidence_hash.clone(),
                // Snapshotted: a later reputation change must not rewrite a
                // tally that has already happened.
                weight,
                bond: m.resolver_bond,
                submitted_at: e.ledger().timestamp(),
                settled: false,
            },
        );

        m.bond_pool = m
            .bond_pool
            .checked_add(m.resolver_bond)
            .ok_or(Error::MathOverflow)?;
        st::set_market(&e, &m);

        OutcomeSubmitted {
            market_id,
            agent_id,
            outcome,
            weight,
            evidence_hash,
        }
        .publish(&e);
        Ok(weight)
    }

    /// Permissionless weighted tally.
    ///
    /// Two cases void the market rather than settling it: no submissions at
    /// all, and an exact weight tie. Both return `Ok` with a zeroed tally —
    /// returning an error would revert the state write and leave the market
    /// stuck in `Resolving` with the escrow trapped behind it.
    pub fn tally(e: Env, market_id: u64) -> Result<TallyResult, Error> {
        let cfg = st::get_config(&e)?;
        let mut m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Resolving {
            return Err(Error::InvalidState);
        }
        if e.ledger().timestamp() < m.resolve_deadline {
            return Err(Error::ResolveWindowOpen);
        }

        let ids = st::submission_ids(&e, market_id);
        if ids.is_empty() {
            // Returning Err here would roll the Void write back and strand the
            // market in Resolving forever, with the escrow locked behind it.
            // Voiding *is* the outcome, so this is a success.
            m.state = MarketState::Void;
            st::set_market(&e, &m);
            void_event(&e, market_id, "noresolvers");
            return Ok(TallyResult {
                outcome: 0,
                weight_for: 0,
                weight_total: 0,
                submission_count: 0,
            });
        }

        let (weight_no, weight_yes) = weigh(&e, market_id, &ids);
        let weight_total = weight_no + weight_yes;

        if weight_no == weight_yes {
            m.state = MarketState::Void;
            st::set_market(&e, &m);
            void_event(&e, market_id, "tie");
            return Ok(TallyResult {
                outcome: 0,
                weight_for: weight_no,
                weight_total,
                submission_count: ids.len(),
            });
        }

        let (outcome, weight_for) = if weight_yes > weight_no {
            (OUTCOME_YES, weight_yes)
        } else {
            (OUTCOME_NO, weight_no)
        };

        m.provisional_outcome = outcome;
        m.state = MarketState::Tallied;
        m.challenge_deadline = e.ledger().timestamp() + cfg.challenge_window;
        st::set_market(&e, &m);

        Tallied {
            market_id,
            outcome,
            weight_for,
            weight_total,
            submission_count: ids.len(),
        }
        .publish(&e);
        Ok(TallyResult {
            outcome,
            weight_for,
            weight_total,
            submission_count: ids.len(),
        })
    }

    pub fn challenge(
        e: Env,
        challenger: Address,
        market_id: u64,
        reason_uri: String,
    ) -> Result<(), Error> {
        let cfg = st::get_config(&e)?;
        require_active(&cfg)?;
        challenger.require_auth();

        let mut m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Tallied {
            return Err(Error::InvalidState);
        }
        if e.ledger().timestamp() >= m.challenge_deadline {
            return Err(Error::ChallengeWindowClosed);
        }
        if st::get_challenge(&e, market_id).is_some() {
            return Err(Error::AlreadyChallenged);
        }

        let bond = m.resolver_bond * cfg.challenge_bond_mult as i128;
        let escrow = e.current_contract_address();
        token::TokenClient::new(&e, &m.token).transfer(&challenger, &escrow, &bond);

        st::set_challenge(
            &e,
            market_id,
            &Challenge {
                challenger: challenger.clone(),
                bond,
                reason_uri,
                raised_at: e.ledger().timestamp(),
            },
        );
        m.state = MarketState::Disputed;
        st::set_market(&e, &m);

        Challenged {
            market_id,
            challenger: challenger.clone(),
            bond,
        }
        .publish(&e);
        Ok(())
    }

    /// v1 backstop: the configured dispute resolver decides. In v1 that is the
    /// curator, which is a trusted role and is documented as such.
    pub fn resolve_dispute(e: Env, market_id: u64, final_outcome: u32) -> Result<(), Error> {
        let cfg = st::get_config(&e)?;
        cfg.dispute_resolver.require_auth();

        let m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Disputed {
            return Err(Error::InvalidState);
        }
        if final_outcome >= m.outcome_count {
            return Err(Error::InvalidOutcome);
        }

        let ch = st::get_challenge(&e, market_id).ok_or(Error::NotChallenged)?;
        let upheld = final_outcome != m.provisional_outcome;
        let tc = token::TokenClient::new(&e, &m.token);

        if upheld {
            // Bond back, plus a reward from the treasury. Routing it through
            // the treasury keeps "penalties go to the protocol" intact while
            // still giving anyone a reason to challenge a bad tally.
            tc.transfer(&e.current_contract_address(), &ch.challenger, &ch.bond);
            let available = st::treasury_balance(&e, &m.token);
            let reward = cfg.challenger_reward.min(available);
            if reward > 0 {
                st::accrue_treasury(&e, &m.token, -reward)?;
                tc.transfer(&e.current_contract_address(), &ch.challenger, &reward);
            }
        } else {
            st::accrue_treasury(&e, &m.token, ch.bond)?;
            FeeAccrued {
                token: m.token.clone(),
                amount: ch.bond,
            }
            .publish(&e);
        }

        DisputeResolved {
            market_id,
            final_outcome,
            upheld,
        }
        .publish(&e);
        settle(&e, m, final_outcome)
    }

    /// Permissionless finalisation once the challenge window has passed clean.
    pub fn finalize(e: Env, market_id: u64) -> Result<(), Error> {
        let m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Tallied {
            return Err(Error::InvalidState);
        }
        if e.ledger().timestamp() < m.challenge_deadline {
            return Err(Error::ChallengeWindowOpen);
        }
        let outcome = m.provisional_outcome;
        settle(&e, m, outcome)
    }

    /// Pays correct resolvers, slashes wrong ones, updates Verdict's counters
    /// and writes the result to the 8004 Reputation Registry.
    ///
    /// Permissionless and idempotent. On a void market it simply returns every
    /// bond and records nothing — a market that produced no outcome cannot say
    /// anything about who was right.
    pub fn settle_resolvers(e: Env, market_id: u64) -> Result<(), Error> {
        let cfg = st::get_config(&e)?;
        let mut m = st::get_market(&e, market_id)?;
        if !matches!(m.state, MarketState::Settled | MarketState::Void) {
            return Err(Error::MarketNotSettled);
        }
        if m.resolvers_settled {
            return Err(Error::ResolverAlreadySettled);
        }

        let ids = st::submission_ids(&e, market_id);
        let tc = token::TokenClient::new(&e, &m.token);
        let contract = e.current_contract_address();
        let void = m.state == MarketState::Void;

        // Pass 1: total weight among the resolvers who got it right.
        let mut total_correct_weight: u32 = 0;
        if !void {
            for agent_id in ids.iter() {
                if let Some(s) = st::get_submission(&e, market_id, agent_id) {
                    if s.outcome == m.final_outcome {
                        total_correct_weight += s.weight;
                    }
                }
            }
        }

        // Pass 2: settle each resolver.
        let mut paid_out: i128 = 0;
        for agent_id in ids.iter() {
            let Some(mut s) = st::get_submission(&e, market_id, agent_id) else {
                continue;
            };
            if s.settled {
                continue;
            }
            s.settled = true;

            if void {
                tc.transfer(&contract, &s.submitter, &s.bond);
                st::set_submission(&e, market_id, &s);
                continue;
            }

            let correct = s.outcome == m.final_outcome;
            if correct {
                let reward = math::resolver_share(s.weight, total_correct_weight, m.resolver_pool)?;
                let total = s.bond.checked_add(reward).ok_or(Error::MathOverflow)?;
                paid_out += reward;
                tc.transfer(&contract, &s.submitter, &total);
                ResolverSettled {
                    market_id,
                    agent_id,
                    correct: true,
                    amount: reward,
                }
                .publish(&e);
            } else {
                st::accrue_treasury(&e, &m.token, s.bond)?;
                ResolverSettled {
                    market_id,
                    agent_id,
                    correct: false,
                    amount: -s.bond,
                }
                .publish(&e);
            }

            st::set_submission(&e, market_id, &s);
            st::record_result(&e, agent_id, correct);
            write_feedback(&e, &cfg, agent_id, market_id, correct, &s);
        }

        // Nobody was right, or rounding left a remainder: the resolver pool has
        // no rightful recipient, so it goes to the treasury rather than sitting
        // in the contract forever.
        if !void {
            let leftover = m.resolver_pool - paid_out;
            if leftover > 0 {
                st::accrue_treasury(&e, &m.token, leftover)?;
                FeeAccrued {
                    token: m.token.clone(),
                    amount: leftover,
                }
                .publish(&e);
            }
        }

        m.resolvers_settled = true;
        m.bond_pool = 0;
        st::set_market(&e, &m);
        Ok(())
    }

    /* ============================================================== payouts */

    pub fn claim(e: Env, user: Address, market_id: u64) -> Result<i128, Error> {
        user.require_auth();
        let m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Settled {
            return Err(Error::MarketNotSettled);
        }
        if st::has_claimed(&e, market_id, &user) {
            return Err(Error::AlreadyClaimed);
        }

        let stake = st::get_position(&e, market_id, &user, m.final_outcome);
        if stake <= 0 {
            return Err(Error::NothingToClaim);
        }
        let winning_pool = st::get_pool(&e, market_id, m.final_outcome);
        let payout = math::parimutuel_payout(stake, winning_pool, m.distributable)?;

        st::mark_claimed(&e, market_id, &user);
        token::TokenClient::new(&e, &m.token).transfer(
            &e.current_contract_address(),
            &user,
            &payout,
        );
        Claimed {
            market_id,
            user,
            amount: payout,
        }
        .publish(&e);
        Ok(payout)
    }

    /// Void markets refund every stake 1:1 across both sides. No fee is taken.
    pub fn refund(e: Env, user: Address, market_id: u64) -> Result<i128, Error> {
        user.require_auth();
        let m = st::get_market(&e, market_id)?;
        if m.state != MarketState::Void {
            return Err(Error::InvalidState);
        }
        if st::has_claimed(&e, market_id, &user) {
            return Err(Error::AlreadyClaimed);
        }

        let mut total: i128 = 0;
        for outcome in 0..m.outcome_count {
            total += st::get_position(&e, market_id, &user, outcome);
        }
        if total <= 0 {
            return Err(Error::NothingToClaim);
        }

        st::mark_claimed(&e, market_id, &user);
        token::TokenClient::new(&e, &m.token).transfer(
            &e.current_contract_address(),
            &user,
            &total,
        );
        Refunded {
            market_id,
            user,
            amount: total,
        }
        .publish(&e);
        Ok(total)
    }

    /* ================================================================ reads */

    pub fn get_config(e: Env) -> Result<Config, Error> {
        st::get_config(&e)
    }

    pub fn get_market(e: Env, market_id: u64) -> Result<Market, Error> {
        st::get_market(&e, market_id)
    }

    pub fn market_count(e: Env) -> u64 {
        st::market_count(&e)
    }

    pub fn get_pools(e: Env, market_id: u64) -> Vec<i128> {
        let mut v = Vec::new(&e);
        v.push_back(st::get_pool(&e, market_id, OUTCOME_NO));
        v.push_back(st::get_pool(&e, market_id, OUTCOME_YES));
        v
    }

    pub fn get_position(e: Env, market_id: u64, user: Address, outcome: u32) -> i128 {
        st::get_position(&e, market_id, &user, outcome)
    }

    pub fn get_submission(e: Env, market_id: u64, agent_id: u32) -> Option<Submission> {
        st::get_submission(&e, market_id, agent_id)
    }

    pub fn get_submissions(e: Env, market_id: u64) -> Vec<Submission> {
        let mut out = Vec::new(&e);
        for id in st::submission_ids(&e, market_id).iter() {
            if let Some(s) = st::get_submission(&e, market_id, id) {
                out.push_back(s);
            }
        }
        out
    }

    pub fn get_challenge(e: Env, market_id: u64) -> Option<Challenge> {
        st::get_challenge(&e, market_id)
    }

    pub fn get_agent_stats(e: Env, agent_id: u32) -> AgentStats {
        st::get_stats(&e, agent_id)
    }

    /// The weight this agent would carry on a submission made right now.
    pub fn get_weight(e: Env, agent_id: u32) -> Result<u32, Error> {
        let cfg = st::get_config(&e)?;
        let s = st::get_stats(&e, agent_id);
        Ok(math::weight_from_stats(
            s.correct,
            s.wrong,
            cfg.weight_min,
            cfg.weight_max,
        ))
    }

    /// What a stake on `outcome` would pay if the market settled that way with
    /// the pools as they stand. Used by the UI to show live odds.
    pub fn quote_payout(e: Env, market_id: u64, outcome: u32, stake: i128) -> Result<i128, Error> {
        let m = st::get_market(&e, market_id)?;
        if outcome >= m.outcome_count {
            return Err(Error::InvalidOutcome);
        }
        let winning_pool = st::get_pool(&e, market_id, outcome) + stake;
        let losing_pool = m.total_staked - st::get_pool(&e, market_id, outcome);
        let split = math::split_fees(losing_pool, m.fee_bps, m.resolver_fee_bps)?;
        math::parimutuel_payout(stake, winning_pool, split.distributable)
    }

    pub fn treasury_balance(e: Env, token_addr: Address) -> i128 {
        st::treasury_balance(&e, &token_addr)
    }
}

/* ==================================================================== helpers */

fn require_active(cfg: &Config) -> Result<(), Error> {
    if cfg.paused {
        return Err(Error::Paused);
    }
    Ok(())
}

fn validate_config(e: &Env, cfg: &Config) {
    let bad = cfg.fee_bps > BPS_DENOM
        || cfg.resolver_fee_bps > BPS_DENOM
        || cfg.resolver_bond <= 0
        || cfg.challenge_bond_mult == 0
        || cfg.challenger_reward < 0
        || cfg.resolve_window == 0
        || cfg.challenge_window == 0
        || cfg.weight_min == 0
        || cfg.weight_max < cfg.weight_min;
    if bad {
        panic_with(e, Error::InvalidConfig);
    }
}

/// Sum submission weights per outcome. Binary in v1, so a pair is enough.
fn weigh(e: &Env, market_id: u64, ids: &Vec<u32>) -> (u32, u32) {
    let mut no: u32 = 0;
    let mut yes: u32 = 0;
    for agent_id in ids.iter() {
        if let Some(s) = st::get_submission(e, market_id, agent_id) {
            if s.outcome == OUTCOME_YES {
                yes += s.weight;
            } else {
                no += s.weight;
            }
        }
    }
    (no, yes)
}

/// Lock the final outcome and snapshot the settlement numbers.
///
/// A winning pool of zero means nobody can be paid, so the market voids rather
/// than settling into a state where escrow has no claimant.
fn settle(e: &Env, mut m: Market, final_outcome: u32) -> Result<(), Error> {
    let winning_pool = st::get_pool(e, m.id, final_outcome);
    if winning_pool <= 0 {
        m.state = MarketState::Void;
        st::set_market(e, &m);
        void_event(e, m.id, "nowinner");
        return Ok(());
    }

    let losing_pool = m.total_staked - winning_pool;
    let split = math::split_fees(losing_pool, m.fee_bps, m.resolver_fee_bps)?;

    m.final_outcome = final_outcome;
    m.distributable = split.distributable;
    m.resolver_pool = split.resolver_pool;
    m.state = MarketState::Settled;
    st::set_market(e, &m);

    if split.protocol_cut > 0 {
        st::accrue_treasury(e, &m.token, split.protocol_cut)?;
        FeeAccrued {
            token: m.token.clone(),
            amount: split.protocol_cut,
        }
        .publish(e);
    }
    MarketSettled {
        market_id: m.id,
        final_outcome,
        distributable: split.distributable,
    }
    .publish(e);
    Ok(())
}

/// Write the result to 8004 so the agent's record is public and portable.
///
/// Uses the fallible client: a registry that is paused, upgraded or otherwise
/// unavailable must not be able to freeze Verdict's own settlement. Verdict's
/// local counters are already updated by this point, so weighting stays correct
/// either way and the public record can be backfilled.
fn write_feedback(
    e: &Env,
    cfg: &Config,
    agent_id: u32,
    market_id: u64,
    correct: bool,
    s: &Submission,
) {
    let reputation = ReputationClient::new(e, &cfg.reputation_registry);
    let _ = reputation.try_give_feedback(
        &e.current_contract_address(),
        &agent_id,
        &if correct {
            FEEDBACK_CORRECT
        } else {
            FEEDBACK_WRONG
        },
        &0u32,
        &String::from_str(e, FEEDBACK_TAG),
        &market_tag(e, market_id),
        &String::from_str(e, ""),
        &s.evidence_uri,
        &s.evidence_hash,
    );
}

/// `tag2` carries the market id so a reader can trace a feedback entry back to
/// the resolution that produced it.
fn market_tag(e: &Env, market_id: u64) -> String {
    // Soroban has no integer formatting in no_std; a short fixed encoding keeps
    // this cheap and is enough for a lookup key.
    let digits = b"0123456789";
    let mut buf = [b'0'; 20];
    let mut n = market_id;
    let mut i = buf.len();
    if n == 0 {
        i -= 1;
    }
    while n > 0 {
        i -= 1;
        buf[i] = digits[(n % 10) as usize];
        n /= 10;
    }
    let slice = &buf[i..];
    String::from_bytes(e, slice)
}

fn void_event(e: &Env, market_id: u64, reason: &str) {
    MarketVoided {
        market_id,
        reason: String::from_str(e, reason),
    }
    .publish(e);
}

fn panic_with(e: &Env, err: Error) -> ! {
    soroban_sdk::panic_with_error!(e, err)
}
