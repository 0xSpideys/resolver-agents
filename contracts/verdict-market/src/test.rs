#![cfg(test)]
//! Integration tests against mock 8004 registries.
//!
//! The mocks implement exactly the two calls Verdict makes (`agent_exists` /
//! `find_owner` on identity, `give_feedback` on reputation) with the same
//! signatures as the deployed trionlabs contracts, so a test that passes here
//! exercises the same code path that runs on testnet.
//!
//! Tests are named after the property they protect.
extern crate std;

use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{
    contract, contractimpl, symbol_short, token, Address, BytesN, Env, String, Symbol, Vec,
};

/// Counter key for the mock identity registry. Kept distinct from the agent-id
/// keys so registering agent 0 cannot clobber the counter.
const NEXT_ID: Symbol = symbol_short!("next_id");

use crate::contract::{VerdictMarket, VerdictMarketClient};
use crate::errors::Error;
use crate::types::*;

/* ================================================================== mocks */

#[contract]
pub struct MockIdentity;

/// Agents are seeded by `register`, which mirrors the real registry's
/// incrementing token id.
#[contractimpl]
impl MockIdentity {
    pub fn register(e: Env, owner: Address) -> u32 {
        let next: u32 = e.storage().instance().get(&NEXT_ID).unwrap_or(0);
        e.storage().instance().set(&NEXT_ID, &(next + 1));
        e.storage().instance().set(&next, &owner);
        next
    }

    pub fn agent_exists(e: Env, agent_id: u32) -> bool {
        e.storage().instance().has(&agent_id)
    }

    pub fn find_owner(e: Env, agent_id: u32) -> Option<Address> {
        e.storage().instance().get(&agent_id)
    }
}

#[contract]
pub struct MockReputation;

/// Records what Verdict wrote so tests can assert the public record matches the
/// contract's local counters.
#[contractimpl]
impl MockReputation {
    #[allow(clippy::too_many_arguments)]
    pub fn give_feedback(
        e: Env,
        caller: Address,
        agent_id: u32,
        value: i128,
        _value_decimals: u32,
        _tag1: String,
        _tag2: String,
        _endpoint: String,
        _feedback_uri: String,
        _feedback_hash: BytesN<32>,
    ) {
        caller.require_auth();
        let mut log: Vec<i128> = e
            .storage()
            .instance()
            .get(&agent_id)
            .unwrap_or(Vec::new(&e));
        log.push_back(value);
        e.storage().instance().set(&agent_id, &log);
    }

    pub fn feedback_for(e: Env, agent_id: u32) -> Vec<i128> {
        e.storage()
            .instance()
            .get(&agent_id)
            .unwrap_or(Vec::new(&e))
    }
}

/* ================================================================ harness */

const DAY: u64 = 86_400;
const UNIT: i128 = 10_000_000; // 7 decimals, like USDC on Stellar

struct Ctx {
    e: Env,
    market: VerdictMarketClient<'static>,
    identity: MockIdentityClient<'static>,
    reputation: MockReputationClient<'static>,
    token: Address,
    sac: token::StellarAssetClient<'static>,
    coin: token::TokenClient<'static>,
    treasury: Address,
}

impl Ctx {
    fn new() -> Self {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().with_mut(|l| l.timestamp = 1_000_000);

        let admin = Address::generate(&e);
        let curator = Address::generate(&e);
        let treasury = Address::generate(&e);

        let issuer = Address::generate(&e);
        let asset = e.register_stellar_asset_contract_v2(issuer);
        let token = asset.address();

        let identity = MockIdentityClient::new(&e, &e.register(MockIdentity, ()));
        let reputation = MockReputationClient::new(&e, &e.register(MockReputation, ()));

        let cfg = Config {
            admin: admin.clone(),
            curator: curator.clone(),
            dispute_resolver: curator.clone(),
            treasury: treasury.clone(),
            identity_registry: identity.address.clone(),
            reputation_registry: reputation.address.clone(),
            fee_bps: 200,
            resolver_fee_bps: 6_000,
            resolver_bond: 10 * UNIT,
            challenge_bond_mult: 2,
            challenger_reward: 5 * UNIT,
            resolve_window: DAY,
            challenge_window: DAY,
            weight_min: 100,
            weight_max: 300,
            paused: false,
        };
        let market = VerdictMarketClient::new(&e, &e.register(VerdictMarket, (cfg,)));

        Ctx {
            sac: token::StellarAssetClient::new(&e, &token),
            coin: token::TokenClient::new(&e, &token),
            e,
            market,
            identity,
            reputation,
            token,
            treasury,
        }
    }

