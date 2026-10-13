# Venxe

An interactive 3D developer portfolio prototype built with Three.js, featuring a laptop and coffee. The site is fully static and can be hosted on GitHub Pages.

Start the local development server with Node.js **22.15 or later**:

```sh
npm run dev
```

Preview the site at http://127.0.0.1:4173. No package installation or build step is required.

Zoom in to closely frame the whole laptop with its keyboard visible and equal margins around its visible outline. A new inward zoom gesture opens the desktop across the viewport, preserving its proportions and cropping excess edges on different screen shapes. The desktop stays aligned to the top so its taskbar remains visible. Site controls are hidden in this view. Each outward gesture, minus-key press, or Escape press returns one stage: desktop to laptop, then laptop to the saved scene view. Wheel events separated by less than 200 ms belong to one gesture; lift all fingers after a pinch or release a zoom key before changing another stage. Clicking the screen or pressing Enter or Space opens the laptop view.

The slim laptop has a perforated cooling grille, side vents, two USB-A sockets, USB-C, an Ethernet socket with a folding lower jaw, and a barrel power socket. All ports start empty. Click or tap the camera cover above the display to slide it open or closed. Keyboard users can tab to the Camera privacy cover button; it becomes visible when focused. The camera indicator stays off, and the scene does not request camera access.

`createLaptop()` exposes `ports` records with `id`, `type`, `group`, and `anchor`. Attach future connector models to the appropriate anchor, whose local +Z points out of the socket. The Ethernet group's `ethernet-jaw` pivots around local X; rotating it to 0.5 radians opens the mouth. `webcam.setClosed(boolean)` and `webcam.update(deltaSeconds, reducedMotion)` control the cover.

Click or tap the front-center lifting notch to close or open the laptop lid, or tab to the Laptop lid button. Closing the lid leaves screen focus; screen and camera-cover controls become available again once the lid is fully open. `lid.setClosed(boolean)` and `lid.update(deltaSeconds, reducedMotion)` control the hinge, with `closed` reporting the target state and `moving` reporting an unfinished transition. Reduced motion changes the lid state immediately.

At a lid opening of 20 degrees or less, the display and its glow fade out over 100 ms. At 30 degrees or more, the display waits 150 ms, then fades in over 600 ms, continuing after the hinge settles. Reduced motion bypasses these delays and fades. `lid.update()` continues updating the display while returning whether the hinge geometry changed.

Run `npm run check` to verify imports, geometry budgets, chassis/port clearance, attachment orientation, camera cover behavior, and scene interactions. These checks do not measure GPU pixels or FPS.
