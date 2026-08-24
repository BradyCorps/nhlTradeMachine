// Mirrors the in-page startup gate so navigation and hydration never swap
// between two different preloaders.

import { LoadingScreen } from "./Screens";

export default function ArmchairGmLoading() {
  return <LoadingScreen />;
}
