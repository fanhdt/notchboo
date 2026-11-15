import NotchIsland from "../../components/island/NotchIsland";
import { useIslandController } from "../../hooks/useIslandController";

/**
 * Window `main`. Perilaku island ada di `useIslandController`; di sini hanya dipilih tampilannya.
 * Gaya lain (mis. pill) nanti dipilih di sini berdasarkan pengaturan.
 */
function IslandPage() {
  const controller = useIslandController();

  return <NotchIsland c={controller} />;
}

export default IslandPage;