    fn funded(&self, amount: i128) -> Address {
        let a = Address::generate(&self.e);
        self.sac.mint(&a, &amount);
        a
    }

    /// Registers an 8004 agent owned by a freshly funded address.
    fn agent(&self) -> (u32, Address) {
        let owner = self.funded(1_000 * UNIT);
        let id = self.identity.register(&owner);
        (id, owner)
    }

    fn hash(&self, seed: u8) -> BytesN<32> {
        BytesN::from_array(&self.e, &[seed; 32])
    }

    fn open_market(&self) -> u64 {
        self.market.create_market(
            &self.token,
            &String::from_str(&self.e, "ipfs://question"),
            &self.hash(1),
            &2,
            &(self.e.ledger().timestamp() + DAY),
        )
    }

    fn warp(&self, secs: u64) {
        let t = self.e.ledger().timestamp();
        self.e.ledger().with_mut(|l| l.timestamp = t + secs);
    }

    fn submit(&self, market_id: u64, agent: u32, owner: &Address, outcome: u32) {
        self.market.submit_outcome(
            owner,
            &agent,
            &market_id,
            &outcome,
            &String::from_str(&self.e, "ipfs://evidence"),
            &self.hash(9),
        );
    }

    /// Escrow held by the contract. Used to assert nothing is created or lost.
    fn escrow(&self) -> i128 {
        self.coin.balance(&self.market.address)
    }
}

/* ============================================================ happy paths */

#[test]
fn full_lifecycle_pays_winners_and_correct_resolvers() {
    let c = Ctx::new();
    let id = c.open_market();

    let alice = c.funded(100 * UNIT); // YES
    let bob = c.funded(100 * UNIT); // NO
    c.market.bet(&alice, &id, &OUTCOME_YES, &(60 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(40 * UNIT));

    let (a1, o1) = c.agent();
    let (a2, o2) = c.agent();

    c.warp(DAY);
    c.market.close_market(&id);
    assert_eq!(c.market.get_market(&id).state, MarketState::Resolving);

    c.submit(id, a1, &o1, OUTCOME_YES);
    c.submit(id, a2, &o2, OUTCOME_YES);

    c.warp(DAY);
    let tally = c.market.tally(&id);
    assert_eq!(tally.outcome, OUTCOME_YES);
    assert_eq!(tally.submission_count, 2);

    c.warp(DAY);
    c.market.finalize(&id);
    let m = c.market.get_market(&id);
    assert_eq!(m.state, MarketState::Settled);
    assert_eq!(m.final_outcome, OUTCOME_YES);

    // 40 lost, 2% fee = 0.8, of which 60% to resolvers.
    assert_eq!(m.distributable, 40 * UNIT - (40 * UNIT * 200 / 10_000));
    assert_eq!(m.resolver_pool, (40 * UNIT * 200 / 10_000) * 6_000 / 10_000);

    let before = c.coin.balance(&alice);
    let payout = c.market.claim(&alice, &id);
    assert_eq!(c.coin.balance(&alice) - before, payout);
    assert!(payout > 60 * UNIT, "the winner should be up on the trade");

    c.market.settle_resolvers(&id);
    for (agent, owner) in [(a1, &o1), (a2, &o2)] {
        let stats = c.market.get_agent_stats(&agent);
        assert_eq!((stats.correct, stats.wrong), (1, 0));
        // Bond returned plus a reward, so the resolver is up on the job.
        assert!(c.coin.balance(owner) > 1_000 * UNIT);
        assert_eq!(
            c.reputation.feedback_for(&agent),
            Vec::from_array(&c.e, [100i128])
        );
    }
}

#[test]
fn a_wrong_resolver_loses_its_bond_and_the_record_says_so() {
    let c = Ctx::new();
    let id = c.open_market();

    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(60 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(40 * UNIT));

    let (good, good_owner) = c.agent();
    let (bad, bad_owner) = c.agent();
    let bad_before = c.coin.balance(&bad_owner);

    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, good, &good_owner, OUTCOME_YES);
    c.submit(id, bad, &bad_owner, OUTCOME_NO);

    // Equal weights (both new) would tie, so give the honest one a track record
    // first — instead, break the tie by adding a second honest agent.
    let (good2, good2_owner) = c.agent();
    c.submit(id, good2, &good2_owner, OUTCOME_YES);

    c.warp(DAY);
    assert_eq!(c.market.tally(&id).outcome, OUTCOME_YES);
    c.warp(DAY);
    c.market.finalize(&id);
    c.market.settle_resolvers(&id);

    let stats = c.market.get_agent_stats(&bad);
    assert_eq!((stats.correct, stats.wrong), (0, 1));
    assert_eq!(
        c.coin.balance(&bad_owner),
        bad_before - 10 * UNIT,
        "the whole bond should be gone"
    );
    assert_eq!(
        c.reputation.feedback_for(&bad),
        Vec::from_array(&c.e, [-100i128])
    );
    assert!(c.market.treasury_balance(&c.token) >= 10 * UNIT);
}

