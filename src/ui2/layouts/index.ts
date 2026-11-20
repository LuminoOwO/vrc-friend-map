// Every desktop layout of the new interface, by its setting (settings.ui.layout).
import type { UiLayout } from "../../types";
import { BoardLayout } from "./Board";
import { ColumnsLayout } from "./Columns";
import { DashboardLayout } from "./Dashboard";
import { DeckLayout } from "./Deck";
import { ExplorerLayout } from "./Explorer";
import { HudLayout } from "./Hud";
import { LobbyLayout } from "./Lobby";
import { MagazineLayout } from "./Magazine";
import { RadialLayout } from "./Radial";
import { SpotlightLayout } from "./Spotlight";
import { SplitLayout } from "./Split";
import { TimelineLayout } from "./Timeline";
import { WindowsLayout } from "./Windows";
import { ZenLayout } from "./Zen";

export const LAYOUT_COMPONENTS: Partial<Record<UiLayout, (p: { onPalette: () => void }) => React.ReactElement>> = {
  columns: ColumnsLayout,
  hud: HudLayout,
  dashboard: DashboardLayout,
  deck: DeckLayout,
  radial: RadialLayout,
  spotlight: SpotlightLayout,
  timeline: TimelineLayout,
  split: SplitLayout,
  magazine: MagazineLayout,
  windows: WindowsLayout,
  explorer: ExplorerLayout,
  board: BoardLayout,
  zen: ZenLayout,
  lobby: LobbyLayout,
};
