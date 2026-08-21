STELLAR ?= stellar
NETWORK ?= testnet

.PHONY: build test fmt lint clean optimize deploy-check

build:
	cargo build --target wasm32v1-none --release

test:
	cargo test

fmt:
	cargo fmt --all

lint:
	cargo fmt --all -- --check
	cargo clippy --all-targets -- -D warnings

optimize: build
	$(STELLAR) contract optimize --wasm target/wasm32v1-none/release/verdict_market.wasm

clean:
	cargo clean

# Prints the sha256 of the built wasm for reproducible-build verification.
hash: build
	shasum -a 256 target/wasm32v1-none/release/*.wasm

# Runs the real test suite + wasm build and writes the JSON the site's
# /status page renders. Fails if anything is red.
report:
	node scripts/report.mjs
