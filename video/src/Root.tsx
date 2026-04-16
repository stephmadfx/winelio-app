import React from "react";
import { Composition } from "remotion";
import { WinelioPromo } from "./WinelioPromo";
import { SLIDES, FPS } from "./config";
import type { WinelioPromoProps } from "./WinelioPromo";

const defaultProps: WinelioPromoProps = { slides: SLIDES };

export const Root: React.FC = () => (
  <Composition
    id="WinelioPromo"
    component={WinelioPromo}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.slides.reduce((s, sl) => s + sl.frames, 0),
    })}
  />
);
