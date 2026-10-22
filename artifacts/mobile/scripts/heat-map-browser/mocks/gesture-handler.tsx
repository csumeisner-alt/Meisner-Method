import React from "react";

type GestureBuilder = {
  enabled: (_enabled: boolean) => GestureBuilder;
  activateAfterLongPress: (_duration: number) => GestureBuilder;
  simultaneousWithExternalGesture: (..._gestures: unknown[]) => GestureBuilder;
  onStart: (_callback: (...args: never[]) => void) => GestureBuilder;
  onUpdate: (_callback: (...args: never[]) => void) => GestureBuilder;
  onFinalize: (_callback: (...args: never[]) => void) => GestureBuilder;
};

export const Gesture = {
  Pan(): GestureBuilder {
    const builder: GestureBuilder = {
      enabled: () => builder,
      activateAfterLongPress: () => builder,
      simultaneousWithExternalGesture: () => builder,
      onStart: () => builder,
      onUpdate: () => builder,
      onFinalize: () => builder,
    };
    return builder;
  },
  Native(): GestureBuilder {
    return Gesture.Pan();
  },
};

export function GestureDetector({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
