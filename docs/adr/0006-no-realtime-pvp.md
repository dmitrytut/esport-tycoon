# ADR 0006: no live online PvP

**Status:** accepted

## Context

An obvious extension of a manager game is to let two users play against each other.

## Decision

We do not build live synchronous PvP. Reasons:
- a match lasts 90 seconds and contains 3–5 decisions in 5-second windows;
  synchronizing this between two people, both of whom must be online and quick enough
  to decide, is technically expensive and plays worse than singleplayer;
- in PvP any imbalance becomes critical, and we have one built into the design by
  intent: stars are rare and expensive;
- servers, anticheat, matchmaking — a separate project and separate maintenance.

Instead — **asynchronous seasonal leagues**: once a week the server collects 16
rosters of real users, simulates a tournament, and sends back the result. Zero load on
the user, competition exists, offline works.

## Architecture requirement from the start

The collective must be able to serialize and simulate on the server without graphics.
This follows for free from `adr/0002` and `specs/0002`. The feature itself — after
release.
