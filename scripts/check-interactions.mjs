import { runViewInteractions } from './check-view-interactions.mjs';
import { runKeyboardInteractions } from './check-keyboard-interactions.mjs';
import { runHardwareInteractions } from './check-hardware-interactions.mjs';
import { runDesktopInteractions } from './check-desktop-interactions.mjs';

runViewInteractions();
runKeyboardInteractions();
runHardwareInteractions();
await runDesktopInteractions();
