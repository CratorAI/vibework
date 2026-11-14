import { appApi } from "../tauri/app";

interface TitlebarProps {
  /**
   * Background color for the titlebar (optional)
   * If not provided, will be transparent
   */
  backgroundColor?: string;
}

export const Titlebar: React.FC<TitlebarProps> = ({ backgroundColor }) => {
  const isMac = navigator.userAgent.includes("Mac");

  const handleDoubleClick = async () => {
    if (isMac) {
      // On macOS, double-clicking the titlebar toggles maximize
      await appApi.toggleMaximizeWindow();
    }
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    // Only drag on left button click, not double click
    if (e.button === 0 && e.detail === 1) {
      await appApi.startDrag();
    }
  };

  return (
    <div
      className="fixed top-0 left-0 h-(--titlebar-height) w-full select-none z-50"
      style={{
        backgroundColor: backgroundColor || "transparent",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
    >
      {/* Full-width draggable title bar region */}
    </div>
  );
};
