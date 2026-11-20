// The app's logo (assets/logo.svg): you in the middle, friends around you with their status
// rings, the lines between them and a circle of friends, like on the map.
import logo from "../../assets/logo.svg";

export function AppLogo({ size = 40 }: { size?: number }) {
  return <img className="app-logo" src={logo} width={size} height={size} alt="VRC Friend Map" draggable={false} />;
}
