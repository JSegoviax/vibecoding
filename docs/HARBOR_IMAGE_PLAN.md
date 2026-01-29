# Plan: Use Harbor Image for All Ports

## Current behavior
- **Harbors:** 9 harbors (4 generic 3:1, 5 specific 2:1), each tied to a coastal edge and two vertices.
- **Rendering (HexBoard):** For each harbor we compute:
  - Position: midpoint of the edge + offset toward water (`harborX`, `harborY`).
  - Outward direction: perpendicular to the edge, pointing away from board center (`perpX`, `perpY`).
- We draw a circle (r=24) with "?" (generic) or "2:1" + colored circle (2:1).

## Goal
Use the provided island image (wooden dock pairs around the coast) to draw every port so harbors look like the reference image.

## Approach: One dock graphic, drawn 9 times

1. **Asset**
   - Use a single image that shows **one pair of wooden docks** (one harbor’s worth).
   - If we only have the full island image: put it in `public/` and use an SVG `<clipPath>` to show one region (e.g. one corner) as the “dock” graphic, then reuse that for all 9 harbors.
   - Preferred: one pre-cropped image `public/harbor-dock.png` (one pair of docks) so we don’t depend on pixel coordinates of the full image.

2. **Position and rotation (already available)**
   - Position: keep current `(harborX, harborY)` (edge midpoint + outward offset).
   - Rotation: `angle = atan2(perpY, perpX)` so the dock points from land toward water.
   - Size: scale the dock to ~40–56px so it’s visible but not oversized (e.g. same order as current circle r=24).

3. **Rendering in HexBoard**
   - For each harbor:
     - Draw `<image href="/harbor-dock.png" ...>` (or the full image with a clipPath) at `(harborX, harborY)`.
     - Apply `transform="rotate(angleDeg, harborX, harborY)"` and translation so the dock is centered and rotated correctly.
   - Keep the trade-rate indicator (3:1 “?” or 2:1 + resource icon) on top of or beside the dock so gameplay stays clear (small text or icon).

4. **Fallback**
   - If `harbor-dock.png` is missing, keep drawing the current circle + “?” / “2:1” so the game still works.

5. **Implementation steps**
   - Add the asset to `public/` (full island image as `harbor-docks.png`, or cropped dock as `harbor-dock.png`).
   - In HexBoard, for each harbor:
     - Compute rotation angle from `(perpX, perpY)`.
     - Render the dock image (with optional clipPath when using the full image), then the 3:1/2:1 indicator on top.
   - Optionally remove or shrink the current circle so the dock is the main visual.

## Edge cases
- **Image aspect ratio:** Use a square clip or preserveAspectRatio so the dock doesn’t stretch.
- **Z-order:** Draw harbors after hexes/water so docks sit on top; keep indicators on top of the dock image.
- **Missing asset:** Fall back to current circle + text so the app never breaks.
