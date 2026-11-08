import { Suspense, lazy } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// Satu bundle frontend dipakai oleh dua window. Halaman dipilih dari label window Tauri.
const IslandPage = lazy(() => import("./pages/island/IslandPage"));
const ShelfPage = lazy(() => import("./pages/shelf/ShelfPage"));

const SHELF_WINDOW_LABEL = "shelf";

function App() {
  const label = getCurrentWindow().label;

  return <Suspense fallback={null}>{label === SHELF_WINDOW_LABEL ? <ShelfPage /> : <IslandPage />}</Suspense>;
}

export default App;
