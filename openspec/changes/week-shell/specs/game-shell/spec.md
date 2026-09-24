## Purpose

The game shell presents a real core run as a usable browser week screen while keeping simulation, rendering and unfinished decisions separate.

## ADDED Requirements

### Requirement: The week screen presents authoritative run values

The shell SHALL show the current absolute week, available slots, every roster member's energy and morale, collective morale and organization balance from the currently committed core state. It SHALL NOT infer changes to those values from a planned action, an animation or an in-flight command. Any state represented visually in the scene SHALL also be available as text or a number in the DOM (ADR 0008).

#### Scenario: Planning does not spend resources

- **WHEN** a user assigns an activity to a future week but has not advanced
- **THEN** the current energy, morale and balance remain the values of the last committed core state, and the assignment is labelled as a plan

#### Scenario: Advancement updates the panel

- **WHEN** core returns an advanced state with changed member energy, collective morale or balance
- **THEN** the displayed values equal that returned state and not a projected or scene-derived value

### Requirement: A user can edit a block of future weeks

The shell SHALL let a user create a block within the core's accepted four-to-six-week range, choose validated content activities for each unexecuted week in order, and select a current member for an activity that requires one. It SHALL submit the ordered assignments through the public core API; it SHALL NOT change run state by editing a plan. The first week of a submitted plan SHALL always be the core run's next absolute week.

#### Scenario: Member-directed activity is assigned

- **WHEN** a user chooses a member-directed activity and a current roster member for an unexecuted week
- **THEN** the submitted plan names that activity and that member for that week in the selected order

#### Scenario: Invalid plan is rejected before advancement

- **WHEN** a submitted plan omits a required member or has a week count outside the core's accepted range
- **THEN** no week is advanced and the screen identifies the rejected assignment or count without replacing the current run state

### Requirement: Completed weeks are immutable and continuation starts after them

After an advancement returns, the shell SHALL mark all weeks reported as executed read-only, retain only unexecuted assignments for possible editing, and resume by submitting a valid block starting at the returned run's next week. It SHALL NOT submit an executed week, its cost, recovery or RNG decision a second time. When fewer than four original weeks remain, the shell SHALL extend the future plan to a valid four-week block rather than padding it with completed weeks; at a season boundary it SHALL not advance until core permits it.

#### Scenario: A block stops early

- **WHEN** a block planned for weeks 3 through 7 stops after completing week 4
- **THEN** weeks 3 and 4 cannot be changed, the remaining assignments stay editable at absolute weeks 5 through 7, and the next submitted plan begins at week 5 with a valid block length

#### Scenario: A block runs out

- **WHEN** every week in the submitted block has executed
- **THEN** a fresh valid block begins at the returned next week; no earlier week is included

### Requirement: Advancement is single-flight and displays every returned reason

One user activation SHALL cause at most one core advancement. From activation until the returned state is committed or the command fails, further taps, keyboard activations and stale rendered handlers SHALL NOT dispatch another command. On success the shell SHALL show the exact stopped week and every returned reason, including simultaneous reasons, without deriving a new stop from displayed thresholds (ADR 0009).

#### Scenario: Rapid repeated activation

- **WHEN** Continue is activated twice before the first result has been committed
- **THEN** the core receives one command and the screen commits one returned transition

#### Scenario: Several reasons coincide

- **WHEN** the core reports two stop reasons for one completed week
- **THEN** both reasons and the returned stopped week are shown, and the next editable week is the returned run's week

### Requirement: Unresolved decisions remain blocked rather than faked

If core state has a pending incident or uncovered engagement, the shell SHALL not advance until a real core resolution/renewal or termination has taken place. At a `contest-ahead` stop, the shell SHALL not invent a contest fact or cross an unresolved marked entry. At a completed season or unsupported series entry it SHALL show the boundary rather than silently reset a season or synthesize an outcome. It SHALL retain the committed state while showing what blocks further advancement.

#### Scenario: An incident awaits a choice

- **WHEN** the returned run contains a pending incident
- **THEN** the screen shows the incident stop and disables Continue until a real incident-choice interaction is available; no week moves on another tap

#### Scenario: A contested week is ahead

