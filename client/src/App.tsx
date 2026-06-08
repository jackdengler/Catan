import { TvApp } from "./tv/TvApp.js";
import { PhoneApp } from "./phone/PhoneApp.js";

export function App() {
  const isTv = window.location.pathname.startsWith("/tv");
  return isTv ? <TvApp /> : <PhoneApp />;
}
