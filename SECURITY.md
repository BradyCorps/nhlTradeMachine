# Security

Cap & Crease is a single-maintainer project. This file says how to report a
problem and what you can realistically expect back — no more than that.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private vulnerability reporting on this repository:
**Security → Report a vulnerability**. That opens a private thread visible only
to the maintainer.

Useful things to include, if you have them: what you found, how to reproduce
it, and what an attacker could actually do with it. A working proof of concept
is welcome. A scanner's raw output usually is not, on its own.

## What to expect

- An acknowledgement within about **7 days**.
- An honest assessment: whether it is being fixed, and roughly when.
- Credit in the release notes if you want it, and none if you would rather not.

There is **no bug bounty and no payment**. This is a nights-and-weekends
project funded by small donations; promising money it does not have would be
worse than saying so plainly.

Please give a reasonable window to fix something before publishing it.

## In scope

- `capandcrease.com` and its API routes.
- The application source in this repository.

## Out of scope

- **Anything requiring access to the admin area.** It is a single operator
  account. Report a way *around* the authentication; a finding that assumes
  you already have the password is not one.
- **The accuracy of the analytics.** A player valued wrongly is a modelling
  question, not a security one — open a normal issue.
- Findings in third-party services this site merely uses (Vercel, Upstash,
  Turso, Anthropic, Buy Me a Coffee). Report those to them.
- Missing hardening with no demonstrated impact — headers, banner versions,
  and similar — unless you can show what it lets someone do.
- Denial of service by volume, automated scanning, and social engineering.

## Please do not

Access, alter, or delete data that is not yours; degrade the service for other
people; or run automated scans heavy enough to act as a denial of service. The
site has request limits that will stop you, and tripping them is not a finding.

Testing in good faith and within this scope is welcome, and no action will be
taken over it.
