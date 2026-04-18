# Agent Follow Refactor Todo

## Goal
- turn follow-agent into an explicit controller/model instead of a cluster of loosely coordinated effects in `Semanticode.tsx`
- make camera movement, inspector sync, dirty-file tracking, and live symbol refresh easier to reason about and extend

## Phases

### 1. Extract pure follow model
- [x] move pure follow-target helpers out of `Semanticode.tsx`
- [x] move pending edited-path queue computation out of inline effect logic
- [ ] give follow-domain concepts their own shared types if they need to cross module boundaries more broadly

### 2. Introduce a follow controller hook
- [x] create `useAgentFollowController`
- [ ] make it own:
  - pending dirty-file queue
  - latest activity target
  - latest edit target
  - camera lock state
  - live refresh intent
- [ ] expose explicit outputs:
  - `cameraCommand`
  - `inspectorCommand`
  - `refreshNeeded`
Current state:
- the hook now owns:
  - pending dirty-file queue
  - latest activity target
  - latest edit target
  - dedupe/ack state for follow commands
- camera lock and live refresh intent still live in `Semanticode.tsx`
- outputs are currently `activityCommand` / `editCommand`, not the final `cameraCommand` / `inspectorCommand` split

### 3. Simplify Semanticode wiring
- [x] remove follow-specific queueing/target-resolution effects from `Semanticode.tsx`
- [ ] replace them with one command-execution layer
- [ ] keep view/layout state isolated from follow refreshes

### 4. Make follow behavior more debuggable
- [ ] add a lightweight debug surface for:
  - current follow source event
  - resolved target
  - confidence / fallback mode
  - queue length
  - camera lock state

### 5. Harden semantics
- [ ] distinguish:
  - activity follow
  - edit follow
  - file fallback
  - symbol exact / best-match / synthetic fallback
- [ ] avoid synthetic low-value targets like `anon` unless no better symbol exists
- [ ] ensure no follow movement happens while idle unless a genuinely new event arrives

## Acceptance Checks
- [ ] follow-agent does not change layout/view on its own when idle
- [ ] edit follow does not reopen the same file in a loop
- [ ] new symbols can appear during a followed run without destabilizing layout selection
- [ ] camera movement feels like focused tracking rather than repeated fit-to-bounds overviews
- [ ] a longer autonomous run can be followed without viewport thrash or inspector flashing
