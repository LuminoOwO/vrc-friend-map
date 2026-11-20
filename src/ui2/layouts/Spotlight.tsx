// Layout "Spotlight" (search first): a big search bar in the middle over a dimmed map. Typing
// filters the map; under the bar: the views as chips, who's online and the latest activity.
// A view opens in a large panel under the bar.
import { setState, useApp } from "../../store";
import { GraphView } from "../../components/GraphView";
import { Icon } from "../../components/Icon";
import { RAIL, SearchField, ToolCluster, ViewSheet, useOpenWorld } from "../parts";
import { ActivityFeed } from "../SidePanel";
import { OnlineNow } from "../OnlineNow";
import { useState } from "react";

export function SpotlightLayout({ onPalette }: { onPalette: () => void }) {
  const view = useApp((s) => s.view);
  const search = useApp((s) => s.filters.search);
  const openWorld = useOpenWorld();
  const [dim, setDim] = useState(true);
  const onMap = view === "graph";
  return (
    <div className={`lay-spot ${onMap && dim && !search ? "dimmed" : ""}`}>
      <div className="spot-map">
        <GraphView />
      </div>
      <ToolCluster onPalette={onPalette} className="spot-tools" />
      <div className="spot-center">
        <div className="spot-bar">
          <SearchField className="spot-search" placeholder="Search friends, or pick something below…" autoFocus />
          <button className="spot-k" onClick={onPalette} title="Search everything">
            Ctrl K
          </button>
        </div>
        <div className="spot-chips">
          {RAIL.map((r) => (
            <button key={r.key} className={`spot-chip ${view === r.key ? "on" : ""}`} onClick={() => setState({ view: r.key })}>
              <Icon name={r.icon} size={15} /> {r.label}
            </button>
          ))}
          {onMap && (
            <button className="spot-chip ghost" onClick={() => setDim(!dim)}>
              <Icon name={dim ? "eye" : "eyeOff"} size={15} /> {dim ? "Show the map" : "Dim the map"}
            </button>
          )}
        </div>
        {onMap && dim && !search && (
          <div className="spot-suggest">
            <section>
              <h2>Online now</h2>
              <OnlineNow onOpen={openWorld} />
            </section>
            <section>
              <h2>Just happened</h2>
              <ActivityFeed max={30} />
            </section>
          </div>
        )}
        {!onMap && <ViewSheet view={view} onClose={() => setState({ view: "graph" })} className="spot-sheet" />}
      </div>
    </div>
  );
}
