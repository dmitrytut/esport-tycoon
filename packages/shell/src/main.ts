import "./style.css";

import { loadContent } from "./content.ts";
import type { LayoutProbe } from "./layout.ts";
import { createRun, DEFAULT_RUN_SEED } from "./run.ts";
import { WeekScene } from "./scene.ts";
import { WeekSession } from "./session.ts";
import { WeekPanel } from "./week-panel.ts";

const app = document.getElementById("app");
if (!app) throw new Error("Missing browser app root");
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? DEFAULT_RUN_SEED;
const layout: LayoutProbe = params.get("layout") === "isometric" ? "isometric" : "front";

try {
  if (import.meta.env.DEV && params.get("failContent") === "1") {
    throw new Error("content/seasons/standard.json: deliberate missing-content probe");
  }
  const catalog = loadContent();
  const session = new WeekSession(catalog, createRun(seed, catalog));
  let scene: WeekScene | null = null;
  new WeekPanel(app, session, catalog, (view) => scene?.render(view));
  const host = app.querySelector<HTMLElement>("#scene-host");
  if (!host) throw new Error("Scene mount is missing");
  void WeekScene.create(host, layout, (message) => {
    let error = document.querySelector<HTMLElement>(".scene-error");
    if (!error) {
      error = document.createElement("div");
      error.className = "scene-error";
      error.setAttribute("role", "alert");
      document.body.append(error);
    }
    error.textContent = `Scene unavailable: ${message}. Planning remains in the sheet.`;
  })
    .then((created) => {
      scene = created;
      scene.render(session.view);
      window.addEventListener("pagehide", () => scene?.destroy(), { once: true });
    })
    .catch((cause: unknown) => {
      const error = document.createElement("p");
      error.className = "scene-error";
      error.setAttribute("role", "alert");
      error.textContent = `Scene unavailable: ${cause instanceof Error ? cause.message : String(cause)}`;
      document.body.append(error);
    });
} catch (cause) {
  const error = document.createElement("main");
  error.className = "boot-error";
  error.setAttribute("role", "alert");
  error.textContent = `Run cannot start: ${cause instanceof Error ? cause.message : String(cause)}. No week has advanced.`;
  app.replaceChildren(error);
}