#[test]
fn being_right_raises_your_weight_on_the_next_market() {
    let c = Ctx::new();
    let (agent, owner) = c.agent();
    assert_eq!(
        c.market.get_weight(&agent),
        100,
        "a new agent starts at 1.00x"
    );

    // Resolve one market correctly.
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);
    c.market.settle_resolvers(&id);

    assert_eq!(
        c.market.get_weight(&agent),
        300,
        "a perfect record should reach the ceiling"
    );
}

#[test]
fn weight_is_snapshotted_so_a_later_result_cannot_rewrite_an_old_tally() {
    let c = Ctx::new();
    let (agent, owner) = c.agent();

    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);

    let submitted_weight = c.market.get_submission(&id, &agent).unwrap().weight;
    assert_eq!(submitted_weight, 100);

    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);
    c.market.settle_resolvers(&id);

    // The agent's live weight has moved, but the historical submission has not.
    assert_eq!(c.market.get_weight(&agent), 300);
    assert_eq!(c.market.get_submission(&id, &agent).unwrap().weight, 100);
}

/* ==================================================================== void */

#[test]
fn a_one_sided_book_voids_and_refunds_in_full() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(60 * UNIT));

    c.warp(DAY);
    c.market.close_market(&id);
    assert_eq!(c.market.get_market(&id).state, MarketState::Void);

    let refunded = c.market.refund(&alice, &id);
    assert_eq!(refunded, 60 * UNIT, "a void market takes no fee");
    assert_eq!(c.coin.balance(&alice), 100 * UNIT);
    assert_eq!(c.escrow(), 0);
}

#[test]
fn no_submissions_voids_the_market() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));

    c.warp(DAY);
    c.market.close_market(&id);
    c.warp(DAY);
    // Voiding is a successful outcome, not an error — an error would revert the
    // state write and trap the escrow in Resolving.
    assert_eq!(c.market.tally(&id).submission_count, 0);
    assert_eq!(c.market.get_market(&id).state, MarketState::Void);

    assert_eq!(c.market.refund(&alice, &id), 50 * UNIT);
    assert_eq!(c.market.refund(&bob, &id), 50 * UNIT);
    assert_eq!(c.escrow(), 0);
}

#[test]
fn an_exact_weight_tie_voids_rather_than_guessing() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));

    let (a1, o1) = c.agent();
    let (a2, o2) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, a1, &o1, OUTCOME_YES);
    c.submit(id, a2, &o2, OUTCOME_NO); // same weight, opposite calls

    c.warp(DAY);
    c.market.tally(&id);
    assert_eq!(c.market.get_market(&id).state, MarketState::Void);

    // Void returns every bond and records nothing about who was right.
    c.market.settle_resolvers(&id);
    assert_eq!(c.coin.balance(&o1), 1_000 * UNIT);
    assert_eq!(c.coin.balance(&o2), 1_000 * UNIT);
    assert_eq!(c.market.get_agent_stats(&a1).correct, 0);
    assert_eq!(c.market.get_agent_stats(&a1).wrong, 0);
}

/* =============================================================== disputes */

#[test]
fn an_upheld_challenge_flips_the_outcome_and_pays_the_challenger() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));

    let (liar, liar_owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, liar, &liar_owner, OUTCOME_YES);
    c.warp(DAY);
    assert_eq!(c.market.tally(&id).outcome, OUTCOME_YES);

    let challenger = c.funded(100 * UNIT);
    c.market
        .challenge(&challenger, &id, &String::from_str(&c.e, "ipfs://why"));
    assert_eq!(c.market.get_market(&id).state, MarketState::Disputed);

    // The dispute resolver overrules the tally.
    c.market.resolve_dispute(&id, &OUTCOME_NO);
    let m = c.market.get_market(&id);
    assert_eq!(m.state, MarketState::Settled);
    assert_eq!(m.final_outcome, OUTCOME_NO);

    // Bond returned. The reward is capped by whatever the treasury holds.
    assert!(c.coin.balance(&challenger) >= 100 * UNIT);

    c.market.settle_resolvers(&id);
    assert_eq!(c.market.get_agent_stats(&liar).wrong, 1);
}

