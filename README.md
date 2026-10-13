# Venxe

An interactive 3D developer portfolio prototype built with Three.js, featuring a laptop and coffee. The site is fully static and can be hosted on GitHub Pages.

Start the local development server with Node.js **22.15 or later**:

```sh
npm run dev
```

Preview the site at http://127.0.0.1:4173. No package installation or build step is required.

The slim laptop has a perforated cooling grille, side vents, two USB-A sockets, USB-C, an Ethernet socket with a folding lower jaw, and a barrel power socket. All ports start empty. Click or tap the camera cover above the display to slide it open or closed. Keyboard users can tab to the Camera privacy cover button; it becomes visible when focused. The camera indicator stays off, and the scene does not request camera access.

`createLaptop()` exposes `ports` records with `id`, `type`, `group`, and `anchor`. Attach future connector models to the appropriate anchor, whose local +Z points out of the socket. The Ethernet group's `ethernet-jaw` pivots around local X; rotating it to 0.5 radians opens the mouth. `webcam.setClosed(boolean)` and `webcam.update(deltaSeconds, reducedMotion)` control the cover.

Run `npm run check` to verify imports, geometry budgets, chassis/port clearance, attachment orientation, camera cover behavior, and scene interactions. These checks do not measure GPU pixels or FPS.
