# Venxe

An interactive 3D developer portfolio prototype built with Three.js, featuring a laptop and coffee. The site is fully static and can be hosted on GitHub Pages.

Start the local development server with Node.js **22.15 or later**:

```sh
npm run dev
```

Preview the site at http://127.0.0.1:4173. No package installation or build step is required.

The laptop display uses a 1200 × 675 desktop texture and a 3.46 × 1.94625 model-unit panel, both exactly 16:9. The chassis and lid share a 3.6 × 2.06625 footprint, with the keyboard and touchpad compressed in depth to fit. Physical ports and camera details retain their dimensions. Desktop and model dimensions are defined in `src/config.js`.

Zoom in to closely frame the whole laptop from a low front angle, with its keyboard visible and equal margins around its visible outline. A new inward zoom gesture centers the entire desktop, preserving its proportions with dark margins on different screen shapes. The taskbar, bottom edge, and both sides remain visible, including on tall phone screens. Only the desktop and plain background appear in this view; site controls are hidden. Each outward gesture, minus-key press, or Escape press returns one stage: desktop to laptop, then laptop to the saved scene view. Wheel events separated by less than 200 ms belong to one gesture; lift all fingers after a pinch or release a zoom key before changing another stage. Clicking the screen or pressing Enter or Space opens the laptop view.

The GNOME-inspired top bar shows your local date and time. Its desktop layout stays fixed at 36 pixels high, with 14-pixel text and 16-pixel icons, independently of camera zoom or viewport size. In laptop and desktop views, select the clock to browse the calendar, or the Wi-Fi, sound and battery indicators to open quick settings. Panels also keep fixed desktop dimensions: 360 pixels wide, with a height of 384 for the calendar, 236 for quick settings, or 324 with the Wi-Fi list expanded. Volume, mute, network selection and power mode control the simulated laptop; they do not change your device settings. Tab to the native desktop controls to use the keyboard, and use arrow keys to select dates or adjust volume. Escape closes an open panel before stepping back a view. Reloading resets the simulated settings.

The power button in quick settings opens Log Out, Restart and Power Off. The page starts signed in. Logging out or reopening the lid shows a password screen; shutdown fades to black, and restart includes a black interval and a startup screen before sign-in. Click the physical Power key at the right end of the keyboard's function row to start a powered-off laptop. Hold it for two seconds to force power off while running. Keyboard users can tab to Laptop power and hold Enter or Space. Cancelling, dragging away, adding a second pointer or leaving the tab cancels the hold. Shutdown from the desktop view returns to the laptop so the key is reachable.

The password is never displayed or stored as plaintext in the source. Verification uses a local SHA-256 digest via Web Crypto (HTTPS or localhost); this is a desktop simulation, not an access-control boundary. Enter submits the native masked password field. No password or session is saved in browser storage. Volume, network and power-mode preferences survive simulated restarts within the page. `src/system.js` owns timed power/session transitions through `send(event, value)`, `update(time, reducedMotion)`, the read-only `state`, and `dispose()`. Model brightness combines this state with lid brightness.

The slim laptop has a perforated cooling grille, side vents, two USB-A sockets, USB-C, an Ethernet socket with a folding lower jaw, and a barrel power socket. All ports start empty. Click or tap the camera cover above the display to slide it open or closed. Keyboard users can tab to the Camera privacy cover button; it becomes visible when focused. The camera indicator stays off, and the scene does not request camera access.

`createLaptop()` exposes `ports` records with `id`, `type`, `group`, and `anchor`. Attach future connector models to the appropriate anchor, whose local +Z points out of the socket. The Ethernet group's `ethernet-jaw` pivots around local X; rotating it to 0.5 radians opens the mouth. `webcam.setClosed(boolean)` and `webcam.update(deltaSeconds, reducedMotion)` control the cover.

Click or tap the front-center lifting notch to close or open the laptop lid, or tab to the Laptop lid button. Closing the lid leaves screen focus; screen and camera-cover controls become available again once the lid is fully open. `lid.setClosed(boolean)` and `lid.update(deltaSeconds, reducedMotion)` control the hinge, with `closed` reporting the target state and `moving` reporting an unfinished transition. Reduced motion changes the lid state immediately.

At a lid opening of 20 degrees or less, the display and its glow fade out over 100 ms. At 30 degrees or more, the display waits 150 ms, then fades in over 600 ms, continuing after the hinge settles. Reduced motion bypasses these delays and fades. `lid.update()` continues updating the display while returning whether the hinge geometry changed.

Run `npm run check` to verify imports, geometry budgets, chassis/port clearance, attachment orientation, camera cover behavior, desktop controls, power/session transitions and scene interactions. Credential tests use a crypto-boundary fixture rather than the real password. These checks do not measure GPU pixels, native browser behavior, screen-reader output or FPS.
