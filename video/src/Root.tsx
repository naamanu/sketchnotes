import { Composition } from "remotion";
import { Tour } from "./Tour";
import { FPS, HEIGHT, WIDTH, totalFrames } from "./steps";

export const Root: React.FC = () => (
  <Composition id="SketchNotesTour" component={Tour} durationInFrames={totalFrames()} fps={FPS} width={WIDTH} height={HEIGHT} />
);
