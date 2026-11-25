import { FONT_FAMILY, convertToExcalidrawElements } from "@excalidraw/excalidraw";

/**
 * Adds a block of Excalifont text near the top-left of what's on screen and selects it,
 * so it can be dragged straight into place.
 */
export function insertTextAtViewport(api: any, text: string, fontSize = 20) {
  if (!api) return;
  const st = api.getAppState();
  const zoom = st.zoom?.value ?? 1;
  // Screen → scene: scene = screen / zoom - scroll.
  // Clear of Excalidraw's toolbar (top) and the properties panel that opens for a selection (left).
  const x = (st.width * 0.3) / zoom - st.scrollX;
  const y = (st.height * 0.18) / zoom - st.scrollY;
  const [el] = convertToExcalidrawElements([
    { type: "text", x, y, text, fontFamily: FONT_FAMILY.Excalifont, fontSize } as any,
  ]);
  api.updateScene({
    elements: [...api.getSceneElements(), el],
    appState: { selectedElementIds: { [el.id]: true } },
  });
}
