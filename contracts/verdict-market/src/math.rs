//! Pure payout and weighting arithmetic.
//!
//! Everything here is deliberately free of `Env` and storage so it can be unit
//! tested without a contract harness, and so v2 can swap the pricing model
//! (parimutuel -> CPMM/LMSR) by replacing this module alone.

use crate::errors::Error;
use crate::types::BPS_DENOM;
#[cfg(test)]
use crate::types::WEIGHT_BASE;

/// How a settled market's losing pool is split.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FeeSplit {
    /// Losing stake handed to the winners, after fee.
    pub distributable: i128,
    /// Fee slice reserved for correct resolvers.
    pub resolver_pool: i128,
    /// Fee slice sent to the protocol treasury.
    pub protocol_cut: i128,
}

/// Split the losing pool into winner payout, resolver rewards and protocol fee.
///
/// `fee = losing_pool * fee_bps / BPS_DENOM`, then that fee is split by
/// `resolver_fee_bps`. Integer division floors at each step; the remainder is
/// absorbed by `protocol_cut` so the three parts always sum back to
/// `losing_pool` exactly and no value is created or destroyed.
pub fn split_fees(losing_pool: i128, fee_bps: u32, resolver_fee_bps: u32) -> Result<FeeSplit, Error> {
    if losing_pool < 0 {
        return Err(Error::MathOverflow);
    }
    let fee = mul_div(losing_pool, fee_bps as i128, BPS_DENOM as i128)?;
    let resolver_pool = mul_div(fee, resolver_fee_bps as i128, BPS_DENOM as i128)?;
    let protocol_cut = fee.checked_sub(resolver_pool).ok_or(Error::MathOverflow)?;
    let distributable = losing_pool.checked_sub(fee).ok_or(Error::MathOverflow)?;

    Ok(FeeSplit {
        distributable,
        resolver_pool,
        protocol_cut,
    })
}

/// Parimutuel payout for one winning position.
///
/// ```text
/// payout = stake + stake * distributable / winning_pool
/// ```
///
/// The user always gets their own stake back plus a pro-rata slice of what the
/// losing side forfeited. Rounding floors in the protocol's favour; the dust
/// left in the contract is swept to the treasury by `sweep_dust`.
pub fn parimutuel_payout(stake: i128, winning_pool: i128, distributable: i128) -> Result<i128, Error> {
    if stake <= 0 {
        return Ok(0);
    }
    if winning_pool <= 0 {
        return Err(Error::MathOverflow);
    }
    if stake > winning_pool {
        // A single position can never exceed the pool it belongs to.
        return Err(Error::MathOverflow);
    }
    let profit = mul_div(stake, distributable, winning_pool)?;
    stake.checked_add(profit).ok_or(Error::MathOverflow)
}

/// Share of the resolver reward pool for one correct resolver.
///
/// Proportional to weight, so a resolver with a better Verdict track record
/// earns more from the same market — the incentive that makes reputation worth
/// accumulating rather than just a display badge.
pub fn resolver_share(weight: u32, total_correct_weight: u32, resolver_pool: i128) -> Result<i128, Error> {
    if total_correct_weight == 0 {
        return Ok(0);
    }
    mul_div(resolver_pool, weight as i128, total_correct_weight as i128)
}

/// Map an average 8004 feedback value in [-100, 100] onto the configured weight
/// band, in `WEIGHT_BASE` units.
///
/// An agent with no history lands on `weight_min` — new agents can participate
/// immediately but carry the least influence until they have been right a few
/// times. A perfect record reaches `weight_max`.
///
/// v2 replaces this with recency decay and small-sample shrinkage; keeping it in
/// one pure function is what makes that swap cheap.
pub fn weight_from_avg(avg: i128, sample_count: u32, weight_min: u32, weight_max: u32) -> u32 {
    if sample_count == 0 || weight_max <= weight_min {
        return weight_min;
    }
    let clamped = if avg < -100 {
        -100
    } else if avg > 100 {
        100
    } else {
        avg
    };
    let span = (weight_max - weight_min) as i128;
    // shift [-100, 100] -> [0, 200]
    let offset = (clamped + 100) * span / 200;
    weight_min.saturating_add(offset as u32).min(weight_max)
}

/// Derive the average feedback value from Verdict's local counters, matching
/// what the 8004 Reputation Registry would report for feedback written by this
/// contract: `+100` per correct call, `-100` per wrong one.
pub fn avg_from_stats(correct: u32, wrong: u32) -> (i128, u32) {
    let total = correct as i128 + wrong as i128;
    if total == 0 {
        return (0, 0);
    }
    let sum = (correct as i128) * 100 - (wrong as i128) * 100;
    (sum / total, (correct + wrong) as u32)
}

/// Convenience: local counters straight to a weight.
pub fn weight_from_stats(correct: u32, wrong: u32, weight_min: u32, weight_max: u32) -> u32 {
    let (avg, n) = avg_from_stats(correct, wrong);
    weight_from_avg(avg, n, weight_min, weight_max)
}

/// `a * b / d` with an i128 intermediate and explicit overflow handling.
pub fn mul_div(a: i128, b: i128, d: i128) -> Result<i128, Error> {
    if d == 0 {
        return Err(Error::MathOverflow);
    }
    a.checked_mul(b).ok_or(Error::MathOverflow)?.checked_div(d).ok_or(Error::MathOverflow)
}