#[test]
fn a_rejected_challenge_forfeits_the_bond_to_the_treasury() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));

    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);

    let challenger = c.funded(100 * UNIT);
    c.market
        .challenge(&challenger, &id, &String::from_str(&c.e, "ipfs://why"));
    // Resolver agrees with the tally: the challenge fails.
    c.market.resolve_dispute(&id, &OUTCOME_YES);

    assert_eq!(
        c.coin.balance(&challenger),
        80 * UNIT,
        "2x resolver bond forfeited"
    );
    assert!(c.market.treasury_balance(&c.token) >= 20 * UNIT);
}

/* ============================================================== rejections */

#[test]
fn an_unregistered_agent_cannot_submit() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    c.warp(DAY);
    c.market.close_market(&id);

    let stranger = c.funded(100 * UNIT);
    let res = c.market.try_submit_outcome(
        &stranger,
        &999,
        &id,
        &OUTCOME_YES,
        &String::from_str(&c.e, "ipfs://e"),
        &c.hash(9),
    );
    assert_eq!(res, Err(Ok(Error::AgentNotRegistered)));
}

#[test]
fn only_the_agent_owner_can_submit_for_it() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, _owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);

    let impostor = c.funded(100 * UNIT);
    let res = c.market.try_submit_outcome(
        &impostor,
        &agent,
        &id,
        &OUTCOME_YES,
        &String::from_str(&c.e, "ipfs://e"),
        &c.hash(9),
    );
    assert_eq!(res, Err(Ok(Error::NotAgentOwner)));
}

#[test]
fn an_agent_gets_one_submission_per_market() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);

    let res = c.market.try_submit_outcome(
        &owner,
        &agent,
        &id,
        &OUTCOME_NO,
        &String::from_str(&c.e, "ipfs://e"),
        &c.hash(9),
    );
    assert_eq!(res, Err(Ok(Error::AlreadySubmitted)));
}

#[test]
fn evidence_is_mandatory() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);

    let res = c.market.try_submit_outcome(
        &owner,
        &agent,
        &id,
        &OUTCOME_YES,
        &String::from_str(&c.e, ""),
        &c.hash(9),
    );
    assert_eq!(res, Err(Ok(Error::EvidenceRequired)));
}

#[test]
fn trading_stops_at_close_time() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    c.warp(DAY);
    assert_eq!(
        c.market.try_bet(&alice, &id, &OUTCOME_YES, &(10 * UNIT)),
        Err(Ok(Error::TradingClosed))
    );
}

#[test]
fn a_zero_bet_is_rejected() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    assert_eq!(
        c.market.try_bet(&alice, &id, &OUTCOME_YES, &0),
        Err(Ok(Error::AmountTooSmall))
    );
}

#[test]
fn double_claim_is_rejected() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);

    c.market.claim(&alice, &id);
    assert_eq!(
        c.market.try_claim(&alice, &id),
        Err(Ok(Error::AlreadyClaimed))
    );
}

#[test]
fn a_loser_has_nothing_to_claim() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);

    assert_eq!(
        c.market.try_claim(&bob, &id),
        Err(Ok(Error::NothingToClaim))
    );
}

#[test]
fn finalize_is_blocked_while_the_challenge_window_is_open() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);

    assert_eq!(
        c.market.try_finalize(&id),
        Err(Ok(Error::ChallengeWindowOpen))
    );
}

#[test]
fn tally_is_blocked_while_resolvers_can_still_submit() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    c.warp(DAY);
    c.market.close_market(&id);
    assert_eq!(c.market.try_tally(&id), Err(Ok(Error::ResolveWindowOpen)));
}

#[test]
fn resolvers_cannot_be_settled_twice() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);

    c.market.settle_resolvers(&id);
    assert_eq!(
        c.market.try_settle_resolvers(&id),
        Err(Ok(Error::ResolverAlreadySettled))
    );
}

#[test]
fn multi_outcome_markets_are_gated_not_broken() {
    let c = Ctx::new();
    let res = c.market.try_create_market(
        &c.token,
        &String::from_str(&c.e, "ipfs://q"),
        &c.hash(1),
        &3,
        &(c.e.ledger().timestamp() + DAY),
    );
    assert_eq!(res, Err(Ok(Error::UnsupportedOutcomeCount)));
}

/* ============================================================= invariants */

