import { Application, Container, Graphics, Text } from "pixi.js";

import type { LayoutProbe } from "./layout.ts";
import { figurePositions, sceneScale } from "./layout.ts";
import type { SessionView } from "./session.ts";

/** Pixi owns decorative geometry only; all decisions and values stay in DOM. */
export class WeekScene {
  private readonly host: HTMLElement;
  private readonly layout: LayoutProbe;
  private readonly app = new Application();
  private readonly observer: ResizeObserver;
  private readonly room = new Container();
  private failed = false;

  private constructor(host: HTMLElement, layout: LayoutProbe) {
    this.host = host;
    this.layout = layout;
    this.observer = new ResizeObserver(() => this.resize());
  }

  /** Initializes the renderer after the DOM exists; a failed renderer leaves the panel alone. */
  static async create(
    host: HTMLElement,
    layout: LayoutProbe,
    onError: (message: string) => void,
  ): Promise<WeekScene> {
    const scene = new WeekScene(host, layout);
    try {
      if (import.meta.env.DEV && new URLSearchParams(location.search).get("failScene") === "init") {
        throw new Error("Deliberate renderer initialization failure");
      }
      await scene.app.init({ width: 320, height: 180, background: "#182235", antialias: false });
      scene.app.canvas.setAttribute("aria-hidden", "true");
      scene.app.canvas.style.pointerEvents = "none";
      host.append(scene.app.canvas);
      scene.app.stage.addChild(scene.room);
      scene.observer.observe(host);
      scene.resize();
      scene.app.ticker.add(() => {
        if (scene.failed) return;
        try {
          if (
            import.meta.env.DEV &&
            new URLSearchParams(location.search).get("failScene") === "tick"
          ) {
            throw new Error("Deliberate renderer ticker failure");
          }
          scene.room.alpha = 0.97 + Math.sin(scene.app.ticker.lastTime / 850) * 0.03;
        } catch (cause) {
          scene.failed = true;
          scene.app.ticker.stop();
          onError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    } catch (cause) {
      scene.failed = true;
      onError(cause instanceof Error ? cause.message : String(cause));
    }
    return scene;
  }

  private resize(): void {
    if (this.failed) return;
    const scale = sceneScale(this.host.clientWidth, this.host.clientHeight);
    this.app.renderer.resize(320 * scale, 180 * scale);
    this.room.scale.set(scale);
  }

  /** Redraws only after a committed command or draft edit; ticker never touches core. */
  render(view: SessionView): void {
    if (this.failed) return;
    for (const child of this.room.removeChildren()) child.destroy({ children: true });
    const floor = new Graphics();
    floor.rect(0, 0, 320, 180).fill(0x1a2639);
    floor.rect(0, 0, 320, 25).fill(0x263954);
    floor.rect(0, 168, 320, 12).fill(0x344c62);
    for (let x = 20; x < 320; x += 60) floor.rect(x, 23, 2, 145).fill(0x263c51);
    this.room.addChild(floor);

    const planned = new Set(
      view.draft.weeks.flatMap((week) => week.entries.map((entry) => entry.memberId)),
    );
    const committed = new Set(
      view.last?.advance.weeks.flatMap((week) =>
        week.executed.flatMap((entry) => entry.participantIds),
      ) ?? [],
    );
    const members = view.runState.collective.members;
    for (const [index, position] of figurePositions(this.layout).entries()) {
      const member = members[index];
      const isPlan = member !== undefined && planned.has(member.id);
      const isCommitted = member !== undefined && committed.has(member.id);
      const figure = new Container();
      figure.position.set(position.x, position.y);
      const parts = new Graphics();
      if (isPlan) parts.circle(0, 3, 18).stroke({ width: 2, color: 0xffc36d });
      if (isCommitted) parts.circle(0, 3, 15).stroke({ width: 2, color: 0x70e0d3 });
      parts.ellipse(0, 18, 15, 4).fill(0x101827);
      parts.roundRect(-10, -4, 20, 20, 3).fill(member ? 0x5696b3 : 0x526277);
      parts.circle(0, -9, 8).fill(member ? 0xe2b893 : 0x82909d);
      parts.rect(-7, -17, 14, 4).fill(member ? 0x343b53 : 0x455264);
      parts.rect(-13, 2, 4, 10).fill(member ? 0xe2b893 : 0x82909d);
      parts.rect(9, 2, 4, 10).fill(member ? 0xe2b893 : 0x82909d);
      figure.addChild(parts);
      figure.addChild(
        new Text({
          text: member?.handle.slice(0, 8) ?? `Guest ${index - members.length + 1}`,
          style: { fontFamily: "monospace", fontSize: 8, fill: member ? 0xf3ebda : 0xaebdcc },
          anchor: { x: 0.5, y: 0 },
          y: 22,
        }),
      );
      this.room.addChild(figure);
    }
  }

  /** Releases the renderer when the page is replaced. */
  destroy(): void {
    this.observer.disconnect();
    this.app.destroy(true, { children: true });
  }
}
