import { COSTS, RESOURCES } from "@catan/shared";
import { RESOURCE_EMOJI } from "./theme.js";

const ITEMS: { label: string; key: keyof typeof COSTS }[] = [
  { label: "🛣️ Road", key: "road" },
  { label: "🏠 Settlement", key: "settlement" },
  { label: "🏙️ City", key: "city" },
  { label: "✦ Dev card", key: "devCard" },
];

const VP: { label: string; value: string }[] = [
  { label: "🏠 Settlement", value: "1 VP" },
  { label: "🏙️ City", value: "2 VP" },
  { label: "🛣️ Longest Road (5+)", value: "2 VP" },
  { label: "⚔️ Largest Army (3+)", value: "2 VP" },
  { label: "⭐ Victory Point card", value: "1 VP" },
];

// Reference of what each structure costs, plus where victory points come from.
export function BuildCosts() {
  return (
    <div className="build-costs">
      <h3>Build costs</h3>
      {ITEMS.map((it) => (
        <div key={it.key} className="cost-row">
          <span className="cost-label">{it.label}</span>
          <span className="cost-icons">
            {RESOURCES.flatMap((r) =>
              Array.from({ length: COSTS[it.key][r] ?? 0 }).map((_, i) => (
                <span key={`${r}${i}`}>{RESOURCE_EMOJI[r]}</span>
              ))
            )}
          </span>
        </div>
      ))}
      <h3 className="vp-head">Victory points</h3>
      {VP.map((v) => (
        <div key={v.label} className="cost-row">
          <span className="cost-label">{v.label}</span>
          <span className="cost-vp">{v.value}</span>
        </div>
      ))}
    </div>
  );
}
