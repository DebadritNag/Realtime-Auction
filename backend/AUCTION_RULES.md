# Auction rules

## Money and opening bid

1 unit = 0.5 Cr. Budgets, base prices, bids and purchases persist as safe integers. Inputs must be finite, nonnegative half-crore amounts and no more than 1,000,000 Cr. Settings prices must be positive.

The initial current bid is the base-price **ask**, with no highest bidder. The first accepted bid may equal the base price. It does not allocate ownership or debit budget until the player is sold.

After a bid:

| Current bid | Increment |
| --- | --- |
| Below 10 Cr | 0.5 Cr |
| 10 Cr to below 20 Cr | 1 Cr |
| 20 Cr or above | 2 Cr |

Examples: 4→4.5, 9→9.5, 9.5→10, 10→11, 11→12, 19→20, 20→22, 22→24, 38→40.
The server supplies minimumNextBidCr. With allowCustomBids=true, any half-crore amount at or above that minimum is legal. With false, it must exactly equal that minimum. The leading bidder cannot raise their own bid.

## Budgets and squads

Remaining = starting budget − committed purchase total.
Required reserve = max(0, minSquadSize − playersOwned) × minimumBasePrice.
For a prospective purchase reserve **one fewer** future slot:

`maximumBid = remaining − max(0, minSquadSize − playersOwned − 1) × minimumBasePrice`

If a team owns 16 players, needs 18, has 18 Cr, and minimum price is 1 Cr, the maximum bid is **17 Cr** because this purchase fills slot 17 and 1 Cr is reserved for slot 18.

A full squad has maximum bid 0. Budgets are not debited for an outbid offer. The only active player may have one leading offer, making that commitment safe to settle under the lock. Base prices are clamped to the configured minimum when the pool is created. Reserve assumes future minimum-price players may exist, not that the catalog guarantees their availability.

## Time

Bid validation samples server time under the mutation lock. At exactly endsAt a bid is rejected. Acceptance before the deadline is valid even if durable commit completes later. Timer callbacks wait behind an in-progress commit.

By default, a bid accepted with at most 3 seconds remaining moves endsAt to now + 5 seconds. Reset cannot be less than the threshold. A client countdown is display only.

Pause stores remainingTimeMs and closes bidding. Resume sets endsAt = now + remainingTimeMs. A late pause resolves an expired player first; it cannot revive bidding. Pausing between players cancels the pending advance; resume restarts the configured transition delay.

## State machine

Room: LOBBY → STARTING → RUNNING ↔ PAUSED; RUNNING/PAUSED → COMPLETED.
STARTING is a validated internal transition committed together with RUNNING and first-player activation; clients never see a partially started pool. A host may close a LOBBY with END_AUCTION, producing CLOSED.

Player: WAITING → ACTIVE → SOLD or UNSOLD. UNSOLD → ACTIVE on recall. WAITING → SKIPPED when the host ends early. There is exactly one active player at most.

A timer sale assigns the player and debits the winning team atomically. No bidder means UNSOLD. MARK_UNSOLD is allowed only while running, on an active player without accepted bids. NEXT_PLAYER is allowed only when running and no player is active; it cannot skip a sale.

Automatic advance activates remaining queued players after the transition delay. When the round queue is exhausted, it leaves the room RUNNING with no active player: the host must recall or end. Recall requires no active player and an empty queue, and preserves unsold base prices. Repeated recalls are allowed. Completed auctions cannot be reopened.

END_AUCTION settles any accepted highest bid, including while paused, marks never-auctioned players SKIPPED and completes. It is an explicit host early-close action. It cannot silently discard the highest offer.

## Default settings

numberOfTeams=4; minimumParticipants=2; startingBudgetCr=100; minSquadSize=11; maxSquadSize=18; playerTimerSeconds=20; antiSnipingEnabled=true; threshold=3; reset=5; minimumBasePriceCr=1; allowCustomBids=true; autoAdvance=true; transitionDelaySeconds=3; playerPoolConfig={}.

Host occupies one team slot. Joining, leaving, kicking and settings changes are lobby-only. The host cannot leave or kick themselves. Running auctions continue without the host's socket.