- **WHEN** advancement reports `contest-ahead` and the next marked entry has not been settled
- **THEN** the stop is shown, Continue is blocked, and no invented contest or week result appears

#### Scenario: Engagement coverage has expired

- **WHEN** the current run has an expired engagement that core refuses to advance
- **THEN** the screen names the blocker and does not silently bypass the core rejection

### Requirement: Initialization and command failures are visible and non-destructive

The shell SHALL refuse to start a run when required content is invalid or missing. It SHALL present a readable diagnostic for initialization failures, rejected core commands, unexpected result tags and rendering failures, without showing a fabricated run or an empty screen. A rejected command SHALL preserve the previously committed run, plan and core RNG continuation; an unexpected result SHALL not be silently interpreted as success.

#### Scenario: Missing content

- **WHEN** a required activity or season template cannot be validated or loaded
- **THEN** the shell displays which content failed and does not offer advancement

#### Scenario: Core rejects a command

- **WHEN** the core rejects the submitted plan before advancing
- **THEN** the last committed state is still displayed, the input can be corrected, and no locally projected balances or weeks appear

#### Scenario: Scene cannot render

- **WHEN** the visual renderer fails to initialize or render
- **THEN** the DOM panel and a visible scene-error message remain accessible; advancement is not represented as a successful visual transition

### Requirement: Mobile presentation keeps command access separate from the scene

The week screen SHALL use a portrait-first scene with a collapsible DOM planning sheet. In its collapsed position the scene and a compact current-state and stop-reason summary SHALL remain visible; expanding the sheet SHALL expose the editable block while retaining a visible scene preview. Planning, numbers, reasons, controls and their accessible labels SHALL remain in the DOM; the scene SHALL not be the only place to read a game state or trigger a command. Opening or closing the sheet SHALL NOT submit a command, discard an unexecuted assignment or change core state. The same single Continue action and stop reason SHALL stay accessible in either position; safe areas, narrow screens, scrolling plan content and touch activation SHALL not hide or overlap them. Scene geometry SHALL scale by whole-number steps rather than blur via fractional scaling (ADR 0008).

#### Scenario: Portrait touch planning

- **WHEN** a user opens the screen in the declared portrait reference viewport with safe-area insets
- **THEN** the sheet opens to an independently scrolling plan, retains a visible scene preview, and all active controls can be reached and activated by touch without losing the current values or reason

#### Scenario: Planning sheet closes and reopens

- **WHEN** a user assigns an activity in the expanded sheet, closes it to inspect the scene and reopens it
- **THEN** the future assignment and committed core values are unchanged, the current reason remains visible, and no advancement has occurred

#### Scenario: Stop exposes the real outcome

- **WHEN** advancement completes while the sheet is expanded
- **THEN** the sheet collapses to reveal the scene and a DOM summary of all returned reasons and the committed numbers; reopening shows only editable future weeks

#### Scenario: Wider viewport

- **WHEN** the viewport becomes wider than the portrait reference
- **THEN** the same DOM actions and exact core values remain available, while the visual scene resizes without changing the run state

### Requirement: Layout probes and device profile do not define final art

The shell SHALL provide front-facing and isometric geometric arrangements with the same characters, actions and collapsible DOM sheet for comparison in both sheet positions. Neither arrangement SHALL be treated as the final art grid or a commitment to isometric production. The act-three performance profile SHALL use at least 15 geometric figures and the real DOM sheet on named physical iOS and Android devices, record environment and viewport, the same open/edit/close/advance sequence, frame timing, FPS and available peak memory, and distinguish unavailable memory counters from measured values.

#### Scenario: Comparing two probes

- **WHEN** the same roster and reference viewport are shown in each probe
- **THEN** the sheet controls, data and figure count match in both collapsed and expanded positions; scene visibility, figure/state legibility, future-week touch editing, occlusion, pointer conflicts and frame timing can be compared for #37 without selecting final sprites

#### Scenario: Device metric unavailable

- **WHEN** a physical device exposes no reliable process peak-memory counter
- **THEN** the profile names the unavailable metric and capture method; it does not substitute an emulator measurement or invent a peak