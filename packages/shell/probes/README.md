# Placeholder week room — layout evidence

These are **desktop Chromium captures at DPR 1, not physical-device results**. Every capture pins the default seed `week-shell-38-5`, the shipped `standard` calendar and the same input: open the plan, add Mechanics Drills to week 0 for moped, press Continue.

| Viewport | Collapsed, fresh | Expanded, draft for moped | Collapsed after Continue |
|---|---|---|---|
| Portrait 390×844 | [collapsed](portrait-collapsed-390x844.png) | [expanded](portrait-expanded-390x844.png) | [committed](portrait-committed-390x844.png) |
| Narrow 320×568 | [collapsed](narrow-collapsed-320x568.png) | [expanded](narrow-expanded-320x568.png) | [committed](narrow-committed-320x568.png) |
| Wide 1024×768 | [collapsed](wide-collapsed-1024x768.png) | [expanded](wide-expanded-1024x768.png) | [committed](wide-committed-1024x768.png) |
| Landscape 844×390 | [collapsed](landscape-collapsed-844x390.png) | [expanded](landscape-expanded-844x390.png) | [committed](landscape-committed-844x390.png) |

Scene rectangle and canvas matched in every run: 390×557 portrait, 320×318 narrow, 594×768 wide, 490×390 landscape. The 360×400 logical room is fitted whole with a fractional scale and letterboxed.

- All five roster members are visible and named in every viewport, including the 390×220 expanded preview. Three stand in front and two behind, between them; no head hides another.
- A planned member gets an amber floor ring only; balance and morale stay unchanged. After Continue the ring is gone and a teal badge names the activity the core returned. The run stopped at week 3 with `contest-ahead` and `block-ran-out`, balance 9824.4.
- At 320×568 expanded the handles are small but readable; the DOM roster names every member regardless.
- `?failScene=init` and `?failScene=tick` show "Scene unavailable … Planning remains in the sheet." and Continue stays usable.

The figures are five hand-drawn vector placeholders in `../placeholders/`; member *i* takes placeholder *i mod 5*. They are not art, show no pose or mood and are not a texture-resolution or memory-budget measurement — that is #84.
