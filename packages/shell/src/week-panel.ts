import type { StopReason } from "@et/core";
import { collectiveMorale } from "@et/core";

import type { ContentCatalog } from "./content.ts";
import type { SessionView, WeekSession } from "./session.ts";

function reasonText(reason: StopReason, view: SessionView, catalog: ContentCatalog): string {
  const performer =
    "performerId" in reason
      ? view.runState.collective.members.find((member) => member.id === reason.performerId)
      : undefined;
  const person = performer
    ? `${performer.name} “${performer.handle}”`
    : "performerId" in reason
      ? reason.performerId
      : "";
  const activity =
    "activityId" in reason
      ? catalog.activities.find((item) => item.id === reason.activityId)
      : undefined;
  switch (reason.kind) {
    case "block-ran-out":
      return "Your plan ran out. The next block is ready to edit.";
    case "activity-skipped":
      return `${activity?.name ?? reason.activityId} was skipped: ${reason.cause === "slots" ? "no free slots" : "not enough energy"}.`;
    case "energy-threshold":
      return `${person} dropped to ${reason.value} energy.`;
    case "morale-threshold":
      return `${person} dropped to ${reason.value} morale.`;
    case "money-negative":
      return `Balance crossed below zero: ${reason.balance}.`;
    case "contest-ahead":
      return `A ${reason.marking} is next. Settle it before another week.`;
    case "season-ended":
      return "The season calendar ended.";
    case "engagement-expired":
      return `${person}'s engagement ${reason.engagementId} expired.`;
    case "incident-pending":
      return `Incident ${reason.incidentId} awaits ${person}'s choice.`;
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** DOM is the authoritative accessible interface; it never calls core transitions directly. */
export class WeekPanel {
  private readonly root: HTMLElement;
  private readonly session: WeekSession;
  private readonly catalog: ContentCatalog;
  private readonly onUpdate: (view: SessionView) => void;
  private readonly sceneHost: HTMLElement;
  private warning: string | null = null;
  private lastStatus = "";

  constructor(
    root: HTMLElement,
    session: WeekSession,
    catalog: ContentCatalog,
    onUpdate: (view: SessionView) => void,
  ) {
    this.root = root;
    this.session = session;
    this.catalog = catalog;
    this.sceneHost = element("div", "scene-host");
    this.sceneHost.id = "scene-host";
    this.sceneHost.setAttribute("aria-hidden", "true");
    this.onUpdate = onUpdate;
    this.render();
  }

  private change(action: () => void): void {
    try {
      action();
      this.warning = null;
    } catch (cause) {
      this.warning = cause instanceof Error ? cause.message : String(cause);
    }
    this.render();
  }

  /** Reflects one session snapshot into semantic controls without inventing future numbers. */
  render(): void {
    const view = this.session.view;
    const focused =
      document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)
        ? document.activeElement
        : null;
    const focusKey = focused?.dataset.focusKey;
    const focusFallback = focused?.dataset.focusFallback;
    const scroll = this.root.querySelector<HTMLElement>(".plan-scroll")?.scrollTop ?? 0;
    this.root.replaceChildren(this.sceneHost);
    this.root.className = `week-shell ${view.sheet}`;
    const sheet = element("section", "week-sheet");
    sheet.setAttribute("aria-label", "Week planning sheet");
    const heading = element("div", "sheet-heading");
    const title = element("div", "identity");
    title.append(element("strong", "brand", view.runState.org.name));
    title.append(
      element(
        "span",
        "subtle",
        `Season ${view.season.number} · Week ${view.runState.week} · Unsaved run; reload resets`,
      ),
    );
    heading.append(title);
    const toggle = element(
      "button",
      "sheet-toggle",
      view.sheet === "expanded" ? "Close plan" : "Edit plan",
    );
    toggle.type = "button";
    toggle.dataset.focusKey = "sheet-toggle";
    toggle.setAttribute("aria-expanded", String(view.sheet === "expanded"));
    toggle.addEventListener("click", () => this.change(() => this.session.toggleSheet()));
    heading.append(toggle);
    sheet.append(heading);

    const state = element("div", "state-summary");
    state.append(element("span", "stat", `Slots ${view.runState.org.slots}`));
    state.append(element("span", "stat", `Morale ${collectiveMorale(view.runState.collective)}`));
    state.append(element("span", "stat balance", `Balance ${view.runState.org.money}`));
    sheet.append(state);
    const stop = element("div", "stop-summary");
    stop.setAttribute("role", "status");
    stop.setAttribute("aria-live", "off");
    if (view.mode.kind === "blocked") stop.append(element("p", "blocker", view.mode.detail));
    if (view.last) {
      stop.append(element("span", "subtle", `Stopped at week ${view.last.advance.stoppedAt}`));
      for (const reason of view.last.advance.reasons)
        stop.append(element("p", "reason", reasonText(reason, view, this.catalog)));
    } else if (view.mode.kind !== "blocked") {
      stop.append(element("p", "reason", "Fresh run. Make a plan, then watch what sticks."));
    }
    if (view.error || this.warning)
      stop.append(element("p", "error", this.warning ?? view.error ?? ""));
    const status = stop.textContent;
    if (status !== this.lastStatus) {
      stop.setAttribute("aria-live", "polite");
      this.lastStatus = status;
    }
    sheet.append(stop);

    const body = element("div", "plan-scroll");
    const legend = element(
      "p",
      "legend",
      `Amber rings = planned member; teal rings = committed participation. ${view.runState.collective.members.length} roster members + ${Math.max(0, 15 - view.runState.collective.members.length)} background guests in the scene. No resources are projected.`,
    );
    body.append(legend);
    const roster = element("section", "roster");
    roster.append(element("h2", "section-title", "Current roster"));
    for (const member of view.runState.collective.members) {
      roster.append(
        element(
          "p",
          "member",
          `${member.name} “${member.handle}” · Energy ${member.state.energy} · Morale ${member.state.morale}`,
        ),
      );
    }
    body.append(roster);
    if (view.history.length > 0) {
      const history = element("section", "history");
      history.append(element("h2", "section-title", "Completed weeks · read only"));
      for (const week of view.history) {
        const row = element(
          "article",
          "past-week",
          `Week ${week.week} · ${week.kind} · ${week.slotsSpent} slots spent · engagements ${week.engagementExpense.total}`,
        );
        const activityIds = week.executed.map((item) => item.activityId);
        row.append(
          element(
            "p",
            "subtle",
            activityIds.length
              ? `Completed: ${activityIds.join(", ")}`
              : "No activities completed.",
          ),
        );
        for (const skipped of week.skipped) {
          const activity = this.catalog.activities.find((entry) => entry.id === skipped.activityId);
          row.append(
            element(
              "p",
              "reason",
              `${activity?.name ?? skipped.activityId} skipped: ${skipped.cause === "slots" ? "no free slots" : "not enough energy"}`,
            ),
          );
        }
        for (const reason of week.reasons)
          row.append(element("p", "subtle", reasonText(reason, view, this.catalog)));
        history.append(row);
      }
      body.append(history);
    }
    const plan = element("section", "plan");
    const planHeader = element("div", "plan-header");
    planHeader.append(element("h2", "section-title", "Next weeks · planned, not spent"));
    const length = element("select", "week-count");
    length.dataset.focusKey = "week-count";
    length.setAttribute("aria-label", "Number of planned weeks");
    for (const size of [4, 5, 6]) {
      const option = new Option(`${size} weeks`, String(size));
      length.append(option);
    }
    length.value = String(view.draft.weeks.length);
    length.addEventListener("change", () =>
      this.change(() => this.session.setWeeks(Number(length.value))),
    );
    planHeader.append(length);
    plan.append(planHeader);
    for (const week of view.draft.weeks) {
      const row = element("article", "draft-week");
      row.append(element("h3", "week-title", `Week ${week.week}`));
      const isBeyondSeason =
        week.week >= view.season.startWeek + view.season.calendar.entries.length;
      if (isBeyondSeason)
        row.append(element("p", "subtle", "Past the calendar; padding only, no assignments."));
      for (const [index, entry] of week.entries.entries()) {
        const activity = this.catalog.activities.find((item) => item.id === entry.activityId);
        const assignment = element("div", "assignment");
        assignment.append(
          element("span", "activity-label", `${index + 1}. ${activity?.name ?? entry.activityId}`),
        );
        if (activity?.target === "member") {
          const memberChoice = element("select", "member-choice");
          memberChoice.setAttribute(
            "aria-label",
            `Member for ${activity.name} in week ${week.week}`,
          );
          memberChoice.append(new Option("Choose member", ""));
          for (const member of view.runState.collective.members)
            memberChoice.append(new Option(member.handle, member.id));
          memberChoice.value = entry.memberId ?? "";
          memberChoice.dataset.focusKey = `member-${week.week}-${index}`;
          memberChoice.dataset.focusFallback = `add-${week.week}`;
          memberChoice.addEventListener("change", () =>
            this.change(() => this.session.setMember(week.week, index, memberChoice.value || null)),
          );
          assignment.append(memberChoice);
        }
        for (const [label, offset] of [
          ["Move up", -1],
          ["Move down", 1],
        ] as const) {
          const button = element("button", "order", label === "Move up" ? "↑" : "↓");
          button.dataset.focusKey = `move-${week.week}-${index}-${offset}`;
          button.dataset.focusFallback = `add-${week.week}`;
          button.type = "button";
          button.title = `${label} ${activity?.name ?? entry.activityId}`;
          button.setAttribute(
            "aria-label",
            `${label} ${activity?.name ?? entry.activityId} in week ${week.week}`,
          );
          button.disabled = index + offset < 0 || index + offset >= week.entries.length;
          button.addEventListener("click", () =>
            this.change(() => this.session.move(week.week, index, offset)),
          );
          assignment.append(button);
        }
        const remove = element("button", "remove", "Remove");
        remove.dataset.focusKey = `remove-${week.week}-${index}`;
        remove.dataset.focusFallback = `add-${week.week}`;
        remove.type = "button";
        remove.setAttribute(
          "aria-label",
          `Remove ${activity?.name ?? entry.activityId} from week ${week.week}`,
        );
        remove.addEventListener("click", () =>
          this.change(() => this.session.remove(week.week, index)),
        );
        assignment.append(remove);
        row.append(assignment);
      }
      if (!isBeyondSeason) {
        const add = element("div", "add-activity");
        const select = element("select", "activity-choice");
        select.dataset.focusKey = `activity-${week.week}`;
        select.setAttribute("aria-label", `Activity for week ${week.week}`);
        for (const activity of this.catalog.activities)
          select.append(new Option(activity.name, activity.id));
        add.append(select);
        const button = element("button", "add-button", "Add");
        button.type = "button";
        button.dataset.focusKey = `add-${week.week}`;
        button.setAttribute("aria-label", `Add activity to week ${week.week}`);
        button.addEventListener("click", () =>
          this.change(() => this.session.add(week.week, select.value)),
        );
        add.append(button);
        row.append(add);
      }
      plan.append(row);
    }
    body.append(plan);
    sheet.append(body);
    const footer = element("div", "continue-bar");
    const continueButton = element("button", "continue-button", "Continue →");
    continueButton.type = "button";
    continueButton.dataset.focusKey = "continue";
    continueButton.disabled = view.mode.kind !== "editing";
    continueButton.addEventListener("click", () =>
      this.change(() => {
        this.session.continue(view.revision);
      }),
    );
    footer.append(continueButton);
    sheet.append(footer);
    this.root.append(sheet);
    body.scrollTop = scroll;
    if (focusKey) {
      const target =
        Array.from(this.root.querySelectorAll<HTMLElement>("[data-focus-key]")).find(
          (item) => item.dataset.focusKey === focusKey && !("disabled" in item && item.disabled),
        ) ??
        Array.from(this.root.querySelectorAll<HTMLElement>("[data-focus-key]")).find(
          (item) => item.dataset.focusKey === focusFallback,
        ) ??
        toggle;
      target.focus({ preventScroll: true });
    }
    this.onUpdate(this.session.view);
  }
}