/// Sanity helper used by the settlement path: weight must stay inside the band.
pub fn clamp_weight(w: u32, weight_min: u32, weight_max: u32) -> u32 {
    w.clamp(weight_min, weight_max)
}

/// A market with an empty side has no counterparty and cannot pay anyone. It is
/// voided rather than settled, and every stake is refunded 1:1.
pub fn is_void_by_pools(pools: &[i128]) -> bool {
    pools.iter().any(|p| *p <= 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    const FEE_BPS: u32 = 200; // 2%
    const RESOLVER_BPS: u32 = 6_000; // 60% of the fee

    #[test]
    fn fee_split_conserves_value() {
        for losing in [0i128, 1, 7, 99, 1_000, 10_000_000, i128::from(u64::MAX)] {
            let s = split_fees(losing, FEE_BPS, RESOLVER_BPS).unwrap();
            assert_eq!(
                s.distributable + s.resolver_pool + s.protocol_cut,
                losing,
                "value leaked for losing={losing}"
            );
            assert!(s.distributable >= 0 && s.resolver_pool >= 0 && s.protocol_cut >= 0);
        }
    }

    #[test]
    fn fee_split_known_value() {
        // 1_000 losing, 2% fee = 20; 60% of 20 = 12 resolvers, 8 protocol.
        let s = split_fees(1_000, FEE_BPS, RESOLVER_BPS).unwrap();
        assert_eq!(s.distributable, 980);
        assert_eq!(s.resolver_pool, 12);
        assert_eq!(s.protocol_cut, 8);
    }

    #[test]
    fn tiny_pools_round_to_zero_fee_not_to_a_loss() {
        // Fee of 2% on 10 units floors to 0. Winners must still not lose value.
        let s = split_fees(10, FEE_BPS, RESOLVER_BPS).unwrap();
        assert_eq!(s.distributable, 10);
        assert_eq!(s.resolver_pool + s.protocol_cut, 0);
    }

    #[test]
    fn payout_never_below_stake() {
        let s = split_fees(500, FEE_BPS, RESOLVER_BPS).unwrap();
        let payout = parimutuel_payout(100, 1_000, s.distributable).unwrap();
        assert!(payout >= 100, "a winner must never receive less than their stake");
    }

    #[test]
    fn payouts_never_exceed_the_escrow() {
        // Three winners split a 1_000 winning pool against a 500 losing pool.
        let winning_pool = 1_000i128;
        let stakes = [500i128, 300, 200];
        let s = split_fees(500, FEE_BPS, RESOLVER_BPS).unwrap();
        let total: i128 = stakes
            .iter()
            .map(|st| parimutuel_payout(*st, winning_pool, s.distributable).unwrap())
            .sum();
        assert!(
            total <= winning_pool + s.distributable,
            "paid out {total}, escrow holds {}",
            winning_pool + s.distributable
        );
    }

    #[test]
    fn sole_winner_takes_everything_after_fee() {
        let s = split_fees(500, FEE_BPS, RESOLVER_BPS).unwrap();
        let payout = parimutuel_payout(1_000, 1_000, s.distributable).unwrap();
        assert_eq!(payout, 1_000 + s.distributable);
    }

    #[test]
    fn empty_winning_pool_is_an_error_not_a_division_by_zero() {
        assert_eq!(parimutuel_payout(10, 0, 100), Err(Error::MathOverflow));
    }

    #[test]
    fn stake_larger_than_pool_is_rejected() {
        assert_eq!(parimutuel_payout(2_000, 1_000, 100), Err(Error::MathOverflow));
    }

    #[test]
    fn new_agent_gets_the_floor_weight() {
        assert_eq!(weight_from_stats(0, 0, 100, 300), 100);
    }

    #[test]
    fn perfect_record_reaches_the_ceiling() {
        assert_eq!(weight_from_stats(10, 0, 100, 300), 300);
    }

    #[test]
    fn all_wrong_stays_at_the_floor() {
        assert_eq!(weight_from_stats(0, 10, 100, 300), 100);
    }

    #[test]
    fn even_record_lands_mid_band() {
        assert_eq!(weight_from_stats(5, 5, 100, 300), 200);
    }

    #[test]
    fn weight_is_monotonic_in_accuracy() {
        let mut last = 0;
        for correct in 0..=10u32 {
            let w = weight_from_stats(correct, 10 - correct, 100, 300);
            assert!(w >= last, "weight went down at correct={correct}");
            last = w;
        }
    }

    #[test]
    fn resolver_rewards_are_proportional_to_weight() {
        // Two correct resolvers, weights 100 and 300, pool of 400.
        let a = resolver_share(100, 400, 400).unwrap();
        let b = resolver_share(300, 400, 400).unwrap();
        assert_eq!(a, 100);
        assert_eq!(b, 300);
        assert_eq!(a + b, 400);
    }

    #[test]
    fn resolver_share_with_no_correct_resolvers_is_zero() {
        assert_eq!(resolver_share(100, 0, 400).unwrap(), 0);
    }

    #[test]
    fn one_sided_market_is_void() {
        assert!(is_void_by_pools(&[0, 1_000]));
        assert!(is_void_by_pools(&[1_000, 0]));
        assert!(!is_void_by_pools(&[1, 1]));
    }

    #[test]
    fn weight_base_is_the_documented_fixed_point() {
        assert_eq!(WEIGHT_BASE, 100);
        assert_eq!(clamp_weight(9_999, 100, 300), 300);
        assert_eq!(clamp_weight(1, 100, 300), 100);
    }
}
