# Isolation policy

**This project is standalone. It has no owner in common with any other account,
organisation or company, and it must stay that way.**

This is not a preference to weigh against convenience. It is a hard constraint,
and it applies to anything not yet chosen as much as to what already exists.

## The rule

Nothing produced here may be pushed, deployed, hosted, provisioned, published or
registered into an environment owned or controlled by any identity other than
this project's own.

That covers, without being an exhaustive list:

| Category | Examples |
|---|---|
| Source hosting | GitHub, GitLab, any mirror |
| Frontend hosting | Vercel, Netlify, Cloudflare Pages, Fly, Render |
| Backend / data | Supabase, Railway, Neon, Planetscale, Upstash, any managed DB |
| Package registries | npm, crates.io, Docker Hub |
| Domains and DNS | registrars, Cloudflare, Route 53 |
| Chain identity | deployer keys, contract admin, treasury, token issuer |
| Everything else | analytics, error tracking, email, CI, secrets managers, CDNs |

**Before adding any new hosted dependency, confirm which account it will live
under.** Never reach for an account that already exists because it is convenient
— that is exactly the failure this policy prevents. If the answer is unclear,
stop and ask rather than provisioning.

Working on a personal machine is fine. The rule governs *remote environments and
published artefacts*, not the local development box.

## What is already in place

| | |
|---|---|
| Git author / committer | `0xSpideys <319500619+0xSpideys@users.noreply.github.com>`, set in repo-local git config |
| Push identity | SSH host alias `github-spideys` → `~/.ssh/id_ed25519_spideys`, with `IdentitiesOnly yes` |
| Remote | `git@github-spideys:0xSpideys/resolver-agents.git` |
| History | Every commit authored by `0xSpideys`; no other identity appears in the log |
| Tracked files | No personal name, email, company or other account referenced anywhere |
| Stellar keys | Generated fresh for this project; not reused from anywhere |

`IdentitiesOnly yes` is the load-bearing part of the SSH setup. Without it, ssh
offers the machine's default key first and GitHub resolves the push to whichever
account that key belongs to — silently, and with no error to notice.

## Verifying

```bash
# Push identity resolves to the right account
ssh -T git@github-spideys

# No other identity anywhere in tracked files or history
git grep -Ii "<name>\|<email>\|<company>" -- . ':!.agents'
git log --all --format="%an <%ae> | %cn <%ce>" | sort -u
```

Both should come back clean. If either does not, fix it before pushing — history
rewrites are cheap while the repo is small and expensive once it is not.

## Third-party credentials

The research resolver calls the Anthropic API and needs a key. It is read from
`ANTHROPIC_API_KEY` at runtime and must come from an account with no connection
to any other identity — same rule as everything else here.

The key never enters the repository, a config file, or a commit. If a future
deployment needs it present somewhere, that somewhere is subject to this whole
document, not an exception to it.
