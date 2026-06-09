import { useState } from "react";
import { colorblindEnabled, setColorblind } from "./theme.js";

// A per-device toggle for the colorblind-friendly player palette. Changing it
// reloads the page so every view re-reads the palette at module load.
export function ColorblindToggle() {
  const [on, setOn] = useState(colorblindEnabled());
  return (
    <label className="cb-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setColorblind(e.target.checked);
          setOn(e.target.checked);
          window.location.reload();
        }}
      />
      Colorblind-friendly colors
    </label>
  );
}
