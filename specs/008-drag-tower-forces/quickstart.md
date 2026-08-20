# Quickstart Validation Guide: Interactive Tower Dragging

## Setup & Verification Commands

```bash
npm install
npm run dev
npm run build
```

## Scenario 1: Mouse Pointer Dragging

1. Open application in browser (`http://localhost:5173`).
2. Select "Force Directed" layout algorithm.
3. Click and hold primary mouse button on any tower object.
4. Drag the mouse across the screen.
5. **Expected Outcome**:
   - The selected tower moves continuously along the layout plane under the cursor.
   - Connected and surrounding towers dynamically shift positions in real time as forces recalculate.
   - Orbit controls (camera rotation/pan) remain disabled during the drag.
6. Release the mouse button.
7. **Expected Outcome**: Drag terminates cleanly and Orbit controls re-enable.

## Scenario 2: Keyboard Accessibility Nudge

1. Click on a tower to select it (or use keyboard selection).
2. Press arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`).
3. **Expected Outcome**:
   - The selected tower shifts position incrementally.
   - Surrounding towers recalculate position in real time.

## Scenario 3: Build Verification

Execute `npm run build` to verify there are no TypeScript/ESLint/Vite compile errors or broken module exports.