#[test]
fn escrow_is_conserved_across_a_full_settlement() {
    let c = Ctx::new();
    let id = c.open_market();

    let winners = [c.funded(100 * UNIT), c.funded(100 * UNIT)];
    let losers = [c.funded(100 * UNIT), c.funded(100 * UNIT)];
    c.market.bet(&winners[0], &id, &OUTCOME_YES, &(70 * UNIT));
    c.market.bet(&winners[1], &id, &OUTCOME_YES, &(30 * UNIT));
    c.market.bet(&losers[0], &id, &OUTCOME_NO, &(45 * UNIT));
    c.market.bet(&losers[1], &id, &OUTCOME_NO, &(35 * UNIT));

    let (a1, o1) = c.agent();
    let (a2, o2) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, a1, &o1, OUTCOME_YES);
    c.submit(id, a2, &o2, OUTCOME_YES);

    let deposited = c.escrow();
    assert_eq!(deposited, 180 * UNIT + 20 * UNIT, "stakes plus two bonds");

    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);

    let paid: i128 = winners.iter().map(|w| c.market.claim(w, &id)).sum();
    c.market.settle_resolvers(&id);

    // Whatever is left in the contract is exactly the accrued treasury balance:
    // protocol fee, plus any rounding dust. Nothing is stranded and nothing was
    // conjured.
    let remaining = c.escrow();
    let treasury = c.market.treasury_balance(&c.token);
    assert_eq!(
        remaining, treasury,
        "leftover escrow must equal the accrued treasury, got {remaining} vs {treasury}"
    );
    assert!(paid <= deposited);

    // And the admin can actually get it out.
    let withdrawn = c.market.withdraw_fees(&c.token);
    assert_eq!(withdrawn, treasury);
    assert_eq!(c.coin.balance(&c.treasury), treasury);
    assert_eq!(c.escrow(), 0, "the contract should end empty");
}

#[test]
fn config_changes_do_not_touch_a_market_already_trading() {
    let c = Ctx::new();
    let id = c.open_market();
    let original = c.market.get_market(&id).fee_bps;

    let mut cfg = c.market.get_config();
    cfg.fee_bps = 9_000; // 90%
    c.market.set_config(&cfg);

    assert_eq!(
        c.market.get_market(&id).fee_bps,
        original,
        "an in-flight market keeps the terms it was created with"
    );
    assert_eq!(c.market.get_config().fee_bps, 9_000);
}

#[test]
fn pausing_stops_new_activity_but_not_settlement() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(100 * UNIT);
    let bob = c.funded(100 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));
    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);

    c.market.set_paused(&true);
    let carol = c.funded(100 * UNIT);
    assert_eq!(
        c.market.try_bet(&carol, &id, &OUTCOME_YES, &UNIT),
        Err(Ok(Error::Paused))
    );

    // Users must always be able to get their money out of a paused contract.
    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);
    assert!(c.market.claim(&alice, &id) > 0);
}

#[test]
fn a_user_can_hold_both_sides_and_still_settles_correctly() {
    let c = Ctx::new();
    let id = c.open_market();
    let hedger = c.funded(100 * UNIT);
    let other = c.funded(100 * UNIT);
    c.market.bet(&hedger, &id, &OUTCOME_YES, &(30 * UNIT));
    c.market.bet(&hedger, &id, &OUTCOME_NO, &(10 * UNIT));
    c.market.bet(&other, &id, &OUTCOME_NO, &(40 * UNIT));

    let (agent, owner) = c.agent();
    c.warp(DAY);
    c.market.close_market(&id);
    c.submit(id, agent, &owner, OUTCOME_YES);
    c.warp(DAY);
    c.market.tally(&id);
    c.warp(DAY);
    c.market.finalize(&id);

    // Only the winning leg pays; the hedged leg is simply lost.
    let payout = c.market.claim(&hedger, &id);
    assert!(payout > 30 * UNIT);
    assert_eq!(c.market.get_position(&id, &hedger, &OUTCOME_NO), 10 * UNIT);
}

#[test]
fn quote_payout_tracks_the_pools() {
    let c = Ctx::new();
    let id = c.open_market();
    let alice = c.funded(1_000 * UNIT);
    let bob = c.funded(1_000 * UNIT);
    c.market.bet(&alice, &id, &OUTCOME_YES, &(50 * UNIT));
    c.market.bet(&bob, &id, &OUTCOME_NO, &(50 * UNIT));

    let even = c.market.quote_payout(&id, &OUTCOME_YES, &(10 * UNIT));
    assert!(
        even > 10 * UNIT,
        "backing the smaller side should pay a profit"
    );

    // Pile onto YES; the same stake should now be worth less.
    c.market.bet(&alice, &id, &OUTCOME_YES, &(400 * UNIT));
    let crowded = c.market.quote_payout(&id, &OUTCOME_YES, &(10 * UNIT));
    assert!(crowded < even, "a crowded side must pay less");
}
