import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from "pixi.js";

import dadUrl from "../placeholders/dad.svg?url";
import kongUrl from "../placeholders/kong.svg?url";
import pixieUrl from "../placeholders/pixie.svg?url";
import tiltUrl from "../placeholders/tilt.svg?url";
import tinyUrl from "../placeholders/tiny.svg?url";
import type { ContentCatalog } from "./content.ts";
import {
  fitRoom,
  floorSpots,
  PLACEHOLDER_COUNT,
  ROOM_HEIGHT,
  ROOM_WIDTH,
  WALL_HEIGHT,
} from "./layout.ts";
import type { SessionView } from "./session.ts";

/** Placeholder heroes in assignment order; not art and never game content (ADR 0015). */
const PLACEHOLDER_URLS = [tinyUrl, kongUrl, pixieUrl, dadUrl, tiltUrl];

/** Logical height of a front-row figure, feet to hair tips. */
const FIGURE_HEIGHT = 150;

/** Pixi owns the room and static figures only; all decisions and values stay in DOM. */
export class WeekScene {
  private readonly host: HTMLElement;
  private readonly catalog: ContentCatalog;
  private readonly app = new Application();
  private readonly observer: ResizeObserver;
  private readonly room = new Container();
  private textures: readonly Texture[] = [];
  private failed = false;

  private constructor(host: HTMLElement, catalog: ContentCatalog) {
    this.host = host;
    this.catalog = catalog;
    this.observer = new ResizeObserver(() => this.resize());
  }

  /** Initializes the renderer after the DOM exists; a failed renderer leaves the panel alone. */
  static async create(
    host: HTMLElement,
    catalog: ContentCatalog,
    onError: (message: string) => void,
  ): Promise<WeekScene> {
    const scene = new WeekScene(host, catalog);
    try {
      if (import.meta.env.DEV && new URLSearchParams(location.search).get("failScene") === "init") {
        throw new Error("Deliberate renderer initialization failure");
      }
      await scene.app.init({
        width: host.clientWidth,
        height: host.clientHeight,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        antialias: true,
        background: "#141a26",
      });
      scene.textures = await Promise.all(
        PLACEHOLDER_URLS.map((src) => Assets.load<Texture>({ src, loadParser: "loadSVG" })),
      );
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
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    this.app.renderer.resize(width, height);
    const fit = fitRoom(width, height);
    this.room.scale.set(fit.scale);
    this.room.position.set(fit.offsetX, fit.offsetY);
  }

  /** Redraws only after a committed command or draft edit; ticker never touches core. */
  render(view: SessionView): void {
    if (this.failed || this.textures.length === 0) return;
    for (const child of this.room.removeChildren()) child.destroy({ children: true });
    this.room.addChild(drawRoom());

    const planned = new Set(
      view.draft.weeks.flatMap((week) => week.entries.map((entry) => entry.memberId)),
    );
    // Last activity each member actually performed in the returned result, never the draft.
    const performed = new Map<string, string>();
    for (const week of view.last?.advance.weeks ?? []) {
      for (const entry of week.executed) {
        const name =
          this.catalog.activities.find((activity) => activity.id === entry.activityId)?.name ??
          entry.activityId;
        for (const id of entry.participantIds) performed.set(id, name);
      }
    }

    const members = view.runState.collective.members;
    const spots = floorSpots(members.length);
    const order = members
      .map((member, index) => ({ member, index }))
      .sort((a, b) => (spots[a.index]?.y ?? 0) - (spots[b.index]?.y ?? 0));
    for (const { member, index } of order) {
      const spot = spots[index];
      const texture = this.textures[index % PLACEHOLDER_COUNT];
      if (!spot || !texture) continue;
      const figure = new Container();
      figure.position.set(spot.x, spot.y);
      figure.scale.set(spot.depth);

      const floorMark = new Graphics().ellipse(0, 0, 34, 9).fill({ color: 0x000000, alpha: 0.28 });
      if (planned.has(member.id))
        floorMark.ellipse(0, 0, 40, 12).stroke({ width: 3, color: 0xffc36d });
      figure.addChild(floorMark);

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.97);
      sprite.scale.set(FIGURE_HEIGHT / texture.height);
      figure.addChild(sprite);

      figure.addChild(
        new Text({
          text: member.handle,
          style: {
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            fontWeight: "600",
            fill: 0xf3ebda,
          },
          anchor: { x: 0.5, y: 0 },
          y: 12,
        }),
      );

      const activity = performed.get(member.id);
      if (activity) {
        const label = new Text({
          text: activity,
          style: { fontFamily: "system-ui, sans-serif", fontSize: 11, fill: 0x0d2a2a },
          anchor: { x: 0.5, y: 0.5 },
          y: -FIGURE_HEIGHT - 12,
        });
        const badge = new Graphics()
          .roundRect(-label.width / 2 - 7, -FIGURE_HEIGHT - 22, label.width + 14, 20, 10)
          .fill(0x70e0d3);
        figure.addChild(badge, label);
      }
      this.room.addChild(figure);
    }
  }

  /** Releases the renderer when the page is replaced. */
  destroy(): void {
    this.observer.disconnect();
    this.app.destroy(true, { children: true });
  }
}

/** Basement backdrop in the fixed 3/4 view: back wall, window, desk with monitors, floor. */
function drawRoom(): Graphics {
  const room = new Graphics();
  room.rect(0, 0, ROOM_WIDTH, WALL_HEIGHT).fill(0x243149);
  room.rect(0, WALL_HEIGHT, ROOM_WIDTH, ROOM_HEIGHT - WALL_HEIGHT).fill(0x2e3542);
  for (let y = WALL_HEIGHT + 30; y < ROOM_HEIGHT; y += 40) {
    room.rect(0, y, ROOM_WIDTH, 2).fill({ color: 0x000000, alpha: 0.12 });
  }
  room.rect(0, WALL_HEIGHT - 6, ROOM_WIDTH, 6).fill(0x1a2335);
  room.roundRect(24, 18, 86, 54, 4).fill(0x0f1a2e).stroke({ width: 4, color: 0x3a4a66 });
  room.rect(24, 44, 86, 3).fill(0x3a4a66);
  room.roundRect(150, 70, 190, 18, 3).fill(0x4a3b33);
  for (const x of [165, 225, 285]) {
    room.roundRect(x, 38, 44, 30, 3).fill(0x10151f).stroke({ width: 3, color: 0x2a2f3a });
    room.rect(x + 4, 42, 36, 22).fill({ color: 0x4aa3ff, alpha: 0.55 });
    room.rect(x + 20, 68, 4, 4).fill(0x2a2f3a);
  }
  room.ellipse(250, 110, 150, 38).fill({ color: 0x4aa3ff, alpha: 0.06 });
  return room;
}
