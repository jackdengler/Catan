import { TvApp } from "./tv/TvApp.js";
import { PhoneApp } from "./phone/PhoneApp.js";
import { isTvRole } from "./net/socket.js";

export function App() {
  // The board/host view is "?tv"; everything else is a phone controller. Query
  // params (not path segments) keep routing working on GitHub Pages.
  return isTvRole() ? <TvApp /> : <PhoneApp />;
}
