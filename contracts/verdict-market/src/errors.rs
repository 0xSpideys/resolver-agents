use soroban_sdk::contracterror;

/// Contract error codes.
///
/// Ranges are stable and must not be renumbered — the SDK and the frontend map
/// them to human-readable messages.
///   1xx  configuration / access control
///   2xx  market lifecycle
///   3xx  trading & settlement
///   4xx  resolver layer (8004)
///   5xx  challenge & dispute
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    // --- 1xx configuration / access control ---
    AlreadyInitialized = 100,
    NotInitialized = 101,
    Unauthorized = 102,
    Paused = 103,
    InvalidConfig = 104,

    // --- 2xx market lifecycle ---
    MarketNotFound = 200,
    InvalidState = 201,
    InvalidCloseTime = 202,
    InvalidOutcome = 203,
    /// v1 supports binary markets only; kept as an error rather than a panic so
    /// the multi-outcome unlock in v2 is a one-line change.
    UnsupportedOutcomeCount = 204,
    TradingClosed = 205,
    TradingStillOpen = 206,

    // --- 3xx trading & settlement ---
    AmountTooSmall = 300,
    NothingToClaim = 301,
    AlreadyClaimed = 302,
    MarketNotSettled = 303,
    InsufficientEscrow = 304,
    MathOverflow = 305,

    // --- 4xx resolver layer ---
    AgentNotRegistered = 400,
    NotAgentOwner = 401,
    AlreadySubmitted = 402,
    ResolveWindowClosed = 403,
    ResolveWindowOpen = 404,
    NoSubmissions = 405,
    ResolverAlreadySettled = 406,
    EvidenceRequired = 407,

    // --- 5xx challenge & dispute ---
    ChallengeWindowClosed = 500,
    ChallengeWindowOpen = 501,
    AlreadyChallenged = 502,
    NotChallenged = 503,
    NotDisputeResolver = 504,
}
